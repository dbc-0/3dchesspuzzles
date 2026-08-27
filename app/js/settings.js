/**
 * User settings: one small, validated, persisted object.
 *
 * The shell is the only writer. Modes get a read-only snapshot on `ctx.settings`
 * and never touch localStorage themselves, so 2D/3D swapping, theming and the
 * offline story all stay in one place.
 *
 * Every value is validated on read as well as on write: a hand-edited or
 * half-written localStorage entry degrades to the default instead of booting
 * the app into an undefined state.
 */

const KEY = 'tt.settings.v1';

export const DEFAULTS = Object.freeze({
  board: '2d',          // '2d' | '3d'   which renderer the shell constructs
  sound: true,          // ding / buzz
  haptics: true,        // navigator.vibrate
  theme: 'system',      // 'system' | 'light' | 'dark'
  assist3d: false,      // 3D legibility aids (outlines / halos)
  coordinates: true,    // rank + file labels on the board
  rating: 1400,         // preferred rating level, also the default practice band
  promptStyle: 'highlight', // 'highlight' | 'notation'  — see resolvePromptStyle
});

/**
 * How the prompted move is presented.
 *
 *   'highlight' — the from/to squares are lit on the board. Fast, and exactly
 *                 what an online board gives you. This is the default.
 *   'notation'  — algebraic only; you have to find the squares yourself.
 *
 * IT DOES NOT FOLLOW THE RENDERER, and that is deliberate. An earlier version
 * defaulted 3D to 'notation' on the reasoning that 3D exists to train board
 * vision so it should not hand over square locations. That was a mistake: it
 * made two things change at once. The app's central measurement is the gap
 * between a player's 2D and 3D rating, and that comparison is only meaningful
 * if the board is the ONLY difference between the two buckets. Tying prompt
 * style to the renderer confounded "how well do I read a 3D board" with "how
 * fast do I locate a square from notation" — two real but separate skills.
 *
 * So this is one setting, applied identically to both renderers, and the user
 * flips it for both at once. It remains a rating axis in its own right, so
 * highlight and notation runs stay bucketed separately and each can still be
 * compared against itself across boards.
 */
export function resolvePromptStyle(s) {
  return s.promptStyle === 'notation' ? 'notation' : 'highlight';
}

/** Coercers, one per key. Anything unknown is dropped entirely. */
const COERCE = {
  board: (v) => (v === '3d' ? '3d' : '2d'),
  sound: (v) => !!v,
  haptics: (v) => !!v,
  theme: (v) => (v === 'light' || v === 'dark' ? v : 'system'),
  assist3d: (v) => !!v,
  coordinates: (v) => !!v,
  // No 'auto': prompt style is deliberately independent of the renderer (see
  // resolvePromptStyle). Anything unrecognised, including a stored legacy 'auto',
  // falls back to the default.
  promptStyle: (v) => (v === 'notation' ? 'notation' : 'highlight'),
  rating: (v) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return DEFAULTS.rating;
    return Math.min(3000, Math.max(400, n));
  },
};

export function sanitise(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(COERCE)) {
      if (raw[key] !== undefined) out[key] = COERCE[key](raw[key]);
    }
  }
  return out;
}

/** Read straight from storage without constructing the store (used pre-boot). */
export function readStored() {
  try { return sanitise(JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch { return { ...DEFAULTS }; }
}

/**
 * Put the theme on the root element. `data-theme` beats the OS preference in
 * BOTH directions (see tokens.css); "system" removes the attribute so the
 * prefers-color-scheme media query takes back over.
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');

  // Keep the iOS status bar / Android chrome in step with whatever --bg
  // actually resolved to, rather than hard-coding a colour per theme.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) {
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', bg);
    }
  }
}

export function createSettings() {
  let current = readStored();
  const listeners = new Set();

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(current)); }
    catch { /* private mode / quota: settings simply don't survive the session */ }
  }

  function get() {
    // A fresh object every time: modes are handed this as a read-only snapshot
    // and must never be able to mutate the shell's state by writing to it.
    //
    // `promptStyle` is RESOLVED here so a mode never has to normalise it.
    // `promptStyleChoice` carries the raw stored preference for the settings UI,
    // which is the only caller that needs to distinguish an unset value from an
    // explicit one (and to survive a legacy stored 'auto').
    return {
      ...current,
      promptStyleChoice: current.promptStyle,
      promptStyle: resolvePromptStyle(current),
    };
  }

  function set(patch) {
    if (!patch || typeof patch !== 'object') return get();
    const next = { ...current };
    let changed = false;
    for (const key of Object.keys(COERCE)) {
      if (patch[key] === undefined) continue;
      const value = COERCE[key](patch[key]);
      if (value !== next[key]) { next[key] = value; changed = true; }
    }
    if (!changed) return get();

    const before = current;
    current = next;
    persist();
    if (before.theme !== current.theme) applyTheme(current.theme);

    const changedKeys = Object.keys(COERCE).filter((k) => before[k] !== current[k]);
    for (const fn of [...listeners]) {
      try { fn(get(), changedKeys); } catch (err) { console.error('settings listener failed', err); }
    }
    return get();
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function reset() {
    current = { ...DEFAULTS };
    persist();
    applyTheme(current.theme);
    for (const fn of [...listeners]) {
      try { fn(get(), Object.keys(DEFAULTS)); } catch { /* ignore */ }
    }
    return get();
  }

  applyTheme(current.theme);

  // "system" tracks the OS live; re-apply so the theme-color meta follows too.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (current.theme === 'system') applyTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  return { get, set, subscribe, reset, DEFAULTS };
}
