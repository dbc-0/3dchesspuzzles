/**
 * ui.js — the `ctx.ui` object modes are handed: toast, confirm, haptic, sound.
 * (`setHeader` is added by the shell in app.js, because only the shell owns the
 * app bar.)
 *
 * Everything here is deliberately dumb and self-contained: no state that a mode
 * could corrupt, no DOM outside the layers it creates inside `.app-shell`, and
 * no styling that isn't already in app.css.
 *
 * AUDIO / iOS
 * -----------
 * The old app called `<audio>.play()` cold. On iOS that is silently refused
 * unless the AudioContext has been unlocked inside a real user gesture, which
 * is why sound in Blunder Rush was unreliable. Here a one-shot capture listener
 * on the first pointer/touch/key event resumes the context, plays a zero-length
 * buffer to prime the output, and kicks off decoding of the two clips. After
 * that every play() is a WebAudio buffer source: no allocation, no latency, and
 * overlapping answers can't cut each other off the way one shared <audio> tag
 * does.
 */

const SOUND_SOURCES = {
  correct: new URL('../../ding.mp3', import.meta.url).href,
  wrong: new URL('../../buzz.mp3', import.meta.url).href,
};

const SOUND_ALIASES = {
  ding: 'correct', success: 'correct', right: 'correct', safe: 'correct',
  buzz: 'wrong', error: 'wrong', fail: 'wrong', strike: 'wrong', blunder: 'wrong',
};

const HAPTIC_PATTERNS = {
  light: 8,
  medium: 18,
  heavy: 34,
  success: [10],
  warning: [10, 60, 10],
  error: [18, 45, 18],
  strike: [26, 40, 26],
  gameover: [40, 60, 40, 60, 90],
};

const TOAST_ICON = { success: 'i-check', error: 'i-alert', info: 'i-info' };

function svgUse(id) {
  return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* -----------------------------------------------------------------------------
   SOUND
   -------------------------------------------------------------------------- */
function createSound(isEnabled) {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const buffers = new Map();
  let ctx = null;
  let unlocked = false;
  let loading = null;
  /** HTMLAudio fallback for engines without WebAudio (or a failed decode). */
  const tags = new Map();

  function ensureContext() {
    if (ctx || !AudioCtor) return ctx;
    try { ctx = new AudioCtor(); } catch { ctx = null; }
    return ctx;
  }

  async function loadAll() {
    if (loading) return loading;
    const audio = ensureContext();
    if (!audio) return null;
    loading = Promise.all(Object.entries(SOUND_SOURCES).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const bytes = await res.arrayBuffer();
        // Safari still wants the callback form; wrap both.
        const buf = await new Promise((resolve, reject) => {
          const p = audio.decodeAudioData(bytes, resolve, reject);
          if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
        buffers.set(name, buf);
      } catch {
        // Fall back to a plain <audio> element for this clip.
        try {
          const tag = new Audio(url);
          tag.preload = 'auto';
          tags.set(name, tag);
        } catch { /* no audio at all; stay silent */ }
      }
    }));
    return loading;
  }

  /** Must run inside a real user gesture. Safe to call repeatedly. */
  function unlock() {
    const audio = ensureContext();
    if (audio) {
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      if (!unlocked) {
        try {
          const src = audio.createBufferSource();
          src.buffer = audio.createBuffer(1, 1, 22050);
          src.connect(audio.destination);
          src.start(0);
        } catch { /* ignore */ }
      }
    }
    unlocked = true;
    loadAll();
    return unlocked;
  }

  function play(name = 'correct', { volume = 1 } = {}) {
    if (!isEnabled()) return false;
    const key = SOUND_ALIASES[name] || name;
    if (!SOUND_SOURCES[key]) return false;
    if (!unlocked) return false;          // never fight the browser's gesture rule

    const audio = ensureContext();
    const buffer = buffers.get(key);
    if (audio && buffer) {
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      try {
        const src = audio.createBufferSource();
        src.buffer = buffer;
        const gain = audio.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));
        src.connect(gain).connect(audio.destination);
        src.start(0);
        return true;
      } catch { /* fall through to the tag */ }
    }
    const tag = tags.get(key);
    if (tag) {
      try { tag.currentTime = 0; tag.volume = Math.max(0, Math.min(1, volume)); tag.play().catch(() => {}); return true; }
      catch { return false; }
    }
    loadAll();
    return false;
  }

  // `sound('correct')` and `sound.play('correct')` both work; modes written
  // against either reading of the contract behave the same.
  const api = (name, opts) => play(name, opts);
  api.play = play;
  api.unlock = unlock;
  api.preload = loadAll;
  Object.defineProperty(api, 'unlocked', { get: () => unlocked });
  return api;
}

/* -----------------------------------------------------------------------------
   PUBLIC FACTORY
   -------------------------------------------------------------------------- */

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.root       the `.app-shell` element
 * @param {() => Object} opts.settings  returns the current settings snapshot
 */
