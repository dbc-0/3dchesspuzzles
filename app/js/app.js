/**
 * app.js — the shell.
 *
 * Owns: navigation, screens, the board, settings, persistence, the service
 * worker and the restart control. Owns nothing about how a drill is played.
 *
 * ROUTES (hash based, so the phone's back gesture works)
 *   #/                          home — Blunder Rush, Tactics, Exercises
 *   #/rush                      Blunder Rush setup: timed / survival / practice, 2D/3D
 *   #/tactics                   Tactics setup: 2D/3D, framing, perspective
 *   #/play?mode=<id>&…          play; mounts app/js/modes/<id>.js
 *   #/summary                   game over (in memory; falls back home on reload)
 *   settings is a bottom sheet, not a route, so it can be opened mid-run
 *   without discarding the run.
 *
 * HOW A MODE IS MOUNTED
 *   ctx.root is an EMPTY `.screen--play` element: the fixed three-row grid from
 *   app.css. The mode fills it (typically `.app-bar` / `.stage` / `.action-bar`,
 *   exactly as app/test/design.html renders them) and drops `ctx.boardEl` — a
 *   ready-made `.board-area` with a live renderer already inside it — wherever
 *   it wants the board.
 *
 *   Afterwards the shell reconciles its own chrome into whatever the mode built
 *   (`adoptChrome`): it guarantees an app bar exists, that the EXIT and RESTART
 *   controls are in the top-left corner outside the thumb arc, and that the
 *   settings gear is in the top-right. A mode that renders no app bar gets the
 *   shell's. A mode that renders one keeps it and has the three controls slotted
 *   in. Modes that never insert `ctx.boardEl` simply don't get a board — the
 *   shell still creates and destroys it.
 */

import { createData } from './data.js';
// Full games for the review player. Imported eagerly (it is 4 KB of code) but it
// touches the network for the first time only when review actually opens.
import { createGames } from './games.js';
import { createSettings, applyTheme, DEFAULTS } from './settings.js';
import { createUI } from './ui.js';
import {
  createStats, store, groupBySeat, groupByOrientation, bucketByDay, summarise, median,
} from './stats.js';
import { createRating, bucketKey, parseBucket } from './rating.js';
// Offline storage: reads the Cache Storage API and navigator.storage directly,
// so #/offline reports what is really on the device rather than what we think
// we downloaded. No DOM in there; the rendering is all here.
import {
  surveyCache, estimateStorage, persistenceState, requestPersistence,
  buildCatalogue, orphans, totals, selectMissing, createPrefetch, clearDataCache, fmtBytes,
} from './storage.js';
// CC BY-SA 3.0 requires visible attribution naming both the author and the
// licence. The app ships as a static site, so a LICENCE file alone will not do —
// it is rendered in the settings sheet. See app/vendor/pieces/LICENSE.md.
import { PIECE_CREDIT } from './pieces-svg.js';
import { assertModeHandle, seedFor } from './mode-interface.js';
import { START_FEN } from './board-interface.js';

/* =============================================================================
   MODE REGISTRY
   Static paths (not template strings) so the set of modes is greppable, and so
   a missing module is a clean import failure rather than a mystery 404.
   ========================================================================== */
const MODES = {
  blunderrush: { title: 'Blunder Rush', load: () => import('./modes/blunderrush.js') },
  // Perspective solving is the reason this app exists, so Tactics opens in 3D
  // unless the setup screen says otherwise. The tile is named "Tactics", not
  // "3D Tactics": the dimension is a per-run choice the user makes (and one of
  // the rating axes), not part of the mode's identity.
  tactics: { title: 'Tactics', defaultBoard: '3d', load: () => import('./modes/tactics.js') },
  visualization: { title: 'Visualization', load: () => import('./modes/visualization.js') },
  drills: { title: 'Exercises', load: () => import('./modes/drills.js') },
};

const DRILL_TITLES = {
  color: 'Square colour',
  square: 'Square identification',
  diagonal: 'Diagonals',
};

/**
 * Blunder Rush IS the defensive task, inherently: it always shows the position
 * before the blunder with the user on the mover's side, and asks whether the
 * natural move loses. There is no offensive variant of it to offer, so its
 * framing is FIXED rather than defaulted — a URL cannot talk it into mislabelling
 * its own bucket. Modes with a free choice get it from their setup screen.
 */
const MODE_FIXED_FRAMING = { blunderrush: 'defensive' };

/**
 * LOOK-AHEAD DEPTH — the `plies` rating axis.
 *
 * Only Visualization has a look-ahead window. The board stays visible on the
 * starting position throughout — nothing is hidden and nothing is memorised.
 * The player is shown N quiet moves plus the blunder in notation, plays them
 * forward in their head, and must find the tactic in the position those moves
 * lead to while the board in front of them never moves. N is that mode's
 * central difficulty dial, and the user's question — "what Elo do I saturate at
 * with different look-aheads?" — is only answerable if each depth carries its own
 * rating. So depth is a bucket axis, and a mode that HAS no look-ahead is pinned
 * at '0' rather than left to default there: a stray `?plies=4` on a Tactics URL
 * must not be able to invent a depth the mode never honoured.
 *
 * The offered set is bounded by what the DATA supports, not by taste. Visualization
 * clamps its window to `min(d, p.length)`, so offering a depth the corpus cannot
 * supply would silently serve a shallower one and record it at the requested depth —
 * corrupting the very axis this exists for. `enforceWindow` below re-picks rather
 * than letting that clamp happen quietly.
 *
 * This was [0,1,2] while the app shipped the legacy shards, where every puzzle
 * carried `d: 2`. The engine-filtered corpus verifies deeper quiet windows, so the
 * set has been widened to match measured support:
 *
 *     1 ply  100%   2 plies  71%   3 plies  51%   4 plies  38%
 *
 * Even the deepest is a ~1-in-3 hit, so `enforceWindow`'s re-pick converges in a
 * couple of draws. Re-measure before widening again — this list must never outrun
 * the corpus.
 */
const MODE_PLY_CHOICES = { visualization: [0, 1, 2, 3, 4] };

/** The banner shows the N quiet moves AND the blunder, so the player reads N+1. */
const PLY_LABELS = {
  0: {
    label: '1 move',
    desc: 'Only the move that blunders — one move between the position on the board and the one you have to solve.',
  },
  1: {
    label: '2 moves',
    desc: 'One quiet move, then the blunder. Two moves to play through in your head before you start looking for the tactic.',
  },
  2: {
    label: '3 moves',
    desc: 'Two quiet moves, then the blunder. Three moves to hold before the tactic — available in 71% of puzzles.',
  },
  3: {
    label: '4 moves',
    desc: 'Three quiet moves, then the blunder. Available in 51% of puzzles, so a few are skipped to find one deep enough.',
  },
  4: {
    label: '5 moves',
    desc: 'Four quiet moves, then the blunder — the deepest window the engine verifies as quiet, and the hardest look-ahead on offer. Available in 38% of puzzles.',
  },
};

/**
 * The look-ahead depth as a bucket axis: a string, and '0' for every mode that
 * has no look-ahead. Read from `config` so it survives however the run was
 * started, and normalised in exactly one place.
 */
function pliesAxis(config) {
  const n = Number(config && config.plies);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : '0';
}

/**
 * The one place a run's bucket is computed. It was three copies, and a sixth
 * axis is exactly the kind of change that leaves one of three copies behind.
 */
function bucketForRun(modeId, runSettings, config) {
  return bucketKey({
    mode: modeId,
    board: runSettings.board,
    promptStyle: runSettings.promptStyle,
    perspective: config.perspective,
    framing: config.framing,
    plies: pliesAxis(config),
  });
}

const BEST_KEY = 'tt.best.v1';
const FALLBACK_BANDS = [800, 1000, 1200, 1400, 1600, 1800, 2000];

/* =============================================================================
   TINY DOM HELPERS
   ========================================================================== */
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

function fromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function on(scope, selector, type, handler) {
  for (const node of scope.querySelectorAll(selector)) node.addEventListener(type, handler);
}

function bandLabel(lo) {
  if (lo < 800) return 'Beginner';
  if (lo < 1000) return 'Casual';
  if (lo < 1200) return 'Club';
  if (lo < 1400) return 'Strong';
  if (lo < 1600) return 'Advanced';
  if (lo < 1800) return 'Expert';
  if (lo < 2000) return 'Master';
  return 'Elite';
}

function formatClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function readBests() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; }
  catch { return {}; }
}

function writeBest(key, score) {
  const all = readBests();
  if (!(score > (all[key] || 0))) return all[key] || 0;
  all[key] = score;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  return score;
}

/* =============================================================================
   SHELL STATE
   ========================================================================== */
const shell = document.getElementById('app');
const settings = createSettings();
const ui = createUI({ root: shell, settings: () => settings.get() });
const data = createData();
const games = createGames();   // full games for review; fetches nothing until then
const stats = createStats();
const rating = createRating(store);   // same durable store as ctx.stats

let currentScreen = null;      // the mounted `.screen` element
let currentRoute = '';         // the hash we last rendered
let host = null;               // active mode host (see mountMode)
let lastSummary = null;        // for #/summary
let dataReady = null;          // memoised data.ready() promise
let settingsSheetClose = null;
let review = null;             // active review player (see REVIEW PLAYER)
let offlineJob = null;         // running prefetch, if any (see OFFLINE STORAGE)

/* -----------------------------------------------------------------------------
   SCREEN MOUNTING
   Exactly one `.screen` lives in `.app-shell` at a time; they all occupy the
   same grid cell, so swapping is a replace, never a stack.
   -------------------------------------------------------------------------- */
function mountScreen(screen) {
  if (currentScreen && currentScreen.isConnected) currentScreen.remove();
  screen.classList.add('screen--enter');
  screen.addEventListener('animationend', () => screen.classList.remove('screen--enter'), { once: true });
  currentScreen = screen;
  // Insert before the toast layer so toasts stay on top of the screen.
  const toastLayer = shell.querySelector('.toast-layer');
  if (toastLayer) shell.insertBefore(screen, toastLayer);
  else shell.appendChild(screen);
  return screen;
}

function showLoading(title, status) {
  const node = fromHTML(`
    <div class="loading">
      <div class="spinner" role="status" aria-label="Loading"></div>
      <h1 class="loading__title">${esc(title)}</h1>
      <p class="loading__status">${esc(status || '')}</p>
    </div>`);
  const existing = shell.querySelector('.loading');
  if (existing) existing.remove();
  shell.appendChild(node);
  return () => node.remove();
}

/** The generic top bar: [left] title [gear]. */
function appBar({ back = false, title = '', restart = false } = {}) {
  const left = restart
    ? `<button class="icon-btn icon-btn--danger" data-shell="restart" aria-label="Restart">${icon('i-refresh')}</button>`
    : back
      ? `<button class="icon-btn" data-shell="back" aria-label="Back">${icon('i-back')}</button>`
      : '<span></span>';
  return `
    <header class="app-bar">
      ${left}
      <div class="app-bar__title" data-shell="header">${esc(title)}</div>
      <button class="icon-btn" data-shell="settings" aria-label="Settings">${icon('i-gear')}</button>
    </header>`;
}

/**
 * The 2D / 3D choice, on the setup screen where it belongs.
 *
 * `board` is one of the five rating axes, and the comparison this whole app is
 * built around is your 2D rating against your 3D rating on the same puzzles. If
 * picking a board meant digging through a settings sheet, that comparison would
 * be buried. So it is a per-run choice here, pre-selected from the global
 * setting (or the mode's own default), and it wins over the global setting for
 * the run it starts.
 */
function boardPicker(selected) {
  return `
    <div class="section">
      <span class="section__title">Board</span>
      <div class="segmented segmented--block" role="group" aria-label="Board" data-role="board">
        <label class="segmented__option${selected === '2d' ? ' is-active' : ''}">
          <input type="radio" name="setup-board" value="2d"${selected === '2d' ? ' checked' : ''}><span>2D</span>
        </label>
        <label class="segmented__option${selected === '3d' ? ' is-active' : ''}">
          <input type="radio" name="setup-board" value="3d"${selected === '3d' ? ' checked' : ''}><span>3D</span>
        </label>
      </div>
      <span class="setting-row__desc" data-role="board-desc"></span>
    </div>`;
}

const BOARD_DESC = {
  '2d': 'Flat board, squares highlighted — the online-equivalent view.',
  '3d': 'Perspective board from a shifting seat. Harder to read, which is the point.',
};

/** Wires a boardPicker; `onChange` gets '2d' | '3d'. */
function wireBoardPicker(screen, initial, onChange) {
  const desc = screen.querySelector('[data-role="board-desc"]');
  const paint = (value) => { if (desc) desc.textContent = BOARD_DESC[value] || ''; };
  paint(initial);
  on(screen, '[data-role="board"] input', 'change', (ev) => {
    for (const opt of screen.querySelectorAll('[data-role="board"] .segmented__option')) {
      opt.classList.toggle('is-active', opt.querySelector('input').checked);
    }
    paint(ev.target.value);
    onChange(ev.target.value);
  });
}

function wireChrome(screen) {
  on(screen, '[data-shell="back"]', 'click', () => history.back());
  on(screen, '[data-shell="settings"]', 'click', () => openSettingsSheet());
}

/* =============================================================================
   NAVIGATION
   ========================================================================== */
function navigate(hash, { replace = false } = {}) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (replace) history.replaceState(history.state, '', target);
  else location.hash = target;
  if (replace) route();
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query), raw };
}

async function route() {
  const { path, params, raw } = parseRoute();
  if (raw === currentRoute) return;
  currentRoute = raw;

  // Leaving play always tears the mode and the board down. The review player
  // owns a board of its own and has to be torn down on exactly the same edge.
  if (host) await destroyHost();
  if (review) destroyReview();
  // A prefetch is tied to the screen that started it. Leaving cancels it rather
  // than letting 50 MB of downloads compete with a run for the radio — and
  // every band already written stays, so nothing is lost by stopping. See the
  // OFFLINE STORAGE section.
  if (offlineJob) offlineJob.cancel();

  switch (path) {
    case '/':
      renderHome();
      break;
    case '/rush':
      renderRushSetup();
      break;
    case '/tactics':
      renderTacticsSetup();
      break;
    case '/visualization':
      renderVisualizationSetup();
      break;
    case '/square-id':
      renderSquareIdSetup();
      break;
    case '/play':
      await renderPlay(params);
      break;
    case '/stats':
      renderStats();
      break;
    case '/offline':
      await renderOffline();
      break;
    case '/summary':
      if (lastSummary) renderSummary(lastSummary);
      else navigate('#/', { replace: true });
      break;
    // Reachable with no summary in this tab: `?id=` rebuilds itself from the
    // corpus, so a link opened in a new tab (or a cold launch, or a shared url)
    // lands on a real review rather than being bounced home.
    case '/review':
      await renderReview(params);
      break;
    default:
      navigate('#/', { replace: true });
  }
}

/* =============================================================================
   HOME  —  three tiers, in the order the user asked for
   ========================================================================== */
