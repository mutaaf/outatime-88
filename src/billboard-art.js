// Billboard art, creative rotation and viewability (docs/ADS.md). Lazy chunk: the 2D road
// reaches it through src/billboards.js, the 3D view imports it directly.
//
// Kid-safe by construction: every creative is either a house design painted here or an image
// bundled under the game's own /outatime/ads/ (no third-party host, no ad network, no
// tracking). Rotation is contextual only: (track seed, level, slot, era), so everyone on the
// same road sees the same boards. The only thing ever reported is an aggregate count per
// campaign per day, and only when the manifest turns reporting on.
//
// Crisp: a creative is painted once per size bucket (64…1024 px wide) as vector art, never
// stretched from one bitmap, and drawn from the bucket that covers its size in device pixels
// (projected width × GameState.pixelScale). Items keep a memo of their face so a steady frame
// allocates nothing.
import { GameState } from './state.js';
import { track } from './track.js';
import { drawRoadsideAd } from './backdrop.js';

const BASE = import.meta.env.BASE_URL;

/**
 * Board kinds: aspect, width in road half-widths, height of the board's bottom edge above the
 * road (half-widths) and whether it spans the road. `key` is the aspect a sponsor image must
 * supply for it. ERA is the clock tower's board: the era's own nod, never sold.
 */
export const SPEC = {
  ROADSIDE: { aspect: 16 / 9, key: '16:9', w: 0.8, lift: 0.3 },
  GATE_SIGN: { aspect: 1, key: '1:1', w: 0.42, lift: 0.22 },
  LOOP_BANNER: { aspect: 4, key: '4:1', w: 1, lift: 0.1 },
  GANTRY: { aspect: 4, key: '4:1', w: 1.7, lift: 0.8, overhead: true },
  START_ARCH: { aspect: 4, key: '4:1', w: 1.9, lift: 0.86, overhead: true },
  ERA: { aspect: 2.6, key: '', w: 0.46, lift: 0.42 },
};
export const BUCKETS = [64, 128, 256, 512, 1024];
const MAX_FACES = 96;

/** The bucket width to paint for a face `px` wide on screen. */
export function bucketFor(px) {
  for (let i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= px) return BUCKETS[i];
  return BUCKETS[BUCKETS.length - 1];
}

