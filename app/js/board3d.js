/**
 * board3d.js -- procedural 3D chess board renderer.
 *
 * Implements the BoardHandle contract in ./board-interface.js on top of modern
 * three.js (r169, vendored in app/vendor/three/, resolved through an import map).
 *
 * DESIGN GOAL: train over-the-board vision. Occlusion, foreshortening and
 * awkward seated angles are the *skill being trained*, not defects to engineer
 * away. So the set is physically honest and the camera sits where a person
 * actually sits. What must never be hard to read is the *rendering* -- lighting,
 * geometry, materials and shadows are as good as we can make them. Difficulty
 * comes from viewpoint and occlusion only.
 *
 *  - Zero model assets. Every piece is generated at runtime: LatheGeometry
 *    revolves for pawn/rook/bishop/queen/king, an extruded profile for the
 *    knight. Six geometries total, shared by all 32 pieces.
 *
 *  - True tournament proportions. One square = 2.25", a 3.75" king, so the king
 *    is 1.667 squares tall and its base is 0.778 of a square wide. Stems narrow
 *    to ~0.35 of their own base radius, exactly as a real Staunton does. A king
 *    on the fourth rank really does hide the foot of a pawn three ranks behind
 *    it from a low seat -- that is the point.
 *
 *  - Knights face the opponent, as they do on a real set. From a player's-eye
 *    camera that shows the back of the head: a narrow slab with two ears and a
 *    mane. Learning to spot that is part of the exercise.
 *
 *  - Legibility aids (inverted-hull outlines, extra lift on the black material)
 *    are all behind `assist: true`, default OFF, so they can be leaned on early
 *    and switched off later.
 *
 *  - The seat, not the side. The camera always sits behind the side to move --
 *    orientation is driven by setOrientation() and never randomised. What varies
 *    is where the player is *sitting*: setSeat({elevation, yaw, distance}) and
 *    randomSeat(seed) pick a point inside a plausible envelope of real seated
 *    positions (28-45 degrees of elevation, +/-20 degrees of yaw, a modest
 *    distance spread), so the user never gets good at exactly one view. Manual
 *    orbit still layers on top, and setView('top') is a genuine square-on plan
 *    view -- the equivalent of online 2D play.
 *
 *  - Raw square taps (`onSquareTap` / `setSquareTapHandler`) are resolved
 *    against the board PLANE, never against the pieces, and never consult the
 *    position. At these camera angles a tall piece routinely covers the square
 *    the user is aiming at, and the blindfold drill taps squares that are empty
 *    on screen, so "what is standing there" is not a question we may ask.
 *
 *  - Arrows and highlights render in a second pass on camera layer 1 with the
 *    depth buffer cleared, so an arrow is never swallowed by a king standing in
 *    the middle of it, while still self-occluding correctly as a real 3D solid.
 *
 * @module board3d
 */

import * as THREE from 'three';
import {
  parseSquare, toSquare, fenToMap, START_FEN, TOKENS,
} from './board-interface.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const SQ = 1;                     // one square = one world unit
const HALF = 4 * SQ;              // half the playing area
const RIM = 0.5;                  // border width
const EXT = HALF + RIM;           // half the whole board slab (4.5)
const BOARD_THICK = 0.34;
const TOP_Y = 0.0;                // playing surface height

const LAYER_MAIN = 0;
const LAYER_OVERLAY = 1;          // arrows: drawn after a depth clear

const MIN_POLAR = 0;              // straight down: a true plan view is a first-class mode
const MAX_POLAR = 1.292;          // ~74 degrees -- never level with or under the board
const DAMPING = 0.12;

/* ---- lighting ------------------------------------------------------- *
 * Tuned by measuring the rendered CIE L* of each piece colour against each
 * square colour (see the report), not by eye. three.js diffuse works out to
 *     rendered = albedo * SUM(intensity_i * NdotL_i) / PI      (+ IBL, + spec)
 * so the split between the key and the ambient terms is what decides how much
 * FORM a curved body shows, and the key's ELEVATION is what decides whether the
 * horizontal board or the vertical pieces catch more light.
 *
 * The old rig had the key at 55 degrees and 45% of the total budget in flat
 * ambient. A board is horizontal, so it took the brightest diffuse in the scene
 * while the pieces -- vertical and curved -- took less: a white piece and a
 * light square landed within 2 L* of each other. The key is now at ~38 degrees,
 * ambient is a third of what it was, and the environment carries the specular.
 * ---------------------------------------------------------------------- */
/*
 * Every light here is deliberately LOW. For a light at elevation t, a
 * horizontal square receives sin(t) and a vertical piece surface facing it
 * receives cos(t) -- so the piece/board ratio is tan(t), and dropping the rig
 * is the one lever that favours the pieces without touching either token. The
 * old rig's key sat at 55 degrees (ratio 0.70); this one averages about 25
 * (ratio ~2.1).
 */
const KEY_INTENSITY = 1.50;
const KEY_INTENSITY_OVERHEAD = 0.95;   // the plan view needs far less
const FILL_INTENSITY = 0.55;
const RIM_INTENSITY = 1.40;
const HEMI_INTENSITY = 0.38;
/**
 * Environment strength, applied PER MATERIAL. It has to be per material: the
 * pieces want a lot of indirect specular (it is most of what shows form on a
 * dark body) and the board wants almost none (a big flat plane seen at grazing
 * angles turns any environment into glare). Note that `material.envMapIntensity`
 * is ignored when the environment comes from `scene.environment`, so the map is
 * assigned to each material directly -- otherwise these numbers do nothing,
 * which is exactly the trap this code was in.
 */
const ENV_PIECES = 0.40;
const ENV_BOARD = 0.24;

/**
 * The whole rig is aimed relative to the SEAT, not to world space. It has to
 * be: a low key fixed at white's end of the table would put black's seat behind
 * the light and render every black-to-move puzzle backlit. Rotating with the
 * seat is also the honest reading of the situation -- swapping orientation is
 * the player walking round to the other side of the board, and the lamp is
 * still over his shoulder when he gets there.
 *
 * Azimuths are radians relative to the seat; positive is the player's right.
 * It deliberately does NOT follow manual orbit: leaning over to look closer
 * does not move the room's lights, and re-aiming every frame would rebuild the
 * shadow map every frame.
 */
const DEG = Math.PI / 180;
const KEY_AZ = 0.70; const KEY_ELEV = 31 * DEG; const KEY_DIST = 7.0;
const KEY_ELEV_TOP = 66 * DEG; const KEY_DIST_TOP = 3.7;
const FILL_AZ = -0.78; const FILL_ELEV = 20 * DEG; const FILL_DIST = 7.4;
const RIM_ELEV = 12 * DEG; const RIM_DIST = 8.5;
/** How strongly a piece darkens the square right where it stands. */
const CONTACT_STRENGTH = 0.62;

const BASE_FOV = 34;              // seated perspective
const TOP_FOV = 11;               // near-orthographic, for the plan view
const FLAT_PHI = 0.16;            // within ~9 degrees of vertical we flatten out
const MIN_ZOOM = 0.50;            // 1.0 == the board exactly fills the frame
const MAX_ZOOM = 2.00;

/**
 * The envelope of plausible seated positions. Every seat inside it is a
 * reasonable view of the board; none of them is a wild one.
 *   elevation -- degrees above the table. A tall player at a low table is near
 *                45; slouched at a high table is near 28.
 *   yaw       -- degrees off the centre line, positive = shifted to the seated
 *                player's right. Nobody sits perfectly square.
 *   distance  -- multiplier on the exact framing distance; how far the chair is
 *                pushed back.
 */
const SEAT_ENVELOPE = {
  elevation: [28, 45],
  yaw: [-20, 20],
  distance: [0.88, 1.14],
};
const DEFAULT_SEAT = { elevation: 36, yaw: 0, distance: 1.0 };

const HIGHLIGHT_KINDS = ['move', 'select', 'error', 'success', 'hint'];

const TOKEN_FALLBACKS = {
  '--board-light': '#ecd9b0',
  '--board-dark': '#a9764c',
  '--board-edge': '#3a2a1c',
  // Highlights and arrows are translucent by design, so the fallbacks are too:
  // a board that has lost its stylesheet should still not paint over pieces.
  '--hl-move': 'rgba(240, 178, 34, 0.55)',
  '--hl-select': 'rgba(47, 104, 224, 0.45)',
  '--hl-error': 'rgba(216, 55, 47, 0.55)',
  '--hl-success': 'rgba(15, 157, 99, 0.50)',
  '--hl-hint': 'rgba(139, 79, 214, 0.45)',
  '--arrow': 'rgba(232, 150, 20, 0.88)',
  '--piece-white': '#fbfaf7',
  '--piece-black': '#40352b',
  '--board-coord-on-light': '#5c4526',
  '--board-coord-on-dark': '#faf2e2',
};

/**
 * True tournament Staunton, in squares. One square = 2.25"; the set is a 3.75"
 * king with the usual companion heights (Q 3.25, B 2.9, N 2.5, R 2.1, P 1.9).
 * Nothing here is squashed to buy sight lines.
 */
const PIECE_HEIGHT = { P: 0.844, R: 0.933, N: 1.111, B: 1.289, Q: 1.444, K: 1.667 };

/**
 * Base radius in squares. Real base *diameters* run 1.2" (pawn) to 1.75" (king)
 * on a 2.25" square, i.e. 53%-78% of the square. Kings on adjacent files very
 * nearly touch, exactly as they do on a real board.
 */
const PIECE_BASE_R = { P: 0.267, R: 0.311, N: 0.322, B: 0.333, Q: 0.367, K: 0.389 };

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Wrap an angle difference into [-PI, PI] so tweens take the short way round. */
function shortAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ---- seats ---------------------------------------------------------- */

/** Keep only the recognised seat fields, each clamped into the envelope. */
function clampSeatInput(s) {
  const out = {};
  if (!s || typeof s !== 'object') return out;
  for (const key of Object.keys(SEAT_ENVELOPE)) {
    const v = Number(s[key]);
    if (!Number.isFinite(v)) continue;
    const [lo, hi] = SEAT_ENVELOPE[key];
    out[key] = clamp(v, lo, hi);
  }
  return out;
}

/** FNV-1a over the string form, so seeds can be puzzle ids as well as numbers. */
function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    const n = Math.abs(Math.trunc(seed)) >>> 0;
    return n === 0 ? 0x9e3779b9 : n;
  }
  const s = seed == null ? String(Math.random()) : String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0 || 0x9e3779b9;
}

