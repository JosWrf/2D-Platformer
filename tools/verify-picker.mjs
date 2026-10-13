/**
 * Picking a boss attack, played through.
 *
 *   1. A tap of the key that changes it takes the next one, and the toast at
 *      the hero says which: one of it however fast the taps come, the picked
 *      attack between its neighbours, whole for at least 1.2 s, and still over
 *      his head 0.6 s later while he runs at full speed.
 *   2. Held, the key opens the picker, and the world goes on at a third of its
 *      pace while it is open; the hero gets neither the arrows nor the jump.
 *   3. Every attack from every other, eighteen owned (306 pairs, played): at
 *      most 5 inputs and 3.5 on average, a hold counting as one; with six
 *      owned at most 3; the one before always 2 (the hold and one step).
 *   4. The picked attack ready again: the chime and the badge lit, at once.
 *   5. R: a tap in play changes nothing; held 0.8 s it starts over, with a bar
 *      filling over the hero. On the pause screen a tap does it.
 *   6. On the pause screen's attacks, up and down pick one; each says how
 *      ready it is.
 *   7. The caps follow the keys in use: C/V, U/O, F/Q; the arrows or WASD.
 *   8. M and N under the pause leave no banner behind for when play resumes.
 *
 * Usage: node tools/verify-picker.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST)) throw new Error('bad path');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.error('PAGE ERROR:', e.message);
});
const base = `http://127.0.0.1:${server.address().port}/`;

const RELICS = [
  'herzkern',
  'keilerhaut',
  'goldzahn',
  'gauklerschritt',
  'bebenfaust',
  'lichtkern',
  'seidenmantel',
  'glutklinge',
  'zwillingsstern',
  'flutklinge',
  'steinblick',
  'taktgeber',
  'blutdurst',
  'schattenschritt',
  'zweiteratem',
  'splitterparade',
  'hydrablut',
  'klingenwelle',
];

/** A fresh page in play, the loop stopped, n attacks learned, and the helpers installed. */
async function fresh(n) {
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(
    ([relics]) => {
      window.loop.stop();
      const g = window.game;
      const input = window.input;
      const ctx = document.querySelector('canvas').getContext('2d');
      g.dialogue = null;
      const h = {};
      const held = new Set();
      /** One frame with exactly these actions down. */
      h.tick = (down = [], draw = false) => {
        for (const a of ['left', 'right', 'up', 'down', 'jump', 'attack', 'parry', 'dash', 'skill', 'cycle', 'confirm', 'pause', 'restart', 'music', 'sound']) {
          const want = down.includes(a);
          if (want !== held.has(a)) {
            input.forceDown(a, want);
            if (want) held.add(a);
            else held.delete(a);
          }
        }
        g.update(1 / 60, input);
        if (draw) g.render(ctx);
      };
      h.quiet = () => {
        const p = g.player;
        g.warpTo(14);
        for (const e of g.enemies) e.dead = true;
        g.projectiles.length = 0;
        p.hp = p.maxHp;
        p.skillEffects = [];
        p.skillCooldowns.clear();
        for (let f = 0; f < 30; f++) h.tick();
        g.zoneBanner.timer = 0;
      };
      h.learn = (k) => {
        for (const r of relics.slice(0, k)) g.takeRelic(r);
        g.dialogue = null;
        g.zoneBanner.timer = 0;
        g.player.skillCooldowns.clear();
      };
      window.__h = h;
      h.quiet();
    },
    [RELICS],
  );
  if (n > 0) await page.evaluate((k) => window.__h.learn(k), n);
}

const results = {};

/* -------------------------------------------------------- 1. the tap, the toast */