// ── Campaigns ───────────────────────────────────────────────────────────────────────────
// House campaigns run whenever nothing else is booked (and fill every slot offline).
export const HOUSE = [
  { id: 'house-friends', creative: { house: 'friends' }, weight: 3, kidSafe: true },
  { id: 'house-daily', creative: { house: 'daily' }, weight: 3, kidSafe: true },
  { id: 'house-board', creative: { house: 'board' }, weight: 2, kidSafe: true },
  { id: 'house-openaero', creative: { house: 'openaero' }, weight: 2, kidSafe: true },
  { id: 'house-88', creative: { house: 'sign88' }, weight: 2, kidSafe: true },
  { id: 'house-site', creative: { house: 'site' }, weight: 1, kidSafe: true },
  { id: 'house-advertise', creative: { house: 'advertise' }, weight: 1, kidSafe: true },
];

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Sponsor images: bundled under /outatime/ads/ only. No scheme, no host, no "..".
const SAFE_SRC = /^ads\/[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.(png|webp|jpe?g)$/i;
const ASPECTS = ['16:9', '4:1', '1:1'];

export const todayUTC = (d = new Date()) => d.toISOString().slice(0, 10);
// The day, refreshed at most once a minute (no Date or string per board per frame).
let dayStr = '', dayAt = -Infinity;
function today() {
  const t = Date.now();
  if (t - dayAt > 60e3) { dayStr = todayUTC(); dayAt = t; }
  return dayStr;
}

/** A campaign the game may show, or null. Anything not explicitly kid-safe is dropped. */
export function validCampaign(c) {
  if (!c || typeof c !== 'object' || c.kidSafe !== true || !ID.test(String(c.id || ''))) return null;
  const weight = Number(c.weight == null ? 1 : c.weight);
  if (!(weight > 0 && weight <= 100)) return null;
  if ((c.start != null && !DAY.test(c.start)) || (c.end != null && !DAY.test(c.end))) return null;
  const cr = c.creative || {};
  let creative = null;
  if (typeof cr.house === 'string' && PAINTERS[cr.house]) creative = { house: cr.house };
  else if (cr.image && typeof cr.image === 'object') {
    const image = {};
    let any = false;
    for (const k of ASPECTS) if (typeof cr.image[k] === 'string' && SAFE_SRC.test(cr.image[k]) && !cr.image[k].includes('..')) { image[k] = cr.image[k]; any = true; }
    if (any) creative = { image };
  }
  if (!creative) return null;
  const list = (v, ok) => (Array.isArray(v) ? v.filter(ok) : null);
  return {
    id: c.id, creative, weight,
    start: c.start || null, end: c.end || null,
    kinds: list(c.kinds, (k) => Object.prototype.hasOwnProperty.call(SPEC, k) && k !== 'ERA'),
    eras: list(c.eras, (e) => typeof e === 'string'),
    levels: list(c.levels, (n) => Number.isInteger(n)),
    name: typeof c.name === 'string' ? c.name.slice(0, 60) : c.id,
  };
}

// Filled with the house pool once the painters below exist; the manifest may replace it.
const store = { mv: 0, report: false, campaigns: [], byId: new Map() };

/** Replace the campaign list from a manifest object (public/ads/manifest.json). */
export function applyManifest(m) {
  if (!m || m.v !== 1 || !Array.isArray(m.campaigns)) return false;
  const list = m.campaigns.map(validCampaign).filter(Boolean);
  // House campaigns always stay in the pool, so a slot is never empty.
  for (const h of HOUSE) if (!list.some((c) => c.id === h.id)) list.push(validCampaign(h));
  store.campaigns = list;
  store.byId = new Map(list.map((c) => [c.id, c]));
  store.report = m.report === true;
  store.mv++;
  clearFaces();
  return true;
}

function eligible(c, kind, eraId, level, today) {
  if (c.start && today < c.start) return false;
  if (c.end && today > c.end) return false;
  if (c.kinds && c.kinds.indexOf(kind) < 0) return false;
  if (c.eras && c.eras.indexOf(String(eraId)) < 0) return false;
  if (c.levels && c.levels.indexOf(level) < 0) return false;
  if (c.creative.image && !c.creative.image[SPEC[kind].key]) return false;
  return true;
}

function unit(a, b, c) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ Math.imul(b + 1, 0x27d4eb2d), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ Math.imul(c + 1, 0x165667b1), 0x85ebca6b);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The campaign id on board `item` (memoized on the item until the manifest, era or day
 * changes). Weighted and contextual only: same seed, level, slot and era → same campaign.
 */
export function creativeFor(item, eraId, day = today(), seed = track.seed, level = GameState.levelIndex | 0) {
  const era = String(eraId || '');
  if (item.mv === store.mv && item.cid && item.me === era && item.md === day) return item.cid;
  const kind = SPEC[item.kind] ? item.kind : 'ROADSIDE';
  let total = 0;
  for (const c of store.campaigns) if (eligible(c, kind, era, level, day)) total += c.weight;
  let r = unit(seed, level, item.slot | 0) * total;
  let cid = 'house-site';
  for (const c of store.campaigns) {
    if (!eligible(c, kind, era, level, day)) continue;
    cid = c.id;
    r -= c.weight;
    if (r < 0) break;
  }
  item.cid = cid; item.mv = store.mv; item.me = era; item.md = day;
  return cid;
}

// ── Faces: one canvas per (campaign, aspect, bucket), LRU-capped ─────────────────────────
const faces = new Map();
let faceGen = 0;
const stats = { impressions: 0, posted: 0, painted: 0, boards: 0 };
let lastBucket = 0, lastPx = 0;

function clearFaces() { faces.clear(); faceGen++; }
if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
  // Faces painted before the bundled fonts finished loading are repainted once they have.
  document.fonts.ready.then(clearFaces).catch(() => {});
}

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const images = new Map();
function image(src) {
  let e = images.get(src);
  if (!e) {
    e = { img: new Image(), ok: false };
    e.img.onload = () => { e.ok = true; clearFaces(); };
    e.img.src = BASE + src;
    images.set(src, e);
  }
  return e.ok ? e.img : null;
}