function mulberry32(a) {
  let x = a >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a seat from a seed. The draw is triangular rather than uniform, so seats
 * cluster round a normal sitting position and only occasionally reach the edges
 * of the envelope -- every seat is reasonable, and the extremes stay rare enough
 * to feel like a genuinely awkward day rather than the norm.
 */
function seatFromSeed(seed) {
  const rnd = mulberry32(hashSeed(seed));
  const tri = () => (rnd() + rnd()) / 2;
  const pick = (key) => {
    const [lo, hi] = SEAT_ENVELOPE[key];
    return lo + tri() * (hi - lo);
  };
  return {
    elevation: Math.round(pick('elevation') * 10) / 10,
    yaw: Math.round(pick('yaw') * 10) / 10,
    distance: Math.round(pick('distance') * 1000) / 1000,
  };
}

/** Read the TOKENS off an element, falling back to a sane built-in palette. */
function readTokens(el) {
  const out = {};
  let cs = null;
  try { cs = getComputedStyle(el); } catch { cs = null; }
  for (const name of TOKENS) {
    let raw = '';
    if (cs) { try { raw = String(cs.getPropertyValue(name) || '').trim(); } catch { raw = ''; } }
    out[name] = raw || TOKEN_FALLBACKS[name] || '#888888';
  }
  return out;
}

/* ---- colour tokens ---------------------------------------------------- *
 * The design system's tokens legitimately carry alpha -- highlights in
 * particular are meant to be translucent. THREE.Color has no alpha channel and
 * warns, then silently drops it, so we split the two apart here: the RGB goes
 * to the material's colour and the alpha to its opacity. Nothing is ever handed
 * to setStyle with an alpha component still attached, so board creation is
 * warning-free.
 * ---------------------------------------------------------------------- */

function alphaToNumber(raw) {
  if (raw == null) return 1;
  const s = String(raw).trim();
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return 1;
  return clamp(s.endsWith('%') ? v / 100 : v, 0, 1);
}

/** Split a colour function's body into three components plus an alpha. */
function splitFuncArgs(body) {
  const slash = body.split('/');
  if (slash.length === 2) {
    return {
      parts: slash[0].trim().split(/[\s,]+/).filter(Boolean),
      alpha: slash[1].trim(),
    };
  }
  const parts = body.split(/[\s,]+/).filter(Boolean);
  return parts.length >= 4
    ? { parts: parts.slice(0, 3), alpha: parts[3] }
    : { parts, alpha: null };
}

/**
 * Parse any CSS colour a token might hold -- hex (3/4/6/8 digits), rgb(), rgba(),
 * hsl(), hsla(), both comma and space/slash syntax, named colours and
 * `transparent` -- into a THREE.Color plus a separate alpha in 0..1.
 * Anything unparseable falls back rather than throwing or warning.
 *
 * @returns {{color: THREE.Color, alpha: number}}
 */
function parseCssColor(css, fallback) {
  const fb = () => ({
    color: new THREE.Color(fallback || '#888888'),
    alpha: 1,
  });
  const s = String(css == null ? '' : css).trim();
  if (!s) return fb();
  if (s.toLowerCase() === 'transparent') return { color: new THREE.Color(0, 0, 0), alpha: 0 };

  let alpha = 1;
  let style = s;

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(s);
  if (fn) {
    const name = fn[1].toLowerCase().replace(/a$/, '');
    const { parts, alpha: a } = splitFuncArgs(fn[2]);
    if (parts.length < 3) return fb();
    alpha = alphaToNumber(a);
    // three.js only understands the comma form, and chokes on angle units
    style = `${name}(${parts.join(', ').replace(/deg\b/gi, '')})`;
  } else if (s[0] === '#') {
    const hex = s.slice(1);
    if (hex.length === 4) {
      alpha = parseInt(hex[3] + hex[3], 16) / 255;
      style = `#${hex.slice(0, 3)}`;
    } else if (hex.length === 8) {
      alpha = parseInt(hex.slice(6, 8), 16) / 255;
      style = `#${hex.slice(0, 6)}`;
    } else if (hex.length !== 3 && hex.length !== 6) {
      return fb();
    }
  } else if (/^[a-z]+$/i.test(s)) {
    // Named colour. Check the table ourselves: setStyle warns on a miss.
    const names = THREE.Color.NAMES || {};
    if (!(s.toLowerCase() in names)) return fb();
  } else {
    return fb();
  }

  const c = new THREE.Color();
  try {
    c.setStyle(style);
  } catch {
    return fb();
  }
  if (!Number.isFinite(c.r) || !Number.isFinite(c.g) || !Number.isFinite(c.b)) return fb();
  return { color: c, alpha: Number.isFinite(alpha) ? alpha : 1 };
}

/** Just the colour, for the places that genuinely have nowhere to put alpha. */
function toColor(css, fallback) {
  return parseCssColor(css, fallback).color;
}

/** Apply a parsed token to a material: colour on the material, alpha on opacity. */
function applyColorToken(mat, parsed, baseOpacity = 1) {
  mat.color.copy(parsed.color);
  const o = clamp(baseOpacity * parsed.alpha, 0, 1);
  mat.opacity = o;
  mat.transparent = o < 0.999;
  // Highlight tiles must never write depth; arrows always must, so they keep
  // self-occluding as solids in the overlay pass even at 0.95 opacity.
  if (mat.userData.forceNoDepthWrite) mat.depthWrite = false;
  else if (mat.userData.forceDepthWrite) mat.depthWrite = true;
  else mat.depthWrite = o >= 0.999;
  mat.needsUpdate = true;
  return o;
}

function luminance(color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/**
 * Merge a list of {geo, matrix} into a single position+normal BufferGeometry.
 * Avoids vendoring examples/jsm/utils/BufferGeometryUtils just for this.
 */
function mergeGeoms(entries) {
  const parts = [];
  let total = 0;
  for (const { geo, matrix } of entries) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    parts.push(g);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let off = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

/** Inverted-hull outline shell: push every vertex out along its own normal. */
function makeOutlineGeom(geo, offset) {
  const g = geo.clone();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i += 1) {
    const y = p.getY(i) + n.getY(i) * offset;
    p.setXYZ(
      i,
      p.getX(i) + n.getX(i) * offset,
      y < 0.002 ? 0.002 : y,           // never sink through the board
      p.getZ(i) + n.getZ(i) * offset,
    );
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

const lathe = (pts, segments = 44) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segments);

/**
 * Average normals between faces that meet at a shallow angle, leaving sharp
 * creases sharp. An ExtrudeGeometry is non-indexed, so every face gets its own
 * flat normal -- which is why an extruded neck reads as a stack of flat panels
 * instead of a rounded one. Only the knight needs this; the lathes already
 * carry smooth normals.
 */
function smoothNormals(geo, maxAngleDeg = 46) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!pos || !nor) return geo;
  const buckets = new Map();
  for (let i = 0; i < pos.count; i += 1) {
    const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    let a = buckets.get(k);
    if (!a) { a = []; buckets.set(k, a); }
    a.push(i);
  }
  const cosMax = Math.cos((maxAngleDeg * Math.PI) / 180);
  const out = new Float32Array(nor.count * 3);
  for (const idxs of buckets.values()) {
    for (const i of idxs) {
      const ix = nor.getX(i); const iy = nor.getY(i); const iz = nor.getZ(i);
      let nx = 0; let ny = 0; let nz = 0;
      for (const j of idxs) {
        const jx = nor.getX(j); const jy = nor.getY(j); const jz = nor.getZ(j);
        if (ix * jx + iy * jy + iz * jz < cosMax) continue;
        nx += jx; ny += jy; nz += jz;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      out[i * 3] = nx / l; out[i * 3 + 1] = ny / l; out[i * 3 + 2] = nz / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}

/** Uniformly scale a built piece so its declared height in PIECE_HEIGHT is exact. */
function normaliseHeight(geo, height) {
  geo.computeBoundingBox();
  const top = geo.boundingBox.max.y;
  if (top > 0 && Math.abs(top - height) > 1e-4) geo.scale(height / top, height / top, height / top);
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------ *
 * Piece geometry
 * ------------------------------------------------------------------ */

/**
 * The shared Staunton foot, sized to a piece's own base radius. Real sets scale
 * the whole foot with the piece rather than sitting every piece on one disc, so
 * the profile heights scale with R too.
 */
function foot(R) {
  const k = R / 0.33;
  return [
    [0, 0], [0.94 * R, 0], [1.00 * R, 0.032 * k], [0.99 * R, 0.075 * k],
    [0.92 * R, 0.102 * k], [0.78 * R, 0.130 * k],
  ];
}

/** Small ball on a plain neck. The shortest, simplest silhouette in the set. */
function buildPawn() {
  const R = PIECE_BASE_R.P;
  const body = lathe([
    ...foot(R),
    [0.150, 0.155], [0.108, 0.235], [0.096, 0.315], [0.098, 0.355],
    [0.150, 0.385], [0.146, 0.412], [0.100, 0.440],
    [0.088, 0.478], [0.084, 0.520], [0, 0.520],
  ]);
  const ball = new THREE.SphereGeometry(0.180, 32, 22);
  const g = mergeGeoms([
    { geo: body },
    { geo: ball, matrix: new THREE.Matrix4().makeTranslation(0, 0.664, 0) },
  ]);
  ball.dispose();
  return normaliseHeight(g, PIECE_HEIGHT.P);
}

/** The only flat-topped piece, and the only one with a crenellated ring. */
function buildRook() {
  const R = PIECE_BASE_R.R;
  const body = lathe([
    ...foot(R),
    [0.212, 0.175], [0.198, 0.240], [0.190, 0.520], [0.196, 0.600],
    [0.228, 0.645], [0.246, 0.685], [0.262, 0.715], [0.262, 0.795],
    [0.208, 0.795], [0.208, 0.735], [0, 0.735],
  ]);
  const entries = [{ geo: body }];
  const merlon = new THREE.BoxGeometry(0.115, 0.138, 0.062);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Matrix4()
      .makeRotationY(a)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.864, 0.234));
    entries.push({ geo: merlon, matrix: m });
  }
  const g = mergeGeoms(entries);
  merlon.dispose();
  return normaliseHeight(g, PIECE_HEIGHT.R);
}

/** Tapering mitre on a banded collar, capped with a small finial. */
function buildBishop() {
  const R = PIECE_BASE_R.B;
  const body = lathe([
    ...foot(R),
    [0.226, 0.180], [0.160, 0.275], [0.124, 0.420], [0.116, 0.530],
    [0.180, 0.585], [0.194, 0.630], [0.140, 0.672], [0.126, 0.700],
    [0.176, 0.775], [0.216, 0.880], [0.228, 0.965], [0.222, 1.030],
    [0.192, 1.095], [0.142, 1.160], [0.090, 1.212], [0.052, 1.245], [0, 1.245],
  ]);
  const ball = new THREE.SphereGeometry(0.062, 22, 16);
  const g = mergeGeoms([
    { geo: body },
    { geo: ball, matrix: new THREE.Matrix4().makeTranslation(0, 1.227, 0) },
  ]);
  ball.dispose();
  return normaliseHeight(g, PIECE_HEIGHT.B);
}

/** Coronet of beads round a flared crown, ball finial sitting in the bowl. */
function buildQueen() {
  const R = PIECE_BASE_R.Q;
  const body = lathe([
    ...foot(R),
    [0.252, 0.200], [0.180, 0.310], [0.146, 0.520], [0.136, 0.690],
    [0.208, 0.750], [0.222, 0.798], [0.162, 0.845], [0.150, 0.880],
    [0.198, 0.960], [0.252, 1.070], [0.272, 1.155], [0.268, 1.200],
    [0.206, 1.228], [0.130, 1.190], [0.100, 1.208], [0.078, 1.240],
    [0.068, 1.262], [0, 1.262],
  ]);
  const entries = [{ geo: body }];
  const bead = new THREE.SphereGeometry(0.036, 14, 10);
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    entries.push({
      geo: bead,
      matrix: new THREE.Matrix4().makeTranslation(
        Math.cos(a) * 0.272, 1.210, Math.sin(a) * 0.272,
      ),
    });
  }
  const finial = new THREE.SphereGeometry(0.110, 26, 18);
  entries.push({ geo: finial, matrix: new THREE.Matrix4().makeTranslation(0, 1.334, 0) });
  const g = mergeGeoms(entries);
  bead.dispose();
  finial.dispose();
  return normaliseHeight(g, PIECE_HEIGHT.Q);
}

/** Tallest piece, and the only one topped by a cross. */
function buildKing() {
  const R = PIECE_BASE_R.K;
  const body = lathe([
    ...foot(R),
    [0.268, 0.215], [0.192, 0.340], [0.156, 0.600], [0.144, 0.790],
    [0.216, 0.855], [0.230, 0.905], [0.170, 0.955], [0.158, 0.995],
    [0.206, 1.080], [0.262, 1.200], [0.282, 1.295], [0.278, 1.345],
    [0.214, 1.375], [0.136, 1.335], [0.104, 1.355], [0.086, 1.395],
    [0.082, 1.425], [0, 1.425],
  ]);
  const vert = new THREE.BoxGeometry(0.064, 0.242, 0.064);
  const horiz = new THREE.BoxGeometry(0.185, 0.062, 0.064);
  const g = mergeGeoms([
    { geo: body },
    { geo: vert, matrix: new THREE.Matrix4().makeTranslation(0, 1.546, 0) },
    { geo: horiz, matrix: new THREE.Matrix4().makeTranslation(0, 1.585, 0) },
  ]);
  vert.dispose();
  horiz.dispose();
  return normaliseHeight(g, PIECE_HEIGHT.K);
}

/**
 * The knight is the one piece a revolve cannot express: an extruded horse-head
 * profile on the shared foot, carved with a mane, two ears and an eye.
 *
 * It is built facing +X and then turned to face the OPPONENT in makePiece(),
 * which is how a real set is laid out. From a seated camera that means you are
 * usually looking at the back or the front of the head rather than its profile,
 * and the knight reads as a narrow eared slab. That is the real-life problem,
 * so the geometry has to earn its identity from the ear notch and the flared
 * mane rather than from being conveniently turned side-on.
 */
function buildKnight() {
  const R = PIECE_BASE_R.N;
  const PLINTH_H = 0.245;
  const plinth = lathe([
    ...foot(R),
    [0.238, 0.175], [0.230, 0.225], [0.225, PLINTH_H], [0, PLINTH_H],
  ]);

  /* ---- the head, built in its own space with y=0 on the plinth ---- */

  // +x is the muzzle, +y is up. Traced clockwise from the bottom of the neck,
  // up the mane, over the poll, down the face and back under the jaw. The ears
  // are NOT in this outline: a real knight's ears are two separate carvings
  // side by side, and a flat profile can only ever show one of them.
  // The crest is deliberately arched hard. An opponent's knight shows you its
  // BACK, so this contour -- not the face -- is what has to read as a horse.
  const CREST = [
    [-0.205, 0.000], [-0.288, 0.120], [-0.332, 0.320], [-0.320, 0.500],
    [-0.268, 0.640], [-0.202, 0.722], [-0.140, 0.762],
  ];
  const raw = [
    ...CREST,
    [-0.058, 0.755],                        // poll
    [0.020, 0.700], [0.105, 0.640], [0.198, 0.575], [0.292, 0.518],
    [0.360, 0.458], [0.388, 0.398],         // muzzle
    [0.348, 0.345], [0.252, 0.330], [0.232, 0.266],
    [0.150, 0.230], [0.035, 0.242],         // jaw
    [-0.030, 0.150], [0.020, 0.045], [0.115, 0.000],
  ];

  const shape = new THREE.Shape();
  shape.moveTo(raw[0][0], raw[0][1]);
  for (let i = 1; i < raw.length; i += 1) shape.lineTo(raw[i][0], raw[i][1]);
  shape.closePath();

  // A real knight head is ~0.6" thick against a 1.45" base -- narrow, which is
  // exactly why it disappears when pointed at you.
  const depth = 0.30;
  const head = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments: 6, bevelEnabled: true,
    bevelThickness: 0.028, bevelSize: 0.028, bevelSegments: 3,
  });
  head.translate(0, 0, -depth / 2);   // shape z -> world thickness, centred

  // Carve the slab into a head: a real one is thickest through the neck and
  // narrows towards the muzzle and towards the poll. Without this it reads as
  // an extruded rectangle from behind -- a modelling failure rather than a
  // horse, which is a different problem from being hard to see.
  const smooth = (v, a, b) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const taper = (x, y) => (1 - 0.30 * smooth(y, 0.34, 0.78)) * (1 - 0.46 * smooth(x, -0.02, 0.39));
  {
    const p = head.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      p.setZ(i, p.getZ(i) * taper(p.getX(i), p.getY(i)));
    }
    p.needsUpdate = true;
    head.computeVertexNormals();
    smoothNormals(head);
  }

  const parts = [{ geo: head }];

  /**
   * The mane: a proud, scalloped crest running down the back of the neck, with
   * the neck falling away either side of it. This is THE rear identification
   * feature -- from directly behind, which is exactly what an opponent's knight
   * shows you, the ridge and the locks either side of it are all you get. A
   * plain extruded back reads as a lump no matter how good the profile is.
   */
  {
    const N = 30;
    // resample the crest, then walk it offsetting along its outward normal
    const pts = [];
    for (let i = 0; i < N; i += 1) {
      const u = (i / (N - 1)) * (CREST.length - 1);
      const a = CREST[Math.floor(u)];
      const b = CREST[Math.min(CREST.length - 1, Math.floor(u) + 1)];
      const f = u - Math.floor(u);
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    const outer = []; const inner = [];
    for (let i = 0; i < N; i += 1) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[Math.min(N - 1, i + 1)];
      let tx = p1[0] - p0[0]; let ty = p1[1] - p0[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty; const ny = tx;      // outward, towards -x along the back
      const t = i / (N - 1);
      // scalloped locks of hair, fading out at both ends
      const lock = Math.sin(t * Math.PI * 4.5) * 0.016 * Math.sin(t * Math.PI);
      const out = 0.030 * Math.sin(Math.min(1, t * 3.2) * Math.PI * 0.5) + lock;
      outer.push([pts[i][0] + nx * out, pts[i][1] + ny * out]);
      inner.push([pts[i][0] - nx * 0.055, pts[i][1] - ny * 0.055]);
    }
    const maneShape = new THREE.Shape();
    maneShape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < N; i += 1) maneShape.lineTo(outer[i][0], outer[i][1]);
    for (let i = N - 1; i >= 0; i -= 1) maneShape.lineTo(inner[i][0], inner[i][1]);
    maneShape.closePath();

    const mDepth = 0.15;
    const mane = new THREE.ExtrudeGeometry(maneShape, {
      depth: mDepth, curveSegments: 4, bevelEnabled: true,
      bevelThickness: 0.020, bevelSize: 0.020, bevelSegments: 2,
    });
    mane.translate(0, 0, -mDepth / 2);
    // narrow the crest towards the poll, and pinch it between the locks so the
    // scallops are visible from dead astern as well as in profile
    const mp = mane.attributes.position;
    for (let i = 0; i < mp.count; i += 1) {
      const t = clamp(mp.getY(i) / 0.762, 0, 1);
      const w = (1 - 0.34 * t) * (1 + 0.17 * Math.sin(t * Math.PI * 4.5));
      mp.setZ(i, mp.getZ(i) * w);
    }
    mp.needsUpdate = true;
    mane.computeVertexNormals();
    smoothNormals(mane, 34);
    parts.push({ geo: mane });
  }

  // Two ears, side by side and splayed, as they are carved on a real set. From
  // a player's-eye view of the back of the head they are the one feature that
  // says "knight" -- and they are honest geometry, not an aid.
  const ear = new THREE.ConeGeometry(0.062, 0.145, 6);
  for (const side of [-1, 1]) {
    const m = new THREE.Matrix4()
      .makeTranslation(-0.112, 0.726, side * 0.076)
      .multiply(new THREE.Matrix4().makeRotationZ(0.24))       // lean back
      .multiply(new THREE.Matrix4().makeRotationX(side * 0.30)) // splay out
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.0725, 0));
    parts.push({ geo: ear, matrix: m });
  }

  // Eyes, on the cheek where the taper has already narrowed the head.
  const eyeX = 0.075; const eyeY = 0.545;
  const eye = new THREE.SphereGeometry(0.030, 14, 10);
  for (const side of [-1, 1]) {
    parts.push({
      geo: eye,
      matrix: new THREE.Matrix4().makeTranslation(
        eyeX, eyeY, side * (depth / 2) * taper(eyeX, eyeY),
      ),
    });
  }

  const headGeo = mergeGeoms(parts);
  head.dispose(); ear.dispose(); eye.dispose();
  for (const part of parts) if (part.geo !== head) part.geo.dispose?.();

  // Scale the head alone so the whole piece hits its Staunton height without
  // shrinking the foot -- the foot has to match the rest of the set.
  headGeo.computeBoundingBox();
  const s = (PIECE_HEIGHT.N - PLINTH_H) / headGeo.boundingBox.max.y;
  headGeo.scale(s, s, s);
  headGeo.translate(0, PLINTH_H, 0);

  const g = mergeGeoms([{ geo: plinth }, { geo: headGeo }]);
  headGeo.dispose();
  return normaliseHeight(g, PIECE_HEIGHT.N);
}

