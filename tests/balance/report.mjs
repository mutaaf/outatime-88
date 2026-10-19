// Turns balance harness output (tests/balance/out/<label>.*.json) into markdown tables.
//   node tests/balance/report.mjs <label> [<label>...]   → stdout (paste into docs/BALANCE.md)
// With two labels, adds a before → after summary.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LEVEL_MEDALS, medalFor } from '../../src/progress.js';
import { WORLD_LEVELS } from '../../src/data.js';
import { UPGRADE } from '../../src/powerups.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'out');
const SKILLS = ['novice', 'casual', 'good', 'expert'];
const labels = process.argv.slice(2);
if (!labels.length) { console.error('usage: node tests/balance/report.mjs <label>...'); process.exit(1); }

const all = (label) => readdirSync(dir).filter((f) => f.startsWith(`${label}.`)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const load = (label) => all(label).filter((p) => p.runs);
const loadCampaign = (label) => all(label).filter((p) => p.races);
const q = (xs, p) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const mmss = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** What ended a run, in a few words. */
function cause(r) {
  const b = (r.badge || '').toUpperCase();
  if (b === 'CAPPED') return 'still going (cap)';
  if (r.cause && r.cause !== 'WRECK') return r.cause.toLowerCase(); // Endless causes (0186)
  if (b.includes('STORM')) return 'Time Storm';
  if (b.includes('WRECKED')) return `wrecked: ${r.lastDmg || 'other'}`;
  const m = b.replace(/[^A-Z0-9 !'—-]/g, '').trim();
  return m.slice(0, 40).toLowerCase() || 'other';
}

function summarize(players) {
  const out = {};
  for (const skill of SKILLS) {
    const ps = players.filter((p) => p.skill === skill);
    if (!ps.length) continue;
    const runs = ps.flatMap((p) => p.runs);
    const first = ps.map((p) => p.runs[0]).filter(Boolean);
    const secs = runs.map((r) => r.secs);
    const causes = {};
    for (const r of runs) { const c = cause(r); causes[c] = (causes[c] || 0) + 1; }
    const mins = runs.reduce((a, r) => a + r.secs / 60, 0);
    const coins = runs.reduce((a, r) => a + r.coins, 0);
    const pts = runs.reduce((a, r) => a + r.score, 0);
    const pw = { MAGNET: 0, SHIELD: 0, DOUBLER: 0 };
    for (const r of runs) for (const k in pw) pw[k] += (r.power[k] || 0) / runs.length;
    const purchases = ps.reduce((a, p) => a + (p.purchases || []).reduce((b, x) => b + x.length, 0), 0);
    const tiers = runs.map((r) => r.tier || 1);
    out[skill] = {
      runs: runs.length,
      firstMedian: q(first.map((r) => r.secs), 0.5),
      firstP10: q(first.map((r) => r.secs), 0.1),
      p10: q(secs, 0.1), p50: q(secs, 0.5), p90: q(secs, 0.9),
      capped: runs.filter((r) => r.capped).length / runs.length,
      tierMedian: q(tiers, 0.5), tierMax: Math.max(...tiers),
      ptsPerSec: pts / Math.max(1, mins * 60),
      coinsPerMin: coins / Math.max(1e-9, mins),
      coinsPerRun: coins / runs.length,
      continues: runs.reduce((a, r) => a + r.continues, 0) / runs.length,
      // What a run leaves in the wallet after paying for its continue (purchases come after).
      net: q(runs.map((r) => r.wallet - r.coins0), 0.5),
      purchasesPerRun: purchases / runs.length,
      power: pw,
      causes,
      hitsPerMin: runs.reduce((a, r) => a + r.hits.traffic + r.hits.obstacle, 0) / Math.max(1e-9, mins),
      // Share of crashes that came within 2.5 s of the last one (pile-ups, pinballing).
      rehit: runs.reduce((a, r) => a + (r.rehits || 0), 0) / Math.max(1, runs.reduce((a, r) => a + r.hits.traffic + r.hits.obstacle, 0)),
      // Of the runs that reached tier t, the share that ended inside it.
      tierDeaths: (() => {
        const t = {};
        for (const r of runs) {
          if (r.capped) continue;
          t[r.tier] = (t[r.tier] || 0) + 1;
        }
        return t;
      })(),
    };
  }
  return out;
}

function table(label, s) {
  const lines = [];
  lines.push(`#### ${label}`, '');
  lines.push('| bot | runs | 1st run p10 / median | survival p10 / p50 / p90 | still going at cap | tier median (max) | pts/s | coins/min | coins/run | continues/run | purchases/run | hits/min | repeat hits |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of SKILLS) {
    const v = s[k];
    if (!v) continue;
    lines.push(`| ${k} | ${v.runs} | ${mmss(v.firstP10)} / ${mmss(v.firstMedian)} | ${mmss(v.p10)} / ${mmss(v.p50)} / ${mmss(v.p90)} | ${fmt(v.capped * 100)}% | ${v.tierMedian} (${v.tierMax}) | ${fmt(v.ptsPerSec)} | ${fmt(v.coinsPerMin)} | ${fmt(v.coinsPerRun)} | ${fmt(v.continues, 2)} | ${fmt(v.purchasesPerRun, 2)} | ${fmt(v.hitsPerMin, 1)} | ${fmt(v.rehit * 100)}% |`);
  }
  lines.push('', '| bot | how runs ended | power-up uptime (magnet / shield / 2×) |', '|---|---|---|');
  for (const k of SKILLS) {
    const v = s[k];
    if (!v) continue;
    const c = Object.entries(v.causes).sort((a, b) => b[1] - a[1]).map(([n, x]) => `${n} ${fmt((x / v.runs) * 100)}%`).join(' · ');
    lines.push(`| ${k} | ${c} | ${fmt(v.power.MAGNET * 100)}% / ${fmt(v.power.SHIELD * 100)}% / ${fmt(v.power.DOUBLER * 100)}% |`);
  }
  const ladder = UPGRADE.cost.reduce((a, c) => a + c, 0) * 3;
  lines.push('', '| bot | net coins/run (median, after continues) | runs to buy every power-up level (⚡ ' + fmt(ladder) + ') | runs per purchase over that ladder |', '|---|---|---|---|');
  for (const k of SKILLS) {
    const v = s[k];
    if (!v || !v.net) continue;
    lines.push(`| ${k} | ${fmt(v.net)} | ${fmt(ladder / v.net, 1)} | ${fmt(ladder / v.net / (UPGRADE.cost.length * 3), 1)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function campaignTable(label) {
  const ps = loadCampaign(label);
  if (!ps.length) return '';
  const lines = [`#### ${label}: campaign races (${ps[0].races.length} per bot per level)`, '', '| level | median score | best | ' + SKILLS.join(' / ') + ' (median) | medals (bronze/silver/gold/none, current targets) |', '|---|---|---|---|---|'];
  for (let lv = 0; lv < WORLD_LEVELS.length; lv++) {
    const here = ps.filter((p) => p.level === lv);
    if (!here.length) continue;
    const rs = here.flatMap((p) => p.races);
    const id = WORLD_LEVELS[lv].id;
    const m = { bronze: 0, silver: 0, gold: 0, none: 0 };
    for (const r of rs) m[medalFor(id, r.score) || 'none']++;
    const per = SKILLS.map((k) => { const p = here.find((x) => x.skill === k); return p ? fmt(q(p.races.map((r) => r.score), 0.5) / 1e6, 2) + 'M' : '–'; }).join(' / ');
    lines.push(`| ${lv + 1} ${id} | ${fmt(q(rs.map((r) => r.score), 0.5) / 1e6, 2)}M | ${fmt(Math.max(...rs.map((r) => r.score)) / 1e6, 2)}M | ${per} | ${m.bronze}/${m.silver}/${m.gold}/${m.none} (targets ${fmt(LEVEL_MEDALS[id].bronze / 1e6, 2)}/${fmt(LEVEL_MEDALS[id].silver / 1e6, 2)}/${fmt(LEVEL_MEDALS[id].gold / 1e6, 2)}M) |`);
  }
  return lines.join('\n') + '\n';
}

const sums = labels.map((l) => [l, summarize(load(l))]);
for (const [l, s] of sums) console.log(table(l, s));
for (const l of labels) console.log(campaignTable(l));
if (sums.length === 2) {
  const [[la, a], [lb, b]] = sums;
  console.log([`#### ${la} → ${lb}`, '', '| bot | median survival | 1st run median | tier median | pts/s | coins/min | net coins/run |', '|---|---|---|---|---|---|---|'].join('\n'));
  for (const k of SKILLS) {
    if (!a[k] || !b[k]) continue;
    console.log(`| ${k} | ${mmss(a[k].p50)} → ${mmss(b[k].p50)} | ${mmss(a[k].firstMedian)} → ${mmss(b[k].firstMedian)} | ${a[k].tierMedian} → ${b[k].tierMedian} | ${fmt(a[k].ptsPerSec)} → ${fmt(b[k].ptsPerSec)} | ${fmt(a[k].coinsPerMin)} → ${fmt(b[k].coinsPerMin)} | ${fmt(a[k].net)} → ${fmt(b[k].net)} |`);
  }
  console.log('');
}