export function createUI({ root, settings }) {
  const getSettings = typeof settings === 'function' ? settings : () => ({});
  const sound = createSound(() => getSettings().sound !== false);

  /* ---- first-gesture audio unlock ------------------------------------- */
  const unlockOnce = () => {
    sound.unlock();
    for (const type of ['pointerdown', 'touchend', 'keydown']) {
      window.removeEventListener(type, unlockOnce, true);
    }
  };
  for (const type of ['pointerdown', 'touchend', 'keydown']) {
    window.addEventListener(type, unlockOnce, { capture: true, passive: true });
  }
  // Coming back from the background can leave the context suspended on iOS.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sound.preload();
  });

  /* ---- toast ----------------------------------------------------------- */
  let toastLayer = null;
  function layer() {
    if (toastLayer && toastLayer.isConnected) return toastLayer;
    toastLayer = root.querySelector('.toast-layer');
    if (!toastLayer) {
      toastLayer = document.createElement('div');
      toastLayer.className = 'toast-layer';
      toastLayer.setAttribute('role', 'status');
      toastLayer.setAttribute('aria-live', 'polite');
      root.appendChild(toastLayer);
    }
    return toastLayer;
  }

  /**
   * toast('Saved') | toast('Update ready', {kind:'info', action:{label:'Reload', onClick}})
   * @returns {() => void} dismiss
   */
  function toast(message, opts = {}) {
    const kind = TOAST_ICON[opts.kind] ? opts.kind : 'info';
    const duration = opts.duration == null ? 2800 : opts.duration;
    const node = document.createElement('div');
    node.className = `toast toast--${kind}`;
    node.innerHTML =
      `${svgUse(TOAST_ICON[kind])}<span class="toast__text">${escapeHtml(message)}</span>`;

    let timer = 0;
    const dismiss = () => {
      clearTimeout(timer);
      if (node.isConnected) node.remove();
    };

    if (opts.action && opts.action.label) {
      const btn = document.createElement('button');
      btn.className = 'toast__action';
      btn.textContent = opts.action.label;
      btn.addEventListener('click', () => {
        dismiss();
        try { opts.action.onClick && opts.action.onClick(); } catch (err) { console.error(err); }
      });
      node.appendChild(btn);
    }

    const host = layer();
    // Never stack more than three; the oldest goes first.
    while (host.children.length >= 3) host.firstElementChild.remove();
    host.appendChild(node);
    if (duration > 0) timer = setTimeout(dismiss, duration);
    return dismiss;
  }

  /* ---- confirm sheet ---------------------------------------------------- */
  let openConfirm = null;

  /**
   * Bottom-sheet confirmation. This is what makes the small corner restart
   * button safe: a stray tap costs a dismiss, never a run.
   * @returns {Promise<boolean>}
   */
  function confirm(opts = {}) {
    if (openConfirm) openConfirm(false);

    const {
      title = 'Are you sure?',
      text = '',
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      danger = true,
    } = opts;

    return new Promise((resolve) => {
      const id = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
      const scrim = document.createElement('div');
      scrim.className = 'sheet-scrim';

      const sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-labelledby', id);
      sheet.innerHTML = `
        <div class="sheet__grabber"></div>
        <div class="sheet__body">
          <h2 class="sheet__title" id="${id}">${escapeHtml(title)}</h2>
          ${text ? `<p class="sheet__text">${text}</p>` : ''}
        </div>
        <div class="sheet__actions">
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--lg btn--block" data-act="ok">${escapeHtml(confirmLabel)}</button>
          <button class="btn btn--ghost btn--block" data-act="cancel">${escapeHtml(cancelLabel)}</button>
        </div>`;

      const previous = document.activeElement;
      const finish = (value) => {
        if (openConfirm !== finish) return;
        openConfirm = null;
        document.removeEventListener('keydown', onKey, true);
        scrim.remove();
        sheet.remove();
        if (previous && previous.isConnected && previous.focus) previous.focus();
        resolve(value);
      };
      openConfirm = finish;

      const onKey = (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      };
      document.addEventListener('keydown', onKey, true);

      scrim.addEventListener('click', () => finish(false));
      sheet.querySelector('[data-act="ok"]').addEventListener('click', () => finish(true));
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(false));

      root.append(scrim, sheet);
      sheet.querySelector('[data-act="cancel"]').focus();
    });
  }

  /** Generic sheet host, used by the shell for the settings panel. */
  function sheet({ labelledBy, build, onClose }) {
    const scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    const node = document.createElement('div');
    node.className = 'sheet';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    if (labelledBy) node.setAttribute('aria-labelledby', labelledBy);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      scrim.remove();
      node.remove();
      if (typeof onClose === 'function') onClose();
    };
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); close(); } };

    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('click', close);
    if (typeof build === 'function') build(node, close);
    root.append(scrim, node);
    return close;
  }

  /* ---- haptics ---------------------------------------------------------- */
  function haptic(kind = 'light') {
    if (getSettings().haptics === false) return false;
    if (!navigator.vibrate) return false;
    // Chrome logs a console error if vibrate() is called before the frame has
    // ever been touched. Nothing to gain from asking in that state.
    if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) return false;
    const pattern = HAPTIC_PATTERNS[kind] || HAPTIC_PATTERNS.light;
    try { return navigator.vibrate(pattern); } catch { return false; }
  }

  return { toast, confirm, sheet, haptic, sound };
}