await fresh(18);
results.tap = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const owned = p.ownedSkills();
  const out = {};
  p.skill = owned[3];
  g.picker.reset();
  const textsBefore = g.particles.texts.length;
  // Three taps at six a second: a frame down, nine up.
  for (let t = 0; t < 3; t++) {
    h.tick(['cycle'], true);
    for (let f = 0; f < 9; f++) h.tick([], true);
  }
  out.after3 = owned.indexOf(p.skill);
  out.floatingTexts = g.particles.texts.length - textsBefore;
  out.kind = g.picker.view.kind;
  // Whole for 1.2 s after the last input: count the frames it stays a toast and is not yet blinking.
  let whole = 9 / 60;
  while (g.picker.view.kind === 'toast' && g.picker.toast > 0.4 && whole < 5) {
    h.tick([], true);
    whole += 1 / 60;
  }
  out.whole = whole;
  // Running at full speed: a tap, then 0.6 s on, and where it is against his head.
  h.quiet();
  for (let f = 0; f < 40; f++) h.tick(['right'], true);
  h.tick(['right', 'cycle'], true);
  for (let f = 0; f < 36; f++) h.tick(['right'], true);
  const v = g.picker.view;
  const hx = (p.cx - g.camera.renderX) / 2;
  const hy = (p.y - g.camera.renderY) / 2;
  out.running = { speed: Math.abs(p.vx), kind: v.kind, dx: v.x + v.w / 2 - hx, dy: hy - (v.y + v.h) };
  // And after a roll.
  h.tick(['right', 'cycle'], true);
  h.tick(['right', 'dash'], true);
  for (let f = 0; f < 35; f++) h.tick(['right'], true);
  const w = g.picker.view;
  out.dashed = { kind: w.kind, dx: w.x + w.w / 2 - (p.cx - g.camera.renderX) / 2, dy: (p.y - g.camera.renderY) / 2 - (w.y + w.h) };
  return out;
});

/* ---------------------------------------------- 2. the hold: open, slow, masked */

results.hold = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  h.quiet();
  const out = {};
  // A mote of dust drifting right at 120 px/s, nothing pulling on it.
  g.particles.spawn({ x: p.cx, y: p.y - 40, vx: 120, vy: 0, gravity: 0, drag: 1, life: 30, size: 1 });
  const mote = g.particles.items[g.particles.items.length - 1];
  const pace = () => {
    const x0 = mote.x;
    for (let f = 0; f < 10; f++) h.tick(['cycle'], true);
    return (mote.x - x0) / 10;
  };
  // Closed: the key not yet held long enough.
  h.tick(['cycle'], true);
  out.openAfter1 = g.picker.open;
  for (let f = 0; f < 12; f++) h.tick(['cycle'], true);
  out.openAfter13 = g.picker.open;
  const x0 = mote.x;
  for (let f = 0; f < 10; f++) h.tick(['cycle'], true);
  const slow = (mote.x - x0) / 10;
  h.tick([], true);
  out.closedOnRelease = !g.picker.open;
  const x1 = mote.x;
  for (let f = 0; f < 10; f++) h.tick([], true);
  const fast = (mote.x - x1) / 10;
  out.paceRatio = slow / fast;
  // Masked: open, then left and jump held - the hero stays where he is.
  for (let f = 0; f < 13; f++) h.tick(['cycle'], true);
  const sx = p.x;
  const sy = p.y;
  for (let f = 0; f < 20; f++) h.tick(['cycle', 'left', 'jump'], true);
  out.heroMoved = Math.abs(p.x - sx) + Math.abs(p.y - sy);
  out.gridKind = g.picker.view.kind;
  out.gridBox = { ...g.picker.view };
  h.tick([], true);
  void pace;
  return out;
});

/* -------------------------------------------- 3. every attack from every other */

async function allPairs() {
  return page.evaluate(() => {
    const g = window.game;
    const h = window.__h;
    const p = g.player;
    const owned = p.ownedSkills();
    const n = owned.length;
    const cols = (() => {
      // The grid's width as the picker lays it out: read off the cursor's
      // moves (down from the first goes to the first of the next row).
      p.skill = owned[0];
      for (let f = 0; f < 13; f++) h.tick(['cycle']);
      h.tick(['cycle', 'down']);
      const c = g.picker.cursor;
      h.tick([]);
      return c === 0 ? n : c;
    })();
    const rows = Math.ceil(n / cols);
    const step = (at, dx, dy) => {
      if (dx) return (at + dx + n) % n;
      const row = (Math.floor(at / cols) + dy + rows) % rows;
      return row * cols + Math.min(at % cols, Math.min(cols, n - row * cols) - 1);
    };
    const MOVES = [
      ['right', 1, 0],
      ['left', -1, 0],
      ['down', 0, 1],
      ['up', 0, -1],
    ];
    const path = (from, to) => {
      const prev = new Map([[from, null]]);
      const queue = [from];
      for (let i = 0; i < queue.length; i++) {
        const at = queue[i];
        if (at === to) break;
        for (const [key, dx, dy] of MOVES) {
          const next = step(at, dx, dy);
          if (!prev.has(next)) {
            prev.set(next, [at, key]);
            queue.push(next);
          }
        }
      }
      const keys = [];
      for (let at = to; prev.get(at); at = prev.get(at)[0]) keys.unshift(prev.get(at)[1]);
      return keys;
    };
    let worst = 0;
    let sum = 0;
    let pairs = 0;
    let wrong = 0;
    let undo = 0;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        p.skill = owned[a];
        h.tick([]);
        let inputs;
        if (b === (a + 1) % n) {
          h.tick(['cycle']);
          h.tick([]);
          inputs = 1;
        } else {
          const keys = path(a, b);
          for (let f = 0; f < 13; f++) h.tick(['cycle']);
          for (const k of keys) {
            h.tick(['cycle', k]);
            h.tick(['cycle']);
          }
          h.tick([]);
          inputs = 1 + keys.length;
        }
        if (p.skill !== owned[b]) wrong++;
        worst = Math.max(worst, inputs);
        sum += inputs;
        pairs++;
        if (b === (a - 1 + n) % n) undo = Math.max(undo, inputs);
      }
    }
    return { n, cols, rows, pairs, worst, mean: sum / pairs, undo, wrong };
  });
}
results.pairs18 = await allPairs();