function renderHome() {
  const s = settings.get();
  const best = readBests()['blunderrush:timed'] || 0;

  const screen = fromHTML(`
    <div class="screen screen--menu">
      <header class="app-bar">
        <button class="icon-btn icon-btn--ghost" data-go="#/stats" aria-label="Progress">${icon('i-chart')}</button>
        <div class="app-bar__title" data-shell="header">Tactics Trainer</div>
        <button class="icon-btn" data-shell="settings" aria-label="Settings">${icon('i-gear')}</button>
      </header>
      <div class="screen-body u-scroll">
        <div class="screen-body__inner">

          <div class="hero">
            <h1 class="hero__title">Train</h1>
            <p class="hero__subtitle">
              Best run <strong class="u-num">${best}</strong> &middot;
              Level <strong class="u-num">${s.rating}</strong>
            </p>
          </div>

          <!-- TIER 1 — the game -->
          <div class="section">
            <div class="mode-list">
              <button class="mode-card mode-card--rush is-selected" data-go="#/rush">
                <span class="mode-card__icon">${icon('i-bolt')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Blunder Rush</span>
                  <span class="mode-card__desc">Safe or unsafe, as many as you can</span>
                  <span class="mode-card__meta">Timed &middot; Survival &middot; Practice</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
            </div>
          </div>

          <!-- TIER 2 — regular tactic solving -->
          <div class="section">
            <span class="section__title">Tactics</span>
            <div class="mode-list">
              <button class="mode-card mode-card--classic" data-go="#/tactics">
                <span class="mode-card__icon">${icon('i-puzzle')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Tactics</span>
                  <span class="mode-card__desc">Find and play the winning move</span>
                  <span class="mode-card__meta">Rated &middot; 2D or 3D &middot; Offensive or defensive</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
            </div>
          </div>

          <!-- TIER 3 — look-ahead tactics -->
          <div class="section">
            <span class="section__title">Visualization</span>
            <div class="mode-list">
              <button class="mode-card mode-card--blind" data-go="#/visualization">
                <span class="mode-card__icon">${icon('i-eye-off')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Visualization</span>
                  <span class="mode-card__desc">Read the moves, solve without the board moving</span>
                  <span class="mode-card__meta">Rated &middot; 2D or 3D &middot; Pick your look-ahead</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
            </div>
          </div>

          <!-- TIER 4 — the vision drills, deliberately secondary -->
          <div class="section">
            <span class="section__title">Exercises</span>
            <div class="mode-list">
              <button class="mode-card" data-go="#/play?mode=drills&amp;drill=color">
                <span class="mode-card__icon">${icon('i-target')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Square colour</span>
                  <span class="mode-card__desc">Light or dark, without looking</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
              <button class="mode-card" data-go="#/square-id">
                <span class="mode-card__icon">${icon('i-cube')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Square identification</span>
                  <span class="mode-card__desc">Tap the square you are named, fast</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
              <button class="mode-card" data-go="#/play?mode=drills&amp;drill=diagonal">
                <span class="mode-card__icon">${icon('i-bolt')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Diagonals</span>
                  <span class="mode-card__desc">Trace the diagonal between two squares</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
            </div>
          </div>

          <button class="btn btn--ghost btn--block" data-go="#/stats">
            ${icon('i-chart')} Progress &amp; vision stats
          </button>

          <!-- Secondary, beside Progress rather than among the games: you go
               looking for it before a flight, not on the way to a run. -->
          <button class="btn btn--ghost btn--block" data-go="#/offline">
            ${icon('i-cube')} Offline downloads
          </button>

        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner">
          <button class="btn btn--primary btn--lg btn--block" data-go="#/rush">
            ${icon('i-bolt')} Play Blunder Rush
          </button>
        </div>
      </div>
    </div>`);

  on(screen, '[data-go]', 'click', (ev) => {
    navigate(ev.currentTarget.getAttribute('data-go'));
  });
  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   BLUNDER RUSH SETUP
   ========================================================================== */
function renderRushSetup() {
  const s = settings.get();
  let variant = 'timed';
  let band = s.rating;
  let board = s.board;

  const screen = fromHTML(`
    <div class="screen screen--menu">
      ${appBar({ back: true, title: 'Blunder Rush' })}
      <div class="screen-body u-scroll">
        <div class="screen-body__inner">
          <div class="hero">
            <h1 class="hero__title">Blunder Rush</h1>
            <p class="hero__subtitle">Is the move about to be played safe, or is it a blunder?</p>
          </div>

          <div class="section">
            <span class="section__title">How do you want to play?</span>
            <div class="mode-list" role="radiogroup" aria-label="Variant">
              <button class="mode-card mode-card--rush is-selected" role="radio" aria-checked="true" data-variant="timed">
                <span class="mode-card__icon">${icon('i-timer')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Timed</span>
                  <span class="mode-card__desc">Beat the clock, as many as you can</span>
                  <span class="mode-card__meta">5 min &middot; 3 strikes</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
              <button class="mode-card mode-card--survival" role="radio" aria-checked="false" data-variant="survival">
                <span class="mode-card__icon">${icon('i-heart')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Survival</span>
                  <span class="mode-card__desc">No clock. Three mistakes and out</span>
                  <span class="mode-card__meta">Untimed &middot; 3 strikes</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
              <button class="mode-card mode-card--rated" role="radio" aria-checked="false" data-variant="practice">
                <span class="mode-card__icon">${icon('i-target')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Practice</span>
                  <span class="mode-card__desc">One rating level, no pressure</span>
                  <span class="mode-card__meta">Untimed &middot; No strikes</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
            </div>
          </div>

          ${boardPicker(board)}

          <div class="band-picker" data-role="bands" hidden>
            <div class="band-picker__head">
              <span class="section__title">Rating level</span>
              <span class="band-picker__current u-num" data-role="band-current"></span>
            </div>
            <div class="band-row u-scroll-x" role="radiogroup" aria-label="Rating level" data-role="band-row"></div>
          </div>
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner">
          <button class="btn btn--primary btn--lg btn--block" data-role="start">
            ${icon('i-bolt')} Start
          </button>
        </div>
      </div>
    </div>`);

  const bandsBox = screen.querySelector('[data-role="bands"]');
  const bandRow = screen.querySelector('[data-role="band-row"]');
  const bandCurrent = screen.querySelector('[data-role="band-current"]');

  const rangeText = (b) => `${b.lo}–${b.hi}`;

  function paintBands(bands) {
    // Snap the remembered level onto a band that actually exists.
    const nearest = bands.reduce(
      (best, b) => (Math.abs(b.lo - band) < Math.abs(best.lo - band) ? b : best), bands[0]);
    if (!bands.some((b) => b.lo === band)) band = nearest.lo;
    const current = bands.find((b) => b.lo === band) || nearest;

    bandRow.innerHTML = bands.map((b) => `
      <button class="band" role="radio" aria-checked="${b.lo === band}" data-band="${b.lo}">
        <span class="band__range u-num">${b.lo}&ndash;${b.hi}</span>
        <span class="band__label">${bandLabel(b.lo)}</span>
      </button>`).join('');
    bandCurrent.textContent = rangeText(current);

    on(bandRow, '.band', 'click', (ev) => {
      band = Number(ev.currentTarget.getAttribute('data-band'));
      for (const chip of bandRow.querySelectorAll('.band')) {
        chip.setAttribute('aria-checked', String(Number(chip.getAttribute('data-band')) === band));
      }
      const picked = bands.find((b) => b.lo === band);
      if (picked) bandCurrent.textContent = rangeText(picked);
      settings.set({ rating: band });
    });

    const selected = bandRow.querySelector('[aria-checked="true"]');
    if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // Real bands if the build has landed, a sane static ladder if it hasn't.
  ensureData().then(() => {
    const index = data.index;
    const width = (index && index.band) || 100;
    const bands = index && Array.isArray(index.bands) && index.bands.length
      ? index.bands.map((b) => ({ lo: b.lo, hi: b.hi != null ? b.hi : b.lo + width - 1 }))
        .sort((a, b) => a.lo - b.lo)
      : FALLBACK_BANDS.map((lo) => ({ lo, hi: lo + 199 }));
    paintBands(bands);
  }).catch(() => {
    paintBands(FALLBACK_BANDS.map((lo) => ({ lo, hi: lo + 199 })));
    ui.toast('Puzzle index unavailable — using default levels', { kind: 'error', duration: 4000 });
  });

  on(screen, '[data-variant]', 'click', (ev) => {
    variant = ev.currentTarget.getAttribute('data-variant');
    for (const card of screen.querySelectorAll('[data-variant]')) {
      const active = card.getAttribute('data-variant') === variant;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-checked', String(active));
    }
    bandsBox.hidden = variant !== 'practice';
  });

  wireBoardPicker(screen, board, (value) => { board = value; });

  screen.querySelector('[data-role="start"]').addEventListener('click', () => {
    const params = new URLSearchParams({ mode: 'blunderrush', variant, board });
    if (variant === 'practice') params.set('band', String(band));
    navigate(`#/play?${params.toString()}`);
  });

  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   3D TACTICS SETUP  —  framing and perspective

   Defaults are offensive / your side, so the common path is one tap on Start.
   The two experimental axes sit below, available but not in the way.
   ========================================================================== */
function renderTacticsSetup() {
  let framing = 'offensive';
  let perspective = 'own';
  // Perspective solving is what this mode is for, so 3D is pre-selected — but
  // it is a visible choice, because switching it is how you measure the gap.
  let board = MODES.tactics.defaultBoard || settings.get().board;

  const screen = fromHTML(`
    <div class="screen screen--menu">
      ${appBar({ back: true, title: 'Tactics' })}
      <div class="screen-body u-scroll">
        <div class="screen-body__inner">
          <div class="hero">
            <h1 class="hero__title">Tactics</h1>
            <p class="hero__subtitle">Rated. Each combination below carries its own rating, so you can see what the board and the framing actually cost you.</p>
          </div>

          ${boardPicker(board)}

          <div class="section">
            <span class="section__title">Framing</span>
            <div class="mode-list" role="radiogroup" aria-label="Framing">
              <button class="mode-card mode-card--classic is-selected" role="radio" aria-checked="true" data-framing="offensive">
                <span class="mode-card__icon">${icon('i-bolt')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Offensive</span>
                  <span class="mode-card__desc">They have already blundered — find the punishment</span>
                  <span class="mode-card__meta">The standard tactics task</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
              <button class="mode-card mode-card--survival" role="radio" aria-checked="false" data-framing="defensive">
                <span class="mode-card__icon">${icon('i-shield')}</span>
                <span class="mode-card__body">
                  <span class="mode-card__title">Defensive</span>
                  <span class="mode-card__desc">The position before the blunder, you to move — see that the natural move loses</span>
                  <span class="mode-card__meta">How games are actually lost</span>
                </span>
                <span class="mode-card__chevron">${icon('i-chevron')}</span>
              </button>
            </div>
          </div>

          <div class="section">
            <span class="section__title">Viewpoint</span>
            <div class="segmented segmented--block" role="group" aria-label="Viewpoint" data-role="perspective">
              <label class="segmented__option is-active"><input type="radio" name="setup-perspective" value="own" checked><span>Your side</span></label>
              <label class="segmented__option"><input type="radio" name="setup-perspective" value="opponent"><span>Opponent’s side</span></label>
            </div>
            <span class="setting-row__desc" data-role="bucket-note"></span>
          </div>
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner">
          <button class="btn btn--primary btn--lg btn--block" data-role="start">
            ${icon('i-puzzle')} Start
          </button>
        </div>
      </div>
    </div>`);

  const note = screen.querySelector('[data-role="bucket-note"]');
  const refreshNote = () => {
    const s = settings.get();
    // `settings.get()` already resolves promptStyle, and it no longer depends on
    // the board — that is the point of it being its own axis.
    const key = bucketKey({
      mode: 'tactics',
      board,
      promptStyle: s.promptStyle,
      perspective,
      framing,
      plies: '0',                 // tactics has no look-ahead window
    });
    const p = rating.get(key);
    note.textContent = p.n
      ? `This combination is rated ${Math.round(p.r)} ± ${Math.round(p.rd)} after ${p.n} attempts.`
      : 'This combination has no rated attempts yet.';
  };
  refreshNote();

  on(screen, '[data-framing]', 'click', (ev) => {
    framing = ev.currentTarget.getAttribute('data-framing');
    for (const card of screen.querySelectorAll('[data-framing]')) {
      const active = card.getAttribute('data-framing') === framing;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-checked', String(active));
    }
    refreshNote();
  });
  on(screen, 'input[name="setup-perspective"]', 'change', (ev) => {
    perspective = ev.target.value;
    for (const opt of screen.querySelectorAll('[data-role="perspective"] .segmented__option')) {
      opt.classList.toggle('is-active', opt.querySelector('input').checked);
    }
    refreshNote();
  });
  wireBoardPicker(screen, board, (value) => { board = value; refreshNote(); });

  screen.querySelector('[data-role="start"]').addEventListener('click', () => {
    navigate(`#/play?mode=tactics&board=${board}&framing=${framing}&perspective=${perspective}`);
  });

  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   SQUARE IDENTIFICATION SETUP  —  board only

   The only drill a board applies to at all (see drills.js's file header) --
   "colour" and "diagonal" are pure recall with no board to show. Defaults to 2D:
   at 3D's exact top-down seat the first question already looks flat, so nothing
   about this drill obviously needs the extra dimension, and a player who wants it
   anyway can still pick it here.
   ========================================================================== */
function renderSquareIdSetup() {
  let board = '2d';

  const screen = fromHTML(`
    <div class="screen screen--menu">
      ${appBar({ back: true, title: 'Square identification' })}
      <div class="screen-body u-scroll">
        <div class="screen-body__inner">
          <div class="hero">
            <h1 class="hero__title">Square identification</h1>
            <p class="hero__subtitle">A square is named — tap it as fast as you can.</p>
          </div>

          ${boardPicker(board)}
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner">
          <button class="btn btn--primary btn--lg btn--block" data-role="start">
            ${icon('i-cube')} Start
          </button>
        </div>
      </div>
    </div>`);

  wireBoardPicker(screen, board, (value) => { board = value; });

  screen.querySelector('[data-role="start"]').addEventListener('click', () => {
    navigate(`#/play?mode=drills&drill=square&board=${board}`);
  });

  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   VISUALIZATION SETUP  —  board and look-ahead depth

   Both choices are rating axes, and both were previously unreachable: the home
   tile went straight to #/play, so every run was 2D at the deepest window and
   every result landed in one bucket. Depth is the mode's difficulty dial, so
   "what do I saturate at with two moves versus three?" needs it to be a per-run
   choice that reaches the bucket — which is the whole reason `plies` is an axis.
   ========================================================================== */
function renderVisualizationSetup() {
  const choices = MODE_PLY_CHOICES.visualization;
  // The deepest window, which is what the mode did before this screen existed —
  // so the default keeps every existing rating comparable with new runs.
  let plies = choices[choices.length - 1];
  let board = settings.get().board;

  const screen = fromHTML(`
    <div class="screen screen--menu">
      ${appBar({ back: true, title: 'Visualization' })}
      <div class="screen-body u-scroll">
        <div class="screen-body__inner">
          <div class="hero">
            <h1 class="hero__title">Visualization</h1>
            <p class="hero__subtitle">Read the listed moves, play them forward in your head, and find the tactic in the position they lead to — while the board in front of you never moves.</p>
          </div>

          ${boardPicker(board)}

          <div class="section">
            <span class="section__title">Look-ahead</span>
            <div class="segmented segmented--block" role="group" aria-label="Look-ahead" data-role="plies">
              ${choices.map((n) => `
                <label class="segmented__option segmented__option--compact${n === plies ? ' is-active' : ''}">
                  <input type="radio" name="setup-plies" value="${n}"${n === plies ? ' checked' : ''}>
                  <span>${esc(PLY_LABELS[n].label)}</span>
                </label>`).join('')}
            </div>
            <span class="setting-row__desc" data-role="plies-desc"></span>
          </div>

          <div class="section">
            <span class="setting-row__desc" data-role="bucket-note"></span>
          </div>
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner">
          <button class="btn btn--primary btn--lg btn--block" data-role="start">
            ${icon('i-eye-off')} Start
          </button>
        </div>
      </div>
    </div>`);

  const plyDesc = screen.querySelector('[data-role="plies-desc"]');
  const note = screen.querySelector('[data-role="bucket-note"]');

  // The note describes the bucket this screen is ABOUT to start — so the board
  // and depth come from the pending choices here, and only promptStyle (which
  // has no per-run control) comes from stored settings.
  const refreshNote = () => {
    plyDesc.textContent = PLY_LABELS[plies].desc;
    const s = settings.get();
    const p = rating.get(bucketKey({
      mode: 'visualization',
      board,
      promptStyle: s.promptStyle,
      perspective: 'own',
      framing: 'offensive',
      plies: String(plies),
    }));
    note.textContent = p.n
      ? `${PLY_LABELS[plies].label} in ${board.toUpperCase()} is rated ${Math.round(p.r)} ± ${Math.round(p.rd)} after ${p.n} attempts.`
      : `${PLY_LABELS[plies].label} in ${board.toUpperCase()} has no rated attempts yet — it carries its own rating, separate from every other depth.`;
  };
  refreshNote();

  on(screen, 'input[name="setup-plies"]', 'change', (ev) => {
    plies = Number(ev.target.value);
    for (const opt of screen.querySelectorAll('[data-role="plies"] .segmented__option')) {
      opt.classList.toggle('is-active', opt.querySelector('input').checked);
    }
    refreshNote();
  });
  wireBoardPicker(screen, board, (value) => { board = value; refreshNote(); });

  screen.querySelector('[data-role="start"]').addEventListener('click', () => {
    navigate(`#/play?mode=visualization&board=${board}&plies=${plies}`);
  });

  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   DATA
   ========================================================================== */
function ensureData() {
  if (!dataReady) {
    dataReady = data.ready().catch((err) => { dataReady = null; throw err; });
  }
  return dataReady;
}

/** How deep a quiet window this puzzle can actually supply. */
function quietWindow(puzzle) {
  if (!puzzle) return 0;
  return Math.max(0, Math.min(puzzle.d | 0, (puzzle.p || []).length));
}

/**
 * The data layer, wrapped so that *every* puzzle a mode picks reseats the 3D
 * camera deterministically — no cooperation required from the mode, and the
 * same puzzle always reproduces the same view. Guarded, because the 3D board is
 * being revised concurrently and `randomSeat` may not exist yet (and the 2D
 * board will never have it).
 *
 * It also enforces the run's LOOK-AHEAD DEPTH. Visualization clamps its window
 * to what the puzzle can supply, so a puzzle with a shallower verified quiet
 * window would silently be played at a smaller depth than the run is bucketed
 * under — a rating recorded against a look-ahead that never happened, which is
 * precisely the corruption the plies axis exists to avoid. Re-picking is bounded
 * and cheap: every band is already in memory by the second call.
 */
function wrapData(getBoard, minWindow = 0) {
  const wrapped = Object.create(data);
  wrapped.pick = async (...args) => {
    let puzzle = await data.pick(...args);
    if (minWindow > 0) {
      for (let tries = 0; tries < 12 && quietWindow(puzzle) < minWindow; tries++) {
        const next = await data.pick(...args);
        if (!next) break;
        puzzle = next;
      }
      if (quietWindow(puzzle) < minWindow) {
        // Nothing in range is deep enough. Better to say so than to quietly
        // rate a shallower puzzle as though it had been the deeper one.
        console.warn(`no puzzle with a ${minWindow}-ply quiet window in range`);
        return null;
      }
    }
    if (puzzle && puzzle.i != null) seatFor(getBoard(), puzzle);
    return puzzle;
  };

  // Same treatment for the ladder path. Blunder Rush's ramp sweeps the whole rating
  // range in one run, so serving it from per-band shards means downloading 6-16 bands
  // mid-run; the ladder is one small cross-band pack that avoids that entirely.
  // The seat and min-window logic must apply identically, or the same puzzle would
  // behave differently depending on which path served it.
  wrapped.pickLadder = async (...args) => {
    let puzzle = await data.pickLadder(...args);
    if (minWindow > 0) {
      for (let tries = 0; tries < 12 && quietWindow(puzzle) < minWindow; tries++) {
        const next = await data.pickLadder(...args);
        if (!next) break;
        puzzle = next;
      }
      if (quietWindow(puzzle) < minWindow) {
        console.warn(`no ladder puzzle with a ${minWindow}-ply quiet window in range`);
        return null;
      }
    }
    if (puzzle && puzzle.i != null) seatFor(getBoard(), puzzle);
    return puzzle;
  };
  return wrapped;
}

function seatFor(board, puzzle) {
  if (!board || !puzzle) return false;
  const inner = typeof board.raw === 'function' ? board.raw() : board;
  if (!inner || typeof inner.randomSeat !== 'function') return false;
  try { inner.randomSeat(seedFor(puzzle.i)); return true; }
  catch { return false; }
}

/* =============================================================================
   BOARD
   The shell creates one board per play session and destroys it on exit. The
   handle handed to modes is a stable wrapper, so changing 2D/3D (or the
   coordinates setting) mid-run swaps the renderer underneath without the mode
   ever noticing its `ctx.board` reference go stale.
   ========================================================================== */
async function createBoardHandle(container, getSettings = () => settings.get(), overrides = {}) {
  let inner = null;
  let destroyed = false;
  let lastFen = START_FEN;
  let orientation = 'white';
  let squareTapHandler = null;

  // Interactivity is wrapper state, not renderer state. board2d can toggle it
  // live; board3d only reads it at construction, so we build 3D interactive and
  // gate acceptance here instead — rebuilding a three.js scene every time a mode
  // locks the board between puzzles would be unusable.
  let interactive = false;
  let onMoveHandler = null;

  async function build() {
    const s = getSettings();
    const is3d = s.board === '3d';
    const mod = is3d ? await import('./board3d.js') : await import('./board2d.js');
    const board = mod.createBoard(container, {
      position: lastFen,
      orientation,
      // The user's global preference, unless the mode declares otherwise. The
      // square-identification and diagonal drills are literally unsolvable with
      // coordinate labels on — the labels are the answer — so a mode's
      // `meta.boardOptions` wins here.
      coordinates: s.coordinates,
      ...overrides,
      interactive: is3d ? true : interactive,
      onMove: (from, to) => {
        if (!interactive || !onMoveHandler) return false;
        return onMoveHandler(from, to);
      },
      assist: s.assist3d,
    });
    // Re-install anything the mode set on the previous renderer, so a mid-run
    // 2D/3D swap is invisible to it.
    if (squareTapHandler && typeof board.setSquareTapHandler === 'function') {
      board.setSquareTapHandler(squareTapHandler);
    }
    return board;
  }

  inner = await build();

  const wrapper = {
    get el() { return inner && inner.el; },
    raw: () => inner,

    setPosition(fen, opts) { lastFen = fen; return inner.setPosition(fen, opts); },
    animateMove(from, to, opts) {
      if (opts && opts.fen) lastFen = opts.fen;
      return inner.animateMove(from, to, opts);
    },
    setOrientation(side) { orientation = side === 'black' ? 'black' : 'white'; return inner.setOrientation(side); },
    getOrientation() { return inner.getOrientation(); },
    highlight(sq, kind) { return inner.highlight(sq, kind); },
    clearHighlights(kind) { return inner.clearHighlights(kind); },
    arrow(from, to, kind) { return inner.arrow(from, to, kind); },
    clearArrows() { return inner.clearArrows(); },
    flash(kind) { return inner.flash(kind); },
    setSquareTapHandler(fn) {
      squareTapHandler = typeof fn === 'function' ? fn : null;
      if (typeof inner.setSquareTapHandler !== 'function') return false;
      inner.setSquareTapHandler(squareTapHandler);
      return true;
    },
    /**
     * Deliver a square tap as though the user had touched it. For the headless checks only:
     * synthesising real pointer events against a 3D canvas means solving the camera
     * projection in the test, and against the 2D board it means guessing at DOM internals —
     * both of which test the harness more than the app. Nothing in the app calls this.
     */
    __tap(square) {
      if (typeof squareTapHandler === 'function') squareTapHandler(square);
      return !!squareTapHandler;
    },
    resize() { return inner.resize(); },

    /* --- extras the shell adds on top of the board contract --------------- */
    /** Deterministic camera seat for a puzzle; a no-op in 2D. */
    seatFor(puzzle) { return seatFor(handle, puzzle); },

    /** Live in 2D, gated here in 3D — same observable behaviour either way. */
    setInteractive(value) {
      interactive = !!value;
      if (typeof inner.setInteractive === 'function') inner.setInteractive(interactive);
      return interactive;
    },
    isInteractive() { return interactive; },
    setOnMove(fn) {
      onMoveHandler = typeof fn === 'function' ? fn : null;
      return !!onMoveHandler;
    },

    async swap() {
      if (destroyed) return;
      // Tear the old renderer down FIRST: both renderers empty their container
      // on destroy(), so building the new one first would see it wiped out from
      // under it a moment later.
      try { inner.destroy(); } catch { /* ignore */ }
      inner = await build();
      inner.resize();
    },

    destroy() {
      destroyed = true;
      try { inner.destroy(); } catch { /* ignore */ }
      inner = null;
    },
  };

  // Anything the wrapper doesn't name falls straight through to the live
  // renderer: randomSeat, getSeat, setSeat, setView, setAssist, refreshTheme,
  // setSquareTapHandler, getCameraState… The renderers are being extended
  // concurrently, and an explicit allowlist here would silently hide whatever
  // lands next. `inner` is read at access time, so this survives a swap.
  const handle = new Proxy(wrapper, {
    get(target, prop, recv) {
      if (prop in target) return Reflect.get(target, prop, recv);
      const value = inner ? inner[prop] : undefined;
      return typeof value === 'function' ? value.bind(inner) : value;
    },
    has(target, prop) {
      return (prop in target) || !!(inner && prop in inner);
    },
  });

  return handle;
}

/* =============================================================================
   PLAY  —  mode host
   ========================================================================== */
async function destroyHost() {
  const current = host;
  host = null;
  if (!current) return;
  current.disposed = true;
  if (current.observer) current.observer.disconnect();
  try { current.handle && current.handle.destroy && current.handle.destroy(); }
  catch (err) { console.error('mode destroy() failed', err); }
  if (current.root) current.root.replaceChildren();
  try { current.board && current.board.destroy(); }
  catch (err) { console.error('board destroy() failed', err); }
}

async function renderPlay(params) {
  const modeId = params.get('mode') || 'blunderrush';
  const meta = MODES[modeId];
  if (!meta) { navigate('#/', { replace: true }); return; }

  // A snapshot for the whole run. Board, perspective and framing come from the
  // setup screen via the URL; prompt style follows from the board. A mode never
  // has to think about which rating bucket it is filling.
  const s = settings.get();
  const boardParam = params.get('board') === '3d' ? '3d'
    : params.get('board') === '2d' ? '2d' : null;
  // 'own' unless the user deliberately picked otherwise on a setup screen.
  // Never flipped implicitly — that would silently mislabel a bucket.
  const perspective = params.get('perspective') === 'opponent' ? 'opponent' : 'own';
  const framing = MODE_FIXED_FRAMING[modeId]
    || (['offensive', 'defensive'].includes(params.get('framing')) ? params.get('framing') : 'offensive');

  const config = {
    variant: params.get('variant') || (modeId === 'blunderrush' ? 'timed' : 'practice'),
    band: Number(params.get('band')) || s.rating,
    perspective,
    framing,
  };
  const drill = params.get('drill');
  if (drill) config.drill = drill;

  // Look-ahead depth, for the one mode that has one. Only a value the mode
  // actually offers is accepted; anything else falls back to the deepest, which
  // is what the mode did before the setting existed.
  const plyChoices = MODE_PLY_CHOICES[modeId];
  if (plyChoices) {
    const asked = Number(params.get('plies'));
    config.plies = plyChoices.includes(asked) ? asked : plyChoices[plyChoices.length - 1];
  }

  const title = drill ? (DRILL_TITLES[drill] || meta.title) : meta.title;
  const hideLoading = showLoading(title, 'Getting the board ready…');

  // The mode's mount point IS the fixed three-row play grid.
  const root = fromHTML('<div class="screen screen--play"></div>');

  // `ctx.boardEl` is a bare mount, not a framed board: every mode renders its
  // own `.board-area > .board-frame > .board-slot` from the design system and
  // drops this inside it. `boardFallback` is the same scaffold, used only when
  // a mode builds a stage but never places the board itself.
  const boardEl = fromHTML('<div data-shell="board" style="position:relative;width:100%;height:100%"></div>');
  const boardFallback = fromHTML(`
    <div class="board-area">
      <div class="board-frame"><div class="board-slot"></div></div>
    </div>`);
  boardFallback.querySelector('.board-slot').appendChild(boardEl);

  const session = {
    root, boardEl, boardFallback, board: null, handle: null, modeId, config,
    runSettings: s,
    // Has anything happened yet that abandoning would throw away? Set by the
    // shell's own ctx surfaces (see markProgress) so no mode has to cooperate.
    progressed: false,
    finished: false,
    bucket: bucketForRun(modeId, s, config),
    disposed: false, headerState: {}, headerSlot: null, headerShape: '', observer: null,
  };
  host = session;

  // Load the module FIRST: `meta.boardOptions` can override board options that
  // the mode needs for its exercise to make sense at all — the square-ID and
  // diagonal drills are unsolvable with coordinate labels showing, and board3d
  // bakes those into a texture, so it has to be decided before construction.
  let factory = null;
  let loadError = null;
  let boardOptions = {};
  let modeBoard = null;
  try {
    const mod = await meta.load();
    factory = mod && (mod.createMode || mod.default);
    const declared = mod && mod.meta && mod.meta.boardOptions;
    if (declared && typeof declared === 'object') {
      boardOptions = { ...declared };
      // A mode may declare which RENDERER its exercise needs, the same way it
      // declares `coordinates`. It is a default, not a lock: an explicit choice
      // on the setup screen still wins.
      if (boardOptions.board === '2d' || boardOptions.board === '3d') modeBoard = boardOptions.board;
      // These belong to the run, not to the module.
      for (const key of ['board', 'position', 'orientation', 'interactive', 'onMove']) {
        delete boardOptions[key];
      }
    }
    if (typeof factory !== 'function') throw new Error('module exports no createMode(ctx)');
  } catch (err) {
    loadError = err;
  }
  if (session.disposed) { hideLoading(); return; }
  session.boardOptions = boardOptions;

  // Renderer precedence: what the user picked on the setup screen > what the
  // mode declares it needs > the mode's registry default > the global setting.
  // Whatever wins goes into runSettings BEFORE the board is built and before
  // the bucket is computed, so a 3D run is always recorded against the 3D
  // bucket -- getting that wrong would silently corrupt the comparison.
  const chosenBoard = boardParam || modeBoard || meta.defaultBoard || s.board;
  // promptStyle arrives already resolved from settings.get() and no longer
  // depends on the renderer, so the board is the ONLY thing that changes here.
  session.runSettings = { ...s, board: chosenBoard };
  session.bucket = bucketForRun(modeId, session.runSettings, config);

  let board;
  try {
    board = await createBoardHandle(boardEl, () => session.runSettings, boardOptions);
  } catch (err) {
    console.error('board failed to initialise', err);
    hideLoading();
    if (session.disposed) return;
    host = null;
    renderErrorScreen({
      title,
      message: 'The board renderer could not start on this device.',
      detail: String((err && err.message) || err),
    });
    return;
  }
  if (session.disposed) { board.destroy(); hideLoading(); return; }
  session.board = board;

  // Puzzle data is only needed by modes that use it, but every mode that does
  // would otherwise hang here silently. Fail loudly, once, up front.
  let dataError = null;
  try { await ensureData(); }
  catch (err) { dataError = err; }
  if (session.disposed) { hideLoading(); return; }

  const ctx = buildContext(session, board);
  session.ctx = ctx;

  if (dataError && modeId !== 'drills') {
    // Drills don't need puzzles; everything else does.
    hideLoading();
    session.handle = createUnavailableMode(ctx, {
      title,
      headline: 'Puzzle data not available',
      detail: 'app/data/index.json could not be loaded. The build that generates it may not have finished yet.',
      retry: () => { dataReady = null; currentRoute = ''; route(); },
    });
  } else if (loadError) {
    console.warn(`mode "${modeId}" is not available yet:`, loadError && loadError.message);
    hideLoading();
    session.handle = createUnavailableMode(ctx, {
      title,
      headline: `${title} isn't installed yet`,
      detail: `app/js/modes/${modeId}.js could not be loaded. The rest of the app works — this drill will appear as soon as the module lands.`,
      retry: () => { currentRoute = ''; route(); },
    });
  } else {
    try {
      session.handle = assertModeHandle(factory(ctx));
    } catch (err) {
      console.error(`mode "${modeId}" failed to start`, err);
      hideLoading();
      session.handle = createUnavailableMode(ctx, {
        title,
        headline: `${title} failed to start`,
        detail: String((err && err.message) || err),
        retry: () => { currentRoute = ''; route(); },
      });
    }
  }

  hideLoading();
  if (session.disposed) return;

  adoptChrome(session);
  mountScreen(root);
  ensureBarLayout(session);      // now connected, so the stylesheet can be read

  // Watch for a mode that re-renders its own screen and drops our controls.
  session.observer = new MutationObserver(() => {
    if (session.disposed) return;
    if (!root.contains(session.exitBtn)
      || !root.contains(session.restartBtn)
      || !root.contains(session.settingsBtn)) adoptChrome(session);
  });
  session.observer.observe(root, { childList: true, subtree: true });

  requestAnimationFrame(() => { if (!session.disposed) board.resize(); });
}

/**
 * Attach the run's rating bucket, and the axes it decomposes into, to whatever a
 * mode hands `ctx.stats.record`.
 *
 * WHY THE SHELL DOES THIS AND NOT THE MODES
 * All four modes already time each attempt, but they do not all record which
 * board, prompt style, viewpoint or framing was in force — so their records
 * cannot be attributed to a condition, and "3D costs me ten seconds a puzzle"
 * is unanswerable from them. Asking every mode to remember would mean four
 * copies of the same bookkeeping, four chances to get it wrong, and a fifth
 * mode that forgets. The shell already resolved the bucket before `ctx` existed.
 *
 * Read from `session.bucket` at RECORD time, not captured once: switching the
 * board mid-run moves the run into a different bucket, and subsequent answers
 * must be attributed to the new one — exactly the semantics rating attribution
 * already has.
 *
 * Purely additive. A field the mode set always wins, so nothing a mode records
 * today changes meaning.
 */
function stampBucket(session, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  // Spread the parsed axes rather than naming them one by one: `plies` was added
  // as a sixth axis after this function was written, and a hand-written list is
  // exactly what silently drops the next one.
  return { bucket: session.bucket, ...parseBucket(session.bucket), ...payload };
}

/**
 * The ModeContext, exactly as mode-interface.js documents it:
 *   { root, board, boardEl, data, settings, config, ui, onFinish }
 */
function buildContext(session, board) {
  return {
    root: session.root,
    board,
    boardEl: session.boardEl,
    data: wrapData(() => session.board, Number(session.config.plies) || 0),
    settings: { ...session.runSettings },
    config: session.config,
    ui: {
      toast: ui.toast,
      confirm: ui.confirm,
      haptic: ui.haptic,
      sound: ui.sound,
      setHeader: (spec) => setHeader(session, spec),
    },
    // Every record leaves here stamped with the bucket it was earned in — see
    // stampBucket. A mode records what it knows about the answer; which
    // CONDITION the answer was given under is the shell's business, and the
    // shell is the only thing that knows it after a mid-run board swap.
    stats: {
      record: (kind, payload) => {
        markProgress(session);
        return stats.record(kind, stampBucket(session, payload));
      },
      query: (kind, opts) => stats.query(kind, opts),
    },
    // Bound to this session's bucket (mode × board × promptStyle) so a mode
    // never has to know bucketing exists — it just asks for the next target and
    // reports the result.
    rating: {
      // A getter, not a snapshot: switching the board mid-run moves the run into
      // a different bucket, and later attempts must be credited to the new one.
      get bucket() { return session.bucket; },
      get: () => rating.get(session.bucket),
      nextTarget: () => rating.nextTarget(session.bucket),
      record: (puzzleRating, score) => {
        markProgress(session);
        const next = rating.record(session.bucket, puzzleRating, score);
        // Glicko itself is cumulative and cannot be re-cut by date, so log each
        // rated attempt too. That is what lets the stats screen answer "how did
        // this bucket move over the last month?".
        stats.record('rated', {
          bucket: session.bucket,
          mode: session.modeId,
          pr: Math.round(Number(puzzleRating) || 0),
          s: Number(score),
          r: Math.round(next.r),
          rd: Math.round(next.rd),
        });
        return next;
      },
    },
    onFinish: (summary) => finishRun(session, summary),
  };
}

/* -----------------------------------------------------------------------------
   CHROME ADOPTION — exit + restart + settings, wherever the mode put its app bar
   -------------------------------------------------------------------------- */
function adoptChrome(session) {
  const { root } = session;

  let bar = root.querySelector('.app-bar');
  if (!bar) {
    bar = fromHTML(`
      <header class="app-bar">
        <span data-shell="exit-slot"></span>
        <span data-shell="restart-slot"></span>
        <div class="readouts" data-shell="header"></div>
        <span data-shell="settings-slot"></span>
      </header>`);
    root.prepend(bar);
  }

  // Restart and settings first: ensureCorner() reasons about the bar's FIRST and
  // LAST child, and the exit button is neither until it has been inserted.
  session.restartBtn = ensureCorner(bar, 'restart', 'start');
  session.settingsBtn = ensureCorner(bar, 'settings', 'end');
  session.exitBtn = ensureExit(bar);
  // Only measurable once the bar is in the document; on the first mount that is
  // not yet true, so renderPlay re-runs this after mountScreen.
  ensureBarLayout(session);
  session.headerSlot = bar.querySelector('[data-shell="header"]') || session.headerSlot;

  // If the mode built a stage but never placed the board, put it where it
  // obviously belongs: an empty `.board-slot` it left for us, or failing that
  // the shell's own framed scaffold. A mode that wants no board — a pure text
  // drill — simply builds no stage, and none appears.
  if (session.boardEl && !root.contains(session.boardEl)) {
    const stage = root.querySelector('.stage');
    if (stage) {
      const slot = [...stage.querySelectorAll('.board-slot')].find((n) => !n.children.length);
      if (slot) slot.appendChild(session.boardEl);
      else if (!stage.querySelector('.board-area, .board-frame, .blindfold')) {
        stage.appendChild(session.boardFallback);
      }
    }
  }
}

/**
 * Slot one of the shell's corner controls into an app bar we may not have
 * built. `.app-bar` is a strict 3-column grid, so we replace an empty
 * placeholder or re-use the mode's own button rather than adding a 4th child.
 */
function ensureCorner(bar, kind, edge) {
  const existing = bar.querySelector(`[data-shell="${kind}"]`);
  if (existing && existing.tagName === 'BUTTON') {
    wireCorner(existing, kind);
    return existing;
  }

  const btn = fromHTML(kind === 'restart'
    ? `<button class="icon-btn icon-btn--danger" data-shell="restart" aria-label="Restart">${icon('i-refresh')}</button>`
    : `<button class="icon-btn" data-shell="settings" aria-label="Settings">${icon('i-gear')}</button>`);
  wireCorner(btn, kind);

  const slot = bar.querySelector(`[data-shell="${kind}-slot"]`);
  if (slot) { slot.replaceWith(btn); return btn; }
  if (existing) { existing.replaceWith(btn); return btn; }

  const children = [...bar.children];
  const edgeChild = edge === 'start' ? children[0] : children[children.length - 1];
  const isEmptyPlaceholder = edgeChild
    && edgeChild.tagName !== 'BUTTON'
    && !edgeChild.children.length
    && !edgeChild.textContent.trim()
    && !edgeChild.matches('[data-shell="header"], .readouts, .app-bar__title');
  const isReusableButton = edgeChild
    && edgeChild.tagName === 'BUTTON'
    && /^(restart|settings)$/i.test((edgeChild.getAttribute('aria-label') || '').trim());

  if (isEmptyPlaceholder || isReusableButton) { edgeChild.replaceWith(btn); return btn; }
  if (edge === 'start') bar.prepend(btn); else bar.appendChild(btn);
  return btn;
}

function wireCorner(btn, kind) {
  if (btn.dataset.shellWired === '1') return;
  btn.dataset.shellWired = '1';
  btn.addEventListener('click', kind === 'restart' ? requestRestart : () => openSettingsSheet());
}

/**
 * The EXIT control — the third shell control on the play screen.
 *
 * WHY IT IS A CORNER ICON AND NOT A BUTTON IN THE ACTION BAR
 * The action bar is the thumb zone: under a five-minute clock the two answer
 * buttons get hit fast and blind, and anything sharing that arc gets hit with
 * them. The app bar corners are already where this app puts everything
 * secondary and everything destructive, at 40pt, behind a confirm sheet. Exit
 * belongs there for the same reason restart does.
 *
 * WHY IT LEADS THE BAR
 * Leftmost is where every other screen in this app puts "leave this screen"
 * (`appBar({back:true})`), so it needs no learning. It is inserted by the SHELL
 * rather than slotted by the mode, so a mode that knows nothing about it — every
 * mode currently does — still gets one. A mode that wants to place it precisely
 * can leave a `[data-shell="exit-slot"]` placeholder, exactly like the other two.
 */
function ensureExit(bar) {
  const existing = bar.querySelector('[data-shell="exit"]');
  if (existing && existing.tagName === 'BUTTON') {
    wireExit(existing);
    return existing;
  }

  const btn = fromHTML(
    `<button class="icon-btn" data-shell="exit" aria-label="Exit game">${icon('i-exit')}</button>`);
  wireExit(btn);

  const slot = bar.querySelector('[data-shell="exit-slot"]');
  if (slot) { slot.replaceWith(btn); return btn; }
  if (existing) { existing.replaceWith(btn); return btn; }
  bar.prepend(btn);
  return btn;
}

function wireExit(btn) {
  if (btn.dataset.shellWired === '1') return;
  btn.dataset.shellWired = '1';
  btn.addEventListener('click', requestExit);
}

/**
 * `.app-bar` was a strict THREE-column grid — one tap target, the readouts, one
 * tap target — and a third control needs a fourth track or the readouts get
 * squeezed into a corner cell. app.css now owns that rule
 * (`.app-bar:has([data-shell="exit"])`), so this is only a FALLBACK.
 *
 * It measures rather than assumes: the inline value is cleared, the stylesheet's
 * own track count is read back, and the fallback is applied only if the
 * stylesheet is not supplying enough tracks for the buttons present. So the
 * design system's widths always win when the rule is there, and the bar still
 * lays out if it is ever missing (an older cached app.css, or a browser without
 * `:has()`). Measuring needs the bar in the document, hence the callers.
 */
const EXIT_BAR_COLUMNS =
  'var(--tap-min) var(--tap-min) minmax(0, 1fr) calc(var(--tap-min) * 2 + var(--space-2))';

function ensureBarLayout(session) {
  const bar = session && session.exitBtn && session.exitBtn.parentElement;
  if (!bar || !bar.isConnected || !bar.contains(session.exitBtn)) return;

  bar.style.removeProperty('grid-template-columns');
  const tracks = getComputedStyle(bar).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
  const needed = bar.children.length;
  if (tracks.length >= needed) {
    // app.css is handling it; leave both properties entirely alone.
    if (session.settingsBtn) session.settingsBtn.style.removeProperty('justify-self');
    return;
  }
  bar.style.gridTemplateColumns = EXIT_BAR_COLUMNS;
  if (session.settingsBtn) session.settingsBtn.style.justifySelf = 'end';
}

/* -----------------------------------------------------------------------------
   IS THERE ANYTHING TO LOSE?

   The confirm sheet is worth a tap when abandoning would throw work away, and is
   pure friction otherwise. Rather than ask each mode (they would all have to
   agree on what "started" means, and a mode that got it wrong would either nag
   or silently eat a run), the shell watches its OWN surfaces: a mode cannot
   score, rate or log anything except through ctx.stats, ctx.rating and
   ctx.ui.setHeader, and all three are shell code. So this is accurate for every
   mode that exists and every mode that hasn't been written yet.
   -------------------------------------------------------------------------- */
function markProgress(session) {
  if (session && !session.disposed) session.progressed = true;
}

function runInProgress(session) {
  return !!(session && !session.finished && session.progressed);
}

/* -----------------------------------------------------------------------------
   EXIT — leave the run and go home.

   Tears down through the ordinary route change, which is the point: `route()`
   already calls destroyHost(), which runs ModeHandle.destroy(), empties the
   mode's DOM and destroys the board (disposing the WebGL context in 3D). There
   is deliberately NO call to finishRun() here — an abandoned run must not write
   a score, a best, a `run` stat or a Glicko update. The rating buckets are the
   measurement this app exists for; a quit silently scored as a loss would
   corrupt them.

   `replace: true` rather than a push, so the phone's back gesture from home
   goes back to the setup screen the run was started from instead of resurrecting
   a run that has just been destroyed.
   -------------------------------------------------------------------------- */
async function requestExit() {
  const session = host;
  if (!session) return;

  if (runInProgress(session)) {
    const score = session.headerState && session.headerState.score;
    const ok = await ui.confirm({
      title: 'Exit this run?',
      text: Number.isFinite(Number(score)) && Number(score) > 0
        ? `Your score of <strong class="u-num">${esc(score)}</strong> will be discarded and nothing will be recorded.`
        : 'This run will be discarded and nothing will be recorded.',
      confirmLabel: 'Exit to home',
      cancelLabel: 'Keep playing',
      danger: true,
    });
    // `host !== session` means the run ended (or was remounted) while the sheet
    // was open; acting on a stale session would tear down someone else's screen.
    if (!ok || host !== session) return;
  }

  ui.haptic('medium');
  navigate('#/', { replace: true });
}

/* -----------------------------------------------------------------------------
   RESTART — the control the old app never had
   -------------------------------------------------------------------------- */
async function requestRestart() {
  const session = host;
  if (!session) return;
  const score = session.headerState && session.headerState.score;
  const ok = await ui.confirm({
    title: 'Restart this run?',
    text: Number.isFinite(Number(score)) && Number(score) > 0
      ? `Your score of <strong class="u-num">${esc(score)}</strong> will be discarded.`
      : 'Your progress in this run will be discarded.',
    confirmLabel: 'Restart',
    cancelLabel: 'Keep playing',
    danger: true,
  });
  if (!ok || host !== session) return;

  ui.haptic('medium');
  if (session.handle && typeof session.handle.restart === 'function') {
    session.headerState = {};
    // A fresh run has nothing to lose yet, so the next exit skips the confirm
    // until the player has actually done something.
    session.progressed = false;
    session.finished = false;
    try { session.handle.restart(); }
    catch (err) { console.error('mode restart() failed', err); }
    adoptChrome(session);
  } else {
    // No restart() in the handle: remount the whole route, which is the same
    // thing from the player's point of view.
    const raw = currentRoute;
    currentRoute = '';
    await destroyHost();
    location.hash = raw;
    route();
  }
}

/* -----------------------------------------------------------------------------
   HEADER — ui.setHeader
   Accepts a string (title), an Element/fragment, or a readout description:
   {score, time, timerState, strikes, strikesMax, title}
   -------------------------------------------------------------------------- */
function setHeader(session, spec) {
  if (!session || session.disposed) return;

  // A score on the board or a strike spent means the run is under way — that is
  // what makes the exit control ask before discarding it. Checked here, ahead of
  // the slot lookup, so it holds even for a mode that paints its own readouts
  // and has no `[data-shell="header"]` for the shell to write into.
  if (spec && typeof spec === 'object'
    && !(spec instanceof Element) && !(spec instanceof DocumentFragment)) {
    const spent = spec.strikes && typeof spec.strikes === 'object'
      ? Number(spec.strikes.used) || 0
      : Number(spec.strikes) || 0;
    if (Number(spec.score) > 0 || spent > 0) markProgress(session);
  }

  const slot = session.headerSlot || (session.headerSlot = session.root.querySelector('[data-shell="header"]'));
  if (!slot) return;

  if (spec == null) {
    session.headerState = {};
    session.headerShape = '';
    slot.replaceChildren();
    return;
  }

  if (typeof spec === 'string') {
    session.headerState = { title: spec };
    session.headerShape = 'title';
    slot.className = 'app-bar__title';
    slot.setAttribute('data-shell', 'header');
    slot.textContent = spec;
    return;
  }

  if (spec instanceof Element || spec instanceof DocumentFragment) {
    session.headerShape = 'node';
    slot.replaceChildren(spec);
    return;
  }

  if (typeof spec !== 'object') return;

  const state = { ...session.headerState, ...spec };
  session.headerState = state;

  if (state.title != null && state.score == null && state.time == null && state.strikes == null) {
    session.headerShape = 'title';
    slot.className = 'app-bar__title';
    slot.textContent = String(state.title);
    return;
  }

  const shape = ['score', 'time', 'strikes']
    .filter((k) => state[k] != null)
    .join('|');

  slot.className = 'readouts';
  if (shape !== session.headerShape) {
    session.headerShape = shape;
    slot.innerHTML = [
      state.score != null ? `
        <div class="readout readout--score">
          <span class="readout__label">Score</span>
          <span class="readout__value u-num" data-readout="score">0</span>
        </div>` : '',
      state.time != null ? `
        <div class="readout readout--timer" data-readout="timer">
          <span class="readout__label">Time</span>
          <span class="readout__value u-num" data-readout="time">0:00</span>
        </div>` : '',
      state.strikes != null ? `
        <div class="readout readout--strikes">
          <span class="readout__label">Strikes</span>
          <span class="strikes" role="img" data-readout="strikes"></span>
        </div>` : '',
    ].join('');
  }

  const scoreEl = slot.querySelector('[data-readout="score"]');
  if (scoreEl && state.score != null) {
    const next = String(state.score);
    if (scoreEl.textContent !== next) {
      scoreEl.textContent = next;
      scoreEl.classList.remove('is-bumped');
      void scoreEl.offsetWidth;                 // restart the bump animation
      scoreEl.classList.add('is-bumped');
    }
  }

  const timeEl = slot.querySelector('[data-readout="time"]');
  if (timeEl && state.time != null) {
    const seconds = typeof state.time === 'number' ? state.time : null;
    timeEl.textContent = seconds == null ? String(state.time) : formatClock(seconds);
    const level = state.timerState
      || (seconds == null ? 'normal' : seconds <= 15 ? 'critical' : seconds <= 60 ? 'warning' : 'normal');
    const timer = slot.querySelector('[data-readout="timer"]');
    timer.classList.toggle('is-warning', level === 'warning');
    timer.classList.toggle('is-critical', level === 'critical');
  }

  const strikeEl = slot.querySelector('[data-readout="strikes"]');
  if (strikeEl && state.strikes != null) {
    const raw = state.strikes;
    const used = typeof raw === 'object' ? Number(raw.used) || 0 : Number(raw) || 0;
    const total = typeof raw === 'object' ? Number(raw.total) || 3 : Number(state.strikesMax) || 3;
    if (strikeEl.children.length !== total) {
      strikeEl.innerHTML = Array.from({ length: total }, () => '<span class="strikes__pip"></span>').join('');
    }
    [...strikeEl.children].forEach((pip, i) => {
      const spent = i < used;
      const wasSpent = pip.classList.contains('is-spent');
      pip.classList.toggle('is-spent', spent);
      pip.classList.toggle('is-just-spent', spent && !wasSpent);
    });
    strikeEl.setAttribute('aria-label', `${used} of ${total} strikes used`);
  }
}

/* -----------------------------------------------------------------------------
   FALLBACK MODE — a real ModeHandle, so a missing module exercises exactly the
   same shell path a real drill does.
   -------------------------------------------------------------------------- */
function createUnavailableMode(ctx, { title, headline, detail, retry }) {
  ctx.root.replaceChildren();
  const body = fromHTML(`
    <div class="stage">
      <div class="empty">
        ${icon('i-puzzle')}
        <p><strong>${esc(headline)}</strong></p>
        <p>${esc(detail)}</p>
      </div>
    </div>`);
  const actions = fromHTML(`
    <div class="action-bar">
      <div class="action-bar__inner" style="display:grid;gap:var(--space-2)">
        <button class="btn btn--secondary btn--block" data-act="retry">${icon('i-refresh')} Try again</button>
        <button class="btn btn--ghost btn--block" data-act="home">Back to home</button>
      </div>
    </div>`);
  ctx.root.append(body, actions);
  ctx.ui.setHeader(title);

  actions.querySelector('[data-act="retry"]').addEventListener('click', () => retry && retry());
  actions.querySelector('[data-act="home"]').addEventListener('click', () => navigate('#/'));

  return { destroy() {}, restart() { retry && retry(); } };
}

/* =============================================================================
   SUMMARY
   ========================================================================== */
function finishRun(session, summary) {
  if (!session || session.disposed) return;
  // Recorded and over: exiting from here has nothing left to discard, so it
  // must not put a confirm sheet in the way.
  session.finished = true;
  const safe = summary && typeof summary === 'object' ? summary : {};
  const key = `${session.modeId}:${session.config.variant || 'default'}`;
  const score = Number(safe.score) || 0;
  const previousBest = readBests()[key] || 0;
  const best = Number.isFinite(Number(safe.best)) ? Number(safe.best) : writeBest(key, score);

  // A mode may report the rating it drifted to (blunderrush does). Modes never
  // write to storage themselves, so the shell persists it as the new level.
  if (Number.isFinite(Number(safe.rating))) settings.set({ rating: Number(safe.rating) });

  lastSummary = {
    ...safe,
    score,
    best: Math.max(best, previousBest, score),
    isBest: score > previousBest && score > 0,
    previousBest,
    modeId: session.modeId,
    config: session.config,
    title: MODES[session.modeId] ? MODES[session.modeId].title : 'Run complete',
    bucket: session.bucket,
    bucketRating: rating.get(session.bucket),
  };
  writeBest(key, score);
  stats.record('run', {
    mode: session.modeId,
    variant: session.config.variant,
    bucket: session.bucket,
    board: session.runSettings.board,
    promptStyle: session.runSettings.promptStyle,
    perspective: session.config.perspective,
    framing: session.config.framing,
    score,
    answers: Array.isArray(safe.history) ? safe.history.length : 0,
    rating: Math.round(rating.get(session.bucket).r),
    rd: Math.round(rating.get(session.bucket).rd),
  });
  ui.haptic('gameover');
  navigate('#/summary');
}

/* -----------------------------------------------------------------------------
   THE REVIEW LIST — one vocabulary per mode, and no result invented

   Blunder Rush answers a safe/unsafe question, so its errors have two distinct
   shapes ('blunder' = missed one, 'missed' = called a safe move unsafe). Tactics
   and Visualization just solve, and record 'correct' | 'wrong' | 'skipped'.
   Those are different vocabularies and both are real; the shell has to speak
   both rather than assume one.

   THE BUG THIS REPLACES: the old mapping recognised only Blunder Rush's three
   words and ended `return 'correct'`. Every Tactics and Visualization 'wrong'
   and 'skipped' fell through that last line and was displayed as Correct — and
   counted as correct in the accuracy figure. Hence the rule below: an
   unrecognised result is 'unknown', never a pass. A review screen that silently
   scores what it does not understand as success is worse than one that says it
   does not know.
   ========================================================================== */
const RESULT_UNKNOWN = 'unknown';

function summaryResult(item) {
  const raw = String(item.result || item.outcome || '').toLowerCase();
  // Blunder Rush's vocabulary, then the solve vocabulary, then the synonyms
  // modes have actually been seen to use.
  if (raw === 'correct' || raw === 'blunder' || raw === 'missed') return raw;
  if (raw === 'wrong' || raw === 'incorrect' || raw === 'failed') return 'wrong';
  if (raw === 'skipped' || raw === 'skip' || raw === 'passed') return 'skipped';
  if (raw === 'solved') return 'correct';

  // No usable `result`: fall back to the boolean some modes carry. `wasSafe`
  // only means anything in the safe/unsafe framing, so it only splits the error
  // into Blunder Rush's two shapes when it is actually present.
  if (item.correct === true) return 'correct';
  if (item.correct === false) {
    if (item.wasSafe === true || item.safe === true) return 'missed';
    if (item.wasSafe === false || item.safe === false) return 'blunder';
    return 'wrong';
  }
  return RESULT_UNKNOWN;
}

/** Correct, an error of some kind, or neither. */
const isCorrect = (r) => r === 'correct';
const isError = (r) => r === 'wrong' || r === 'blunder' || r === 'missed';

/**
 * Which of the design system's three result colours a row wears.
 * app.css defines rails for `correct`, `blunder` and `missed` only; anything
 * else falls through to the neutral grey rail, which is exactly right for
 * "skipped" and "we could not tell". The precise result rides along in
 * `data-outcome` so it stays inspectable and can be styled later.
 */
const RESULT_STYLE = {
  correct: 'correct',
  blunder: 'blunder',
  wrong: 'blunder',     // a solve that failed: the same red as a missed blunder
  missed: 'missed',
  skipped: '',
  [RESULT_UNKNOWN]: '',
};

const RESULT_ICON = {
  correct: 'i-check',
  blunder: 'i-x',
  wrong: 'i-x',
  missed: 'i-alert',
  skipped: 'i-chevron',
  [RESULT_UNKNOWN]: 'i-info',
};

/**
 * Fallback wording, per mode. A mode that supplies `item.title` or `item.label`
 * always wins; this is only what the shell says when it has to speak for itself.
 * "Missed a blunder" and "Called a safe move unsafe" describe the safe/unsafe
 * judgement, which is a question only Blunder Rush asks — using them everywhere
 * described Tactics puzzles in terms of a decision the player never made.
 */
const RESULT_LABEL = {
  blunderrush: {
    correct: 'Correct',
    blunder: 'Missed a blunder',
    missed: 'Called a safe move unsafe',
    wrong: 'Wrong',
    skipped: 'Skipped',
    [RESULT_UNKNOWN]: 'Not recorded',
  },
  default: {
    correct: 'Solved',
    blunder: 'Wrong',
    missed: 'Wrong',
    wrong: 'Wrong',
    skipped: 'Skipped',
    [RESULT_UNKNOWN]: 'Not recorded',
  },
};

const resultLabel = (modeId, result) =>
  (RESULT_LABEL[modeId] || RESULT_LABEL.default)[result] || RESULT_LABEL.default[RESULT_UNKNOWN];

function renderSummary(summary) {
  const items = Array.isArray(summary.history) ? summary.history : [];
  const modeId = summary.modeId;
  const results = items.map(summaryResult);

  const correct = results.filter(isCorrect).length;
  const wrong = results.filter(isError).length;
  const skipped = results.filter((r) => r === 'skipped').length;
  const unknown = results.filter((r) => r === RESULT_UNKNOWN).length;
  // Accuracy is over puzzles that were actually ANSWERED. A skipped puzzle is
  // not a wrong answer, and one we could not classify is not evidence either
  // way — counting either as a failure would be as dishonest as the old code
  // counting them as successes.
  const answered = correct + wrong;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;

  const rows = items.map((item, i) => {
    const result = results[i];
    const label = item.title || item.label || resultLabel(modeId, result);
    const metaBits = [item.move || item.san, item.meta || item.detail,
      item.ms != null ? `${(Number(item.ms) / 1000).toFixed(1)}s` : null].filter(Boolean);
    const rating = item.rating != null ? item.rating : item.r;
    const attrs = `class="history-item" data-result="${RESULT_STYLE[result]}" data-outcome="${result}"`;
    const body = `
        <span class="history-item__rail"></span>
        <span class="history-item__icon">${icon(RESULT_ICON[result])}</span>
        <span class="history-item__body">
          <span class="history-item__title">${esc(label)}</span>
          <span class="history-item__meta">${esc(metaBits.join(' · '))}</span>
        </span>
        <span class="history-item__rating u-num">${rating != null ? esc(rating) : ''}</span>`;
    // Only rows that actually go somewhere are buttons, and review wins the tap
    // when the entry can be replayed. A mode that supplies neither a review
    // payload nor a game link renders a static row rather than a dead button.
    if (isReviewable(item)) {
      return `<li><button ${attrs} data-review="${i}">${body}</button></li>`;
    }
    return item.url
      ? `<li><button ${attrs} data-url="${esc(item.url)}">${body}</button></li>`
      : `<li><div ${attrs}>${body}</div></li>`;
  }).join('');

  // Only the outcomes this run actually produced, in this mode's words.
  const legendKinds = [...new Set(results)].filter((r) => r !== RESULT_UNKNOWN);
  const LEGEND_SWATCH = { correct: 'correct', blunder: 'blunder', wrong: 'blunder', missed: 'missed' };
  const legend = legendKinds.map((r) => `
    <span class="history-legend__item">
      <span class="history-legend__swatch${LEGEND_SWATCH[r] ? ` history-legend__swatch--${LEGEND_SWATCH[r]}` : ''}"></span>
      ${esc(resultLabel(modeId, r))}
    </span>`).join('');

  const countBits = [`${items.length} ${items.length === 1 ? 'puzzle' : 'puzzles'}`];
  if (skipped) countBits.push(`${skipped} skipped`);
  if (unknown) countBits.push(`${unknown} not recorded`);

  const headline = summary.isBest
    ? `<span class="badge badge--gold">${icon('i-arrow-up')} New best — beat ${esc(summary.previousBest)}</span>`
    : summary.headline
      ? esc(summary.headline)
      : summary.best
        ? `Best <span class="u-num">${esc(summary.best)}</span>`
        : '';

  const screen = fromHTML(`
    <div class="screen screen--summary">
      ${appBar({ back: true, title: 'Run complete' })}
      <div class="summary-scroll u-scroll">
        <div class="screen-body__inner">
          <div class="summary-hero">
            <span class="summary-hero__eyebrow">Final score</span>
            <span class="summary-hero__score u-num">${esc(summary.score)}</span>
            <span class="summary-hero__note">${headline}</span>
          </div>
          <div class="stat-grid">
            <div class="stat-tile stat-tile--good"><span class="stat-tile__value u-num">${correct}</span><span class="stat-tile__label">Correct</span></div>
            <div class="stat-tile stat-tile--bad"><span class="stat-tile__value u-num">${wrong}</span><span class="stat-tile__label">Wrong</span></div>
            <div class="stat-tile"><span class="stat-tile__value u-num">${answered ? `${accuracy}%` : '—'}</span><span class="stat-tile__label">Accuracy</span></div>
          </div>
          ${summary.bucketRating && summary.bucketRating.n ? `
          <button class="setting-row" data-go="#/stats" style="width:100%;border-radius:var(--radius-lg);background:var(--surface);border:var(--border-width) solid var(--border);text-align:left">
            <span class="setting-row__label">
              <span class="setting-row__name">Rating — ${esc(bucketTitle(summary.bucket))}</span>
              <span class="setting-row__desc">${summary.bucketRating.n} rated puzzles in this condition · tap for the full comparison</span>
            </span>
            <span class="stat-tile__value u-num">${Math.round(summary.bucketRating.r)} ± ${Math.round(summary.bucketRating.rd)}</span>
          </button>` : ''}
          <div class="history">
            <div class="history__head">
              <span class="section__title">Review</span>
              <span class="u-caps u-num">${esc(countBits.join(' · '))}</span>
            </div>
            ${items.length ? `
            ${legend ? `<div class="history-legend">${legend}</div>` : ''}
            <ul class="history-list">${rows}</ul>` : `
            <div class="empty">${icon('i-puzzle')}<p>No puzzles logged for this run.</p></div>`}
          </div>
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner" style="display:grid;gap:var(--space-2)">
          <button class="btn btn--primary btn--lg btn--block" data-act="again">${icon('i-refresh')} Play again</button>
          <button class="btn btn--ghost btn--block" data-act="home">Back to home</button>
        </div>
      </div>
    </div>`);

  screen.querySelector('[data-act="again"]').addEventListener('click', () => {
    const params = new URLSearchParams({ mode: summary.modeId });
    if (summary.config) {
      if (summary.config.variant) params.set('variant', summary.config.variant);
      if (summary.config.band) params.set('band', String(summary.config.band));
      if (summary.config.drill) params.set('drill', summary.config.drill);
    }
    // Replay the SAME condition, not whatever the global settings happen to say.
    // The bucket is the run's condition written down, so read it back from there
    // rather than hoping every axis was also copied into `config`. Without this,
    // "Play again" after a 3D three-move run silently starts a 2D one-move run
    // and files the result under a bucket the player never chose.
    if (summary.bucket) {
      const axes = parseBucket(summary.bucket);
      params.set('board', axes.board);
      params.set('perspective', axes.perspective);
      params.set('framing', axes.framing);
      if (MODE_PLY_CHOICES[summary.modeId]) params.set('plies', axes.plies);
    }
    navigate(`#/play?${params.toString()}`);
  });
  screen.querySelector('[data-act="home"]').addEventListener('click', () => navigate('#/'));
  on(screen, '[data-go]', 'click', (ev) => navigate(ev.currentTarget.getAttribute('data-go')));
  // The PRIMARY tap on a reviewable row now opens the review player. The lichess
  // link is still there, but as an explicit link inside the review screen rather
  // than something a stray tap fires. Rows from a mode that has not shipped the
  // review payload yet keep the old behaviour, so this degrades cleanly.
  on(screen, '.history-item[data-review]', 'click', (ev) => {
    navigate(`#/review?i=${ev.currentTarget.getAttribute('data-review')}`);
  });
  on(screen, '.history-item[data-url]', 'click', (ev) => {
    window.open(ev.currentTarget.getAttribute('data-url'), '_blank', 'noopener');
  });

  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   REVIEW PLAYER  —  step through a puzzle, at leisure, after the run

   WHY IT LIVES HERE AND NOT IN THE MODES
   Timed Blunder Rush must stay a pure race: nothing may pause it mid-run, so
   there is no stepping during play. Once the run is over, every mode's result
   lands on the same summary screen, so one player here serves all four rather
   than four near-identical ones that drift apart.

   WHY IT NEVER ANIMATES
   This is a study tool, not a replay. `setPosition(fen, {animate:false})` on a
   precomputed FEN means every step is a jump to a finished position, instantly,
   identically in both directions and however fast the buttons are pressed —
   which is what makes scrubbing back and forth to compare two positions
   possible at all. An animated transition would make each step a wait, and
   stepping back through an animation designed to play forward looks wrong.

   -----------------------------------------------------------------------------
   THE HISTORY-ENTRY SCHEMA THIS NEEDS  (spec for the mode agents)

   A history entry today carries {id, rating, result, url, san, ms, ...}: enough
   to LIST a puzzle, not enough to reconstruct one. Add ONE optional key,
   `review`, with the same shape in every mode:

     review: {
       fen:   string     REQUIRED. The position the review opens on, full FEN.
                         This is the position BEFORE the first move in `moves`.
       moves: Array      REQUIRED (may be empty). The line, in order, one entry
                         per PLY, each played from the position the previous one
                         produced:
           {
             uci: 'g1f3'   REQUIRED. from+to, plus a promotion piece for a
                           5-character move ('e7e8q'). Lowercase.
             san: 'Nf3'    OPTIONAL. Display text. The shell derives SAN from the
                           position if this is absent; supply it only if the mode
                           wants different wording. Never let it disagree.
             tag: string   OPTIONAL, and the only per-mode part. One of
                           'quiet' | 'blunder' | 'refutation' | 'solution'.
                           Purely descriptive; the player works without it.
           }
       focusPly:    number  OPTIONAL, default 0. Which ply to OPEN on, as an
                            index into the step list: 0 is `fen` itself, 1 is
                            after moves[0], and so on. Point this at the position
                            the player was actually judging, so review opens on
                            the question rather than at the top of the line.
       orientation: 'white'|'black'  OPTIONAL. Defaults to the side to move in
                            `fen`, which is the side the player was playing.
     }

   Per mode, concretely:
     Blunder Rush   fen = the position at the start of the quiet window; moves =
                    the quiet pre-moves, then the prompted move (tag 'blunder'
                    when it was one), then the refutation line (tag 'refutation').
                    focusPly = the number of quiet moves, i.e. the position the
                    safe/unsafe question was asked about.
     Tactics        fen = the puzzle position; moves = the solution line
                    (tag 'solution'); focusPly = 0.
     Visualization  fen = the position shown on the board; moves = the quiet
                    window (tag 'quiet'), the blunder, then the solution line;
                    focusPly = 0, since the whole point is what follows.
     Exercises      no `review` key. They have no position to replay, and an
                    entry without the key simply is not reviewable.

   ONE SHAPE, NOT FOUR: everything above is (position, list of plies). Blunder
   Rush's quiet-moves-then-blunder-then-refutation is that same list with tags on
   it, so the player needs no per-mode branch and a fifth mode gets review free.

   RELIABILITY: the shell validates every move against the position rather than
   trusting it. An illegal or malformed `uci` truncates the line there instead of
   desynchronising the board from the notation — a review that quietly shows the
   wrong position would be worse than a short one.

   DURABILITY: deliberately none, and still none. `lastSummary` is in memory, so
   a reload drops the review exactly as it already drops the summary. Review is
   what you do in the minute after a run, and persisting it would mean persisting
   whole runs and deciding when they expire — real storage design for a feature
   whose value is entirely in the moment.

   -----------------------------------------------------------------------------
   TWO WAYS IN, AND WHY THE SECOND EXISTS

     #/review?i=<n>                        the summary's history entry n
     #/review?id=<puzzleId>&r=<rating>     rebuilt from the corpus, no state
                          &ply=<focusPly>

   The live history strip DURING a run wants to open review in a new tab. A new
   tab is a fresh app instance with an empty `lastSummary`, so `?i=` cannot work
   there — and making it work would mean persisting runs, which is exactly the
   design we rejected above.

   It doesn't need persistence. Everything review needs is ALREADY on the device
   and already keyed by puzzle id: the puzzle row lives in the band shard that the
   run downloaded to play it, and the game lives in the games shard. `r` says
   which band, `id` finds the row, and `ply` carries the one run-specific thing
   that is not in the corpus — WHICH position that particular prompt was asked
   at. So the second form reconstructs the whole screen from the URL, in a cold
   tab, offline, with no shared state at all.

   `?i=` stays the primary path and is NOT replaced: a history entry knows the
   result, the mode's own wording, and the exact line the mode built, none of
   which is recoverable from the corpus. `?id=` is what you fall back to when
   this tab has no summary. Both are then the same screen.

   For mode authors: build the link as
       `#/review?id=${puzzle.i}&r=${puzzle.r}&ply=${plyWithinTheLine}`
   where `ply` is an index into the reconstructed step list — 0 is the puzzle's
   own FEN, and the position the blunder question is asked at is the number of
   quiet moves (puzzle.p.length), which is also the default when `ply` is absent.
   ========================================================================== */

/** The `review` payload if the entry has a usable one, else null. */
function reviewSpec(entry) {
  const spec = entry && entry.review;
  if (!spec || typeof spec !== 'object') return null;
  const fen = typeof spec.fen === 'string' ? spec.fen.trim() : '';
  if (!fen) return null;
  return {
    fen,
    moves: Array.isArray(spec.moves) ? spec.moves : [],
    focusPly: Number.isFinite(Number(spec.focusPly)) ? Math.max(0, Math.round(Number(spec.focusPly))) : 0,
    orientation: spec.orientation === 'black' || spec.orientation === 'white' ? spec.orientation : null,
  };
}

const isReviewable = (entry) => reviewSpec(entry) !== null;

/* -----------------------------------------------------------------------------
   REBUILDING A REVIEW FROM NOTHING BUT A URL
   -------------------------------------------------------------------------- */

/**
 * Find one puzzle row by id. data.js has no lookup-by-id and is owned elsewhere,
 * so this does it against the band rows `ensureBand` already hands back.
 *
 * The rating names the band, which is the whole point of passing it: without it
 * there is no shard to open and we would be scanning the entire corpus. If the
 * exact band misses, the immediate neighbours are tried — a rating that was
 * rounded on its way into a URL should not dead-end — but nothing wider, because
 * past that point we would be downloading megabytes to keep saying "no".
 */
async function findPuzzleById(id, rating) {
  if (!id) return null;
  const r = Number(rating);
  if (!Number.isFinite(r)) return null;
  await ensureData();
  const size = (data.index && data.index.band) || 100;
  const lo = data.bandFor(r);
  for (const band of [lo, lo - size, lo + size]) {
    const rows = await data.ensureBand(band);
    if (!Array.isArray(rows) || !rows.length) continue;
    const hit = rows.find((p) => p && String(p.i) === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Turn a corpus row into the same `{id, rating, url, review}` shape a mode would
 * have put in the history, so everything downstream is identical.
 *
 * The corpus stores the quiet window as SAN and the puzzle's own moves as UCI;
 * the review spec is UCI throughout, so the quiet moves are converted here
 * rather than teaching the step builder a second notation — a builder that
 * accepts two forms is a builder that can be handed two that disagree.
 *
 * If a quiet move will not play, this gives up rather than shifting the rest of
 * the line onto the wrong position.
 */
async function reconstructEntry(id, rating, plyParam) {
  const puzzle = await findPuzzleById(id, rating);
  if (!puzzle || typeof puzzle.f !== 'string') return null;

  const { Chess } = await import('../vendor/chess.min.js');
  const game = new Chess();
  let loaded = false;
  try { loaded = game.load(puzzle.f) !== false; } catch { loaded = false; }
  if (!loaded) return null;

  const moves = [];
  for (const san of (Array.isArray(puzzle.p) ? puzzle.p : [])) {
    let made = null;
    try { made = game.move(String(san), { sloppy: true }); } catch { made = null; }
    if (!made) return null;
    moves.push({ uci: made.from + made.to + (made.promotion || ''), san: made.san, tag: 'quiet' });
  }
  const quiet = moves.length;
  // puzzle.m[0] is the move the puzzle turns on — the blunder in Blunder Rush's
  // framing, the opponent's move in Tactics'. The rest is how it is punished.
  (Array.isArray(puzzle.m) ? puzzle.m : []).forEach((uci, i) => {
    moves.push({ uci: String(uci).toLowerCase(), tag: i === 0 ? 'blunder' : 'refutation' });
  });
  if (!moves.length) return null;

  // `params.get()` yields null for an absent key and Number(null) is 0, which is
  // finite — so an absent `ply` would silently mean "the start of the quiet
  // window" instead of "the position the question was asked at". Test for the
  // key, not for the number.
  const given = plyParam == null || plyParam === '' ? null : Number(plyParam);
  const focusPly = given != null && Number.isFinite(given)
    ? Math.max(0, Math.min(moves.length, Math.round(given)))
    : quiet;
  // The side to move at the focus ply is the side the player was playing. Parity
  // off the starting FEN, so no second replay is needed.
  const startWhite = puzzle.f.split(' ')[1] !== 'b';
  const focusWhite = focusPly % 2 === 0 ? startWhite : !startWhite;

  return {
    id: puzzle.i,
    rating: puzzle.r,
    // Already carries the `#ply` fragment that points lichess at this position.
    url: puzzle.u || '',
    title: 'Puzzle',
    review: { fen: puzzle.f, moves, focusPly, orientation: focusWhite ? 'white' : 'black' },
  };
}

/**
 * Which entry `#/review` is asking for. `?i=` reads the summary in memory; `?id=`
 * rebuilds from the corpus. Returns null when neither can be honoured, and the
 * caller decides where to send the user.
 */
async function resolveReviewEntry(params) {
  const raw = params.get('i');
  if (raw != null && lastSummary) {
    const items = Array.isArray(lastSummary.history) ? lastSummary.history : [];
    const index = Number(raw);
    const entry = Number.isInteger(index) ? items[index] : null;
    return isReviewable(entry) ? entry : null;
  }
  const id = String(params.get('id') || '').trim();
  if (!id) return null;
  try {
    return await reconstructEntry(id, params.get('r'), params.get('ply'));
  } catch (err) {
    console.warn('review: could not rebuild from the url', err);
    return null;
  }
}

/**
 * Expand a spec into one step per ply: [{fen, san, from, to, tag}, …], index 0
 * being the starting position with no move attached. Stops at the first move the
 * position rejects.
 */
async function buildReviewSteps(spec) {
  const { Chess } = await import('../vendor/chess.min.js');
  const game = new Chess();
  // chess.js 0.10 returns false rather than throwing; guard both.
  let loaded = false;
  try { loaded = game.load(spec.fen) !== false; } catch { loaded = false; }
  if (!loaded) return null;

  const steps = [{ fen: game.fen(), san: null, from: null, to: null, tag: null }];
  let truncated = false;
  for (const move of spec.moves) {
    const uci = String((move && move.uci) || '').toLowerCase();
    if (uci.length < 4) { truncated = true; break; }
    let made = null;
    try {
      made = game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        // chess.js only reads `promotion` for a move that actually promotes, so
        // passing it unconditionally is safe and covers 5-character UCI.
        promotion: (uci[4] || 'q').toLowerCase(),
      });
    } catch { made = null; }
    if (!made) { truncated = true; break; }
    steps.push({
      fen: game.fen(),
      san: (move && typeof move.san === 'string' && move.san) || made.san,
      from: made.from,
      to: made.to,
      tag: (move && typeof move.tag === 'string' && move.tag) || null,
    });
  }
  return { steps, truncated };
}

/* -----------------------------------------------------------------------------
   THE WHOLE GAME  —  app/data/games/r<band>.json

   The puzzle line above is three to six plies: enough to see the tactic, not
   enough to see where it CAME from. The game shards carry the full game the
   puzzle was cut out of, plus lichess's own per-ply evaluation, so review can
   walk move 1 to the end and show the graph of the whole thing.

   SIGN CONVENTION — this is the one thing in here that can silently lie, so it
   is stated once and obeyed everywhere: the numbers are centipawns FROM WHITE'S
   POINT OF VIEW, exactly as lichess stores them. Positive is good for White at
   every ply, whoever just moved. Nothing is ever negated for the side to move,
   and nothing is ever flipped to match the board's orientation. The readout
   prints the sign, the bar fills from the White end, and both ends of the bar
   are labelled, so a black-to-move position showing "−1.4" cannot be misread as
   "Black is 1.4 behind".

   `e[i]` is the evaluation of the position AFTER ply i+1, so step k carries
   `e[k-1]` and the starting position carries none. The array is often one short:
   a game that ended in mate has no eval after the mating move. That last step is
   reconstructed from the position itself rather than left blank.
   -------------------------------------------------------------------------- */

/** Beyond this, a stored centipawn value is lichess's mate sentinel, not a score. */
const MATE_CP = 5000;

/** Positions compare on placement/turn/castling/ep — clocks are not identity. */
const positionKey = (fen) => String(fen).split(' ').slice(0, 4).join(' ');

/**
 * Expand a game record into one step per ply: [{fen, san, from, to, ev, ply}, …],
 * index 0 being the initial position. Stops at the first SAN the position
 * rejects, exactly as the puzzle-line builder does.
 */
async function buildGameSteps(record) {
  const { Chess } = await import('../vendor/chess.min.js');
  const sans = String(record.m || '').trim().split(/\s+/).filter(Boolean);
  if (!sans.length) return null;

  const game = new Chess();
  const evals = Array.isArray(record.e) ? record.e : [];
  const steps = [{ fen: game.fen(), san: null, from: null, to: null, tag: null, ev: null, ply: 0 }];
  let truncated = false;

  for (let i = 0; i < sans.length; i++) {
    let made = null;
    // `sloppy` so a non-canonical SAN from the source PGN still lands.
    try { made = game.move(sans[i], { sloppy: true }); } catch { made = null; }
    if (!made) { truncated = true; break; }
    const raw = Number(evals[i]);
    steps.push({
      fen: game.fen(),
      san: made.san,
      from: made.from,
      to: made.to,
      tag: null,
      ev: Number.isFinite(raw) ? raw : null,
      ply: i + 1,
    });
  }
  if (steps.length < 2) return null;

  // lichess stops analysing at mate, so the final position of a mated game has
  // no stored eval. It is not unknown — it is decisive, and the board says so.
  const last = steps[steps.length - 1];
  if (!truncated && last.ev == null) {
    let mated = false;
    try { mated = game.in_checkmate(); } catch { mated = false; }
    if (mated) last.ev = game.turn() === 'w' ? -10000 : 10000;
  }
  return { steps, truncated };
}

/**
 * Find the puzzle inside the game and carry the line's tags across.
 *
 * `p` is the 1-based ply of the move the puzzle turns on, taken from the `#N`
 * fragment of the lichess puzzle url, so the position the puzzle is ASKED FROM
 * is the one after p-1 plies. (Checked against the shipped corpus by replaying
 * every game and comparing with the puzzle's own FEN: 401/401 land on p-1.)
 *
 * The line's own positions are then matched into the game by FEN so 'blunder' /
 * 'refutation' / 'solution' show up in the full-game walk too. Matching stops at
 * the first divergence, because a puzzle solution is often NOT what was played.
 */
function alignPuzzle(gameSteps, lineSteps, ply, focusPly) {
  const last = gameSteps.length - 1;
  let tacticAt = null;
  if (Number.isFinite(ply)) tacticAt = Math.max(0, Math.min(last, Math.round(ply) - 1));

  // Where the LINE starts inside the game: p-1 if it agrees, else a scan.
  let anchor = null;
  const startKey = lineSteps && lineSteps.length ? positionKey(lineSteps[0].fen) : null;
  if (startKey) {
    if (tacticAt != null && positionKey(gameSteps[tacticAt].fen) === startKey) anchor = tacticAt;
    else {
      const found = gameSteps.findIndex((s) => positionKey(s.fen) === startKey);
      if (found >= 0) anchor = found;
    }
  }
  if (tacticAt == null && anchor != null) tacticAt = anchor;

  let matched = 0;
  if (anchor != null) {
    for (let k = 1; k < lineSteps.length; k++) {
      const at = anchor + k;
      if (at > last || positionKey(gameSteps[at].fen) !== positionKey(lineSteps[k].fen)) break;
      if (lineSteps[k].tag) gameSteps[at].tag = lineSteps[k].tag;
      matched = k;
    }
  }

  // Open on the position the player was actually judging, if it is in the game.
  let openAt = tacticAt;
  if (anchor != null) {
    const focus = anchor + (Number(focusPly) > 0 ? Math.round(Number(focusPly)) : 0);
    if (focus >= 0 && focus <= anchor + matched) openAt = focus;
  }
  return { tacticAt, anchor, openAt: openAt == null ? 0 : openAt };
}

/**
 * Give the puzzle line the evals of the same positions in the game, so the
 * readout does not blank out when you switch back to it.
 */
function attachLineEvals(lineSteps, gameSteps) {
  const byKey = new Map();
  for (const s of gameSteps) {
    const k = positionKey(s.fen);
    if (!byKey.has(k)) byKey.set(k, s.ev);
  }
  for (const s of lineSteps) {
    const hit = byKey.get(positionKey(s.fen));
    s.ev = hit == null ? null : hit;
  }
}

/**
 * Centipawns -> what the user reads. `text` is lichess's own notation: a signed
 * pawn score, or '#' for mate — never the 10000 sentinel. `share` is White's
 * share of the eval bar, using lichess's win-probability curve so a +9 rook-up
 * position does not peg the bar the way a linear scale would.
 */
function formatEval(cp) {
  if (cp == null || !Number.isFinite(cp)) {
    return { text: '—', share: 50, who: 'unknown', title: 'No evaluation for this position' };
  }
  if (Math.abs(cp) >= MATE_CP) {
    const white = cp > 0;
    return {
      text: '#',
      share: white ? 100 : 0,
      who: white ? 'white' : 'black',
      title: `Mate — ${white ? 'White' : 'Black'} is winning`,
    };
  }
  const pawns = cp / 100;
  const sign = cp > 0 ? '+' : cp < 0 ? '−' : '';
  const text = `${sign}${Math.abs(pawns).toFixed(2)}`;
  const share = 100 / (1 + Math.exp(-0.00368208 * cp));
  const who = cp > 20 ? 'white' : cp < -20 ? 'black' : 'level';
  const title = who === 'level'
    ? `Level (${text} for White)`
    : `${who === 'white' ? 'White' : 'Black'} is ahead (${text} for White)`;
  return { text, share: Math.max(0, Math.min(100, share)), who, title };
}

function destroyReview() {
  const current = review;
  review = null;
  if (!current) return;
  current.disposed = true;
  if (current.unsubscribe) { try { current.unsubscribe(); } catch { /* ignore */ } }
  if (current.onKey) window.removeEventListener('keydown', current.onKey);
  try { current.board && current.board.destroy(); }
  catch (err) { console.error('review board destroy() failed', err); }
}

const TAG_NOTE = {
  quiet: 'Quiet move',
  blunder: 'The blunder',
  refutation: 'How it is punished',
  solution: 'Solution',
};

/** The same thing as a badge, for the full-game walk where the prompt is tight. */
const TAG_SHORT = {
  quiet: 'Quiet',
  blunder: 'Blunder',
  refutation: 'Punished',
  solution: 'Solution',
};

/**
 * How long review will wait for the game shard before opening on the puzzle line
 * anyway. The shard is ~1.2 MB: instant once the service worker has it, a couple
 * of seconds on a cold phone connection. Either way the screen must open — if
 * the game arrives after this, the controls light up in place instead.
 */
const GAME_WAIT_MS = 6000;

async function renderReview(params) {
  // Where a failure sends you. With a summary in this tab, back to it; in a tab
  // opened straight onto a review url there is nothing behind it but home.
  const bail = () => navigate(lastSummary ? '#/summary' : '#/', { replace: true });
  const hideLoading = showLoading('Review', 'Setting the position up…');

  // The `?id=` path can wait on a band download, which is long enough for the
  // user to have navigated somewhere else. Anything after an await here has to
  // check that this render is still the one the route wants, or it will mount a
  // screen over the top of whatever replaced it.
  const myRoute = currentRoute;
  const stale = () => currentRoute !== myRoute;

  const entry = await resolveReviewEntry(params);
  if (stale()) { hideLoading(); return; }
  const spec = reviewSpec(entry);
  if (!spec) {
    hideLoading();
    if (params.get('id')) ui.toast('That puzzle is not on this device', { kind: 'error' });
    bail();
    return;
  }

  const title = entry.title || entry.label
    || (lastSummary ? resultLabel(lastSummary.modeId, summaryResult(entry)) : 'Puzzle');

  const built = await buildReviewSteps(spec);
  if (stale()) { hideLoading(); return; }
  if (!built || !built.steps.length) {
    hideLoading();
    ui.toast('That position could not be reconstructed', { kind: 'error' });
    bail();
    return;
  }
  const { steps: lineSteps, truncated } = built;

  /* THE ONLY PLACE THE GAME SHARDS ARE EVER TOUCHED.
     Not at boot, not on the summary, not on a run — here, once review is
     actually open, and only for the band this puzzle came from. An entry with no
     id or no rating has no band to ask for, so it costs not even the index. */
  const gamePromise = (entry.id != null && entry.rating != null)
    ? Promise.resolve().then(() => games.get(entry.id, entry.rating)).catch((err) => {
      console.warn('review: game lookup failed', err);
      return null;
    })
    : Promise.resolve(null);
  const record = await Promise.race([
    gamePromise,
    new Promise((r) => setTimeout(() => r(null), GAME_WAIT_MS)),
  ]);
  if (stale()) { hideLoading(); return; }

  // Review in the board the run was PLAYED in, not whatever the global setting
  // happens to be now — the bucket is where the run's board was written down.
  // A mid-run history tap (Blunder Rush's strip) opens review in a NEW TAB, which
  // has no lastSummary to inherit from, so it stamps `?board=` on the url itself
  // (see reviewHref() in modes/blunderrush.js) -- that wins when present. Only a
  // tab with neither a summary nor an explicit param falls back to the global
  // setting.
  const boardOverride = params.get('board') === '3d' ? '3d' : params.get('board') === '2d' ? '2d' : null;
  const runBoard = boardOverride
    || (lastSummary && lastSummary.bucket ? parseBucket(lastSummary.bucket).board : settings.get().board);
  const reviewSettings = { ...settings.get(), board: runBoard };

  const gameUrl = entry.url || entry.gameUrl || '';
  // The inline max-width on the prompt and the eval row is 100cqi, not app.css's
  // 100%: a percentage is circular while the stage's single auto column is being
  // sized, so it does not stop a long row from widening that column and pushing
  // the board off-centre. The container-query unit is definite, and clamps it.
  const screen = fromHTML(`
    <div class="screen screen--play">
      ${appBar({ back: true, title: 'Review' })}
      <div class="stage">
        <div class="prompt" style="max-width:100cqi">
          <span class="prompt__side" data-role="side"></span>
          <span class="prompt__label" data-role="ply">Start position</span>
          <span class="prompt__move" data-role="move" hidden></span>
          <span class="badge badge--accent" data-role="tactic-badge" hidden>Puzzle</span>
        </div>
        <div class="board-area">
          <div class="board-frame"><div class="board-slot" data-role="slot"></div></div>
        </div>
        <div class="stage__meta" data-role="eval-row" style="max-width:100cqi" hidden>
          <span class="u-caps">White</span>
          <div class="progress"><div class="progress__bar" data-role="eval-bar"></div></div>
          <span class="u-caps">Black</span>
          <span class="badge u-num" data-role="eval-num">—</span>
        </div>
        <div class="stage__meta">
          <span>${esc(title)}</span>
          ${entry.rating != null ? `<span class="stage__meta-sep"></span><span>Rating <span class="u-num">${esc(entry.rating)}</span></span>` : ''}
          ${gameUrl ? `<span class="stage__meta-sep"></span><a href="${esc(gameUrl)}" target="_blank" rel="noopener">Open in lichess</a>` : ''}
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner">
          <div class="answers">
            <button class="btn btn--secondary btn--lg" data-act="prev">${icon('i-back')} Back</button>
            <button class="btn btn--secondary btn--lg" data-act="next">Forward ${icon('i-chevron')}</button>
            <button class="btn btn--ghost" data-act="tactic" hidden>${icon('i-target')} Tactic</button>
            <button class="btn btn--ghost" data-act="source" hidden><span data-role="source-label">Puzzle line</span></button>
          </div>
        </div>
      </div>
    </div>`);

  const els = {
    stage: screen.querySelector('.stage'),
    slot: screen.querySelector('[data-role="slot"]'),
    side: screen.querySelector('[data-role="side"]'),
    ply: screen.querySelector('[data-role="ply"]'),
    move: screen.querySelector('[data-role="move"]'),
    tacticBadge: screen.querySelector('[data-role="tactic-badge"]'),
    evalRow: screen.querySelector('[data-role="eval-row"]'),
    evalBar: screen.querySelector('[data-role="eval-bar"]'),
    evalNum: screen.querySelector('[data-role="eval-num"]'),
    prev: screen.querySelector('[data-act="prev"]'),
    next: screen.querySelector('[data-act="next"]'),
    tactic: screen.querySelector('[data-act="tactic"]'),
    source: screen.querySelector('[data-act="source"]'),
    sourceLabel: screen.querySelector('[data-role="source-label"]'),
  };
  // The bar must LAND on its value, like the board does. The shared .progress
  // component animates its width, which is right for a download and wrong for a
  // position you are studying.
  els.evalBar.style.transition = 'none';

  const session = {
    disposed: false,
    board: null,
    at: 0,
    steps: lineSteps,          // whichever list is on screen
    lineSteps,
    gameSteps: null,
    source: 'line',            // 'line' = today's puzzle-line review, 'game' = whole game
    tacticAt: null,            // index of the puzzle position within gameSteps
    openAt: 0,
    hasEvals: false,
    screen,
  };
  review = session;

  let board;
  try {
    board = await createBoardHandle(els.slot, () => reviewSettings);
  } catch (err) {
    console.error('review board failed to initialise', err);
    hideLoading();
    if (session.disposed) return;
    review = null;
    ui.toast('The board could not start for review', { kind: 'error' });
    bail();
    return;
  }
  if (session.disposed) { board.destroy(); hideLoading(); return; }
  session.board = board;

  board.setOrientation(spec.orientation || (lineSteps[0].fen.split(' ')[1] === 'b' ? 'black' : 'white'));
  // Same camera seat the puzzle was played from: the seat is derived from the
  // puzzle id, so review reproduces the exact view rather than a fresh angle.
  if (entry.id != null) board.seatFor({ i: entry.id });

  /**
   * Reserve exactly the height the non-board rows actually occupy, so the board
   * shrinks to fit rather than being clipped. Only ever called once the full-game
   * controls are on screen: without them the layout is unchanged from before, and
   * the stylesheet's own reserve is left to do its job.
   */
  function tuneStage() {
    if (session.disposed || !els.stage) return;
    const cs = getComputedStyle(els.stage);
    const gap = parseFloat(cs.rowGap) || 0;
    let h = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    let rows = 0;
    for (const node of els.stage.children) {
      if (node.classList.contains('board-area') || node.hidden) continue;
      h += node.getBoundingClientRect().height;
      rows += 1;
    }
    els.stage.style.setProperty('--stage-reserve', `${Math.ceil(h + gap * rows)}px`);
  }

  /** Point the player at whichever list is current, and repaint the controls. */
  function setSource(next) {
    const toGame = next === 'game' && !!session.gameSteps;
    session.source = toGame ? 'game' : 'line';
    session.steps = toGame ? session.gameSteps : session.lineSteps;
    session.hasEvals = session.steps.some((s) => s.ev != null);
    els.sourceLabel.textContent = toGame ? 'Puzzle line' : 'Full game';
    els.source.setAttribute(
      'aria-label',
      toGame ? 'Review the puzzle line only' : 'Review the whole game',
    );
    els.evalRow.hidden = !session.hasEvals;
  }

  /** Land on a ply. No animation, by design — see the header. */
  function show(next) {
    if (session.disposed) return;
    const steps = session.steps;
    const at = Math.max(0, Math.min(steps.length - 1, next));
    session.at = at;
    const step = steps[at];
    const total = steps.length - 1;
    const game = session.source === 'game';

    board.setPosition(step.fen, { animate: false });
    board.clearHighlights();
    if (step.from && step.to) board.highlight([step.from, step.to], 'move');

    els.side.dataset.side = step.fen.split(' ')[1] === 'b' ? 'black' : 'white';

    const isTactic = !!session.gameSteps && at === (game
      ? session.tacticAt
      : Math.min(spec.focusPly, total));
    // At the puzzle position the badge already says what this ply is; repeating
    // the incoming move's tag beside it ("Quiet move") only muddies it.
    const note = !isTactic && step.tag && TAG_NOTE[step.tag] ? ` · ${TAG_NOTE[step.tag]}` : '';
    if (at === 0) {
      els.ply.textContent = game
        ? `Start · ${Math.ceil(total / 2)} moves`
        : (total ? `Start · ${total} ${total === 1 ? 'move' : 'moves'}` : 'Position');
      els.move.hidden = true;
    } else if (game) {
      // Whole games are read in FULL moves, not plies. The tag moves out of the
      // label and into the badge here: "Move 40 of 55 · How it is punished" plus
      // the move itself does not fit across a 360px phone, and the prompt is one
      // nowrap line that can only spill if it is overfilled.
      els.ply.textContent = `Move ${Math.ceil(at / 2)} of ${Math.ceil(total / 2)}`;
      els.move.textContent = step.san || '';
      els.move.hidden = false;
    } else {
      els.ply.textContent = `Move ${at} of ${total}${note}`;
      els.move.textContent = step.san || '';
      els.move.hidden = false;
    }
    const badge = isTactic ? 'Puzzle' : (game && step.tag ? TAG_SHORT[step.tag] : '');
    els.tacticBadge.hidden = !badge;
    if (badge) els.tacticBadge.textContent = badge;
    els.tacticBadge.classList.toggle('badge--accent', isTactic);

    if (session.hasEvals) {
      const ev = formatEval(step.ev);
      els.evalNum.textContent = ev.text;
      els.evalBar.style.width = `${ev.share.toFixed(1)}%`;
      els.evalRow.title = ev.title;
      els.evalNum.setAttribute('aria-label', ev.title);
    }

    els.prev.disabled = at === 0;
    els.next.disabled = at === total;
  }

  /** Jump to the puzzle position — the whole point of a 90-ply game walk. */
  function jumpToTactic() {
    if (session.source === 'game') {
      if (session.tacticAt != null) show(session.tacticAt);
    } else {
      show(Math.min(spec.focusPly, session.steps.length - 1));
    }
  }

  /** Swap lists, staying on the same POSITION rather than the same index. */
  function toggleSource() {
    if (!session.gameSteps) return;
    const key = positionKey(session.steps[session.at].fen);
    const to = session.source === 'game' ? 'line' : 'game';
    setSource(to);
    let at = session.steps.findIndex((s) => positionKey(s.fen) === key);
    if (at < 0) {
      at = to === 'game'
        ? (session.tacticAt == null ? 0 : session.tacticAt)
        : Math.min(spec.focusPly, session.steps.length - 1);
    }
    show(at);
  }

  /**
   * Fold a game record in. Safe to call after the screen is already up: if the
   * shard was slow, the controls simply appear and the puzzle-line review the
   * user is looking at is left exactly where it is.
   */
  async function attachGame(rec, { open = false } = {}) {
    if (!rec || session.disposed || session.gameSteps) return false;
    let out = null;
    try { out = await buildGameSteps(rec); } catch (err) {
      console.warn('review: the game could not be replayed', err);
    }
    if (!out || session.disposed) return false;

    const aligned = alignPuzzle(out.steps, lineSteps, rec.p, spec.focusPly);
    attachLineEvals(lineSteps, out.steps);
    session.gameSteps = out.steps;
    session.tacticAt = aligned.tacticAt;
    session.openAt = aligned.openAt;

    els.tactic.hidden = false;
    els.source.hidden = false;
    els.tactic.disabled = aligned.tacticAt == null;
    if (open) { setSource('game'); } else { setSource(session.source); }
    return true;
  }

  const hasGame = await attachGame(record, { open: true });

  els.prev.addEventListener('click', () => show(session.at - 1));
  els.next.addEventListener('click', () => show(session.at + 1));
  els.tactic.addEventListener('click', jumpToTactic);
  els.source.addEventListener('click', toggleSource);

  session.onKey = (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const end = session.steps.length - 1;
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(session.at - 1); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); show(session.at + 1); }
    else if (ev.key === 'Home') { ev.preventDefault(); show(0); }
    else if (ev.key === 'End') { ev.preventDefault(); show(end); }
    else if (ev.key === 't' || ev.key === 'T') { ev.preventDefault(); jumpToTactic(); }
    else if (ev.key === 'g' || ev.key === 'G') { ev.preventDefault(); toggleSource(); }
  };
  window.addEventListener('keydown', session.onKey);

  /**
   * Follow the global board setting, swapping the renderer and repainting the
   * ply you were on.
   *
   * Review OPENS on the board the run was played in, which is often not the
   * global setting — so the settings sheet can show "2D" while you are looking
   * at the 3D board this run used. Picking the value already stored changes
   * nothing, fires no listener, and would leave the tap doing nothing at all.
   * Hence: compare against what is actually on screen, not against what changed.
   */
  session.applyBoard = () => {
    const wanted = settings.get().board;
    if (session.disposed || wanted === reviewSettings.board) return;
    reviewSettings.board = wanted;
    board.swap()
      .then(() => { if (!session.disposed) show(session.at); })
      .catch((err) => {
        console.error('review board swap failed', err);
        ui.toast('Could not switch the board renderer', { kind: 'error' });
      });
  };
  // Live while the sheet is open, and once more on close to catch the case above.
  session.unsubscribe = settings.subscribe((next, changed) => {
    if (changed.includes('board')) session.applyBoard();
  });

  hideLoading();
  if (session.disposed) return;

  wireChrome(screen);
  mountScreen(screen);
  show(hasGame ? session.openAt : Math.min(spec.focusPly, lineSteps.length - 1));
  if (truncated) {
    ui.toast('Part of this line could not be replayed', { kind: 'error', duration: 3500 });
  }
  requestAnimationFrame(() => {
    if (session.disposed) return;
    if (hasGame) tuneStage();
    board.resize();
  });

  // The shard took longer than GAME_WAIT_MS. Don't yank the screen out from
  // under the user — just light the controls up and let them ask for it.
  if (!hasGame) {
    gamePromise.then(async (late) => {
      if (!late || session.disposed) return;
      if (!(await attachGame(late))) return;
      show(session.at);
      requestAnimationFrame(() => { if (!session.disposed) { tuneStage(); board.resize(); } });
      ui.toast('The full game is ready', { kind: 'info', duration: 2500 });
    }).catch(() => { /* review keeps working without it */ });
  }
}

/* =============================================================================
   STATS  —  browsable, not a guided experiment.

   The experimental control lives in the modes: same puzzles, same rating
   method, one small difference per bucket. So the comparison is already clean
   by construction and this screen only has to report it. No orchestration, no
   nudging toward collecting more data, no ceremony around significance — just
   the numbers, over whatever time window is interesting, with their intervals
   shown because that is honest.

   Invalid comparisons are impossible to construct here rather than guarded
   against: only pairs that rating.deficit() accepts (exactly one axis differing)
   are ever emitted.
   ========================================================================== */
const secs = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const pct = (v) => (v == null ? '—' : `${v}%`);
const pts = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`;

const AXIS_LABEL = {
  mode: 'Mode', board: 'Board', promptStyle: 'Prompt', perspective: 'Viewpoint',
  framing: 'Framing', plies: 'Look-ahead',
};
const VALUE_LABEL = {
  '2d': '2D', '3d': '3D',
  highlight: 'squares shown', notation: 'notation only',
  own: 'your side', opponent: 'opponent’s side',
  offensive: 'offensive', defensive: 'defensive',
  tactics: 'Tactics', blunderrush: 'Blunder Rush',
  visualization: 'Visualization', drills: 'Exercises',
  // Look-ahead depth. The player reads N quiet moves PLUS the blunder, so the
  // label is the number of moves on screen, not the raw axis value.
  0: '1 move', 1: '2 moves', 2: '3 moves',
};
const WINDOWS = [
  { id: 'week', label: '7 days', ms: 7 * 86400000 },
  { id: 'month', label: '30 days', ms: 30 * 86400000 },
  { id: 'all', label: 'All time', ms: null },
];

const label = (v) => VALUE_LABEL[v] || v;
const bucketTitle = (key) => {
  const b = parseBucket(key);
  const bits = [label(b.board), label(b.promptStyle), label(b.perspective), label(b.framing)];
  // Only modes that HAVE a look-ahead show one. Printing "1 move" on every
  // Tactics row would be four-fifths noise and imply a dial that isn't there.
  if (b.plies !== '0') bits.push(label(b.plies));
  return bits.join(' · ');
};

/* -----------------------------------------------------------------------------
   SOLVE TIME PER BUCKET

   The rating is accuracy, and accuracy alone can report "no difference" while
   missing the whole effect. A strong player will usually still FIND the move on
   a perspective board — it just takes noticeably longer to read the position.
   That deficit lives in time, not in the rating, so time is reported beside the
   rating and is deliberately never folded into it. (Derating a rating by speed
   was considered and rejected: solve times are bimodal — a pattern is either
   recognised at a glance or calculated — so a single number cannot score them
   fairly. It can, however, describe them.)

   MEDIAN, not mean: one long think drags a mean by seconds and says nothing
   about the typical solve.
   -------------------------------------------------------------------------- */

/**
 * One rated attempt, from any mode, that can be attributed to a condition.
 *
 * `bucket` was only stamped onto records from the version that introduced
 * stampBucket onwards. Older records genuinely cannot be attributed — the board
 * they were solved on was never written down — so they are excluded rather than
 * guessed at, and cannot drag a median toward a condition they may not belong to.
 * `ms` + a boolean `correct` is what distinguishes a single attempt from a
 * whole-run summary (blunderrush's `.run` record carries a COUNT in `correct`).
 */
function isAttempt(row) {
  return !!row
    && typeof row.bucket === 'string' && row.bucket
    && typeof row.correct === 'boolean'
    && Number.isFinite(Number(row.ms));
}

/** Map of bucket key -> {n, medianMs} over the selected window. */
function solveTimesByBucket(since) {
  const byBucket = new Map();
  for (const kind of stats.kinds()) {
    if (kind === 'rated') continue;              // the shell's own rating log; no `ms`
    for (const row of stats.query(kind, since ? { since } : {})) {
      if (!isAttempt(row)) continue;
      if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
      byBucket.get(row.bucket).push(Number(row.ms));
    }
  }
  const out = new Map();
  for (const [key, values] of byBucket) {
    out.set(key, { n: values.length, medianMs: median(values) });
  }
  return out;
}

/** Only buckets actually played; the empty cells of a 2×2×2×2 grid are noise. */
function ratedBuckets() {
  const all = rating.all();
  return Object.keys(all)
    .filter((k) => all[k] && all[k].n > 0)
    .map((k) => ({ key: k, ...parseBucket(k), ...rating.get(k) }))
    .sort((a, b) => b.n - a.n);
}

/** Every pair the engine is willing to compare — one axis apart, nothing else. */
function validPairs(buckets) {
  const out = [];
  for (let i = 0; i < buckets.length; i++) {
    for (let j = i + 1; j < buckets.length; j++) {
      const result = rating.deficit(buckets[i].key, buckets[j].key);
      if (result.ok) out.push({ a: buckets[i], b: buckets[j], result });
    }
  }
  return out.sort((x, y) => y.result.n - x.result.n);
}

function renderStats() {
  let windowId = 'month';

  const screen = fromHTML(`
    <div class="screen screen--summary">
      ${appBar({ back: true, title: 'Progress' })}
      <div class="summary-scroll u-scroll">
        <div class="screen-body__inner" data-role="body"></div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner" style="display:grid;gap:var(--space-2)">
          <button class="btn btn--primary btn--lg btn--block" data-go="#/">Back to home</button>
          <button class="btn btn--ghost btn--block" data-act="clear" hidden>Clear recorded history</button>
        </div>
      </div>
    </div>`);

  const body = screen.querySelector('[data-role="body"]');
  const clearBtn = screen.querySelector('[data-act="clear"]');

  function paint() {
    const win = WINDOWS.find((w) => w.id === windowId) || WINDOWS[2];
    const since = win.ms ? Date.now() - win.ms : 0;

    const buckets = ratedBuckets();
    const timings = solveTimesByBucket(since);
    const attempts = stats.query('rated', since ? { since } : {});
    const drills = stats.query('drill', since ? { since } : {});
    clearBtn.hidden = !(buckets.length || stats.count('drill'));

    /* ---- ratings per bucket ------------------------------------------- */
    const inWindow = new Map();
    for (const a of attempts) {
      if (!inWindow.has(a.bucket)) inWindow.set(a.bucket, []);
      inWindow.get(a.bucket).push(a);
    }

    const byMode = new Map();
    for (const b of buckets) {
      if (!byMode.has(b.mode)) byMode.set(b.mode, []);
      byMode.get(b.mode).push(b);
    }

    const bucketSections = [...byMode.entries()].map(([mode, rows]) => `
      <div class="section">
        <span class="section__title">${esc(label(mode))} — ratings</span>
        <div class="setting-list">
          ${rows.map((b) => {
    const recent = inWindow.get(b.key) || [];
    const moved = recent.length > 1 ? b.r - recent[0].r : null;
    const bits = [`${b.n} rated ${b.n === 1 ? 'attempt' : 'attempts'}`];
    if (win.ms) bits.push(`${recent.length} in ${win.label.toLowerCase()}`);
    if (moved != null && Math.abs(moved) >= 1) bits.push(`${pts(moved)} over the window`);
    // The rating is the headline; the median sits under it, same row, its own
    // number. Never multiplied into the rating — see solveTimesByBucket.
    const timing = timings.get(b.key);
    return `
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">${esc(bucketTitle(b.key))}</span>
                <span class="setting-row__desc">${esc(bits.join(' · '))}</span>
              </span>
              <span style="display:grid;gap:1px;justify-items:end;text-align:right">
                <span class="stat-tile__value u-num">${Math.round(b.r)} ± ${Math.round(b.rd)}</span>
                <span class="setting-row__desc u-num">${timing && timing.medianMs != null
    ? `median ${esc(secs(timing.medianMs))} · n=${timing.n}`
    : 'median —'}</span>
              </span>
            </div>`;
  }).join('')}
        </div>
        <span class="setting-row__desc">${esc(mode === 'blunderrush'
    ? 'Every row is its own rating. Blunder Rush is a binary safe/unsafe call rather than a solve, so these numbers are not on the same scale as the tactics ratings and cannot be compared with them or averaged together.'
    : 'Every row is its own rating, earned under that exact configuration. They are separate scales — a 3D rating and a 2D rating are not interchangeable, and neither is an offensive one and a defensive one.')}</span>
        <span class="setting-row__desc">Median is the typical time to answer one puzzle in that condition, over the window above, counted only from answers that recorded which condition they were given under. It is reported next to the rating and never folded into it: two conditions can settle at the same rating and still be minutes apart, and that difference is the thing worth watching.</span>
      </div>`).join('');

    /* ---- differences, where two rows happen to line up ------------------ */
    const pairs = validPairs(buckets).slice(0, 6);
    const gapSection = pairs.length ? `
      <div class="section">
        <span class="section__title">Differences</span>
        <div class="setting-list">
          ${pairs.map(({ result }) => `
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">${esc(AXIS_LABEL[result.varying])}: ${esc(label(result.to))} vs ${esc(label(result.from))}</span>
                <span class="setting-row__desc">95% interval ${pts(result.low)} to ${pts(result.high)} · n=${result.n}</span>
              </span>
              <span class="stat-tile__value u-num">${pts(result.diff)}</span>
            </div>`).join('')}
        </div>
        <span class="setting-row__desc">Only rows differing on exactly one setting are subtracted, so each number isolates that one change. All-time, since the ratings themselves are cumulative.</span>
      </div>` : '';

    /* ---- drills -------------------------------------------------------- */
    const overall = summarise(drills);
    const seats = groupBySeat(drills);
    const sides = groupByOrientation(drills);
    const days = bucketByDay(drills);

    const statRow = (name, hint, group) => `
      <div class="setting-row">
        <span class="setting-row__label">
          <span class="setting-row__name">${esc(name)}</span>
          <span class="setting-row__desc">${esc(group.n
    ? `${hint ? `${hint} · ` : ''}${group.n} answer${group.n === 1 ? '' : 's'} · ${pct(group.accuracy)} correct`
    : `${hint ? `${hint} · ` : ''}no answers in this window`)}</span>
          ${group.n ? `<span class="progress" style="width:100%;margin-top:6px" role="img"
               aria-label="${pct(group.accuracy)} correct"><span class="progress__bar"
               style="width:${group.accuracy || 0}%"></span></span>` : ''}
        </span>
        <span class="stat-tile__value u-num">${secs(group.medianMs)}</span>
      </div>`;

    const drillSection = drills.length ? `
      <div class="section">
        <span class="section__title">Exercises — accuracy and speed</span>
        <div class="stat-grid">
          <div class="stat-tile"><span class="stat-tile__value u-num">${overall.n}</span><span class="stat-tile__label">Answers</span></div>
          <div class="stat-tile stat-tile--good"><span class="stat-tile__value u-num">${pct(overall.accuracy)}</span><span class="stat-tile__label">Accuracy</span></div>
          <div class="stat-tile"><span class="stat-tile__value u-num">${secs(overall.medianMs)}</span><span class="stat-tile__label">Median</span></div>
        </div>
        <span class="setting-row__desc">By camera seat — median response time on the right, accuracy as the bar.</span>
        <div class="setting-list">${seats.map((b) => statRow(b.label, b.hint, b)).join('')}</div>
        <span class="setting-row__desc">By board orientation.</span>
        <div class="setting-list">${sides.map((s) => statRow(s.label, s.hint, s)).join('')}</div>
        ${days.length > 1 ? `
        <span class="setting-row__desc">Day by day, most recent last.</span>
        <div class="setting-list">${days.map((d) => statRow(
    new Date(d.rows[0].t || Date.now()).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    '', d,
  )).join('')}</div>` : ''}
      </div>` : `
      <div class="section">
        <span class="section__title">Exercises — accuracy and speed</span>
        <div class="empty">
          ${icon('i-target')}
          <p>No drill answers in this window. Exercises log every answer with the camera seat
             and board orientation it was given from.</p>
        </div>
      </div>`;

    const nothing = !buckets.length && !drills.length && !stats.count('drill');

    body.innerHTML = `
      <div class="section">
        <div class="segmented segmented--block" role="group" aria-label="Time window" data-role="window">
          ${WINDOWS.map((w) => `
            <label class="segmented__option${w.id === windowId ? ' is-active' : ''}">
              <input type="radio" name="stats-window" value="${w.id}"${w.id === windowId ? ' checked' : ''}>
              <span>${esc(w.label)}</span>
            </label>`).join('')}
        </div>
      </div>
      ${nothing ? `
        <div class="empty">
          ${icon('i-chart')}
          <p><strong>Nothing recorded yet</strong></p>
          <p>Ratings appear here once you have played a rated set, and the Exercises log every
             answer with the viewpoint it was given from. There is nothing to do on this
             screen — it is here to browse when you feel like it.</p>
        </div>` : `${bucketSections}${gapSection}${drillSection}`}`;

    on(body, '[data-role="window"] input', 'change', (ev) => {
      windowId = ev.target.value;
      paint();
    });
  }

  paint();

  on(screen, '.action-bar [data-go]', 'click', (ev) => navigate(ev.currentTarget.getAttribute('data-go')));
  clearBtn.addEventListener('click', async () => {
    const ok = await ui.confirm({
      title: 'Clear recorded history?',
      text: 'Every logged drill answer and every puzzle rating will be deleted. Settings and best scores are kept.',
      confirmLabel: 'Clear',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    stats.clear('drill');
    stats.clear('rated');
    store.remove('br.ratings.v1');
    paint();
  });
  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   OFFLINE STORAGE  —  #/offline

   The screen you open BEFORE the flight, and the screen you open on the plane
   to find out whether you can still play. So it has two hard requirements that
   shape everything below.

   1. IT MUST NEVER GUESS. Every number here is measured:
        * which bands exist on the device comes from enumerating the `tt-data`
          Cache, not from a download log of our own — a log drifts from reality
          the moment the browser evicts something, and the whole point of this
          screen is to be right about that.
        * the size of a band comes from the `bytes` the two data indexes already
          publish per shard, which is the raw JSON the Cache actually stores.
        * the ceiling comes from navigator.storage.estimate() ON THIS DEVICE.
          WebKit's docs have described the Cache API as capped at 50 MB per
          partition on iOS while Safari 17 reportedly raised home-screen-app
          limits to ~60% of disk; our full corpus is ~53 MB, i.e. exactly
          between those two claims. A hardcoded number would be a lie on one
          device or the other, so there isn't one — and where the browser
          reports nothing, this screen says so instead of inventing a figure.

   2. IT MUST WORK OFFLINE ITSELF. Nothing here needs the network to render:
      the puzzle index is precached, the games index is served from the DATA
      cache once review or this screen has pulled it, and if it has never been
      pulled the games section degrades to "what the cache already holds" rather
      than failing.

   THE TWO DATASETS ARE OFFERED SEPARATELY because they are not the same
   decision: puzzles are ~14.5 MB and make every mode playable, games are
   another ~37.6 MB and buy exactly one screen (review). Folding them into one
   button would make everyone pay 2.6x for a feature many sessions never open.
   ========================================================================== */
async function renderOffline() {
  const screen = fromHTML(`
    <div class="screen screen--summary">
      ${appBar({ back: true, title: 'Offline' })}
      <div class="summary-scroll u-scroll">
        <div class="screen-body__inner" data-role="body">
          <div class="empty">
            ${icon('i-cube')}
            <p>Reading what is stored on this device…</p>
          </div>
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner" style="display:grid;gap:var(--space-2)">
          <button class="btn btn--danger btn--block" data-act="cancel" hidden>${icon('i-x')} Stop downloading</button>
          <button class="btn btn--primary btn--lg btn--block" data-go="#/">Back to home</button>
        </div>
      </div>
    </div>`);

  const body = screen.querySelector('[data-role="body"]');
  const cancelBtn = screen.querySelector('[data-act="cancel"]');

  let catalogue = { puzzles: [], games: [] };
  let cached = { supported: true, puzzles: new Set(), games: new Set(), entries: 0, error: null };
  let est = { supported: false, usage: null, quota: null, free: null, cacheUsage: null };
  let persist = { supported: false, canRequest: false, persisted: false };
  let gamesIndexKnown = false;
  let jobLabel = '';

  /* ---- reading reality ------------------------------------------------- */
  async function readAll() {
    cached = await surveyCache();
    [est, persist] = await Promise.all([estimateStorage(), persistenceState()]);

    let puzzleBands = [];
    try {
      const idx = await ensureData();
      puzzleBands = (idx && Array.isArray(idx.bands)) ? idx.bands : [];
    } catch { puzzleBands = []; }

    // games.ready() never throws — it resolves null when there is no game data
    // at all, which is a normal state, not an error. Offline with the index
    // never fetched lands here too, and the section says so.
    let gameBands = [];
    const gidx = await games.ready();
    if (gidx && Array.isArray(gidx.bands)) { gameBands = gidx.bands; gamesIndexKnown = true; }

    catalogue = buildCatalogue({ puzzleBands, gameBands, cached });
  }

  /* ---- painting -------------------------------------------------------- */
  const chip = (b) => `
    <button class="band${b.cached ? ' is-selected' : ''}" data-band-kind="${b.kind}" data-band="${b.lo}"
            aria-label="${esc(`${b.lo} to ${b.hi}: ${b.cached ? 'saved' : `not downloaded, ${fmtBytes(b.bytes)}`}`)}">
      <span class="band__range u-num">${b.lo}&ndash;${b.hi}</span>
      <span class="band__label" data-role="chip-label">${b.cached ? 'Saved' : esc(fmtBytes(b.bytes))}</span>
    </button>`;

  function bandSection(title, items, count, note) {
    return `
      <div class="section">
        <div class="band-picker">
          <div class="band-picker__head">
            <span class="section__title">${esc(title)}</span>
            <span class="band-picker__current u-num">${count}</span>
          </div>
          <div class="band-row u-scroll-x">${items.map(chip).join('')}</div>
        </div>
        <span class="setting-row__desc">${note}</span>
      </div>`;
  }

  function paint() {
    const p = totals(catalogue.puzzles);
    const g = totals(catalogue.games);
    const stray = orphans(catalogue, cached);
    const running = !!offlineJob;
    const state = running ? offlineJob.state : null;

    cancelBtn.hidden = !running;

    const quotaKnown = est.supported && est.quota != null && est.usage != null;
    const missingAll = p.missingBytes + g.missingBytes;

    /* -- the running download, if there is one --------------------------- */
    const jobSection = running ? `
      <div class="section">
        <span class="section__title">Downloading</span>
        <div class="setting-list">
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name" data-role="job-name">${esc(jobLabel)}</span>
              <span class="setting-row__desc" data-role="job-desc">Starting…</span>
              <span class="progress" style="width:100%;margin-top:6px" role="progressbar">
                <span class="progress__bar" data-role="job-bar" style="width:0%"></span>
              </span>
            </span>
            <span class="stat-tile__value u-num" data-role="job-pct">0%</span>
          </div>
        </div>
        <span class="setting-row__desc">One band at a time, so a band either lands completely or not at all. Stopping keeps everything already downloaded — bands are independent files and nothing is rolled back.</span>
      </div>` : '';

    /* -- what is here ---------------------------------------------------- */
    const playableNote = !p.count
      ? 'The puzzle index could not be read, so there is nothing to report about puzzle bands.'
      : p.missingCount === 0
        ? 'Every puzzle band is on this device. Tactics, Visualization and Practice work with no network at any level.'
        : p.cachedCount === 0
          ? 'No puzzle bands yet. Blunder Rush still plays offline — its ladder pack ships with the app — but Tactics, Visualization and Practice need the band for the level you pick.'
          : `${p.cachedCount} of ${p.count} puzzle bands are here (${fmtBytes(p.cachedBytes)}). Levels outside them will need the network.`;

    const reviewNote = !gamesIndexKnown && !g.count
      ? 'The game index has not been downloaded, so the games available cannot be listed. It is fetched the first time review opens, or the first time this screen is opened with a connection.'
      : g.missingCount === 0 && g.count
        ? 'Every game band is here too, so review replays the full game offline.'
        : g.cachedCount === 0
          ? 'No game bands. Review still works — it falls back to the puzzle line — but replaying the full game needs the network.'
          : `${g.cachedCount} of ${g.count} game bands are here (${fmtBytes(g.cachedBytes)}). Review falls back to the puzzle line for the rest.`;

    const summarySection = `
      <div class="section">
        <span class="section__title">On this device</span>
        <div class="stat-grid">
          <div class="stat-tile${p.count && p.missingCount === 0 ? ' stat-tile--good' : ''}">
            <span class="stat-tile__value u-num">${p.cachedCount}/${p.count}</span>
            <span class="stat-tile__label">Puzzle bands</span>
          </div>
          <div class="stat-tile${g.count && g.missingCount === 0 ? ' stat-tile--good' : ''}">
            <span class="stat-tile__value u-num">${g.cachedCount}/${g.count}</span>
            <span class="stat-tile__label">Game bands</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__value u-num">${esc(fmtBytes(p.cachedBytes + g.cachedBytes))}</span>
            <span class="stat-tile__label">Downloaded</span>
          </div>
        </div>
        <span class="setting-row__desc">${esc(playableNote)}</span>
        <span class="setting-row__desc">${esc(reviewNote)}</span>
        ${cached.supported ? '' : '<span class="setting-row__desc">This browser has no Cache Storage API, so nothing can be stored for offline use and none of the figures above mean anything.</span>'}
        ${cached.error ? `<span class="setting-row__desc">The download cache could not be read: ${esc(cached.error)}</span>` : ''}
        ${(stray.puzzles.length || stray.games.length) ? `<span class="setting-row__desc">${stray.puzzles.length + stray.games.length} cached band(s) are not in the current index — left over from an earlier build. They still take up space and are removed by the button at the bottom.</span>` : ''}
      </div>`;

    /* -- the device's own numbers ---------------------------------------- */
    const usedPct = quotaKnown && est.quota > 0 ? (est.usage / est.quota) * 100 : 0;
    const storageSection = `
      <div class="section">
        <span class="section__title">Storage on this device</span>
        <div class="setting-list">
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Used by this app</span>
              <span class="setting-row__desc">${est.cacheUsage != null
    ? esc(`${fmtBytes(est.cacheUsage)} of it in the caches`)
    : 'Everything this origin has stored, downloads included'}</span>
              ${quotaKnown ? `<span class="progress" style="width:100%;margin-top:6px" role="img"
                   aria-label="${esc(`${usedPct < 1 ? 'under 1' : Math.round(usedPct)} percent of quota used`)}"><span
                   class="progress__bar" style="width:${Math.max(usedPct > 0 ? 1 : 0, Math.min(100, usedPct))}%"></span></span>` : ''}
            </span>
            <span class="stat-tile__value u-num">${esc(fmtBytes(est.usage))}</span>
          </div>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Quota this device reports</span>
              <span class="setting-row__desc">${est.supported
    ? 'Read from the browser just now. It is not a number this app chooses, and it moves with free disk and with how the app was installed.'
    : 'This browser does not report a storage estimate, so there is no honest figure for what will fit. Downloads still work, and still stop cleanly if the device runs out.'}</span>
            </span>
            <span class="stat-tile__value u-num">${esc(fmtBytes(est.quota))}</span>
          </div>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Headroom</span>
              <span class="setting-row__desc">${quotaKnown
    ? esc(`Everything not yet downloaded is ${fmtBytes(missingAll)}, so ${missingAll <= est.free ? 'it fits' : 'it does not fit'} in what is reported free.`)
    : 'Unknown, because the quota is unknown.'}</span>
            </span>
            <span class="stat-tile__value u-num">${esc(fmtBytes(est.free))}</span>
          </div>
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">Persistent storage</span>
              <span class="setting-row__desc">${esc(persist.persisted
    ? 'Granted. The browser has agreed not to evict these downloads to reclaim space. You can still clear them yourself, and deleting the app deletes them.'
    : persist.canRequest
      ? 'Not granted. Downloads are kept best-effort and the browser may evict them when the device is short of space. Asking is not the same as getting it — browsers decide on their own and often say no.'
      : 'This browser does not expose navigator.storage.persist(), so there is nothing to request and no way to know. Downloads are kept best-effort.')}</span>
            </span>
            ${persist.persisted
    ? '<span class="badge badge--safe">Granted</span>'
    : persist.canRequest
      ? '<button class="btn btn--secondary" data-act="persist">Request</button>'
      : '<span class="badge">Unavailable</span>'}
          </div>
        </div>
      </div>`;

    /* -- the two downloads ----------------------------------------------- */
    const fitNote = (bytes) => (quotaKnown && bytes > est.free
      ? ` · more than the ${fmtBytes(est.free)} free`
      : '');

    const downloadSection = running ? '' : `
      <div class="section">
        <span class="section__title">Download for offline</span>
        <div class="mode-list">
          <button class="mode-card mode-card--classic" data-download="puzzles">
            <span class="mode-card__icon">${icon('i-puzzle')}</span>
            <span class="mode-card__body">
              <span class="mode-card__title">Puzzles</span>
              <span class="mode-card__desc">Every rating band — all four modes playable with no network</span>
              <span class="mode-card__meta">${p.missingCount === 0
    ? esc(`All ${p.count} bands already saved`)
    : esc(`${p.missingCount} of ${p.count} bands left · ${fmtBytes(p.missingBytes)}${fitNote(p.missingBytes)}`)}</span>
            </span>
            <span class="mode-card__chevron">${icon('i-chevron')}</span>
          </button>
          <button class="mode-card mode-card--rated" data-download="all">
            <span class="mode-card__icon">${icon('i-cube')}</span>
            <span class="mode-card__body">
              <span class="mode-card__title">Puzzles and games</span>
              <span class="mode-card__desc">Adds the full game behind every puzzle, so review replays offline too</span>
              <span class="mode-card__meta">${missingAll === 0
    ? 'Everything already saved'
    : esc(`${p.missingCount + g.missingCount} bands left · ${fmtBytes(missingAll)}${fitNote(missingAll)}`)}</span>
            </span>
            <span class="mode-card__chevron">${icon('i-chevron')}</span>
          </button>
        </div>
        <span class="setting-row__desc">Sizes are the real byte counts the data index records for each shard, not an estimate. Games are 2.6x the size of the puzzles and are wanted on exactly one screen, which is why they are a separate choice.</span>
        ${navigator.onLine === false ? '<span class="setting-row__desc">This device reports no connection, so a download will not get far. Whatever is already listed above still works.</span>' : ''}
      </div>`;

    /* -- per band -------------------------------------------------------- */
    const puzzleBandSection = catalogue.puzzles.length
      ? bandSection('Puzzle bands', catalogue.puzzles, `${p.cachedCount} / ${p.count}`,
        'Filled chips are on the device. Tap an empty one to download just that band — useful when you only ever play one level.')
      : '';

    const gameBandSection = catalogue.games.length
      ? bandSection('Game bands', catalogue.games, `${g.cachedCount} / ${g.count}`,
        'Review only. Each is roughly twice the size of the puzzle band beside it.')
      : '';

    /* -- what is not listed, and how to get rid of what is ---------------- */
    const shellSection = `
      <div class="section">
        <span class="section__title">Also stored</span>
        <div class="setting-list">
          <div class="setting-row">
            <span class="setting-row__label">
              <span class="setting-row__name">The app itself</span>
              <span class="setting-row__desc">Code, styles, pieces, sounds, the puzzle index and the ladder pack Blunder Rush runs on — cached when the app installs, so Blunder Rush and the Exercises already work offline with nothing downloaded here. Not listed above and not removed below.</span>
            </span>
            <span class="badge badge--safe">Always</span>
          </div>
        </div>
      </div>
      <button class="btn btn--ghost btn--block" data-act="clear"${running ? ' disabled' : ''}>
        ${icon('i-x')} Remove downloaded bands
      </button>`;

    body.innerHTML = `${jobSection}${summarySection}${storageSection}${downloadSection}${puzzleBandSection}${gameBandSection}${shellSection}`;

    // Park each chip row on the boundary between what is here and what is not,
    // so the answer to "have I got anything?" does not require a swipe. Written
    // as scrollLeft rather than scrollIntoView because the latter would also
    // scroll the page vertically to a row that is still below the fold.
    for (const row of body.querySelectorAll('.band-row')) {
      const chips = [...row.children];
      const last = chips.filter((c) => c.classList.contains('is-selected')).pop();
      if (!last) continue;
      row.scrollLeft = Math.max(0, last.offsetLeft - (row.clientWidth - last.offsetWidth) / 2);
    }

    if (state) paintProgress(state);
    wireBody();
  }

  /**
   * The three headline tiles, recomputed from the catalogue.
   *
   * Called as bands land so the counters cannot sit at their start-of-download
   * value while the chips below them light up one by one — two figures for the
   * same fact, disagreeing, on the screen whose whole job is to be believed.
   */
  function refreshTiles() {
    const p = totals(catalogue.puzzles);
    const g = totals(catalogue.games);
    const values = body.querySelectorAll('.stat-grid .stat-tile__value');
    if (values.length < 3) return;
    values[0].textContent = `${p.cachedCount}/${p.count}`;
    values[1].textContent = `${g.cachedCount}/${g.count}`;
    values[2].textContent = fmtBytes(p.cachedBytes + g.cachedBytes);
  }

  /* ---- incremental progress -------------------------------------------
     Repainting the whole body once per band would reset the scroll position
     44 times during a full download, so the running job writes into the nodes
     it already put there and lights up chips as they land. A full repaint
     happens once, at the end, off a fresh survey of the cache.
     -------------------------------------------------------------------- */
  function paintProgress(state) {
    const bar = body.querySelector('[data-role="job-bar"]');
    const pctEl = body.querySelector('[data-role="job-pct"]');
    const desc = body.querySelector('[data-role="job-desc"]');
    if (!bar) return;
    const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
    bar.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (desc) {
      const bits = [`${state.done} of ${state.total} bands`, `${fmtBytes(state.bytes)} of ${fmtBytes(state.totalBytes)}`];
      if (state.failed.length) bits.push(`${state.failed.length} failed`);
      desc.textContent = bits.join(' · ');
    }
  }

  function markChip(item, outcome) {
    if (outcome !== 'saved' && outcome !== 'already') return;
    // `item` is the catalogue's own object (selectMissing filters, it does not
    // copy), so marking it here keeps the counters and the chips in step until
    // the end-of-job repaint re-reads the cache and confirms it.
    item.cached = true;
    refreshTiles();
    const el = body.querySelector(`[data-band-kind="${item.kind}"][data-band="${item.lo}"]`);
    if (!el) return;
    el.classList.add('is-selected');
    const label = el.querySelector('[data-role="chip-label"]');
    if (label) label.textContent = 'Saved';
  }

  /* ---- actions --------------------------------------------------------- */
  async function startDownload(items, label) {
    if (offlineJob) return;
    if (!items.length) { ui.toast('Already downloaded', { kind: 'success' }); return; }

    const bytes = items.reduce((n, b) => n + b.bytes, 0);
    // The warning the whole screen exists for. Only asked when the device's own
    // numbers say it will not fit — never on a guessed ceiling, and never
    // suppressed into a silent partial download.
    if (est.supported && est.free != null && bytes > est.free) {
      const ok = await ui.confirm({
        title: 'This will not fit',
        text: `${esc(label)} is <strong class="u-num">${esc(fmtBytes(bytes))}</strong>, and this device reports only `
          + `<strong class="u-num">${esc(fmtBytes(est.free))}</strong> free of its `
          + `<strong class="u-num">${esc(fmtBytes(est.quota))}</strong> quota. It will download as much as fits and stop `
          + 'when it runs out. Every band that lands stays usable — nothing is rolled back.',
        confirmLabel: 'Download anyway',
        cancelLabel: 'Cancel',
      });
      if (!ok || !screen.isConnected) return;
    }

    jobLabel = label;
    const job = createPrefetch(items, { onProgress: paintProgress, onItem: markChip });
    offlineJob = job;
    paint();

    const result = await job.promise;
    if (offlineJob === job) offlineJob = null;
    if (!screen.isConnected) return;      // navigated away; the cache keeps what landed

    await readAll();
    paint();
    announce(result);
  }

  function announce(r) {
    const kept = r.saved.length;
    const plural = kept === 1 ? 'band' : 'bands';
    if (r.quotaHit) {
      ui.toast(`Out of storage after ${kept} ${plural}. What downloaded is kept and works.`,
        { kind: 'error', duration: 6000 });
    } else if (r.cancelled) {
      ui.toast(`Stopped. ${kept} ${plural} downloaded and kept.`, { kind: 'info', duration: 4000 });
    } else if (r.error) {
      ui.toast('The download cache could not be opened.', { kind: 'error', duration: 5000 });
    } else if (r.failed.length) {
      ui.toast(`${kept} downloaded, ${r.failed.length} failed. Run it again to pick up the rest.`,
        { kind: 'error', duration: 5000 });
    } else if (kept) {
      ui.toast(`${kept} ${plural} downloaded — ${fmtBytes(r.bytes)}.`, { kind: 'success', duration: 4000 });
    }
  }

  function wireBody() {
    on(body, '[data-download]', 'click', (ev) => {
      const what = ev.currentTarget.getAttribute('data-download');
      startDownload(selectMissing(catalogue, what),
        what === 'all' ? 'Puzzles and games' : 'Puzzles');
    });

    on(body, '[data-band-kind]', 'click', (ev) => {
      if (offlineJob) return;
      const kind = ev.currentTarget.getAttribute('data-band-kind');
      const lo = Number(ev.currentTarget.getAttribute('data-band'));
      const list = kind === 'game' ? catalogue.games : catalogue.puzzles;
      const band = list.find((b) => b.lo === lo);
      if (!band) return;
      if (band.cached) { ui.toast(`${band.lo}–${band.hi} is already downloaded`, { kind: 'info' }); return; }
      startDownload([band], `${kind === 'game' ? 'Games' : 'Puzzles'} ${band.lo}–${band.hi}`);
    });

    on(body, '[data-act="persist"]', 'click', async (ev) => {
      ev.currentTarget.disabled = true;
      const result = await requestPersistence();
      persist = await persistenceState();
      if (!screen.isConnected) return;
      paint();
      // Reported exactly as it came back. A refusal is the common case and is
      // said out loud rather than dressed up — claiming the data is safe when
      // the browser declined would be the one genuinely harmful thing here.
      if (result.alreadyGranted) ui.toast('Persistent storage was already granted', { kind: 'success' });
      else if (result.persisted) ui.toast('Persistent storage granted', { kind: 'success' });
      else if (!result.supported) ui.toast('This browser cannot grant persistent storage', { kind: 'error', duration: 5000 });
      else {
        ui.toast('The browser refused. Downloads still work, but may be evicted when space runs short.',
          { kind: 'error', duration: 6000 });
      }
    });

    on(body, '[data-act="clear"]', 'click', async () => {
      if (offlineJob) return;
      const p = totals(catalogue.puzzles);
      const g = totals(catalogue.games);
      const ok = await ui.confirm({
        title: 'Remove downloaded bands?',
        text: `${p.cachedCount + g.cachedCount} band(s), about <strong class="u-num">${esc(fmtBytes(p.cachedBytes + g.cachedBytes))}</strong>, `
          + 'will be deleted. The app itself, the ladder pack and your ratings are not touched, and anything deleted downloads again the next time you play it online.',
        confirmLabel: 'Remove',
        cancelLabel: 'Keep them',
        danger: true,
      });
      if (!ok || !screen.isConnected) return;
      await clearDataCache();
      await readAll();
      if (!screen.isConnected) return;
      paint();
      ui.toast('Downloaded bands removed', { kind: 'success' });
    });
  }

  on(screen, '.action-bar [data-go]', 'click', (ev) => navigate(ev.currentTarget.getAttribute('data-go')));
  cancelBtn.addEventListener('click', () => { if (offlineJob) offlineJob.cancel(); });
  wireChrome(screen);
  mountScreen(screen);

  await readAll();
  if (!screen.isConnected) return;
  paint();
}

/**
 * Open #/offline from the play screen's settings sheet.
 *
 * #/offline is a ROUTE, and route() tears down a running mode — so unlike every
 * other row in that sheet, this one can throw a run away. It asks first, on
 * exactly the same terms the exit control does, rather than silently discarding
 * a five-minute rush because someone wanted to check their downloads.
 *
 * Keeping the prefetch and the run mutually exclusive this way is also why the
 * prefetch never has to negotiate with a mode for bandwidth: by the time the
 * screen exists, there is no run.
 */
async function openOfflineScreen() {
  const session = host;
  if (runInProgress(session)) {
    const ok = await ui.confirm({
      title: 'Leave this run?',
      text: 'Offline downloads is a separate screen, so this run will be discarded and nothing will be recorded.',
      confirmLabel: 'Leave and open',
      cancelLabel: 'Keep playing',
      danger: true,
    });
    if (!ok || host !== session) return;
  }
  navigate('#/offline');
}

function renderErrorScreen({ title, message, detail }) {
  const screen = fromHTML(`
    <div class="screen">
      ${appBar({ back: true, title: esc(title) })}
      <div class="screen-body">
        <div class="screen-body__inner">
          <div class="empty">
            ${icon('i-alert')}
            <p><strong>${esc(message)}</strong></p>
            <p>${esc(detail || '')}</p>
          </div>
        </div>
      </div>
      <div class="action-bar">
        <div class="action-bar__inner">
          <button class="btn btn--primary btn--lg btn--block" data-act="home">Back to home</button>
        </div>
      </div>
    </div>`);
  screen.querySelector('[data-act="home"]').addEventListener('click', () => navigate('#/'));
  wireChrome(screen);
  mountScreen(screen);
}

/* =============================================================================
   SETTINGS SHEET — an overlay, never a route, so it can't discard a run
   ========================================================================== */
/**
 * Applies to BOTH renderers identically. It used to have an 'Auto' setting that
 * followed the board, which confounded the app's core measurement: the 2D-vs-3D
 * rating gap only means something if the board is the only difference between
 * those buckets.
 */
function promptStyleDesc(s) {
  return s.promptStyleChoice === 'notation'
    ? 'You locate the squares yourself, 2D and 3D'
    : 'Squares shown on the board, 2D and 3D';
}

function openSettingsSheet() {
  if (settingsSheetClose) return;
  const s = settings.get();

  settingsSheetClose = ui.sheet({
    labelledBy: 'settings-title',
    onClose: () => {
      settingsSheetClose = null;
      // See session.applyBoard: choosing the value already stored fires no
      // change event, so the review reconciles against the screen on close.
      if (review && review.applyBoard) review.applyBoard();
    },
    build: (node, close) => {
      node.innerHTML = `
        <div class="sheet__grabber"></div>
        <div class="sheet__body">
          <h2 class="sheet__title" id="settings-title">Settings</h2>
          <div class="u-scroll" data-role="settings-scroll">
          <div class="setting-list" data-role="list">
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Board</span>
                <span class="setting-row__desc">3D uses more battery</span>
              </span>
              <div class="segmented" role="group" aria-label="Board renderer">
                <label class="segmented__option${s.board === '2d' ? ' is-active' : ''}"><input type="radio" name="set-board" value="2d"${s.board === '2d' ? ' checked' : ''}><span>2D</span></label>
                <label class="segmented__option${s.board === '3d' ? ' is-active' : ''}"><input type="radio" name="set-board" value="3d"${s.board === '3d' ? ' checked' : ''}><span>3D</span></label>
              </div>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Move prompt</span>
                <span class="setting-row__desc" data-role="prompt-desc">${promptStyleDesc(s)}</span>
              </span>
              <div class="segmented" role="group" aria-label="Move prompt">
                <label class="segmented__option${s.promptStyleChoice !== 'notation' ? ' is-active' : ''}"><input type="radio" name="set-prompt" value="highlight"${s.promptStyleChoice !== 'notation' ? ' checked' : ''}><span>Squares</span></label>
                <label class="segmented__option${s.promptStyleChoice === 'notation' ? ' is-active' : ''}"><input type="radio" name="set-prompt" value="notation"${s.promptStyleChoice === 'notation' ? ' checked' : ''}><span>Notation</span></label>
              </div>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">3D assist</span>
                <span class="setting-row__desc">Outlines and halos on 3D pieces</span>
              </span>
              <label class="switch"><input type="checkbox" name="set-assist" aria-label="3D assist"${s.assist3d ? ' checked' : ''}><span class="switch__track"></span><span class="switch__thumb"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Coordinates</span>
                <span class="setting-row__desc">Rank and file labels on the board</span>
              </span>
              <label class="switch"><input type="checkbox" name="set-coords" aria-label="Coordinates"${s.coordinates ? ' checked' : ''}><span class="switch__track"></span><span class="switch__thumb"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Sound</span>
                <span class="setting-row__desc">Ding on correct, buzz on blunder</span>
              </span>
              <label class="switch"><input type="checkbox" name="set-sound" aria-label="Sound"${s.sound ? ' checked' : ''}><span class="switch__track"></span><span class="switch__thumb"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Haptics</span>
                <span class="setting-row__desc">Vibrate on a strike</span>
              </span>
              <label class="switch"><input type="checkbox" name="set-haptics" aria-label="Haptics"${s.haptics ? ' checked' : ''}><span class="switch__track"></span><span class="switch__thumb"></span></label>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Appearance</span>
                <span class="setting-row__desc">Overrides the system setting</span>
              </span>
              <div class="segmented" role="group" aria-label="Appearance">
                <label class="segmented__option${s.theme === 'light' ? ' is-active' : ''}"><input type="radio" name="set-theme" value="light"${s.theme === 'light' ? ' checked' : ''}><span>Light</span></label>
                <label class="segmented__option${s.theme === 'system' ? ' is-active' : ''}"><input type="radio" name="set-theme" value="system"${s.theme === 'system' ? ' checked' : ''}><span>Auto</span></label>
                <label class="segmented__option${s.theme === 'dark' ? ' is-active' : ''}"><input type="radio" name="set-theme" value="dark"${s.theme === 'dark' ? ' checked' : ''}><span>Dark</span></label>
              </div>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Level</span>
                <span class="setting-row__desc">Puzzle rating to aim for</span>
              </span>
              <div class="segmented" role="group" aria-label="Level">
                <button class="segmented__option" data-level="-200" aria-label="Lower">&minus;</button>
                <span class="segmented__option is-active u-num" data-role="level">${s.rating}</span>
                <button class="segmented__option" data-level="200" aria-label="Higher">+</button>
              </div>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__name">Offline downloads</span>
                <span class="setting-row__desc">What is stored on this device, and download the rest before a flight</span>
              </span>
              <button class="btn btn--secondary" data-act="offline">Open</button>
            </div>
            <div class="setting-row">
              <span class="setting-row__label">
                <span class="setting-row__desc">${esc(PIECE_CREDIT)}</span>
              </span>
            </div>
          </div>
          </div>
        </div>
        <div class="sheet__actions">
          <button class="btn btn--secondary btn--block" data-act="done">Done</button>
        </div>`;

      const sync = (name, patch) => {
        for (const label of node.querySelectorAll(`.segmented__option:has(input[name="${name}"])`)) {
          const input = label.querySelector('input');
          label.classList.toggle('is-active', input.checked);
        }
        settings.set(patch);
      };

      const refreshPromptDesc = () => {
        const desc = node.querySelector('[data-role="prompt-desc"]');
        if (desc) desc.textContent = promptStyleDesc(settings.get());
      };

      on(node, 'input[name="set-board"]', 'change', (ev) => {
        sync('set-board', { board: ev.target.value });
        refreshPromptDesc();          // 'Auto' means something different per board
        refreshBoardFromSettings();
      });
      on(node, 'input[name="set-prompt"]', 'change', (ev) => {
        sync('set-prompt', { promptStyle: ev.target.value });
        refreshPromptDesc();
      });
      on(node, 'input[name="set-theme"]', 'change', (ev) => sync('set-theme', { theme: ev.target.value }));
      on(node, 'input[name="set-assist"]', 'change', (ev) => {
        settings.set({ assist3d: ev.target.checked });
        if (host && host.board && host.board.setAssist) host.board.setAssist(ev.target.checked);
      });
      on(node, 'input[name="set-coords"]', 'change', (ev) => {
        settings.set({ coordinates: ev.target.checked });
        refreshBoardFromSettings();
      });
      on(node, 'input[name="set-sound"]', 'change', (ev) => {
        settings.set({ sound: ev.target.checked });
        if (ev.target.checked) { ui.sound.unlock(); ui.sound('correct'); }
      });
      on(node, 'input[name="set-haptics"]', 'change', (ev) => {
        settings.set({ haptics: ev.target.checked });
        if (ev.target.checked) ui.haptic('medium');
      });
      on(node, '[data-level]', 'click', (ev) => {
        const delta = Number(ev.currentTarget.getAttribute('data-level'));
        const next = settings.set({ rating: settings.get().rating + delta }).rating;
        node.querySelector('[data-role="level"]').textContent = String(next);
      });
      // Close FIRST: openOfflineScreen may need a confirm sheet of its own, and
      // two sheets at once is not a thing ui.sheet supports.
      on(node, '[data-act="offline"]', 'click', () => { close(); openOfflineScreen(); });
      node.querySelector('[data-act="done"]').addEventListener('click', close);
    },
  });
}

/** Rebuild the live board when a renderer-affecting setting changes mid-run. */
function refreshBoardFromSettings() {
  if (!host || !host.board) return;
  host.runSettings = settings.get();
  // Board and prompt style are both rating axes, so changing either mid-run
  // moves the run into a different bucket rather than quietly polluting the old
  // one. The look-ahead depth is fixed for the run and rides along unchanged.
  host.bucket = bucketForRun(host.modeId, host.runSettings, host.config);
  host.board.swap().catch((err) => {
    console.error('board swap failed', err);
    ui.toast('Could not switch the board renderer', { kind: 'error' });
  });
}

/* =============================================================================
   LIFECYCLE
   ========================================================================== */
document.addEventListener('visibilitychange', () => {
  if (!host || !host.handle) return;
  const fn = document.hidden ? host.handle.pause : host.handle.resume;
  if (typeof fn === 'function') {
    try { fn.call(host.handle); } catch (err) { console.error('mode pause/resume failed', err); }
  }
});

const resizeBoards = () => {
  if (host && host.board) host.board.resize();
  if (review && review.board) review.board.resize();
};
window.addEventListener('resize', resizeBoards);
window.addEventListener('orientationchange', () => { setTimeout(resizeBoards, 250); });

// A single router event: popstate covers hash changes too, and lets the phone's
// back gesture close an open sheet before it leaves the screen.
window.addEventListener('popstate', () => {
  if (settingsSheetClose) { settingsSheetClose(); settingsSheetClose = null; }
  route();
});
window.addEventListener('hashchange', route);

/* =============================================================================
   SERVICE WORKER
   ========================================================================== */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  // The FIRST controller — the install claiming this page — must not reload:
  // that would restart the app under the player mid-launch. Only a later
  // change of controller means "the update you asked for has taken over".
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    const promptFor = (worker) => {
      if (!worker) return;
      ui.toast('A new version is ready', {
        kind: 'info',
        duration: 0,
        action: { label: 'Reload', onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
      });
    };
    // Only prompt if there is already a controller: on the very first visit the
    // new worker taking over is not an "update", it's the install.
    if (reg.waiting && navigator.serviceWorker.controller) promptFor(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) promptFor(worker);
      });
    });
  }).catch((err) => console.warn('service worker registration failed', err));
}

/* =============================================================================
   BOOT
   ========================================================================== */
function boot() {
  applyTheme(settings.get().theme);
  const done = shell.querySelector('.loading');
  if (done) done.remove();

  if (!location.hash) history.replaceState(null, '', '#/');
  currentRoute = '';
  route();
  registerServiceWorker();

  // Warm the *index* only — 3 KB, and it makes the setup screen instant.
  // Deliberately NOT prefetchAround(): that pulls three bands before the player
  // has chosen anything. A run loads the one band it actually plays.
  ensureData().catch(() => {});

  // Small, deliberate debug surface. Handy from the console and from the
  // headless-Chrome checks; nothing in the app depends on it.
  window.__app = {
    get settings() { return settings.get(); },
    setSettings: (patch) => settings.set(patch),
    get route() { return currentRoute; },
    get mode() { return host ? host.modeId : null; },
    get board() { return host ? host.board : null; },
    get ctx() { return host ? host.ctx : null; },
    /** The running mode's own read-only debug view, where it publishes one. */
    get modeDebug() {
      try { return host && host.handle && host.handle.debug ? host.handle.debug : null; }
      catch { return null; }
    },
    get boardKind() { return settings.get().board; },
    // Whether the exit control would ask before discarding. Read by the headless
    // checks; nothing in the app depends on it.
    get runInProgress() { return runInProgress(host); },
    /** Where the review player is standing, if it is open. */
    get review() {
      if (!review) return null;
      const step = review.steps[review.at];
      return {
        at: review.at,
        total: review.steps.length - 1,
        fen: step.fen,
        san: step.san,
        from: step.from,
        to: step.to,
        // Full-game review. `ev` is centipawns FROM WHITE'S POINT OF VIEW, the
        // raw lichess number: +/-10000 is mate and the UI prints it as '#'.
        source: review.source,
        hasGame: !!review.gameSteps,
        gamePlies: review.gameSteps ? review.gameSteps.length - 1 : 0,
        tacticAt: review.tacticAt,
        tag: step.tag || null,
        ev: step.ev == null ? null : step.ev,
      };
    },
    data,
    games,
    stats,
    rating,
    defaults: DEFAULTS,
    // The offline screen reads the cache directly rather than trusting a
    // counter, and so should anything checking it. These are the same functions
    // the screen uses, not a parallel implementation that could agree with a
    // bug. `prefetching` is the live job's state, or null.
    storage: {
      survey: surveyCache,
      estimate: estimateStorage,
      persisted: persistenceState,
      get prefetching() { return offlineJob ? offlineJob.state : null; },
    },
  };
}

boot();