const PIECE_BUILDERS = {
  P: buildPawn, R: buildRook, N: buildKnight, B: buildBishop, Q: buildQueen, K: buildKing,
};

/* ------------------------------------------------------------------ *
 * Highlight tile templates
 * ------------------------------------------------------------------ */

function flatPlane(size, y) {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function bar(len, thick, y, x, z, rotY) {
  const g = new THREE.BoxGeometry(len, 0.022, thick);
  const m = new THREE.Matrix4().makeRotationY(rotY || 0);
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

/** Frame outline made of four bars. */
function frameGeom(size, thick, y) {
  const h = size / 2;
  return mergeGeoms([
    { geo: bar(size, thick, y, 0, -h + thick / 2, 0) },
    { geo: bar(size, thick, y, 0, h - thick / 2, 0) },
    { geo: bar(size - thick * 2, thick, y, -h + thick / 2, 0, Math.PI / 2) },
    { geo: bar(size - thick * 2, thick, y, h - thick / 2, 0, Math.PI / 2) },
  ]);
}

/** Four corner brackets -- reads as a reticle, distinct from a solid frame. */
function bracketsGeom(size, thick, y) {
  const h = size / 2;
  const len = size * 0.34;
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push({ geo: bar(len, thick, y, sx * (h - len / 2), sz * (h - thick / 2), 0) });
      out.push({ geo: bar(len, thick, y, sx * (h - thick / 2), sz * (h - len / 2), Math.PI / 2) });
    }
  }
  return mergeGeoms(out);
}

function crossGeom(size, thick, y) {
  const len = size * 0.82;
  return mergeGeoms([
    { geo: bar(len, thick, y, 0, 0, Math.PI / 4) },
    { geo: bar(len, thick, y, 0, 0, -Math.PI / 4) },
  ]);
}

