// Controls feel (ticket 0183): input reaches the screen on the next frame from every source,
// gamepad triggers are analog pedals, tilt is filtered without lag, and the tyres and walls
// come through the gamepad's rumble. Judged in frames and sim time, not wall-clock ms, so a
// loaded CI runner can't fail it.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // A fake gamepad the test drives, with a rumble motor that records what it's asked.
    const effects = [];
    const pad = {
      id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: { playEffect: (type, p) => { effects.push({ type, ...p }); return Promise.resolve('complete'); }, reset: () => { effects.push({ type: 'reset' }); return Promise.resolve('complete'); } },
    };
    window.__pad = pad;
    window.__padOn = false;
    window.__rumble = effects;
    navigator.getGamepads = () => (window.__padOn ? [pad] : []);
    if (window.DeviceOrientationEvent) window.DeviceOrientationEvent.requestPermission = async () => 'granted';
    // Count frames after each game frame, so tests can ask "how many frames until…".
    const raf = window.requestAnimationFrame;
    window.__frames = 0;
    window.requestAnimationFrame = (cb) => raf.call(window, (t) => {
      cb(t);
      window.__frames++;
      // Checked right after each game frame, so the count can't drift with timer jitter.
      const pr = window.__probe;
      if (pr && window.__OT && Math.abs(window.__OT.GameState.steerInput - pr.s0) > 0.02) { window.__probe = null; pr.done(window.__frames - pr.f0); }
    });
  });
});

async function race(page, { tilt = false } = {}) {
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT);
  if (tilt) {
    const filter = page.waitForResponse((r) => /\/tilt-[^/]*\.js$/.test(r.url())); // tilt's own chunk (src/tilt.js + its filter)
    await page.locator('#btnTitleTilt').evaluate((b) => b.click());
    await filter;
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 0, gamma: 0 })));
    await page.waitForFunction(() => window.__OT.InputState.tiltEnabled);
  }
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START');
}

/** Frames from applying an input (in page) until the sim's steering moves. */
function framesToSteer(page, src) {
  return page.evaluate((src) => new Promise((done) => {
    const g = window.__OT.GameState;
    const hold = setInterval(() => { g.speed = 70; }, 4);
    setTimeout(() => {
      const s0 = g.steerInput;
      const finish = (n) => {
        clearInterval(hold);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
        window.__pad.axes[0] = 0;
        done(n);
      };
      window.__probe = { f0: window.__frames, s0, done: finish };
      if (src === 'key') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      if (src === 'pad') { window.__padOn = true; window.__pad.axes[0] = 0.8; }
      if (src === 'tilt') window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 12, gamma: 12 }));
      setTimeout(() => { if (window.__probe) { window.__probe = null; finish(99); } }, 3000);
    }, 400);
  }), src);
}

test('every input source moves the steering on the next frame or the one after', async ({ page }) => {
  const problems = watchPage(page);
  await race(page, { tilt: true });
  for (const src of ['key', 'pad', 'tilt']) {
    const n = await framesToSteer(page, src);
    expect(n, src).toBeLessThanOrEqual(2);
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 0, gamma: 0 })));
    await page.waitForTimeout(600); // back to centre
  }
  expect(problems).toEqual([]);
});

test('gamepad triggers are analog: half throttle pulls about half as hard', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  await page.evaluate(() => { window.__OT.GameState.autoGas = false; }); // auto-gas is a full press
  // The drivetrain's own pull (drive.ax, before drag) with the speed pinned at 50 mph, so
  // traffic, slipstream and gear changes can't muddy it: RT at 100% vs ~50%.
  const accel = (amt) => page.evaluate((amt) => new Promise((done) => {
    const g = window.__OT.GameState, d = window.__OT.drive();
    window.__padOn = true;
    const b = window.__pad.buttons[7];
    b.value = amt; b.pressed = amt > 0.5;
    const t0 = g.raceTime, ax = [];
    const id = setInterval(() => {
      g.speed = 50; g.playerY = 0;
      if (g.raceTime - t0 > 0.05) ax.push(d.ax);
      if (g.raceTime - t0 < 0.3) return;
      clearInterval(id);
      b.value = 0; b.pressed = false;
      ax.sort((x, y) => x - y);
      done(ax[ax.length >> 1]);
    }, 2);
  }), amt);
  const full = await accel(1);
  const half = await accel(0.53);
  expect(full).toBeGreaterThan(3);
  expect(half).toBeGreaterThan(full * 0.3);
  expect(half).toBeLessThan(full * 0.7);
  expect(problems).toEqual([]);
});

