// Results screen and leaderboard UI (ticket 0115): its own chunk, so the race boots without
// it. main.js keeps the run rules (score sheet, saves, unlocks) and hands this module what to
// show; it is preloaded after boot, so the results and the board still open on the same frame.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { WORLD_LEVELS } from './data.js';
import { MEDAL_ICON, nextTarget, medalFor } from './progress.js';
import { dailySpec, utcDay } from './daily.js';
import { normalizeInitials, rankLine } from './leaderboard.js';
import { submitRunQueued as submitRun, fetchBoardCached as fetchBoard, fetchStandingCached as fetchStanding, fetchHallCached as fetchHall } from './board-offline.js';
import { renderRankCard, renderBoardRows, rivalLine, timeLeft } from './compete-ui.js';
import { ordinal, plural } from './raceflow.js';
import { missionLine } from './missions.js';
import { resultSummary } from './results-summary.js';

/**
 * deps: run (get/set the current leaderboard run, owned by main.js), raceGhostOf(initials, level),
 * coarsePointer (no auto-focus on touch keyboards).
 */
export function createResultsUI({ run, raceGhostOf, coarsePointer }) {
  let boardView = { board: 'week', mode: 'ARCADE' }; // the weekly season leads (ticket 0091)
  // Boards (ticket 0091): podium, medals on the track board, last week's champion crowned,
  // your row always shown and scrolled into view, and the season clock.
  let hallCache = null;
  const $ = (id) => document.getElementById(id);

  /** Results-screen medal line: what you earned, your best, and the next target. */
  function renderRunMedal(lvl, result) {
    const el = $('endMedalText');
    if (!el) return;
    const prog = SaveStore.data.progress[lvl.id] || { best: 0, medal: null };
    const earned = result.medal ? `${MEDAL_ICON[result.medal]} ${result.medal.toUpperCase()}` : 'NO MEDAL';
    const next = nextTarget(lvl.id, GameState.score);
    const nextTxt = next ? ` • NEXT ${MEDAL_ICON[next.medal]} ${next.score.toLocaleString()}` : ' • TOP OF THE LADDER';
    el.textContent = `${earned}${result.newBest ? ' • NEW BEST!' : ` • BEST ${prog.best.toLocaleString()}`}${nextTxt}`;
    const unlockEl = $('endUnlockText');
    if (unlockEl) {
      const opened = result.unlocked !== null ? WORLD_LEVELS[result.unlocked] : null;
      unlockEl.textContent = opened ? `🔓 UNLOCKED: ${opened.name}` : '';
      unlockEl.classList.toggle('hidden', !opened);
    }
  }

  /** Results: what the run earned, what sloppy driving cost, and why (ticket 0073). */
  function renderScoreSheet(sheet) {
    const el = $('endPenaltyText');
    if (!el) return;
    if (!sheet.penalty) {
      el.textContent = 'CLEAN RUN — NO PENALTIES ✨';
      el.className = 'mt-0.5 text-[8px] sm:text-[9px] font-arcade font-bold text-emerald-300';
      return;
    }
    const why = [];
    if (sheet.obstacleHits) why.push(`${sheet.obstacleHits} HIT${sheet.obstacleHits > 1 ? 'S' : ''}`);
    if (sheet.trafficHits) why.push(`${sheet.trafficHits} CRASH${sheet.trafficHits > 1 ? 'ES' : ''}`);
    if (sheet.coneHits) why.push(`${sheet.coneHits} CONE${sheet.coneHits > 1 ? 'S' : ''}`);
    if (sheet.wallSec) why.push(`${sheet.wallSec}s WALL`);
    // 0290: the line wraps on phones; a count never leaves its word (no-break space).
    el.textContent = `${sheet.earned.toLocaleString()} − ${sheet.penalty.toLocaleString()} (${why.map((w) => w.replace(' ', '\u00a0')).join(' · ')})`;
    el.className = 'mt-0.5 text-[8px] sm:text-[9px] font-arcade font-bold text-rose-300';
  }

  /** Results: the run's three missions (ticket 0026). */
  function renderMissions(run) {
    const list = $('endMissions');
    if (!list) return;
    list.textContent = '';
    for (const m of run || []) {
      const li = document.createElement('li');
      li.className = m.done ? 'done' : '';
      li.textContent = missionLine(m);
      list.appendChild(li);
    }
  }

  /** Results line for cars a race just unlocked (the garage plays the full reveal). */
  function announceNewCars(names) {
    if (!names.length) return;
    const el = $('endUnlockText');
    if (!el) return;
    const carLine = `🏎️ NEW CAR UNLOCKED: ${names.join(' + ').toUpperCase()}`;
    el.textContent = el.classList.contains('hidden') || !el.textContent ? carLine : `${el.textContent} • ${carLine}`;
    el.classList.remove('hidden');
  }

  // A browser that cannot save (0213): one dismissible line on the first results card after a
  // failed save, once per session. No DOM at all while storage works.
  let saveNoticeShown = false;
  function showSaveNotice() {
    $('saveNotice')?.remove();
    if (!SaveStore.persistFailed || saveNoticeShown) return;
    const box = document.createElement('div');
    box.id = 'saveNotice';
    box.className = 'save-notice';
    box.setAttribute('role', 'status');
    const msg = document.createElement('span');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'save-notice-x';
    close.setAttribute('aria-label', 'Dismiss save warning');
    close.textContent = '✕';
    close.addEventListener('click', () => {
      const hadFocus = box.contains(document.activeElement);
      box.remove();
      if (hadFocus) $('btnPlayAgain')?.focus();
    });
    box.append(msg, close);
    $('endMedalText').before(box);
    // The live region is in the tree (and the modal shown) before its text lands, so it is read.
    // Left before then (PLAY AGAIN at once)? It counts as unseen and waits for the next card.
    setTimeout(() => {
      if (!box.isConnected || $('gameOverModal').classList.contains('hidden')) { box.remove(); return; }
      saveNoticeShown = true;
      msg.innerHTML = '<span aria-hidden="true">💾 </span>';
      msg.append("Progress can't be saved in this browser: medals and times reset when you close the tab.");
    }, 100);
  }

  // The card's spoken line (0294): written before the card shows, so it is the dialog's description,
  // read once as focus enters the card (the rank card keeps its own live region).
  function speakSummary() {
    const el = $('endSummary');
    if (!el) return;
    const g = GameState, lr = g.lastResult;
    const endless = g.mode === 'INFINITE' || !g.raceLength;
    const text = resultSummary({
      endless, score: g.score, distance: g.endlessResult ? g.endlessResult.distance : g.distance,
      place: lr ? lr.place : g.racePosition, total: lr ? lr.total : 0, outcome: lr ? lr.outcome : 'finished',
      time: g.finishTime != null ? g.finishTime : g.raceTime,
    });
    el.textContent = text;
  }

  // The card is a dialog (0294): focus, Tab and HOME glue in its own small chunk (src/results-focus.js).
  import('./results-focus.js').then((m) => m.initResultsFocus(GameState)).catch(() => {});

  /** Everything on the results card after the finish order: medal, ghost, score, stats, initials. */
  function showResults({ lvl, result, newCarNames, verdict, ghostInitials, scoreSheet }) {
    if (result) renderRunMedal(lvl, result);
    else {
      $('endMedalText').textContent = `📅 DAILY CHALLENGE · ${GameState.daily.modifier.name}`;
      $('endUnlockText').classList.add('hidden');
    }
    announceNewCars(newCarNames);
    // The ghost verdict sits on the results card (the finish ceremony owns the announcer).
    const ghostEl = $('endGhostText');
    if (ghostEl) {
      const by = verdict && verdict.by != null ? ` BY ${verdict.by.toFixed(1)}s` : '';
      ghostEl.textContent = !verdict ? '' : verdict.beat
        ? `👻 YOU BEAT ${ghostInitials}'S GHOST${by}!`
        : `👻 ${ghostInitials}'S GHOST WON${by} — RACE IT AGAIN`;
      ghostEl.classList.toggle('hidden', !verdict);
    }
    $('endScoreText').textContent = GameState.score.toLocaleString();
    renderScoreSheet(scoreSheet);
    $('endWarpsText').textContent = `${ordinal(GameState.racePosition)} • ${plural(GameState.timeWarps, 'WARP')}`;
    // "TD" stays: "188 MPH • 12 TAKEDOWNS" overflows this cell at every size (0289); the caption spells it out.
    // 0293: KM/H shows the peak in km/h (the posted run and share text keep mph). "303 KM/H • 12 TD" is
    // ~3 px wider than the cell at 320 and 667x375, so the km/h line takes thin spaces.
    const pk = Math.max(0, GameState.peakSpeed);
    $('endPeakSpeedText').textContent = GameState.kmh
      ? `${Math.round(pk * 1.609344)}\u2009KM/H\u2009•\u2009${GameState.takedowns}\u2009TD`
      : `${Math.round(pk)} MPH • ${GameState.takedowns} TD`;
    $('endCoinsText').textContent = `+${GameState.runCoins} ⚡`;
    renderMissions(GameState.missions);
    speakSummary();
    $('gameOverModal').classList.remove('hidden');
    showSaveNotice();
    offerScoreSubmission();
  }

  // --- DAILY CHALLENGE & GLOBAL LEADERBOARD (tickets 0023, 0025) ---
  function renderDailyCard() {
    const d = dailySpec(utcDay(Date.now()));
    const lvl = WORLD_LEVELS[d.levelIndex];
    const t = $('dailyTitle');
    const desc = $('dailyDesc');
    if (t) t.textContent = `${lvl.name.replace(/^LVL \d+:\s*/, '')} · ${d.modifier.name}`;
    if (desc) desc.textContent = `${d.modifier.desc}. Same road for everyone today.`;
  }

  const sameView = (a, b) => a.board === b.board && a.mode === b.mode && Boolean(a.track) === Boolean(b.track);

  function offlineAge(at) {
    if (!at) return 'YOUR LAST VISIT';
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 60) return `${Math.max(1, mins)} MIN AGO`;
    const hrs = Math.round(mins / 60);
    return hrs < 48 ? `${hrs} H AGO` : `${Math.round(hrs / 24)} DAYS AGO`;
  }

  function renderBoard(data, view) {
    const list = $('boardList');
    const status = $('boardStatus');
    if (!list || !status) return;
    list.textContent = '';
    if (!data) { status.textContent = 'LEADERBOARD OFFLINE — YOUR BEST IS SAVED ON THIS DEVICE'; return; }
    const lvl = view.track ? WORLD_LEVELS[data.level] : null;
    if (data.offline) status.textContent = `📴 OFFLINE — SCORES AS OF ${offlineAge(data.cachedAt)}`;
    else if (data.entries.length) status.textContent = lvl ? `TRACK: ${lvl.name.replace(/^LVL \d+:\s*/, '')}` : '';
    else status.textContent = view.board === 'friends'
      ? 'NO FRIENDS HERE YET — SEND A CHALLENGE OR RACE IN A ROOM'
      : 'NO SCORES YET — BE THE FIRST';
    renderBoardRows(list, data, {
      me: SaveStore.data.initials,
      champion: hallCache?.champions?.[0]?.initials || null,
      medal: (e) => (lvl ? MEDAL_ICON[medalFor(lvl.id, e.score)] || '' : ''),
      reduced: GameState.reducedMotion,
    });
  }

  function renderSeason() {
    const el = $('boardSeason');
    if (!el) return;
    const champ = hallCache?.champions?.[0];
    const end = hallCache?.season?.endsAt;
    el.textContent = [end ? `⏳ SEASON ENDS IN ${timeLeft(end, Date.now())}` : '', champ ? `LAST WEEK 👑 ${champ.initials}` : ''].filter(Boolean).join(' · ');
  }

  async function loadBoard() {
    document.querySelectorAll('.board-tab').forEach((b) => {
      b.setAttribute('aria-selected', String(sameView({ board: b.dataset.board, mode: b.dataset.mode, track: b.dataset.track }, boardView)));
    });
    const status = $('boardStatus');
    if (status) status.textContent = 'LOADING…';
    const view = { ...boardView };
    const level = view.track ? (SaveStore.data.selectedLevel || 0) : undefined;
    const data = await fetchBoard(view.board, view.mode, 10, { level, around: SaveStore.data.initials || undefined });
    if (sameView(view, boardView)) renderBoard(data, view);
  }

  /** A board tab was picked. */
  function selectBoard(view) {
    boardView = view;
    loadBoard();
  }

  function openLeaderboard(view) {
    if (view) boardView = view;
    renderDailyCard();
    const best = $('boardYourBest');
    if (best) best.textContent = SaveStore.data.bestScore.toLocaleString();
    $('leaderboardModal').classList.remove('hidden');
    loadBoard();
    fetchHall('ARCADE').then((h) => { if (h) { hallCache = h; renderSeason(); } });
  }

  function closeLeaderboard() {
    $('leaderboardModal').classList.add('hidden');
  }

  // Rival line on the title and the daily streak (ticket 0091): one pull at boot, no push.
  const COMPETE_KEY = 'outatime88_compete_v1';
  async function refreshRival() {
    const initials = normalizeInitials(SaveStore.data.initials);
    if (!initials) return;
    let seen = 0;
    try { seen = JSON.parse(localStorage.getItem(COMPETE_KEY) || '{}').seen || 0; } catch { seen = 0; }
    const s = await fetchStanding({ initials, mode: 'ARCADE', level: SaveStore.data.selectedLevel || 0, since: seen || undefined });
    if (!s) return;
    try { localStorage.setItem(COMPETE_KEY, JSON.stringify({ seen: Date.now() })); } catch { /* blocked */ }
    const line = $('titleRival');
    if (line) line.textContent = rivalLine(s);
    const streak = $('dailyStreak');
    if (streak) streak.textContent = s.streak?.days ? `🔥 ${s.streak.days}-DAY STREAK${s.streak.today ? '' : ' — PLAY TODAY TO KEEP IT'}` : '';
  }

  async function postScore(initials) {
    const rankEl = $('endRankText');
    const form = $('initialsForm');
    const current = run.get();
    if (!current || !rankEl) return;
    run.set(null); // one submission per run
    form.classList.add('hidden');
    rankEl.textContent = 'POSTING…';
    const token = await current.tokenPromise;
    if (!token) {
      // Started with no connection (a plane): no run token, so it can't count on the board.
      rankEl.textContent = (typeof navigator !== 'undefined' && navigator.onLine === false) || !current.online
        ? '✈️ PLAYED OFFLINE — BEST SAVED ON THIS DEVICE. RACES STARTED ONLINE COUNT ON THE BOARD'
        : 'LEADERBOARD OFFLINE — BEST SAVED LOCALLY';
      return;
    }
    const r = await submitRun({
      token, initials, score: current.score, distance: current.distance, durationMs: current.durationMs,
      warps: current.warps, level: current.level, mode: current.mode, car: current.car, earned: current.earned, pen: current.pen, fp: current.fp, trace: current.trace,
    });
    if (r.ok) {
      const card = $('endRankCard');
      const rich = card && renderRankCard(card, r.body, {
        reduced: GameState.reducedMotion,
        onGhost: current.mode === 'ARCADE' ? (who) => raceGhostOf(who, current.level) : null,
      });
      rankEl.textContent = rich ? '' : `🏆 ${initials} ${rankLine(r.body.rank)}`;
      // Autopilot runs are saved but don't rank against hand-driven ones (ticket 0180).
      if (r.body.unranked === 'assist') rankEl.textContent = '🤖 AUTOPILOT RUN — SAVED FOR YOU, NOT RANKED ON THE GLOBAL BOARD';
      refreshRival();
    }
    else if (r.status === 400) { rankEl.textContent = 'PICK OTHER INITIALS'; SaveStore.data.initials = ''; SaveStore.save(); run.set(current); form.classList.remove('hidden'); }
    else if (r.queued) rankEl.textContent = '✈️ SAVED — POSTS WHEN YOU\'RE BACK ONLINE';
    else if (r.status === 0 || r.status === 503) rankEl.textContent = 'LEADERBOARD OFFLINE — BEST SAVED LOCALLY';
    else rankEl.textContent = 'SCORE NOT ACCEPTED';
  }

  function offerScoreSubmission() {
    const form = $('initialsForm');
    const rankEl = $('endRankText');
    if (!form || !rankEl) return;
    rankEl.textContent = '';
    const card = $('endRankCard');
    if (card) card.textContent = '';
    form.classList.add('hidden');
    const current = run.get();
    if (!current || current.score <= 0) { run.set(null); return; }
    const saved = normalizeInitials(SaveStore.data.initials);
    if (saved) { postScore(saved); return; }
    form.classList.remove('hidden');
    const input = $('initialsInput');
    if (input) { input.value = ''; if (!coarsePointer) input.focus(); }
  }

  return { showResults, openLeaderboard, closeLeaderboard, selectBoard, refreshRival, postScore };
}