function ringGeom(inner, outer, y) {
  const g = new THREE.RingGeometry(inner, outer, 40);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/* ------------------------------------------------------------------ *
 * Shared, immutable piece resources
 *
 * Every board draws the same six shapes. Building them per instance made
 * mounting a board noticeably slow, and this app swaps boards constantly.
 * ------------------------------------------------------------------ */

let SHARED_GEO = null;
function getSharedPieceGeometry() {
  if (SHARED_GEO) return SHARED_GEO;
  const pieceGeo = {};
  const outlineGeo = {};
  for (const k of Object.keys(PIECE_BUILDERS)) {
    pieceGeo[k] = PIECE_BUILDERS[k]();
    pieceGeo[k].userData.shared = true;
    // Built unconditionally but hidden unless assist is on, so the toggle is
    // instant and costs nothing while it is off.
    outlineGeo[k] = makeOutlineGeom(pieceGeo[k], 0.014);
    outlineGeo[k].userData.shared = true;
  }
  SHARED_GEO = { pieceGeo, outlineGeo };
  return SHARED_GEO;
}

let SHARED_METRICS = null;
/**
 * height      -- top of the piece, in squares
 * baseRadius  -- widest radius in the bottom 6% of a square
 * waistRadius -- narrowest radius of the body above the foot: the number that
 *                says whether the upper body has been slimmed for sight lines
 */
function getSharedPieceMetrics() {
  if (SHARED_METRICS) return SHARED_METRICS;
  const { pieceGeo } = getSharedPieceGeometry();
  const out = {};
  for (const k of Object.keys(pieceGeo)) {
    const pos = pieceGeo[k].attributes.position;
    let height = 0; let baseR = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y > height) height = y;
      if (y <= 0.06) baseR = Math.max(baseR, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    // Waist = the thinnest point of the SOLID between the foot and the collar.
    // Measured by slicing the mesh with horizontal planes and interpolating
    // along the triangle edges that cross each one: a lathe only carries
    // vertices at its profile points, so sampling vertices alone would read
    // whatever happens to be nearby -- including the axis vertex where a cap
    // closes -- rather than the real silhouette.
    const radiusAt = (y0) => {
      let r = 0;
      for (let i = 0; i < pos.count; i += 3) {
        for (let e = 0; e < 3; e += 1) {
          const a = i + e; const b = i + ((e + 1) % 3);
          const ya = pos.getY(a); const yb = pos.getY(b);
          if ((ya - y0) * (yb - y0) > 0 || ya === yb) continue;
          const t = (y0 - ya) / (yb - ya);
          const x = pos.getX(a) + (pos.getX(b) - pos.getX(a)) * t;
          const z = pos.getZ(a) + (pos.getZ(b) - pos.getZ(a)) * t;
          const d = Math.hypot(x, z);
          if (d > r) r = d;
        }
      }
      return r;
    };
    let waist = Infinity;
    for (let f = 0.25; f <= 0.551; f += 0.025) {
      const r = radiusAt(height * f);
      if (r > 0 && r < waist) waist = r;
    }
    out[k] = {
      height: Math.round(height * 1e4) / 1e4,
      baseRadius: Math.round(baseR * 1e4) / 1e4,
      waistRadius: Number.isFinite(waist) ? Math.round(waist * 1e4) / 1e4 : null,
    };
  }
  SHARED_METRICS = out;
  return out;
}

/* ------------------------------------------------------------------ *
 * createBoard
 * ------------------------------------------------------------------ */

/**
 * @param {HTMLElement} container
 * @param {import('./board-interface.js').BoardOptions} [options]
 * @returns {import('./board-interface.js').BoardHandle}
 */
export function createBoard(container, options = {}) {
  if (!container) throw new Error('createBoard: container is required');

  const opts = {
    position: START_FEN,
    orientation: 'white',
    coordinates: true,
    interactive: false,
    onMove: null,
    onSquareTap: null,
    shadows: true,
    // Legibility aids are opt-in and OFF by default: reading a real set is the
    // point. `assist` is the single switch; `outlines` can override it alone.
    assist: false,
    ...options,
  };
  let assistOn = opts.outlines != null ? !!opts.outlines : !!opts.assist;

  /* ---------- DOM ---------- */

  const el = document.createElement('div');
  el.className = 'board3d';
  el.style.cssText = 'position:relative;width:100%;height:100%;min-height:1px;' +
    'touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden;';
  container.appendChild(el);

  const flashEl = document.createElement('div');
  flashEl.className = 'board3d-flash';
  flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;' +
    'mix-blend-mode:normal;border-radius:inherit;';
  el.appendChild(flashEl);

  let tokens = readTokens(el);

  /* ---------- renderer ---------- */

  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !!opts.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Without tone mapping the key light clips the top of a white piece flat, and
  // a clipped highlight carries no form -- which is most of why the set read as
  // smooth. A filmic roll-off keeps the specular shoulder rendering as shape.
  renderer.toneMapping = THREE.NeutralToneMapping != null
    ? THREE.NeutralToneMapping
    : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
  el.insertBefore(renderer.domElement, flashEl);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 200);
  camera.up.set(0, 1, 0);

  /* ---------- environment ---------- */

  /**
   * A room, as an equirectangular gradient: bright ceiling, mid walls, dark
   * floor, and one soft window-shaped bright patch. This is what gives a lathed
   * body its specular roll-off -- a directional light alone only ever produces
   * one hard highlight, which is why a revolve lit that way looks like a
   * uniformly smooth balloon. Generated at runtime; still zero assets.
   */
  function buildEnvTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0.00, '#ffffff');
    grad.addColorStop(0.30, '#eef1f6');
    grad.addColorStop(0.50, '#c6ccd4');   // horizon
    // The lower half is a lit room, not a void: a table under a lamp bounces a
    // great deal of light back up. It matters far more than it looks, because
    // the board faces the sky while the PIECES face the horizon and the floor.
    // Brightening down here lifts the pieces roughly eight times as much as it
    // lifts the squares, which is exactly the bias the black pieces needed.
    grad.addColorStop(0.68, '#95897a');
    grad.addColorStop(1.00, '#6b6154');   // table top
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 64);
    // a window: gives curved bodies a highlight that travels as they turn
    const rg = g.createRadialGradient(34, 17, 1, 34, 17, 26);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 64);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * Prefiltering the environment costs ~55ms of GPU work, and this app mounts a
   * new board for every puzzle -- so it is deliberately kept OFF the path to
   * first paint. The analytic key/fill/rim already carry the image; the
   * environment only adds indirect specular, and having it appear a frame later
   * is invisible. A board that is destroyed before it lands never pays at all.
   */
  let envRT = null;
  let envTimer = null;
  function buildEnvironment() {
    envTimer = null;
    if (destroyed || envRT) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const src = buildEnvTexture();
    try {
      envRT = pmrem.fromEquirectangular(src);
      const env = envRT.texture;
      for (const [m, i] of [[matWhite, ENV_PIECES], [matBlack, ENV_PIECES * 1.15],
        [topMat, ENV_BOARD], [slabMat, ENV_BOARD], [arrowMat, ENV_PIECES]]) {
        m.envMap = env;
        m.envMapIntensity = i;
        m.needsUpdate = true;
      }
      requestRender();
    } catch { envRT = null; }   // no float targets: fall back to lights alone   // no float targets: fall back to lights alone
    src.dispose();
    pmrem.dispose();
  }

  /* ---------- lighting ---------- */

  /**
   * Deliberately inverted: a DARK sky and a BRIGHT warm ground. A hemisphere
   * light gives its sky colour to up-facing normals and its ground colour to
   * down-facing ones, so this is bounce off a lit table -- it lands almost
   * entirely on the vertical surfaces of the pieces and almost not at all on
   * the horizontal squares. That asymmetry is what stops black pieces from
   * crushing to a silhouette without lifting the board with them.
   */
  const hemi = new THREE.HemisphereLight(0x2a2f38, 0xbfae95, HEMI_INTENSITY);
  hemi.layers.enableAll();
  scene.add(hemi);

  // Lower than it was. A key high overhead lands almost square on the board,
  // which is horizontal, so the squares got the brightest diffuse in the scene
  // while the pieces -- vertical and curved -- got less. Dropping the key to a
  // real desk-lamp/window elevation swings that the other way and lengthens the
  // cast shadows, which is what grounds a piece on its square.
  const key = new THREE.DirectionalLight(0xfff4e6, KEY_INTENSITY);
  key.position.set(KEY_DIST * Math.sin(KEY_AZ), KEY_DIST * Math.tan(KEY_ELEV),
    KEY_DIST * Math.cos(KEY_AZ));
  key.layers.enableAll();
  if (opts.shadows) {
    key.castShadow = true;
    // Full-height Staunton pieces throw long shadows, so the ortho frustum has
    // to be wider than the slab. 1536 keeps contact shadows crisp at that spread
    // without making every animation frame expensive on a phone GPU -- the map
    // is rebuilt whenever a piece moves, so its cost is not one-off.
    key.shadow.mapSize.set(1536, 1536);
    const c = key.shadow.camera;
    c.left = -7.4; c.right = 7.4; c.top = 7.4; c.bottom = -7.4;
    c.near = 1; c.far = 30;
    c.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.018;
    // Real shadows are never black: bounced light fills them. Without this the
    // key's own terminator crushes a dark piece's shaded half to nothing, which
    // is most of why the black pieces read as flat blobs.
    if ('intensity' in key.shadow) key.shadow.intensity = 0.62;
  }
  scene.add(key);

  /**
   * Classic three-point fill: opposite the key in azimuth but on the SAME side
   * of the board as the player, and low. It has to be on the player's side --
   * a fill behind the board only lifts surfaces the camera cannot see, which is
   * where this one used to be. Low again, so it lifts the pieces' visible
   * shadow side about three times as much as it lifts the squares.
   */
  const fill = new THREE.DirectionalLight(0xd6e0f0, FILL_INTENSITY);
  fill.position.set(FILL_DIST * Math.sin(FILL_AZ), FILL_DIST * Math.tan(FILL_ELEV),
    FILL_DIST * Math.cos(FILL_AZ));
  fill.layers.enableAll();
  scene.add(fill);

  /**
   * Rim, from beyond the far edge of the board, low. Every room has light
   * coming from more than one direction; this is the one that matters, because
   * at a grazing angle it catches the silhouette. It is the only thing that
   * separates a BLACK piece from a dark square: black lacquer has almost no
   * diffuse response, so its edge has to come from specular. Repositioned with
   * the camera, since which of a room's lights back-lights you depends on where
   * you are sitting.
   */
  const rim = new THREE.DirectionalLight(0xcfe0ff, RIM_INTENSITY);
  rim.position.set(0, 3.2, -8);
  rim.layers.enableAll();
  scene.add(rim);

  /* ---------- board ---------- */

  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024;
  boardCanvas.height = 1024;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  boardTex.minFilter = THREE.LinearMipmapLinearFilter;

  const topGeo = new THREE.PlaneGeometry(EXT * 2, EXT * 2);
  topGeo.rotateX(-Math.PI / 2);
  /**
   * Deliberately the least reflective thing in the scene, and the one place
   * MeshPhysicalMaterial earns its cost. A seated camera sees the board almost
   * entirely at grazing incidence, where Fresnel drives *any* dielectric's
   * specular towards 1 -- so a standard material lit by a low rig glares right
   * across the far half of the board and swallows the pieces standing on it.
   * `specularIntensity` is the only honest way to say "this is matte varnish,
   * not lacquer", and it is what finally let the squares sit below the pieces.
   */
  const topMat = new THREE.MeshPhysicalMaterial({
    map: boardTex, roughness: 0.82, metalness: 0.0, specularIntensity: 0.22,
  });
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.position.y = TOP_Y + 0.002;
  topMesh.receiveShadow = !!opts.shadows;
  boardGroup.add(topMesh);

  const slabGeo = new THREE.BoxGeometry(EXT * 2, BOARD_THICK, EXT * 2);
  const slabMat = new THREE.MeshStandardMaterial({
    roughness: 0.66, metalness: 0.0,
  });
  const slabMesh = new THREE.Mesh(slabGeo, slabMat);
  slabMesh.position.y = TOP_Y - BOARD_THICK / 2;
  boardGroup.add(slabMesh);

  /* ---------- shared piece resources ---------- */

  // Built once for the whole module, not once per board. The app mounts and
  // unmounts a board per puzzle, so this used to be the single largest cost in
  // createBoard(): six lathes, six merges and six inverted hulls, rebuilt every
  // time. The data is deterministic and immutable, so it is shared and never
  // disposed -- a couple of megabytes retained against ~150ms per mount.
  const { pieceGeo, outlineGeo } = getSharedPieceGeometry();

  /**
   * Measured off the geometry that actually gets drawn, not off the design
   * table, so anything that reports these numbers is reporting the truth.
   * Computed on demand: it walks every triangle thirteen times per piece, which
   * has no business happening while a board is trying to appear on screen.
   */
  const pieceMetrics = () => getSharedPieceMetrics();

  const matWhite = new THREE.MeshStandardMaterial({
    roughness: 0.30, metalness: 0.0,
  });
  /**
   * Ebonised boxwood under a lacquer coat, which is what a tournament "black"
   * set actually is -- not a black plastic ball. The clearcoat matters far more
   * here than on the white pieces: it is a second specular lobe that does NOT
   * scale with albedo, so on a dark body it carries almost all of the visible
   * modelling. The diffuse base underneath stays fairly matte, like wood.
   */
  const matBlack = new THREE.MeshPhysicalMaterial({
    roughness: 0.30, metalness: 0.0,
    clearcoat: 0.55, clearcoatRoughness: 0.20,
  });
  const outWhite = new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false });
  const outBlack = new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false });

  /* ---------- contact shadow (ambient occlusion at the base) ---------- */

  /**
   * A cast shadow tells you where the light is; it does not tell you that a
   * piece is touching the board, because it lands off to one side. The dark
   * ring right at the foot is what does that, and it is honest ambient
   * occlusion -- the board simply cannot see much of the sky from under a
   * piece. It also creates hard local contrast exactly where a white piece
   * meets a light square, which is the worst-case pairing in the whole set.
   */
  const contactTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0.00, 'rgba(0,0,0,1)');
    rg.addColorStop(0.30, 'rgba(0,0,0,0.95)');
    rg.addColorStop(0.46, 'rgba(0,0,0,0.55)');
    rg.addColorStop(0.66, 'rgba(0,0,0,0.20)');
    rg.addColorStop(0.85, 'rgba(0,0,0,0.05)');
    rg.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  })();
  const contactGeo = (() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTex, color: 0x000000, transparent: true, opacity: CONTACT_STRENGTH,
    depthWrite: false, toneMapped: false,
  });
  const CONTACT_Y = 0.022;   // above the highlight tiles: a piece occludes those too

  /* ---------- highlight resources ---------- */

  const hlGeo = {
    fill: flatPlane(0.94, 0.014),
    frame: frameGeom(0.94, 0.075, 0.018),
    cross: crossGeom(0.94, 0.085, 0.018),
    ring: ringGeom(0.29, 0.375, 0.018),
    brackets: bracketsGeom(0.94, 0.075, 0.018),
  };
  /** @type {Record<string, THREE.Material[]>} */
  const hlMats = {};
  /** @type {Record<string, THREE.Group>} */
  const hlTemplate = {};

  const highlightGroup = new THREE.Group();
  scene.add(highlightGroup);

  const arrowGroup = new THREE.Group();
  scene.add(arrowGroup);
  const ARROW_BASE_OPACITY = 0.95;
  const arrowMat = new THREE.MeshStandardMaterial({
    roughness: 0.45, metalness: 0.0, transparent: true, opacity: ARROW_BASE_OPACITY,
  });
  arrowMat.userData.forceDepthWrite = true;

  /* ---------- state ---------- */

  let orientation = opts.orientation === 'black' ? 'black' : 'white';
  /** @type {Record<string,string>} square -> 'wP' */
  let position = fenToMap(opts.position || START_FEN);
  /** @type {Map<string, THREE.Group>} square -> piece group */
  const pieces = new Map();
  /** @type {Map<string, THREE.Object3D>} `${kind}:${square}` -> tile */
  const highlights = new Map();
  /** @type {THREE.Mesh[]} */
  const arrows = [];

  /** Where the player is sitting. Always behind the side to move. */
  let seat = { ...DEFAULT_SEAT, ...clampSeatInput(options.seat) };

  const spherical = new THREE.Spherical(
    20,
    THREE.MathUtils.degToRad(90 - seat.elevation),
    (orientation === 'white' ? 0 : Math.PI) + THREE.MathUtils.degToRad(seat.yaw),
  );
  const sphDelta = new THREE.Spherical(0, 0, 0);
  // Aim above the surface, roughly where a king's collar sits: that is what a
  // seated player's gaze is actually centred on.
  const target = new THREE.Vector3(0, 0.40, 0);
  let fitDistance = 20;
  let zoomRatio = seat.distance;
  let zoomDelta = 0;

  let camTween = null;
  /** @type {Array<Object>} live piece animations */
  let anims = [];
  /** @type {Array<{resolve:Function, map:Object}>} */
  const pendingResolves = [];

  let rafId = null;
  let dirty = true;
  let pageVisible = document.visibilityState !== 'hidden';
  let inView = true;
  let destroyed = false;

  let selected = null;
  /** Raw square-tap reporter. Never inspects the position. */
  let squareTapHandler = typeof opts.onSquareTap === 'function' ? opts.onSquareTap : null;

  /* ------------------------------------------------------------------ *
   * Colour application
   * ------------------------------------------------------------------ */

  function drawBoardTexture() {
    const ctx = boardCanvas.getContext('2d');
    const S = boardCanvas.width;
    const px = S / (EXT * 2);            // pixels per world unit
    const rimPx = RIM * px;
    const sqPx = SQ * px;

    const light = tokens['--board-light'];
    const dark = tokens['--board-dark'];
    const edge = tokens['--board-edge'];

    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, S, S);

    // If a square colour carries alpha it must show the slab through it, not the
    // rim colour that was just painted underneath, so clear before filling.
    const squaresTranslucent = Math.min(
      parseCssColor(light, TOKEN_FALLBACKS['--board-light']).alpha,
      parseCssColor(dark, TOKEN_FALLBACKS['--board-dark']).alpha,
    ) < 0.999;

    for (let r = 0; r < 8; r += 1) {
      for (let f = 0; f < 8; f += 1) {
        // canvas row 0 == rank 8, so rank index == 7 - r. A square is light when
        // file + rank is odd, which reduces to (f + r) being even here. (a1 dark,
        // h1 light -- get this backwards and every player notices immediately.)
        const isLight = (f + r) % 2 === 0;
        ctx.fillStyle = isLight ? light : dark;
        const x = rimPx + f * sqPx; const y = rimPx + r * sqPx;
        if (squaresTranslucent) ctx.clearRect(x, y, sqPx, sqPx);
        ctx.fillRect(x, y, sqPx + (squaresTranslucent ? 0 : 0.6), sqPx + (squaresTranslucent ? 0 : 0.6));
      }
    }

    // hairline between the playing area and the rim
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = Math.max(2, px * 0.02);
    ctx.strokeRect(rimPx, rimPx, sqPx * 8, sqPx * 8);

    if (opts.coordinates) drawCoordinates(ctx, S, rimPx, sqPx, edge);
    boardTex.needsUpdate = true;
  }

  function drawCoordinates(ctx, S, rimPx, sqPx, edgeCss) {
    // The design system supplies label ink chosen independently of the square
    // palette. The 3D board puts its labels on the RIM rather than on a square,
    // so take whichever of the two inks actually contrasts against the rim --
    // that honours the intent (use the chosen ink, not a derived one) while
    // being correct for where these particular labels sit.
    const edgeCol = toColor(edgeCss, TOKEN_FALLBACKS['--board-edge']);
    const onLight = toColor(tokens['--board-coord-on-light'], TOKEN_FALLBACKS['--board-coord-on-light']);
    const onDark = toColor(tokens['--board-coord-on-dark'], TOKEN_FALLBACKS['--board-coord-on-dark']);
    const ratio = (a, b) => {
      const la = luminance(a); const lb = luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const ink = ratio(onDark, edgeCol) >= ratio(onLight, edgeCol) ? onDark : onLight;
    ctx.fillStyle = `#${ink.getHexString()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(rimPx * 0.56)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;

    const flipped = orientation === 'black';
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    for (let i = 0; i < 8; i += 1) {
      const centre = rimPx + (i + 0.5) * sqPx;   // canvas x for file i, canvas y for rank 8-i

      // File letters: on the rim nearest the viewing player.
      ctx.save();
      const fx = centre;
      const fy = flipped ? rimPx * 0.5 : S - rimPx * 0.5;
      ctx.translate(fx, fy);
      if (flipped) ctx.rotate(Math.PI);
      ctx.fillText(files[i], 0, 0);
      ctx.restore();

      // Rank numbers: on the rim to the viewing player's left.
      ctx.save();
      const rx = flipped ? S - rimPx * 0.5 : rimPx * 0.5;
      const ry = centre;
      ctx.translate(rx, ry);
      if (flipped) ctx.rotate(Math.PI);
      ctx.fillText(String(8 - i), 0, 0);
      ctx.restore();
    }
  }

  const token = (name) => parseCssColor(tokens[name], TOKEN_FALLBACKS[name]);

  function applyTokens() {
    const edge = token('--board-edge');
    applyColorToken(slabMat, edge);

    // The board texture is drawn on a 2D canvas, which composites rgba() itself.
    // The plane only needs to know whether the result has holes in it.
    const boardAlpha = Math.min(
      token('--board-light').alpha, token('--board-dark').alpha, edge.alpha,
    );
    topMat.transparent = boardAlpha < 0.999;

    const w = token('--piece-white');
    const b = token('--piece-black');
    applyColorToken(matWhite, w);
    applyColorToken(matBlack, b);
    // No self-lift by default. Emissive is what flattened the black pieces --
    // it raises the shadow side towards the lit side, which is the opposite of
    // form. Their edges now come from specular and the rim, which is how a real
    // black lacquered piece separates from a dark square. Assist still offers
    // the lift for anyone who wants it early on.
    matWhite.emissive.setScalar(0);
    matBlack.emissive.copy(b.color).multiplyScalar(assistOn ? 0.55 : 0)
      .addScalar(assistOn ? 0.035 : 0);

    // Halo colours, derived from the piece tokens rather than a fixed palette:
    // a dark rim round white pieces, a light rim round black ones. Each halo is
    // invisible against the square colour it matches and rescues the piece
    // against the one it does not -- which is what stops a black knight on a
    // dark square from collapsing into a silhouette.
    applyColorToken(outWhite, { color: w.color.clone().multiplyScalar(0.10), alpha: w.alpha });
    applyColorToken(outBlack, {
      color: b.color.clone().lerp(new THREE.Color(1, 1, 1), 0.70), alpha: b.alpha,
    });

    // Highlight tiles: the token's alpha multiplies the shape's own designed
    // opacity, so a translucent token stays translucent instead of drawing
    // opaque over the piece standing on the square.
    for (const kind of HIGHLIGHT_KINDS) {
      const t = token(`--hl-${kind}`);
      for (const m of hlMats[kind] || []) applyColorToken(m, t, m.userData.baseOpacity);
    }
    applyColorToken(arrowMat, token('--arrow'), ARROW_BASE_OPACITY);

    drawBoardTexture();
  }

  /* ------------------------------------------------------------------ *
   * Highlight templates
   * ------------------------------------------------------------------ */

  function makeHighlightTemplates() {
    // One distinct visual language per kind, readable without colour. The
    // numbers are RELATIVE to the token's own alpha, not absolute: the design
    // system's highlight tokens are translucent on purpose, and multiplying a
    // designed 0.55 by another 0.5 here would make the 3D board's highlights
    // half the strength of the 2D board's. Line work sits at 1.0 so it stays
    // as crisp as the token allows; fills sit below it so the two read apart.
    const spec = {
      move: [['fill', 0.92]],
      select: [['fill', 0.62], ['frame', 1.0]],
      error: [['fill', 0.76], ['cross', 1.0]],
      success: [['fill', 0.76], ['ring', 1.0]],
      hint: [['brackets', 1.0]],
    };
    for (const kind of HIGHLIGHT_KINDS) {
      const group = new THREE.Group();
      const mats = [];
      for (const [shape, opacity] of spec[kind]) {
        const mat = new THREE.MeshBasicMaterial({
          transparent: true, opacity, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          side: THREE.DoubleSide,
          // A highlight is UI, not a lit surface: it must come out at the exact
          // token colour, so it stays out of the tone mapping curve.
          toneMapped: false,
        });
        // A highlight tile never writes depth, whatever its opacity works out to
        mat.userData.forceNoDepthWrite = true;
        mat.userData.baseOpacity = opacity;
        mats.push(mat);
        const mesh = new THREE.Mesh(hlGeo[shape], mat);
        mesh.renderOrder = 4;
        group.add(mesh);
      }
      hlMats[kind] = mats;
      hlTemplate[kind] = group;
    }
  }
  makeHighlightTemplates();

  /* ------------------------------------------------------------------ *
   * Geometry <-> board mapping
   * ------------------------------------------------------------------ */

  function squareToWorld(sq, out = new THREE.Vector3()) {
    const p = parseSquare(sq);
    if (!p) return null;
    return out.set((p.file - 3.5) * SQ, TOP_Y, (3.5 - p.rank) * SQ);
  }

  function worldToSquare(x, z) {
    const file = Math.floor(x / SQ + 4);
    const rank = Math.floor(3.5 - z / SQ + 0.5);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return toSquare(file, rank);
  }

  /* ------------------------------------------------------------------ *
   * Pieces
   * ------------------------------------------------------------------ */

  function makePiece(code) {
    const colour = code[0];
    const type = code[1];
    const geo = pieceGeo[type];
    if (!geo) return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo, colour === 'w' ? matWhite : matBlack);
    body.castShadow = !!opts.shadows;
    // Pieces shadow each other and themselves. On a lathed body that
    // self-shadowing under the collar and the crown is a large part of what
    // makes the form read as three-dimensional rather than smooth.
    body.receiveShadow = !!opts.shadows;
    group.add(body);

    const contact = new THREE.Mesh(contactGeo, contactMat);
    const s = (PIECE_BASE_R[type] || 0.3) * 2 * 1.75;
    contact.scale.set(s, 1, s);
    contact.position.y = CONTACT_Y;
    contact.renderOrder = 5;          // over the highlight tiles
    contact.userData.contact = true;
    group.add(contact);
    if (outlineGeo[type]) {
      const halo = new THREE.Mesh(outlineGeo[type], colour === 'w' ? outWhite : outBlack);
      halo.visible = assistOn;
      halo.userData.halo = true;
      group.add(halo);
    }
    // Knights face the opponent, as on a real set. The profile is modelled
    // facing +X; white plays up the board (-Z) and black plays down it (+Z).
    if (type === 'N') group.rotation.y = colour === 'w' ? Math.PI / 2 : -Math.PI / 2;
    group.userData.code = code;
    group.userData.contact = contact;
    return group;
  }

  /**
   * Keep the contact shadow on the board while its piece is in the air. It is
   * a child of the piece so it follows it across the board for free, but a
   * shadow that lifts off with the piece would look pasted on.
   */
  function plantContact(group) {
    const c = group.userData.contact;
    if (!c) return;
    const s = group.scale.y || 1;
    c.position.y = (CONTACT_Y - (group.position.y - TOP_Y)) / s;
  }

  function disposePieceGroup(group) {
    if (!group) return;
    if (group.parent) group.parent.remove(group);
    // geometries and materials are shared; nothing per-instance to dispose
  }

  /** Rebuild the whole board from `map`, instantly. */
  function applyMap(map) {
    for (const [sq, group] of pieces) {
      if (map[sq] !== group.userData.code) {
        disposePieceGroup(group);
        pieces.delete(sq);
      }
    }
    const v = new THREE.Vector3();
    for (const sq of Object.keys(map)) {
      if (pieces.has(sq)) continue;
      const group = makePiece(map[sq]);
      if (!group) continue;
      if (!squareToWorld(sq, v)) { continue; }
      group.position.copy(v);
      group.scale.setScalar(1);
      scene.add(group);
      pieces.set(sq, group);
    }
    // squares that kept the same piece may still need repositioning after a slide
    for (const [sq, group] of pieces) {
      if (squareToWorld(sq, v)) group.position.copy(v);
      group.scale.setScalar(1);
      plantContact(group);
    }
    position = { ...map };
    shadowsDirty();
  }

  function shadowsDirty() {
    if (opts.shadows) renderer.shadowMap.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ *
   * Position diffing / animation
   * ------------------------------------------------------------------ */

  function sqDist(a, b) {
    const pa = parseSquare(a); const pb = parseSquare(b);
    if (!pa || !pb) return Infinity;
    return Math.hypot(pa.file - pb.file, pa.rank - pb.rank);
  }

  /**
   * Work out which pieces slid where, using nothing but the two positions.
   * Same-code nearest match first (covers normal moves and both castling
   * rooks/kings), then a same-colour fallback within a square and a half
   * (covers promotion) -- so the renderer never needs to know the rules.
   */
  function diffPositions(prev, next) {
    const departures = [];
    const arrivals = [];
    for (const sq of Object.keys(prev)) if (next[sq] !== prev[sq]) departures.push({ sq, code: prev[sq] });
    for (const sq of Object.keys(next)) if (prev[sq] !== next[sq]) arrivals.push({ sq, code: next[sq] });

    const moves = [];
    const usedDep = new Set();
    const usedArr = new Set();

    const pass = (sameCode) => {
      for (let i = 0; i < arrivals.length; i += 1) {
        if (usedArr.has(i)) continue;
        const a = arrivals[i];
        let best = -1; let bestD = Infinity;
        for (let j = 0; j < departures.length; j += 1) {
          if (usedDep.has(j)) continue;
          const d = departures[j];
          if (sameCode ? d.code !== a.code : d.code[0] !== a.code[0]) continue;
          const dist = sqDist(d.sq, a.sq);
          if (!sameCode && dist > 1.6) continue;
          if (dist < bestD) { bestD = dist; best = j; }
        }
        if (best >= 0) {
          usedArr.add(i); usedDep.add(best);
          moves.push({ from: departures[best].sq, to: a.sq, code: a.code, promote: !sameCode });
        }
      }
    };
    pass(true);
    pass(false);

    const added = arrivals.filter((_, i) => !usedArr.has(i));
    const removed = departures.filter((_, i) => !usedDep.has(i));
    return { moves, added, removed };
  }

  function animatePieceTo(group, fromV, toV, dur, arc, onDone) {
    anims.push({
      kind: 'slide', group, from: fromV.clone(), to: toV.clone(),
      t0: performance.now(), dur, arc, onDone,
    });
  }

  /**
   * Run a set of slides/removals/additions and resolve when everything settles.
   * `finalMap` is applied verbatim at the end, so the authoritative FEN always
   * wins over whatever the animation guessed.
   */
  /**
   * Land any in-flight animation immediately. Called before starting a new one
   * so overlapping calls can never diff against a half-applied position.
   */
  function settle() {
    if (!anims.length && !pendingResolves.length) return;
    for (const an of anims) if (an.onDone) an.onDone();
    anims = [];
    const list = pendingResolves.splice(0);
    for (const p of list) applyMap(p.map);
    for (const p of list) p.resolve();
  }

  function runTransition(finalMap, baseDur) {
    settle();
    const prev = position;
    const { moves, added, removed } = diffPositions(prev, finalMap);
    if (!moves.length && !added.length && !removed.length) {
      applyMap(finalMap);
      requestRender();
      return Promise.resolve();
    }

    const dur = baseDur || 260;
    const now = performance.now();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    // Claim every source group up front. Doing this inside the loop would let a
    // move whose destination is another move's origin steal the wrong piece.
    const claimed = [];
    for (const m of moves) {
      const group = pieces.get(m.from);
      if (group) { claimed.push({ m, group }); pieces.delete(m.from); }
    }

    // pieces that are leaving: shrink out slightly later so the capture reads
    for (const r of removed) {
      const group = pieces.get(r.sq);
      if (!group) continue;
      pieces.delete(r.sq);
      anims.push({
        kind: 'shrink', group, t0: now + dur * 0.35, dur: dur * 0.5,
        onDone: () => disposePieceGroup(group),
      });
    }

    for (const { m, group } of claimed) {
      if (!squareToWorld(m.from, a) || !squareToWorld(m.to, b)) { disposePieceGroup(group); continue; }
      // Knights hop; everything else glides. Both arc enough to clear a piece.
      const arc = m.code[1] === 'N' ? 0.55 : 0.16;
      const longer = dur * (1 + Math.min(sqDist(m.from, m.to), 7) * 0.045);
      animatePieceTo(group, a, b, longer, arc, m.promote ? () => disposePieceGroup(group) : null);
      // register at the destination so nothing else claims that square
      if (!m.promote) pieces.set(m.to, group);
    }

    const spawn = (sq, code, delay, growDur) => {
      const group = makePiece(code);
      if (!group || !squareToWorld(sq, a)) return;
      group.position.copy(a);
      group.scale.setScalar(0.001);
      scene.add(group);
      pieces.set(sq, group);
      anims.push({ kind: 'grow', group, t0: now + delay, dur: growDur });
    };

    for (const add of added) spawn(add.sq, add.code, dur * 0.55, dur * 0.5);
    // promotions: the new piece appears as its pawn lands
    for (const m of moves) if (m.promote) spawn(m.to, m.code, dur * 0.8, dur * 0.35);

    requestRender();
    return new Promise((resolve) => {
      pendingResolves.push({ resolve, map: finalMap });
    });
  }

  function updateAnimations(now) {
    if (!anims.length) {
      if (pendingResolves.length) {
        const list = pendingResolves.splice(0);
        for (const p of list) { applyMap(p.map); p.resolve(); }
        requestRender();
      }
      return false;
    }
    const keep = [];
    const v = new THREE.Vector3();
    for (const an of anims) {
      const t = (now - an.t0) / an.dur;
      if (t < 0) { keep.push(an); continue; }
      const k = clamp(t, 0, 1);
      if (an.kind === 'slide') {
        const e = easeInOut(k);
        v.lerpVectors(an.from, an.to, e);
        v.y += Math.sin(Math.PI * e) * an.arc;
        an.group.position.copy(v);
        plantContact(an.group);
      } else if (an.kind === 'shrink') {
        an.group.scale.setScalar(Math.max(0.001, 1 - k));
        an.group.position.y = TOP_Y - k * 0.12;
        plantContact(an.group);
      } else if (an.kind === 'grow') {
        const s = 0.001 + easeInOut(k) * 0.999;
        an.group.scale.setScalar(s);
        plantContact(an.group);
      }
      if (k >= 1) { if (an.onDone) an.onDone(); } else keep.push(an);
    }
    anims = keep;
    shadowsDirty();
    if (!anims.length && pendingResolves.length) {
      const list = pendingResolves.splice(0);
      for (const p of list) { applyMap(p.map); p.resolve(); }
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Camera fitting
   * ------------------------------------------------------------------ */

  // The slab's own corners, plus the top of a king standing on a *corner
  // square*. Reserving king height out at the rim instead would push the board
  // down the frame and leave a band of dead space above it.
  const FIT_CORNERS = (() => {
    const pts = [];
    const inner = HALF - SQ / 2;                  // centre of a corner square
    for (const x of [-EXT, EXT]) {
      for (const z of [-EXT, EXT]) pts.push(new THREE.Vector3(x, -BOARD_THICK, z));
    }
    for (const x of [-inner, inner]) {
      for (const z of [-inner, inner]) pts.push(new THREE.Vector3(x, PIECE_HEIGHT.K, z));
    }
    return pts;
  })();

  /**
   * Field of view as a function of elevation. A seated view is a 34-degree
   * perspective; within ~9 degrees of vertical it eases down to 11 degrees, so
   * setView('top') is very nearly orthographic and pieces at the edge of the
   * board barely lean. The framing distance is recomputed every frame from the
   * same fov, so flattening never changes how much board you can see.
   */
  function fovForPolar(phi) {
    const t = clamp((FLAT_PHI - phi) / FLAT_PHI, 0, 1);
    const s = t * t * (3 - 2 * t);
    return BASE_FOV + (TOP_FOV - BASE_FOV) * s;
  }

  /**
   * The camera's up vector for a given view angle. World-up normally, easing
   * towards the board's own "away from the viewer" axis as the camera goes
   * overhead -- where world-up is parallel to the view direction and therefore
   * useless. Both the framing maths and the camera itself must use THIS, not
   * `camera.up`: reading the live vector while it is a frame behind produces a
   * degenerate cross product, a NaN camera position and a black screen.
   */
  function viewUp(phi, theta, out = new THREE.Vector3()) {
    const t = clamp((FLAT_PHI - phi) / FLAT_PHI, 0, 1);
    if (t <= 0) return out.set(0, 1, 0);
    return out.set(-Math.sin(theta) * t, 1 - t, -Math.cos(theta) * t).normalize();
  }

  /** Exact fit: smallest distance along the given view axis that keeps the
   *  board slab (plus a king's worth of height) inside the frustum. */
  function computeFitDistance(polar, azimuth = spherical.theta, fov = camera.fov) {
    const aspect = camera.aspect || 1;
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const tanH = tanV * aspect;

    const dir = new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(1, polar, azimuth),
    ).normalize();                                     // target -> camera
    const forward = dir.clone().negate();              // camera -> target
    const refUp = viewUp(polar, azimuth);
    const right = new THREE.Vector3().crossVectors(forward, refUp);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);   // belt and braces
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    let d = 1;
    const p = new THREE.Vector3();
    for (const corner of FIT_CORNERS) {
      p.copy(corner).sub(target);
      const px = p.dot(right);
      const py = p.dot(up);
      const pz = p.dot(forward);
      d = Math.max(d, Math.abs(px) / tanH - pz, Math.abs(py) / tanV - pz);
    }
    return d * 1.02;
  }

  /**
   * `zoomRatio` is a multiplier on the *exact* fit at the current angle, so the
   * board stays framed however you orbit and 1.0 always means "just fits".
   */
  function updateCamera() {
    spherical.phi = clamp(spherical.phi, MIN_POLAR, MAX_POLAR);
    const fov = fovForPolar(spherical.phi);
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    fitDistance = computeFitDistance(spherical.phi, spherical.theta, fov);
    if (!Number.isFinite(fitDistance) || fitDistance <= 0) fitDistance = 20;
    zoomRatio = clamp(zoomRatio, MIN_ZOOM, MAX_ZOOM);
    spherical.radius = fitDistance * zoomRatio;
    spherical.makeSafe();
    camera.position.setFromSpherical(spherical).add(target);

    // The plan view comes out square-on with the side to move at the bottom of
    // the screen, exactly like a 2D diagram.
    viewUp(spherical.phi, spherical.theta, camera.up);
    camera.lookAt(target);
    // Aimed at the SEAT, not at the live camera, so orbiting does not drag the
    // room's lights around with it.
    updateLights(seatTheta(), clamp((FLAT_PHI - spherical.phi) / FLAT_PHI, 0, 1));
  }

  /**
   * Raking light gives a seated view its depth, but in a plan view it turns
   * every piece into a long streak lying across the squares behind it. So as
   * the camera flattens out, the key swings overhead: contact shadows still say
   * which square a piece stands on, without the streaks.
   */
  const placeLight = (light, az, elev, dist) => {
    light.position.set(Math.sin(az) * dist, Math.tan(elev) * dist, Math.cos(az) * dist);
  };

  /**
   * Aim the whole rig at the seat. `flat` is the plan-view blend: raking light
   * gives a seated view its depth, but from directly overhead it turns every
   * piece into a long streak across the squares behind it, so the key climbs
   * and dims as the camera flattens out.
   *
   * Guarded, because moving a light invalidates the shadow map, and rebuilding
   * that every frame is exactly the cost this renderer works to avoid.
   */
  let lightTheta = null;
  let lightFlat = -1;
  function updateLights(theta, flat) {
    if (lightTheta != null
      && Math.abs(shortAngle(lightTheta, theta)) < 0.02
      && Math.abs(flat - lightFlat) < 0.01) return;
    lightTheta = theta;
    lightFlat = flat;
    placeLight(key, theta + KEY_AZ,
      KEY_ELEV + (KEY_ELEV_TOP - KEY_ELEV) * flat,
      KEY_DIST + (KEY_DIST_TOP - KEY_DIST) * flat);
    // Overhead the board turns to face the key square on, so the same intensity
    // would blow the squares out. Ease it down with the swing.
    key.intensity = KEY_INTENSITY + (KEY_INTENSITY_OVERHEAD - KEY_INTENSITY) * flat;
    placeLight(fill, theta + FILL_AZ, FILL_ELEV, FILL_DIST);
    // ~12 degrees: low enough that the board barely sees it (sin 0.2) while a
    // piece's silhouette catches it almost square on (cos 0.98).
    placeLight(rim, theta + Math.PI, RIM_ELEV, RIM_DIST);
    shadowsDirty();
  }

  function updateControls() {
    let busy = false;
    if (Math.abs(sphDelta.theta) > 1e-5 || Math.abs(sphDelta.phi) > 1e-5) {
      spherical.theta += sphDelta.theta * DAMPING;
      spherical.phi += sphDelta.phi * DAMPING;
      sphDelta.theta *= (1 - DAMPING);
      sphDelta.phi *= (1 - DAMPING);
      busy = true;
    } else { sphDelta.theta = 0; sphDelta.phi = 0; }

    if (Math.abs(zoomDelta) > 1e-5) {
      zoomRatio = clamp(zoomRatio * (1 + zoomDelta * DAMPING), MIN_ZOOM, MAX_ZOOM);
      zoomDelta *= (1 - DAMPING);
      busy = true;
    } else zoomDelta = 0;

    if (camTween) {
      const k = clamp((performance.now() - camTween.t0) / camTween.dur, 0, 1);
      const e = easeInOut(k);
      spherical.theta = camTween.theta0 + camTween.dTheta * e;
      spherical.phi = camTween.phi0 + camTween.dPhi * e;
      zoomRatio = camTween.zoom0 + (camTween.zoom1 - camTween.zoom0) * e;
      if (k >= 1) camTween = null;
      busy = true;
    }

    if (busy) updateCamera();
    return busy;
  }

  function tweenTo(theta, phi, zoom, dur = 480) {
    camTween = {
      t0: performance.now(), dur,
      theta0: spherical.theta, dTheta: shortAngle(spherical.theta, theta),
      phi0: spherical.phi, dPhi: clamp(phi, MIN_POLAR, MAX_POLAR) - spherical.phi,
      zoom0: zoomRatio, zoom1: zoom == null ? zoomRatio : zoom,
    };
    sphDelta.theta = 0; sphDelta.phi = 0; zoomDelta = 0;
    requestRender();
  }

  function defaultTheta(side) { return side === 'black' ? Math.PI : 0; }

  /* ---- the seat ---------------------------------------------------- */

  const seatPhi = (s = seat) => THREE.MathUtils.degToRad(90 - s.elevation);
  /** Always behind the side to move: the home azimuth, nudged by the yaw. */
  const seatTheta = (s = seat) =>
    defaultTheta(orientation) + THREE.MathUtils.degToRad(s.yaw);

  function applySeat(o = {}) {
    const dur = o.animate === false ? 0 : (o.duration == null ? 480 : o.duration);
    if (dur <= 0) {
      camTween = null;
      sphDelta.theta = 0; sphDelta.phi = 0; zoomDelta = 0;
      spherical.theta = seatTheta();
      spherical.phi = seatPhi();
      zoomRatio = seat.distance;
      updateCamera();
      requestRender();
    } else {
      tweenTo(seatTheta(), seatPhi(), seat.distance, dur);
    }
    return { ...seat };
  }

  /**
   * Move the chair. Anything omitted is left alone; anything out of the
   * envelope is clamped rather than rejected, so a caller can safely ask for
   * "very low" and get the lowest reasonable seat.
   */
  function setSeat(partial, o = {}) {
    if (destroyed) return { ...seat };
    seat = { ...seat, ...clampSeatInput(partial) };
    return applySeat(o);
  }

  /** Deterministic seat for a seed, so a given puzzle always reproduces a view. */
  function randomSeat(seed, o = {}) {
    if (destroyed) return { ...seat };
    seat = seatFromSeed(seed);
    return applySeat(o);
  }

  function getSeat() { return { ...seat }; }

  function setView(view) {
    const home = defaultTheta(orientation);
    switch (view) {
      case 'white': tweenTo(0, seatPhi(), seat.distance); break;
      case 'black': tweenTo(Math.PI, seatPhi(), seat.distance); break;
      case 'side': {
        // Leaning right over to look along the ranks -- the OTB equivalent of
        // getting your eye down to table level.
        const t = orientation === 'white' ? Math.PI / 2 : -Math.PI / 2;
        tweenTo(t, THREE.MathUtils.degToRad(90 - 22), seat.distance);
        break;
      }
      // A genuine plan view: square-on, no yaw, near-orthographic, exactly
      // framed. This is the 2D-diagram mode, so it must be pristine.
      case 'top': tweenTo(home, 0, 1); break;
      case 'seat':
      default: applySeat(); break;
    }
  }

  /* ------------------------------------------------------------------ *
   * Render loop
   * ------------------------------------------------------------------ */

  function running() { return !destroyed && pageVisible && inView; }

  function schedule() {
    if (rafId == null && running()) rafId = requestAnimationFrame(tick);
  }

  function requestRender() { dirty = true; schedule(); }

  function tick(now) {
    rafId = null;
    if (destroyed) return;
    let busy = false;
    busy = updateControls() || busy;
    busy = updateAnimations(now) || busy;
    if (dirty || busy) { render(); dirty = false; }
    if (busy) schedule();
  }

  function render() {
    if (destroyed || !renderer) return;
    // The shadow map is only rebuilt when shadowsDirty() says so. Orbiting does
    // not move a directional light's shadow, so re-rendering it every frame was
    // pure cost -- and with a 2048 map that cost is not small.
    camera.layers.set(LAYER_MAIN);
    renderer.autoClear = true;
    renderer.render(scene, camera);

    if (arrows.length) {
      // Second pass with a cleared depth buffer: arrows read as solid 3D objects
      // but are never hidden behind a piece standing in the middle of them.
      renderer.autoClear = false;
      renderer.clearDepth();
      camera.layers.set(LAYER_OVERLAY);
      renderer.render(scene, camera);
      renderer.autoClear = true;
      camera.layers.set(LAYER_MAIN);
    }
  }

  /* ------------------------------------------------------------------ *
   * Sizing
   * ------------------------------------------------------------------ */

  function resize() {
    if (destroyed) return;
    const w = Math.max(1, el.clientWidth || container.clientWidth || 1);
    const h = Math.max(1, el.clientHeight || container.clientHeight || 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateCamera();      // recomputes fitDistance for the new aspect
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * Pointer / gesture handling
   * ------------------------------------------------------------------ */

  const pointers = new Map();
  let pinchStart = 0;
  let dragMoved = 0;
  let downAt = 0;
  let downSquare = null;
  let downPlaneSquare = null;

  function localXY(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /**
   * Which square the pointer is over, judged purely by where the ray meets the
   * playing surface -- pieces are ignored entirely.
   *
   * This is what the raw square-tap reports. It has to be the plane and not the
   * pieces: the camera sits low by design, so a king two ranks nearer the viewer
   * routinely covers the square the user is aiming at, and in the blindfold mode
   * the position on screen is deliberately stale, so "what is standing there"
   * is not a question the renderer is allowed to ask.
   */
  function pickPlaneSquare(ev) {
    const p = localXY(ev);
    ndc.set((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    return worldToSquare(hit.x, hit.z);
  }

  function pickSquare(ev) {
    const p = localXY(ev);
    ndc.set((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.layers.set(LAYER_MAIN);

    // Pieces first: tapping the crown of a king must select the king's square,
    // not the square visually behind it.
    const meshes = [];
    for (const group of pieces.values()) if (group.children[0]) meshes.push(group.children[0]);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const owner = hits[0].object.parent;
      for (const [sq, group] of pieces) if (group === owner) return sq;
    }

    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    return worldToSquare(hit.x, hit.z);
  }

  function onPointerDown(ev) {
    if (destroyed) return;
    // Capture is an optimisation, not a requirement: a synthetic or already
    // released pointer makes this throw, and losing the whole handler would
    // silently kill both orbit and square taps.
    try { renderer.domElement.setPointerCapture?.(ev.pointerId); } catch { /* not capturable */ }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    dragMoved = 0;
    downAt = performance.now();
    if (pointers.size === 1) {
      // Always resolved, whether or not the board is interactive.
      downPlaneSquare = pickPlaneSquare(ev);
      downSquare = opts.interactive ? pickSquare(ev) : null;
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }
    camTween = null;
  }

  function onPointerMove(ev) {
    if (destroyed || !pointers.has(ev.pointerId)) return;
    const prev = pointers.get(ev.pointerId);
    const dx = ev.clientX - prev.x;
    const dy = ev.clientY - prev.y;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    dragMoved += Math.hypot(dx, dy);

    const h = renderer.domElement.clientHeight || 1;

    if (pointers.size === 1) {
      sphDelta.theta -= (2 * Math.PI * dx) / h;
      sphDelta.phi -= (2 * Math.PI * dy) / h;
      requestRender();
      return;
    }
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      if (pinchStart) zoomDelta += (pinchStart / dist) - 1;
      pinchStart = dist;
      // let the two-finger midpoint orbit too, so the gesture never feels dead
      sphDelta.theta -= (Math.PI * dx) / h;
      sphDelta.phi -= (Math.PI * dy) / h;
      requestRender();
    }
  }

  function onPointerUp(ev) {
    // Guard against re-entry: releasePointerCapture below synchronously fires
    // 'lostpointercapture', which lands back here with the same pointer id.
    if (destroyed || !pointers.has(ev.pointerId)) return;
    const wasSingle = pointers.size === 1;
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStart = 0;

    const quick = performance.now() - downAt < 600;
    const tapped = downSquare;
    // Prefer the square under the finger on release; fall back to where the
    // press landed if the release ray missed the board entirely.
    const planeTapped = pickPlaneSquare(ev) || downPlaneSquare;
    downSquare = null;
    downPlaneSquare = null;
    try { renderer.domElement.releasePointerCapture?.(ev.pointerId); } catch { /* not captured */ }

    if (!wasSingle || dragMoved >= 9 || !quick) return;

    // The raw square tap goes out FIRST and unconditionally: no piece-presence
    // test, no legality test, no selection side effects, and no dependence on
    // `interactive`. The blindfold drill taps squares that are empty on screen.
    if (planeTapped && typeof squareTapHandler === 'function') {
      try { squareTapHandler(planeTapped); } catch { /* a caller's error is not ours */ }
    }

    if (opts.interactive) handleTap(tapped);
  }

  function handleTap(sq) {
    if (!sq) { clearSelection(); return; }
    if (selected == null) {
      if (!position[sq]) return;
      selected = sq;
      highlight([sq], 'select');
      return;
    }
    if (selected === sq) { clearSelection(); return; }
    const from = selected;
    clearSelection();
    if (typeof opts.onMove === 'function') {
      Promise.resolve(opts.onMove(from, sq)).catch(() => {});
    }
  }

  function clearSelection() {
    if (selected != null) { clearHighlights('select'); selected = null; }
  }

  function onWheel(ev) {
    if (destroyed) return;
    ev.preventDefault();
    zoomDelta += clamp(ev.deltaY, -120, 120) * 0.006;
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  function setPosition(fen, o = {}) {
    if (destroyed) return Promise.resolve();
    const map = fenToMap(fen);
    clearSelection();
    if (!o.animate) {
      settle();
      applyMap(map);
      requestRender();
      return Promise.resolve();
    }
    return runTransition(map, 280);
  }

  function animateMove(from, to, o = {}) {
    if (destroyed) return Promise.resolve();
    const a = parseSquare(from);
    const b = parseSquare(to);
    if (!a || !b) return Promise.resolve();
    clearSelection();

    settle();
    if (o.fen) {
      // The FEN is authoritative: diff against it so castling rooks, the
      // en-passant victim and promotions all resolve without any rule knowledge.
      return runTransition(fenToMap(o.fen), 280);
    }
    const next = { ...position };
    const code = next[from];
    if (!code) return Promise.resolve();
    delete next[from];
    next[to] = code;
    return runTransition(next, 280);
  }

  /**
   * The camera follows the side to move -- never randomised, because the whole
   * exercise is judging the opponent's reply from your own side of the table.
   * The seat comes with it, so you keep sitting the same way round the board.
   */
  function setOrientation(side) {
    const next = side === 'black' ? 'black' : 'white';
    if (next === orientation) return;
    orientation = next;
    drawBoardTexture();
    applySeat();
    requestRender();
  }

  function getOrientation() { return orientation; }

  /**
   * Install or clear the raw square-tap reporter. Anything that is not a
   * function clears it, so `setSquareTapHandler(null)` and a stray value behave
   * the same way rather than leaving a half-armed handler behind.
   */
  function setSquareTapHandler(fn) {
    squareTapHandler = typeof fn === 'function' ? fn : null;
  }

  /**
   * Legibility aids on/off. Off is the default and the training state; on is
   * for leaning on early. Nothing here changes the geometry or the camera --
   * only how much help you get separating pieces from each other.
   */
  function setAssist(on) {
    if (destroyed) return assistOn;
    const next = !!on;
    if (next === assistOn) return assistOn;
    assistOn = next;
    for (const group of pieces.values()) {
      for (const child of group.children) if (child.userData.halo) child.visible = assistOn;
    }
    applyTokens();
    shadowsDirty();
    requestRender();
    return assistOn;
  }

  function getAssist() { return assistOn; }

  function highlight(squares, kind = 'move') {
    if (destroyed) return;
    const k = HIGHLIGHT_KINDS.includes(kind) ? kind : 'move';
    const list = Array.isArray(squares) ? squares : [squares];
    const v = new THREE.Vector3();
    for (const sq of list) {
      if (!squareToWorld(sq, v)) continue;      // silently ignore bad squares
      const key = `${k}:${sq}`;
      if (highlights.has(key)) continue;
      const tile = hlTemplate[k].clone(true);
      tile.position.copy(v);
      highlightGroup.add(tile);
      highlights.set(key, tile);
    }
    requestRender();
  }

  function clearHighlights(kind) {
    if (destroyed) return;
    for (const [key, tile] of [...highlights]) {
      if (kind && !key.startsWith(`${kind}:`)) continue;
      highlightGroup.remove(tile);
      highlights.delete(key);
    }
    if (!kind) selected = null;
    requestRender();
  }

  function buildArrowGeometry(len) {
    const w = 0.085;
    const hw = 0.20;
    const hl = Math.min(0.32, len * 0.45);
    const s = new THREE.Shape();
    s.moveTo(0, -w);
    s.lineTo(len - hl, -w);
    s.lineTo(len - hl, -hw);
    s.lineTo(len, 0);
    s.lineTo(len - hl, hw);
    s.lineTo(len - hl, w);
    s.lineTo(0, w);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.055, bevelEnabled: true,
      bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2);       // lay it flat: shape z becomes world up
    return g;
  }

  function arrow(from, to, kind) {
    if (destroyed) return;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    if (!squareToWorld(from, a) || !squareToWorld(to, b)) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) return;

    const geo = buildArrowGeometry(len);
    let mat = arrowMat;
    if (kind && HIGHLIGHT_KINDS.includes(kind)) {
      mat = arrowMat.clone();
      mat.userData = { ...arrowMat.userData, perArrow: true };
      applyColorToken(mat, token(`--hl-${kind}`), ARROW_BASE_OPACITY);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(a.x, TOP_Y + 0.06, a.z);
    mesh.rotation.y = Math.atan2(-dz / len, dx / len);
    mesh.layers.set(LAYER_OVERLAY);
    mesh.renderOrder = 20;
    arrowGroup.add(mesh);
    arrows.push(mesh);
    requestRender();
  }

  function clearArrows() {
    if (destroyed) return;
    for (const mesh of arrows) {
      arrowGroup.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material && mesh.material.userData.perArrow) mesh.material.dispose();
    }
    arrows.length = 0;
    requestRender();
  }

  /* flash: a DOM overlay, so rapid calls cost nothing on the GPU */
  let flashAnim = null;
  function flash(kind) {
    if (destroyed) return;
    const token = kind === 'error' ? '--hl-error' : '--hl-success';
    flashEl.style.background = tokens[token] || TOKEN_FALLBACKS[token];
    if (flashAnim) { try { flashAnim.cancel(); } catch { /* ignore */ } }
    if (typeof flashEl.animate === 'function') {
      flashAnim = flashEl.animate(
        [{ opacity: 0 }, { opacity: 0.5, offset: 0.25 }, { opacity: 0 }],
        { duration: 420, easing: 'ease-out' },
      );
      flashAnim.onfinish = () => { flashEl.style.opacity = '0'; };
    } else {
      flashEl.style.opacity = '0.5';
      setTimeout(() => { flashEl.style.opacity = '0'; }, 260);
    }
  }

  function refreshTheme() {
    tokens = readTokens(el);
    applyTokens();
    requestRender();
  }

  /* ------------------------------------------------------------------ *
   * Lifecycle wiring
   * ------------------------------------------------------------------ */

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  // Safety net rather than 'pointerleave': with pointer capture active, leave
  // fires spuriously and would abort a legitimate orbit drag.
  canvas.addEventListener('lostpointercapture', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', preventCtx);
  function preventCtx(e) { e.preventDefault(); }

  function onVisibility() {
    pageVisible = document.visibilityState !== 'hidden';
    if (pageVisible) requestRender();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function onOrientationChange() { setTimeout(resize, 120); }
  window.addEventListener('orientationchange', onOrientationChange);

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize());
    ro.observe(el);
  } else {
    window.addEventListener('resize', resize);
  }

  let io = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      if (inView) requestRender();
    }, { threshold: 0 });
    io.observe(el);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    squareTapHandler = null;
    if (envTimer != null) { clearTimeout(envTimer); envTimer = null; }
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;

    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('lostpointercapture', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', preventCtx);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('orientationchange', onOrientationChange);
    window.removeEventListener('resize', resize);
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    if (flashAnim) { try { flashAnim.cancel(); } catch { /* ignore */ } }

    for (const p of pendingResolves.splice(0)) p.resolve();
    anims = [];

    clearArrows();

    const geos = new Set();
    const mats = new Set();
    const texs = new Set();
    scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => mats.add(x));
    });
    for (const g of Object.values(pieceGeo)) geos.add(g);
    for (const g of Object.values(outlineGeo)) geos.add(g);
    for (const g of Object.values(hlGeo)) geos.add(g);
    mats.add(matWhite); mats.add(matBlack); mats.add(outWhite); mats.add(outBlack);
    mats.add(arrowMat); mats.add(topMat); mats.add(slabMat); mats.add(contactMat);
    geos.add(contactGeo);
    for (const list of Object.values(hlMats)) for (const m of list) mats.add(m);

    // Shared, immutable resources outlive every individual board.
    for (const g of geos) if (!g.userData || !g.userData.shared) g.dispose();
    for (const m of mats) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) {
        if (m[key]) texs.add(m[key]);
      }
      m.dispose();
    }
    texs.add(boardTex);
    texs.add(contactTex);
    for (const t of texs) if (!t.userData || !t.userData.shared) t.dispose();

    // The PMREM render target holds a cubemap; nothing above reaches it.
    scene.environment = null;
    if (envRT) { envRT.dispose(); envRT = null; }

    scene.clear();
    pieces.clear();
    highlights.clear();

    renderer.dispose();
    try { renderer.forceContextLoss(); } catch { /* ignore */ }
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (el.parentNode) el.parentNode.removeChild(el);
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  applyTokens();
  applyMap(position);
  resize();
  requestRender();
  // after first paint, never before it
  envTimer = setTimeout(buildEnvironment, 0);

  return {
    el,
    setPosition,
    animateMove,
    setOrientation,
    getOrientation,
    highlight,
    clearHighlights,
    arrow,
    clearArrows,
    flash,
    setSquareTapHandler,
    resize,
    destroy,
    // extras beyond the contract
    setView,
    setSeat,
    randomSeat,
    getSeat,
    setAssist,
    getAssist,
    refreshTheme,
    getPosition: () => ({ ...position }),
    getSeatEnvelope: () => ({
      elevation: [...SEAT_ENVELOPE.elevation],
      yaw: [...SEAT_ENVELOPE.yaw],
      distance: [...SEAT_ENVELOPE.distance],
    }),
    /** Measured off the built geometry, in squares. */
    getPieceMetrics: () => JSON.parse(JSON.stringify(pieceMetrics())),
    getPieceHeights: () => {
      const m = pieceMetrics();
      const out = {};
      for (const k of Object.keys(m)) out[k] = m[k].height;
      return out;
    },
    getPieceBaseRadii: () => {
      const m = pieceMetrics();
      const out = {};
      for (const k of Object.keys(m)) out[k] = m[k].baseRadius;
      return out;
    },
    // camera state, for tests and for the harness readout
    getCameraState: () => ({
      elevation: 90 - THREE.MathUtils.radToDeg(spherical.phi),
      yaw: THREE.MathUtils.radToDeg(shortAngle(defaultTheta(orientation), spherical.theta)),
      distance: zoomRatio,
      fov: camera.fov,
      position: camera.position.toArray(),
      up: camera.up.toArray(),
      // true while a snap/seat move is still in flight, or the loop is awake
      tweening: !!camTween,
      running: rafId != null,
    }),
  };
}

export default createBoard;