test('the rumble carries the tyres sliding and a wall hit', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  // The force-feel chunk loads when a pad connects: wait for it, not a fixed beat.
  const chunk = page.waitForResponse((r) => /forcefeel-[^/]*\.js$/.test(r.url()));
  await page.evaluate(() => { window.__padOn = true; window.dispatchEvent(new Event('gamepadconnected')); });
  await chunk;
  // Slam into the right wall at speed with the stick pinned, for 2 s of sim time.
  await page.evaluate(() => new Promise((done) => {
    const g = window.__OT.GameState, t0 = g.raceTime;
    // Stick pinned and the brake on: a power drift into the barrier.
    window.__pad.axes[0] = 1;
    window.__pad.buttons[6].value = 1; window.__pad.buttons[6].pressed = true;
    const id = setInterval(() => {
      g.speed = 95;
      if (g.raceTime - t0 < 2) return;
      clearInterval(id); window.__pad.axes[0] = 0; window.__pad.buttons[6].value = 0; window.__pad.buttons[6].pressed = false; done();
    }, 4);
  }));
  const fx = await page.evaluate(() => window.__rumble.filter((e) => e.type === 'dual-rumble'));
  expect(fx.length).toBeGreaterThan(3);
  expect(Math.max(...fx.map((e) => e.strongMagnitude))).toBeGreaterThan(0.5); // the wall
  expect(Math.max(...fx.map((e) => e.weakMagnitude))).toBeGreaterThan(0.2);  // the tyres scrubbing
  // Paused: the motors stop.
  await page.evaluate(() => window.__OT.pause());
  await page.waitForFunction(() => { const r = window.__rumble; const e = r[r.length - 1]; return e && (e.type === 'reset' || (e.weakMagnitude === 0 && e.strongMagnitude === 0)); });
  expect(problems).toEqual([]);
});

test('tilt held still is steady: sensor jitter barely moves the wheel', async ({ page }) => {
  const problems = watchPage(page);
  await race(page, { tilt: true });
  const spread = await page.evaluate(() => new Promise((done) => {
    let s = 11;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const vals = [];
    let i = 0;
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = i++ * 16.7;
      // Held at 10°, with 0.5° of sensor noise and a 9 Hz hand tremor.
      const a = 10 + (rnd() - 0.5) * 1.7 + 0.3 * Math.sin(2 * Math.PI * 9 * t / 1000);
      // A real sensor reports every 16.7 ms; a loaded runner fires this timer in bursts. The
      // filter adapts to the sample clock (e.timeStamp), so stamp each sample with its sensor
      // time: the result is then the same on any machine.
      const ev = new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: a, gamma: a });
      Object.defineProperty(ev, 'timeStamp', { value: t0 + t });
      window.dispatchEvent(ev);
      if (i > 30) vals.push(window.__OT.InputState.tiltSteerVal);
      if (i > 120) {
        clearInterval(id);
        const m = vals.reduce((x, v) => x + v, 0) / vals.length;
        done({ mean: m, rms: Math.sqrt(vals.reduce((x, v) => x + (v - m) * (v - m), 0) / vals.length) });
      }
    }, 16);
  }));
  expect(spread.mean).toBeGreaterThan(0.25);
  console.log(`[tilt] held-still rms ${spread.rms.toFixed(4)}`);
  expect(spread.rms).toBeLessThan(0.015); // unfiltered, this noise is ~0.025
  expect(problems).toEqual([]);
});