/* ----------------------------------------------------------- 4. ready again */

results.ready = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  h.quiet();
  const played = [];
  const play = window.audio.play.bind(window.audio);
  window.audio.play = (name, pitch) => {
    played.push(name);
    return play(name, pitch);
  };
  p.skillCooldowns.set(p.skill, 0.05);
  let frames = 0;
  while (p.skillCooldowns.has(p.skill) && frames < 20) {
    h.tick([], true);
    frames++;
  }
  const flashAtOnce = p.readyFlash;
  let lit = 0;
  while (p.readyFlash > 0 && lit < 100) {
    h.tick([], true);
    lit++;
  }
  // Pressed while it cools: the refusal.
  p.skillCooldowns.set(p.skill, 5);
  h.tick(['skill']);
  h.tick([]);
  window.audio.play = play;
  return { chime: played.includes('ready'), flashAtOnce, flashFor: lit / 60, deny: played.includes('deny') };
});

/* ------------------------------------------------------------------- 5. R */

results.restart = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  h.quiet();
  const had = p.skills.size;
  const out = {};
  // A tap, a quarter of a second: nothing.
  for (let f = 0; f < 15; f++) h.tick(['restart'], true);
  h.tick([]);
  out.afterTap = p.skills.size;
  out.state = g.state;
  // Held: the bar fills, and at 0.8 s the run starts over.
  let barSeen = false;
  let f = 0;
  while (p.skills.size === had && f < 120) {
    h.tick(['restart'], true);
    if (g.restartHold > 0.3) barSeen = true;
    f++;
  }
  out.heldFor = f / 60;
  out.afterHold = p.skills.size;
  out.barSeen = barSeen;
  // Still held after it: no second restart.
  for (let i = 0; i < 80; i++) h.tick(['restart']);
  out.restartHoldAfter = g.restartHold;
  h.tick([]);
  out.had = had;
  return out;
});

/* ---------------------------------------------------- 6. the pause screen */

await fresh(18);
results.pause = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const owned = p.ownedSkills();
  p.skill = owned[0];
  p.skillCooldowns.set(owned[1], 3);
  h.tick(['pause']);
  h.tick([]);
  const out = { state: g.state };
  if (g.pausePage !== 'skills') {
    h.tick(['right']);
    h.tick([]);
  }
  out.page = g.pausePage;
  h.tick(['down']);
  h.tick([]);
  out.afterDown = owned.indexOf(p.skill);
  h.tick(['up']);
  h.tick(['up']);
  h.tick([]);
  h.tick(['up']);
  h.tick([]);
  out.afterUpUp = owned.indexOf(p.skill);
  const entries = g.pauseEntries();
  out.statuses = entries.slice(0, 3).map((e) => e.status);
  out.allHaveStatus = entries.every((e) => typeof e.status === 'string' && e.status.length > 0);
  // M and N under the pause: no banner left for later.
  h.tick(['music']);
  h.tick(['sound']);
  h.tick([]);
  out.bannerUnderPause = g.zoneBanner.timer;
  h.tick(['music']);
  h.tick(['sound']);
  h.tick([]);
  // R at a tap from the pause screen.
  h.tick(['restart']);
  h.tick([]);
  out.restartFromPause = p.skills.size === 0 && g.state === 'playing';
  out.bannerAfterResume = g.zoneBanner.text === 'MUSIK AN' || g.zoneBanner.text === 'EFFEKTE AN' ? g.zoneBanner.timer : 0;
  return out;
});