/** The face canvas for campaign `cid` on a board of `kind`, painted at `bucket` px wide. */
export function faceCanvas(cid, kind, bucket) {
  const spec = SPEC[kind] || SPEC.ROADSIDE;
  const key = `${cid}|${spec.key}|${bucket}`;
  let c = faces.get(key);
  if (c) { faces.delete(key); faces.set(key, c); return c; }
  c = canvas(bucket, Math.max(1, Math.round(bucket / spec.aspect)));
  paintCampaign(c, store.byId.get(cid), spec);
  stats.painted++;
  faces.set(key, c);
  if (faces.size > MAX_FACES) faces.delete(faces.keys().next().value); // holders keep their own ref
  return c;
}
export const faceGeneration = () => faceGen;

function paintCampaign(c, camp, spec) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const img = camp && camp.creative.image ? image(camp.creative.image[spec.key]) : null;
  if (img) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    return;
  }
  const house = camp && camp.creative.house ? camp.creative.house : 'site';
  PAINTERS[house](g, W, H);
}

// ── House designs (vector, painted per bucket, safe area = 6% inset) ──────────────────────
function fit(g, text, weight, family, maxW, maxH) {
  let size = Math.max(4, Math.floor(maxH));
  g.font = `${weight} ${size}px ${family}`;
  const w = g.measureText(text).width;
  if (w > maxW) { size = Math.max(4, Math.floor(size * maxW / w)); g.font = `${weight} ${size}px ${family}`; }
  return size;
}

function bg(g, W, H, top, bottom) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}

/** Icon box and text box for an aspect: icon left on wide boards, on top otherwise. */
function layout(W, H) {
  const m = Math.round(Math.min(W, H) * 0.06) + 1;
  if (W / H >= 2.5) {
    const s = H - m * 2;
    return { ix: m + s / 2, iy: H / 2, ir: s * 0.42, tx: m * 2 + s, ty: m, tw: W - s - m * 3, th: H - m * 2, align: 'left' };
  }
  const ih = (H - m * 2) * (W / H > 1.2 ? 0.46 : 0.5);
  return { ix: W / 2, iy: m + ih / 2, ir: ih * 0.45, tx: m, ty: m + ih, tw: W - m * 2, th: H - ih - m * 2, align: 'center' };
}

function words(g, L, title, sub, color, subColor) {
  g.textBaseline = 'middle';
  g.textAlign = L.align;
  const x = L.align === 'left' ? L.tx : L.tx + L.tw / 2;
  g.fillStyle = color;
  fit(g, title, 900, 'Orbitron, "Arial Black", sans-serif', L.tw, L.th * 0.46);
  g.fillText(title, x, L.ty + L.th * 0.32);
  g.fillStyle = subColor;
  fit(g, sub, 700, 'Inter, Arial, sans-serif', L.tw, L.th * 0.24);
  g.fillText(sub, x, L.ty + L.th * 0.76);
}