/* ---------------------------------------------------- 7. the caps follow */

await fresh(4);
const caps = {};
for (const [key, name] of [
  ['KeyC', 'C'],
  ['KeyU', 'U'],
  ['KeyQ', 'Q'],
  ['ArrowLeft', 'arrows'],
  ['KeyA', 'wasd'],
]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
  caps[name] = await page.evaluate(() => ({ attack: window.input.attackKeys.join(''), move: window.input.moveKeys.join('') }));
}
results.caps = caps;

/* -------------------------------------------------- 3b. six attacks owned */

await fresh(6);
results.pairs6 = await allPairs();

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

const T = results.tap;
const H = results.hold;
const P18 = results.pairs18;
const P6 = results.pairs6;
const Rd = results.ready;
const Rs = results.restart;
const Ps = results.pause;
const C = results.caps;
const near = (v) => v.kind === 'toast' && Math.abs(v.dx) <= 40 && v.dy >= -40 && v.dy <= 40;
const checks = [
  ['three taps at 6/s: three steps on, one toast, no floating words', T.after3 === 6 && T.kind === 'toast' && T.floatingTexts === 0],
  ['the toast stays whole for at least 1.2 s after the last input', T.whole >= 1.2],
  ['running at full speed, 0.6 s after a tap the toast is over his head', T.running.speed > 200 && near(T.running)],
  ['and after a roll too', near(T.dashed)],
  ['held 0.2 s the key opens the picker; a frame does not', !H.openAfter1 && H.openAfter13 && H.closedOnRelease],
  ['while it is open the world runs at no more than 0.35 of its pace', H.paceRatio > 0 && H.paceRatio <= 0.35],
  ['while it is open the hero neither walks nor jumps on the picker keys', H.heroMoved < 0.5 && H.gridKind === 'grid'],
  ['18 owned: every attack from every other, as planned', P18.pairs === 306 && P18.wrong === 0],
  ['18 owned: at most 5 inputs, 3.5 on average', P18.worst <= 5 && P18.mean <= 3.5],
  ['back one after an overshoot: 2 inputs', P18.undo <= 2 && P6.undo <= 2],
  ['6 owned: at most 3 inputs', P6.worst <= 3 && P6.wrong === 0],
  ['ready again: the chime and the badge lit at once, for 0.2 s or more', Rd.chime && Rd.flashAtOnce > 0 && Rd.flashFor >= 0.2],
  ['pressed while it cools: the refusal sound', Rd.deny],
  ['a tap of R in play changes nothing', Rs.afterTap === Rs.had && Rs.state === 'playing'],
  ['R held 0.8 s starts the run over, with the bar showing', Rs.afterHold === 0 && Rs.heldFor >= 0.78 && Rs.heldFor <= 0.9 && Rs.barSeen],
  ['and held on, it does not start over again', Rs.restartHoldAfter === -1],
  ['pause: up and down pick an attack on its page', Ps.page === 'skills' && Ps.afterDown === 1 && Ps.afterUpUp === 17],
  ['pause: every attack says how ready it is', Ps.allHaveStatus && Ps.statuses[0] === 'BEREIT' && /S$/.test(Ps.statuses[1])],
  ['pause: M and N leave no banner for later; R takes a tap there', Ps.bannerUnderPause <= 0 && Ps.bannerAfterResume <= 0 && Ps.restartFromPause],
  [
    'the caps follow the keys in use',
    C.C.attack === 'CV' && C.U.attack === 'UO' && C.Q.attack === 'FQ' && C.arrows.move === '←→↑↓' && C.wasd.move === 'ADWS',
  ],
  ['no page errors', errors.length === 0],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(
  `\n  18 owned: ${P18.cols}×${P18.rows}, worst ${P18.worst}, mean ${P18.mean.toFixed(2)}; 6 owned: ${P6.cols}×${P6.rows}, worst ${P6.worst}, mean ${P6.mean.toFixed(2)}; pace ${H.paceRatio.toFixed(2)}`,
);
if (failed) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nOK - a tap takes the next attack, a hold picks any in a few steps with the world slowed, and R needs a hold.');