function disc(g, x, y, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

const PAINTERS = {
  friends(g, W, H) {
    bg(g, W, H, '#062a4a', '#0a63b8');
    const L = layout(W, H);
    // Two little cars nose to nose.
    for (const s of [-1, 1]) {
      const x = L.ix + s * L.ir * 0.5, y = L.iy + L.ir * 0.2;
      g.fillStyle = s < 0 ? '#ffd166' : '#ff5d8f';
      g.fillRect(x - L.ir * 0.42, y - L.ir * 0.2, L.ir * 0.84, L.ir * 0.36);
      g.fillRect(x - L.ir * 0.22, y - L.ir * 0.46, L.ir * 0.44, L.ir * 0.3);
      disc(g, x - L.ir * 0.24, y + L.ir * 0.18, L.ir * 0.12, '#0b1020');
      disc(g, x + L.ir * 0.24, y + L.ir * 0.18, L.ir * 0.12, '#0b1020');
    }
    words(g, L, 'RACE YOUR FRIENDS', 'FRIENDS → SHARE A 4-LETTER CODE', '#ffffff', '#ffd166');
  },
  daily(g, W, H) {
    bg(g, W, H, '#3d0a05', '#d1361b');
    const L = layout(W, H);
    disc(g, L.ix, L.iy, L.ir, '#fff3c4');
    g.strokeStyle = '#3b2a12'; g.lineWidth = Math.max(1, L.ir * 0.12); g.lineCap = 'round';
    const hand = (a, len) => { g.beginPath(); g.moveTo(L.ix, L.iy); g.lineTo(L.ix + Math.sin(a) * len, L.iy - Math.cos(a) * len); g.stroke(); };
    hand((10 + 4 / 60) / 12 * Math.PI * 2, L.ir * 0.5); // 10:04
    hand(4 / 60 * Math.PI * 2, L.ir * 0.78);
    words(g, L, 'DAILY CHALLENGE', 'A NEW ROAD EVERY DAY', '#fff3c4', '#ffd7a8');
  },
  board(g, W, H) {
    bg(g, W, H, '#1c1300', '#9a6a00');
    const L = layout(W, H), r = L.ir;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.moveTo(L.ix - r * 0.6, L.iy - r * 0.7); g.lineTo(L.ix + r * 0.6, L.iy - r * 0.7);
    g.quadraticCurveTo(L.ix + r * 0.55, L.iy + r * 0.15, L.ix, L.iy + r * 0.25);
    g.quadraticCurveTo(L.ix - r * 0.55, L.iy + r * 0.15, L.ix - r * 0.6, L.iy - r * 0.7);
    g.fill();
    g.fillRect(L.ix - r * 0.1, L.iy + r * 0.2, r * 0.2, r * 0.35);
    g.fillRect(L.ix - r * 0.42, L.iy + r * 0.55, r * 0.84, r * 0.18);
    words(g, L, 'BEAT THE BOARD', 'NEW SEASON EVERY MONDAY', '#ffffff', '#ffe08a');
  },
  openaero(g, W, H) {
    bg(g, W, H, '#0b4f8a', '#7cc8ff');
    const L = layout(W, H), r = L.ir;
    g.fillStyle = '#ffffff';
    g.save(); g.translate(L.ix, L.iy); g.rotate(-0.35);
    g.fillRect(-r, -r * 0.1, r * 2, r * 0.2);           // fuselage
    g.fillRect(-r * 0.15, -r * 0.75, r * 0.3, r * 1.5); // wings
    g.fillRect(-r * 0.95, -r * 0.35, r * 0.15, r * 0.7); // tail
    g.restore();
    words(g, L, 'OPENAERO DFW', 'FLY THE REAL DALLAS SKY', '#ffffff', '#08243f');
  },
  sign88(g, W, H) {
    g.fillStyle = '#12051f'; g.fillRect(0, 0, W, H);
    const b = Math.max(2, Math.round(Math.min(W, H) * 0.05));
    g.strokeStyle = '#ff2fa8'; g.lineWidth = b; g.strokeRect(b, b, W - b * 2, H - b * 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#38e8ff';
    g.shadowColor = '#38e8ff'; g.shadowBlur = Math.min(W, H) * 0.08;
    fit(g, '88', 900, 'Orbitron, "Arial Black", sans-serif', W * 0.7, H * 0.56);
    g.fillText('88', W / 2, H * 0.44);
    g.shadowBlur = 0;
    g.fillStyle = '#ffd166';
    fit(g, 'MILES PER HOUR', 800, 'Orbitron, Arial, sans-serif', W * 0.8, H * 0.14);
    g.fillText('MILES PER HOUR', W / 2, H * 0.82);
  },
  site(g, W, H) {
    bg(g, W, H, '#0a0a10', '#25233a');
    const L = layout(W, H), r = L.ir;
    g.fillStyle = '#38e8ff';
    g.fillRect(L.ix - r * 0.8, L.iy + r * 0.2, r * 1.6, r * 0.45);       // arcade base
    g.fillRect(L.ix - r * 0.07, L.iy - r * 0.45, r * 0.14, r * 0.7);     // stick
    disc(g, L.ix, L.iy - r * 0.5, r * 0.26, '#ff2fa8');
    words(g, L, 'MUTAAFAZIZ.COM', 'MORE FREE GAMES', '#ffffff', '#38e8ff');
  },
  advertise(g, W, H) {
    bg(g, W, H, '#111114', '#2b2b33');
    const b = Math.max(2, Math.round(Math.min(W, H) * 0.035));
    g.setLineDash([b * 3, b * 2]);
    g.strokeStyle = '#ff6a13'; g.lineWidth = b; g.strokeRect(b * 1.5, b * 1.5, W - b * 3, H - b * 3);
    g.setLineDash([]);
    const L = layout(W, H);
    disc(g, L.ix, L.iy, L.ir, '#ff6a13');
    g.fillStyle = '#111114';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'AD', 900, 'Orbitron, Arial, sans-serif', L.ir * 1.3, L.ir);
    g.fillText('AD', L.ix, L.iy);
    words(g, L, 'YOUR BRAND HERE', 'FAMILY-SAFE SPONSOR BOARDS', '#ffffff', '#ffb15c');
  },
};
export const HOUSE_DESIGNS = Object.keys(PAINTERS);
store.campaigns = HOUSE.map(validCampaign);
for (const c of store.campaigns) store.byId.set(c.id, c);

// ── Viewability: an impression is ≥50% of the board on screen, at a readable size, for one
// continuous second, counted once per board per race (only while racing). ─────────────────
export const VIEW = { minOnScreen: 0.5, minArea: 0.0025, ms: 1000, gapMs: 250, batch: 40 };
const seen = new Map();
let seenRun = null;
let counts = Object.create(null);
let pending = 0;

/** Note that board `item` showing campaign `cid` covers screen rect (x, y, w, h) of vw×vh. */
export function noteView(item, cid, x, y, w, h, vw, vh, now = performance.now()) {
  if (seenRun !== track.run) { flush(false); seen.clear(); seenRun = track.run; }
  if (GameState.status !== 'PLAYING' || !cid || w <= 0 || h <= 0) return false;
  const ix = Math.min(x + w, vw) - Math.max(x, 0), iy = Math.min(y + h, vh) - Math.max(y, 0);
  if (ix <= 0 || iy <= 0 || (ix * iy) / (w * h) < VIEW.minOnScreen || (w * h) / (vw * vh) < VIEW.minArea) return false;
  let v = seen.get(item.slot);
  if (!v) { v = { t0: now, last: now, done: false }; seen.set(item.slot, v); }
  if (now - v.last > VIEW.gapMs) v.t0 = now;
  v.last = now;
  if (v.done || now - v.t0 < VIEW.ms) return false;
  v.done = true;
  counts[cid] = (counts[cid] || 0) + 1;
  pending++;
  stats.impressions++;
  if (pending >= VIEW.batch) flush(false);
  return true;
}

const privacyOff = () => typeof navigator !== 'undefined' && (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1');

/**
 * Hand over the aggregate counts (no ids, no device, nothing personal): posted if the manifest
 * turns reporting on and the browser doesn't ask not to be tracked. Returns the batch.
 */
export function flush(beacon) {
  if (!pending) return null;
  const day = today();
  const snap = counts;
  const body = JSON.stringify({ v: 1, day, counts: snap });
  counts = Object.create(null);
  pending = 0;
  if (!store.report || privacyOff()) return body;
  // Offline (ticket 0158): keep the totals and send them when the connection is back.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { stash(day, snap); return body; }
  send(body, beacon, () => stash(day, snap));
  return body;
}

const url = () => `${BASE}api/ads/impressions`;
function send(body, beacon, onFail) {
  try {
    if (beacon && navigator.sendBeacon) {
      if (navigator.sendBeacon(url(), new Blob([body], { type: 'application/json' }))) stats.posted++;
      else onFail();
    } else {
      fetch(url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
        .then((r) => { if (r.ok) stats.posted++; else if (r.status >= 500) onFail(); }).catch(onFail);
    }
  } catch { /* never let reporting break a race */ }
}

// Unsent totals per day (the server takes today and yesterday only; older ones are dropped).
const OUTBOX = 'outatime88_ads_outbox_v1';
function readStash() { try { return JSON.parse(localStorage.getItem(OUTBOX) || '{}') || {}; } catch { return {}; } }
export function stash(day, c) {
  const all = readStash();
  const into = all[day] || {};
  for (const k of Object.keys(c)) into[k] = Math.min(200, (into[k] || 0) + c[k]);
  all[day] = into;
  for (const d of Object.keys(all).sort().slice(0, -2)) delete all[d];
  try { localStorage.setItem(OUTBOX, JSON.stringify(all)); } catch { /* blocked */ }
}
export function flushStash() {
  if (!store.report || privacyOff() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  const all = readStash();
  try { localStorage.removeItem(OUTBOX); } catch { /* blocked */ }
  let n = 0;
  for (const day of Object.keys(all)) {
    if (!Object.keys(all[day]).length) continue;
    send(JSON.stringify({ v: 1, day, counts: all[day] }), false, () => stash(day, all[day]));
    n++;
  }
  return n;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('online', () => flushStash());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  fetch(`${BASE}ads/manifest.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null)).then((m) => { applyManifest(m); flushStash(); }).catch(() => {});
}

export function debug() {
  return { ...stats, lastBucket, lastPx, faces: faces.size, campaigns: store.campaigns.length, report: store.report, mv: store.mv, pending };
}

// ── 2D ─────────────────────────────────────────────────────────────────────────────────
/**
 * Draw board `item` (a BILLBOARD, or the clock tower's ERA board) standing on the road row
 * `roadY`, centred at screen x, for a road `roadW` px half-wide. `n` picks the era's ad.
 */
export function draw2D(ctx, item, n, x, roadY, roadW, rw, rh, eraId) {
  const kind = item.type === 'CLOCK_TOWER_BILLBOARD' ? 'ERA' : (SPEC[item.kind] ? item.kind : 'ROADSIDE');
  const s = SPEC[kind];
  const w = s.w * roadW;
  if (w < 3) return;
  const h = w / s.aspect;
  const bottom = roadY - s.lift * roadW;
  const top = bottom - h;
  const left = x - w / 2;
  if (top > rh || roadY < 0 || left > rw || left + w < 0) return;
  stats.boards++;
  const night = String(eraId) !== '1955';
  // Legs: two posts under a roadside board, two pylons outside the road for an overhead one.
  ctx.fillStyle = '#1b1f29';
  const legW = Math.max(1, w * (s.overhead ? 0.02 : 0.03));
  if (s.overhead) {
    ctx.fillRect(left - legW, top, legW * 1.6, roadY - top);
    ctx.fillRect(left + w - legW * 0.6, top, legW * 1.6, roadY - top);
  } else {
    ctx.fillRect(x - w * 0.3 - legW / 2, bottom, legW, roadY - bottom);
    ctx.fillRect(x + w * 0.3 - legW / 2, bottom, legW, roadY - bottom);
  }
  // Bezel, then the face.
  const b = Math.max(1, w * 0.022);
  ctx.fillStyle = '#0c0e13';
  ctx.fillRect(left - b, top - b, w + b * 2, h + b * 2);
  if (kind === 'ERA') {
    if (!drawRoadsideAd(ctx, left, top, w, h, n)) { ctx.fillStyle = '#1e1b4b'; ctx.fillRect(left, top, w, h); }
  } else {
    const cid = creativeFor(item, eraId);
    // The road canvas is backed at GameState.pixelScale device pixels per drawn px (the gfx
    // tier's DPR × the governor's resolution), so paint the face for its real pixel width.
    const bucket = bucketFor(w * (GameState.pixelScale || 1));
    lastBucket = bucket; lastPx = w * (GameState.pixelScale || 1);
    if (item.fc && item.fcid === cid && item.fb === bucket && item.fg === faceGen) {
      // memo hit: no lookups, no allocation
    } else {
      item.fc = faceCanvas(cid, kind, bucket); item.fcid = cid; item.fb = bucket; item.fg = faceGen;
    }
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(item.fc, left, top, w, h);
    ctx.imageSmoothingEnabled = smooth;
    noteView(item, cid, left, top, w, h, rw, rh);
  }
  if (night && w > 20) {
    // Two lamp heads on the top bezel washing the face with warm light.
    ctx.fillStyle = 'rgba(255, 236, 190, 0.1)';
    ctx.fillRect(left, top, w, h * 0.22);
    ctx.fillRect(left, top, w, h * 0.5);
    ctx.fillStyle = '#ffe9b0';
    const lw = Math.max(1, w * 0.06), lh = Math.max(1, b * 0.9);
    ctx.fillRect(x - w * 0.28 - lw / 2, top - b - lh, lw, lh);
    ctx.fillRect(x + w * 0.28 - lw / 2, top - b - lh, lw, lh);
  }
}
