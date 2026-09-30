/**
 * The three new bosses: Ankhor in the temple, Ignivor in the ember chamber and
 * Vesperon on the roof of the keep.
 *
 * Each is pinned on the same three questions the older fights are:
 *
 *   1. Does it actually do everything it is supposed to? Every move has to show
 *      up in a fight of ordinary length, from where the hero happens to be.
 *   2. Is it fair? Every move that hurts is announced for at least half a
 *      second, and a hero who reads the announcements takes far less than one
 *      who stands still.
 *   3. Does its rule hold? Ankhor's face takes double and a broken fist brings
 *      his head down to sword height; Ignivor's plates are armour and only his
 *      head counts; Vesperon comes down after every dive and lands on his face
 *      when the dive is parried.
 *
 * And then that each of them can be finished, and what that gives.
 *
 * Usage: node tools/verify-bosses.mjs
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
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
const base = `http://127.0.0.1:${server.address().port}/`;

/** A fresh page for each boss: nothing one fight does leaks into the next. */
async function stage(kind) {
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => window.loop.stop());
  // Shared helpers, installed once per page.
  await page.evaluate((kind) => {
    const g = window.game;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    const h = {};
    h.tick = (actions = {}) => {
      for (const [a, v] of Object.entries({
        left: false,
        right: false,
        jump: false,
        attack: false,
        parry: false,
        dash: false,
        confirm: false,
        ...actions,
      })) {
        input.forceDown(a, v);
      }
      g.update(1 / 60, input);
      g.render(ctx);
    };
    h.arena = g.level.arenas.find((a) =>
      g.level.spawns.some((s) => s.kind === kind && s.tx * 32 >= a.left && s.tx * 32 < a.right),
    );
    h.find = () => g.enemies.find((e) => e.kind === kind && !e.dead);
    h.wake = () => {
      g.warpTo(h.arena.entryTx + 3);
      for (let f = 0; f < 60 * 6 && !(h.arena.fighting && h.find()?.state !== 'intro'); f++) {
        g.player.hp = g.player.maxHp;
        h.tick({ right: f < 40 });
      }
      return h.find();
    };
    /** Holds the hero where he is, alive, and counts what reaches him. */
    h.hits = 0;
    /** What the boss was doing each time something got through, by state. */
    h.why = {};
    h.watchHp = () => {
      const p = g.player;
      if (p.hp < p.maxHp) {
        const lost = p.maxHp - p.hp;
        h.hits += lost;
        const state = h.find()?.state ?? 'none';
        h.why[state] = (h.why[state] ?? 0) + lost;
        p.hp = p.maxHp;
      }
      p.dead = false;
    };
    /**
     * What a frame of the fight costs, update and draw together, with the hero
     * swinging at it - the draw is the expensive half of these three.
     */
    h.measure = (seconds) => {
      const times = [];
      for (let f = 0; f < 60 * seconds; f++) {
        const boss = h.find();
        const dx = boss ? boss.cx - g.player.cx : 0;
        const t0 = performance.now();
        h.tick({ attack: f % 20 < 3, right: dx > 90, left: dx < -90 });
        times.push(performance.now() - t0);
        h.watchHp();
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      return { mean: +mean.toFixed(2), p99: +times[Math.floor(times.length * 0.99)].toFixed(2) };
    };
    window.__h = h;
  }, kind);
}

const results = {};

/* ------------------------------------------------------------------ Ankhor */

await stage('colossus');
results.colossus = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Ankhor' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };

  // 1. Every move, from three places in the court.
  const seen = new Set();
  const winds = { slam: [], sweep: [], beam: [] };
  const tracking = new Map();
  const prev = new Map();
  const standAt = (x, seconds, dodge) => {
    h.hits = 0;
    for (let f = 0; f < 60 * seconds; f++) {
      const actions = {};
      if (dodge) {
        // Read the tells: out from under a locked fist, over a sweeping
        // hand, away from the sun.
        for (const hand of boss.hands) {
          if ((hand.state === 'track' && hand.timer < 0.25) || hand.state === 'drop') {
            if (Math.abs(hand.x - p.cx) < 70) actions[hand.x > p.cx ? 'left' : 'right'] = true;
          }
          if (hand.state === 'sweep' && Math.abs(hand.x - p.cx) < 150 && Math.sign(p.cx - hand.x) === hand.dir) {
            actions.jump = true;
          }
        }
        if (boss.beam && boss.beam.stage !== 'fade' && Math.abs(boss.beam.x - p.cx) < 110) {
          actions[boss.beam.x > p.cx ? 'left' : 'right'] = true;
        }
        if (!actions.left && !actions.right) {
          // Drift back to the post.
          if (p.cx < x - 30) actions.right = true;
          else if (p.cx > x + 30) actions.left = true;
        }
      } else {
        p.x = x - p.w / 2;
        p.vx = 0;
      }
      h.tick(actions);
      h.watchHp();
      seen.add(boss.state);
      for (const [i, hand] of boss.hands.entries()) {
        seen.add(`hand:${hand.state}`);
        const key = `${i}`;
        // Only a wind-up seen from its first frame counts: one already under
        // way when a run starts would measure short.
        const was = prev.get(key);
        prev.set(key, hand.state);
        if (hand.state === 'track' && was === 'lift') tracking.set(key, g.time);
        if (hand.state === 'sweepWind' && was !== undefined && was !== 'sweepWind') tracking.set(`s${key}`, g.time);
        if (hand.state === 'drop' && tracking.has(key)) {
          winds.slam.push(+(g.time - tracking.get(key)).toFixed(2));
          tracking.delete(key);
        }
        if (hand.state === 'sweep' && tracking.has(`s${key}`)) {
          winds.sweep.push(+(g.time - tracking.get(`s${key}`)).toFixed(2));
          tracking.delete(`s${key}`);
        }
      }
      if (boss.beam) {
        seen.add(`beam:${boss.beam.stage}`);
        if (boss.beam.stage === 'mark' && boss.beam.t < 0.02) tracking.set('b', g.time);
        if (boss.beam.stage === 'burn' && tracking.has('b')) {
          winds.beam.push(+(g.time - tracking.get('b')).toFixed(2));
          tracking.delete('b');
        }
      }
    }
    return h.hits;
  };
  const mid = (h.arena.left + h.arena.right) / 2;
  const standing = [standAt(mid - 300, 20, false), standAt(mid + 80, 20, false), standAt(mid + 330, 20, false)];
  const dodging = [standAt(mid - 300, 20, true), standAt(mid + 80, 20, true), standAt(mid + 330, 20, true)];
  // Second half: both fists.
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.enterPhaseTwo(g);
  let doubles = 0;
  for (let f = 0; f < 60 * 30; f++) {
    p.x = mid - 200;
    h.tick();
    h.watchHp();
    const up = boss.hands.filter((q) => q.state === 'lift' || q.state === 'track').length;
    if (up === 2) doubles++;
  }
  out.moves = [...seen].sort();
  out.winds = {
    slamMin: Math.min(...winds.slam),
    sweepMin: Math.min(...winds.sweep),
    beamMin: Math.min(...winds.beam),
    slams: winds.slam,
    sweeps: winds.sweep,
    beams: winds.beam,
  };
  out.hitsStanding = standing.reduce((a, b) => a + b, 0);
  out.hitsDodging = dodging.reduce((a, b) => a + b, 0);
  out.doubleFists = doubles > 0;

  // 3. The face takes double; a fist takes its share and then breaks.
  boss.state = 'idle';
  boss.timer = 99;
  boss.poiseLock = 0;
  boss.beam = null;
  for (const hand of boss.hands) {
    hand.state = 'hover';
    hand.crack = boss.poiseMax;
  }
  for (let f = 0; f < 30; f++) h.tick();
  const head = boss.headRect();
  let before = boss.hp;
  boss.overlaps(head);
  boss.hurt(1, 1, g);
  out.headTakes = before - boss.hp;
  const hand = boss.hands[0];
  const handBox = boss.handRect(hand);
  before = boss.hp;
  boss.overlaps(handBox);
  boss.hurt(1, 1, g);
  out.handTakes = before - boss.hp;
  for (let i = 0; i < 20 && hand.state !== 'broken'; i++) {
    boss.overlaps(boss.handRect(hand));
    boss.hurt(1, 1, g);
  }
  for (let f = 0; f < 50; f++) h.tick();
  const low = boss.headRect();
  out.shatter = {
    broken: hand.state === 'broken',
    slumped: boss.state === 'slumped',
    headBottomAboveFloor: Math.round(boss.floorY - (low.y + low.h)),
    headTopAboveFloor: Math.round(boss.floorY - low.y),
  };
  // A hero on the floor, swinging, reaches the sagging head.
  p.x = boss.headX - 40 - p.w;
  p.y = boss.floorY - p.h - 1;
  p.facing = 1;
  out.shatter.swordReaches = boss.overlaps(p.swordRect());
  for (let f = 0; f < 60 * 8; f++) {
    h.tick();
    h.watchHp();
  }
  out.shatter.reformed = hand.state !== 'broken' && hand.state !== 'reform';
  out.shatter.upAgain = boss.state !== 'slumped';

  // 4. The end.
  p.hp = 2;
  boss.overlaps(boss.headRect());
  boss.hurt(999, 1, g);
  let felled = false;
  for (let f = 0; f < 60 * 4; f++) {
    h.tick();
    if (!h.find()) felled = true;
  }
  out.end = { felled, healed: p.hp === p.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
  return out;
});

/* ----------------------------------------------------------------- Ignivor */

await stage('wyrm');
results.wyrm = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Ignivor' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };
  const mid = (h.arena.left + h.arena.right) / 2;

  const seen = new Set();
  let locks = [];
  let lockStart = -1;
  const fight = (seconds, dodge) => {
    h.hits = 0;
    const post = mid - 150;
    for (let f = 0; f < 60 * seconds; f++) {
      const actions = {};
      if (dodge) {
        // Clear of him while he is up, too - walking back to the post under a
        // wyrm still coming down is walking into him.
        if (boss.state === 'breach' && Math.abs(boss.hx - p.cx) < 120) actions[boss.hx > p.cx ? 'left' : 'right'] = true;
        const lockedUnder = boss.state === 'hunt' && boss.timer < 0.4;
        const glowing = boss.state === 'hunt' && Math.abs(boss.hx - p.cx) < 80;
        if (lockedUnder && Math.abs(boss.hx - p.cx) < 90) actions[boss.hx > p.cx ? 'left' : 'right'] = true;
        else if (glowing && !actions.left && !actions.right) actions[p.cx < mid ? 'right' : 'left'] = true;
        // A wave coming: up on the nearest ledge. Stand on it by placement -
        // the climb itself is verify:level's business.
        if (boss.state === 'waveWind' || boss.state === 'wave') {
          const ledge = g.level;
          void ledge;
          p.x = h.ledgeX - p.w / 2;
          p.y = h.ledgeY - p.h - 1;
          p.vy = 0;
        } else if (!actions.left && !actions.right && boss.state !== 'breach') {
          if (p.cx < post - 40) actions.right = true;
          else if (p.cx > post + 40) actions.left = true;
        }
        // Spat at: the clots are aimed at where he stood, so he leaves it -
        // away from the wall behind him, a good step past the spread.
        if (boss.state === 'spitWind' || boss.state === 'rise') h.spitFrom = null;
        if (boss.state === 'exposed' && h.spitFrom === null) {
          h.spitFrom = p.cx;
          h.spitDir = p.cx - h.arena.left < 200 ? 1 : h.arena.right - p.cx < 200 ? -1 : Math.sign(p.cx - boss.hx) || 1;
        }
        if (boss.state === 'exposed' && h.spitFrom !== null && Math.abs(p.cx - h.spitFrom) < 140) {
          actions.left = h.spitDir < 0;
          actions.right = h.spitDir > 0;
        }
        // And not back into a burning pool on the way to the post.
        for (const pool of boss.pools) {
          if (Math.abs(pool.x - p.cx) < 50 && p.onGround) {
            actions.left = pool.x > p.cx;
            actions.right = pool.x <= p.cx;
          }
        }
      } else {
        p.x = post - p.w / 2;
        p.vx = 0;
      }
      h.tick(actions);
      h.watchHp();
      seen.add(boss.state);
      if (boss.state === 'hunt' && boss.timer < 0.4 && lockStart < 0) lockStart = g.time;
      if (boss.state === 'breach' && lockStart >= 0) {
        locks.push(+(g.time - lockStart).toFixed(2));
        lockStart = -1;
      }
    }
    return h.hits;
  };
  // The high ledge nearest the middle, for the dodger to stand on.
  const L = g.level;
  let best = null;
  for (let tx = Math.floor(h.arena.left / 32); tx < Math.floor(h.arena.right / 32); tx++) {
    for (let ty = 2; ty < 17; ty++) {
      if (L.platformAt(tx, ty) && (!best || ty < best.ty || (ty === best.ty && Math.abs(tx * 32 - mid) < Math.abs(best.tx * 32 - mid)))) {
        best = { tx, ty };
      }
    }
  }
  h.ledgeX = best.tx * 32 + 16;
  h.ledgeY = best.ty * 32;
  h.spitFrom = null;
  out.hitsStanding = fight(45, false);
  h.why = {};
  out.hitsDodging = fight(45, true);
  out.dodgerHitDuring = { ...h.why };
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  out.hitsStandingPhase2 = fight(25, false);
  out.moves = [...seen].sort();
  out.lockMin = Math.min(...locks);
  out.breaches = locks.length;

  // The wave, twice: once on the floor, once on the ledge.
  const wave = (onLedge) => {
    boss.state = 'waveEdge';
    boss.waveDir = 1;
    boss.pillars.length = 0;
    g.projectiles.length = 0;
    let hits = 0;
    for (let f = 0; f < 60 * 7 && !(boss.state === 'idle' && f > 60); f++) {
      if (onLedge) {
        p.x = h.ledgeX - p.w / 2;
        p.y = h.ledgeY - p.h - 1;
        p.vy = 0;
      } else {
        p.x = mid - p.w / 2;
      }
      const before = p.hp;
      h.tick();
      if (p.hp < before) hits += before - p.hp;
      p.hp = p.maxHp;
      p.invuln = 0;
    }
    return hits;
  };
  out.waveOnFloor = wave(false);
  out.waveOnLedge = wave(true);

  // Armour and head.
  boss.state = 'exposed';
  boss.timer = 99;
  boss.hx = mid;
  boss.hy = boss.floorY - 100;
  for (let f = 0; f < 40; f++) {
    boss.timer = 99;
    h.tick();
  }
  let before = boss.hp;
  const seg = boss.segs.find((s) => s.y < boss.floorY - 30 && Math.hypot(s.x - boss.hx, s.y - boss.hy) > 60);
  if (seg) {
    boss.overlaps({ x: seg.x - 4, y: seg.y - 4, w: 8, h: 8 });
    boss.hurt(3, 1, g);
  }
  out.bodyTakes = seg ? before - boss.hp : null;
  before = boss.hp;
  boss.overlaps(boss.headRect());
  boss.hurt(1, 1, g);
  out.headTakes = before - boss.hp;
  boss.poiseLock = 0;
  for (let i = 0; i < 20 && boss.state !== 'stunned'; i++) {
    boss.overlaps(boss.headRect());
    boss.hurt(1, 1, g);
  }
  out.knockedDown = boss.state === 'stunned';
  for (let f = 0; f < 30; f++) h.tick();
  out.headOnFloor = Math.round(boss.floorY - boss.hy);

  // The end.
  boss.overlaps(boss.headRect());
  boss.hurt(999, 1, g);
  p.hp = 2;
  let felled = false;
  for (let f = 0; f < 60 * 4; f++) {
    h.tick();
    if (!h.find()) felled = true;
  }
  out.end = { felled, healed: p.hp === p.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
  return out;
});

/* ---------------------------------------------------------------- Vesperon */

await stage('vesper');
results.vesper = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Vesperon' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };
  const mid = (h.arena.left + h.arena.right) / 2;
  const seen = new Set();
  const winds = [];
  const grounded = [];
  let windStart = -1;
  let groundStart = -1;
  let maxBats = 0;
  const fight = (seconds, dodge) => {
    h.hits = 0;
    const post = mid - 120;
    for (let f = 0; f < 60 * seconds; f++) {
      const actions = {};
      if (dodge) {
        // Off the line of a locked dive, and a roll through a crescent.
        if (boss.state === 'diveWind' && boss.timer < 0.3 && Math.abs(boss.target.x - p.cx) < 90) {
          actions[boss.target.x > p.cx ? 'left' : 'right'] = true;
        }
        for (const q of g.projectiles) {
          if (!q.friendly && q.kind === 'blood' && Math.hypot(q.cx - p.cx, q.cy - p.cy) < 90) actions.dash = true;
        }
        for (const m of boss.marks) if (Math.abs(m.x - p.cx) < 36 && m.t > 0.3) actions[m.x > p.cx ? 'left' : 'right'] = true;
        // His bats get swatted, the way anyone would.
        const bat = g.enemies.find((e) => e.kind === 'bat' && !e.dead && Math.abs(e.cx - p.cx) < 70 && Math.abs(e.cy - p.cy) < 60);
        if (bat) {
          p.facing = bat.cx > p.cx ? 1 : -1;
          actions.attack = f % 12 < 3;
        }
        if (!actions.left && !actions.right) {
          if (p.cx < post - 40) actions.right = true;
          else if (p.cx > post + 40) actions.left = true;
        }
      } else {
        p.x = post - p.w / 2;
        p.vx = 0;
      }
      h.tick(actions);
      h.watchHp();
      seen.add(boss.state);
      maxBats = Math.max(maxBats, g.enemies.filter((e) => e.kind === 'bat' && !e.dead && e.spawnKey === 'vesper').length);
      // From the first frame of a wind-up only: one already under way when a
      // run starts would measure short.
      if (boss.state === 'diveWind' && h.lastState !== undefined && h.lastState !== 'diveWind') windStart = g.time;
      h.lastState = boss.state;
      if (boss.state === 'dive' && windStart >= 0) {
        winds.push(+(g.time - windStart).toFixed(2));
        windStart = -1;
      }
      if (boss.state === 'grounded' && groundStart < 0) groundStart = g.time;
      if (boss.state !== 'grounded' && groundStart >= 0) {
        grounded.push({ t: +(g.time - groundStart).toFixed(2), onFloor: Math.abs(boss.bottom - boss.floorY) < 60 });
        groundStart = -1;
      }
      if (boss.state === 'grounded') out.groundedBottom = Math.round(boss.floorY - boss.bottom);
    }
    return h.hits;
  };
  out.hitsStanding = fight(40, false);
  h.why = {};
  out.hitsDodging = fight(40, true);
  out.dodgerHitDuring = { ...h.why };
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  fight(40, false);
  out.moves = [...seen].sort();
  out.diveWindMin = Math.min(...winds);
  out.dives = winds.length;
  // Of the plain dives - in his second half the first of a pair is short.
  out.groundedMax = Math.max(...grounded.map((q) => q.t));
  out.groundedOnFloor = grounded.every((q) => q.onFloor);
  out.maxBats = maxBats;

  // A parried dive.
  for (const e of g.enemies) if (e.kind === 'bat') e.dead = true;
  g.projectiles.length = 0;
  boss.poiseLock = 0;
  boss.state = 'hover';
  boss.timer = 99;
  for (let f = 0; f < 30; f++) {
    boss.timer = 99;
    h.tick();
  }
  p.x = mid - p.w / 2;
  p.y = boss.floorY - p.h - 1;
  boss.beginDive(p.cx, 0.6);
  let parried = false;
  for (let f = 0; f < 60 * 3 && boss.state !== 'stunned' && boss.state !== 'fall'; f++) {
    p.x = mid - p.w / 2;
    p.vx = 0;
    p.hp = p.maxHp;
    p.invuln = 0;
    const near = boss.state === 'dive' && Math.hypot(boss.cx - p.cx, boss.cy - p.cy) < 150;
    if (near) p.facing = boss.cx > p.cx ? 1 : -1;
    h.tick({ parry: near && !parried });
    if (near) parried = true;
  }
  for (let f = 0; f < 60; f++) h.tick();
  out.parryDive = { state: boss.state, onFloor: Math.abs(boss.bottom - boss.floorY) < 4 };

  // The end.
  boss.state = 'stunned';
  boss.timer = 5;
  boss.hurt(999, 1, g);
  p.hp = 2;
  let felled = false;
  for (let f = 0; f < 60 * 4; f++) {
    h.tick();
    if (!h.find()) felled = true;
  }
  out.end = { felled, healed: p.hp === p.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
  return out;
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

const c = results.colossus;
const w = results.wyrm;
const v = results.vesper;
const has = (list, ...names) => names.every((n) => list?.includes(n));
const checks = [
  ['Ankhor wakes and his court closes', c.engaged && c.sealed],
  ['Ankhor costs less than a frame to fight', c.frame.p99 < 16.67],
  ['Ankhor slams, sweeps and calls the sun', has(c.moves, 'hand:drop', 'hand:sweep', 'beam:burn')],
  [
    'Ankhor announces every move for half a second',
    c.winds.slams.length > 0 && c.winds.slamMin >= 0.5 && c.winds.sweepMin >= 0.5 && c.winds.beamMin >= 0.5,
  ],
  ['Ankhor: reading him costs less than half of standing still', c.hitsStanding >= 4 && c.hitsDodging * 2 <= c.hitsStanding],
  ['Ankhor brings both fists in his second half', c.doubleFists],
  ['Ankhor: the face takes double, a fist single', c.headTakes === 2 && c.handTakes === 1],
  ['Ankhor sags when a fist breaks, head at sword height', c.shatter.broken && c.shatter.slumped && c.shatter.swordReaches],
  ['Ankhor reforms the fist and stands up again', c.shatter.reformed && c.shatter.upAgain],
  ['Ankhor falls, heals the hero, opens the wards', c.end.felled && c.end.healed && c.end.cleared && c.end.banner.includes('ANKHOR')],
  ['Ignivor wakes and his chamber closes', w.engaged && w.sealed],
  ['Ignivor costs less than a frame to fight', w.frame.p99 < 16.67],
  ['Ignivor hunts, breaches, spits and burns the floor', has(w.moves, 'hunt', 'breach', 'spitWind', 'exposed', 'wave')],
  ['Ignivor holds still under the hero before he breaks through', w.breaches > 0 && w.lockMin >= 0.3],
  ['Ignivor: reading him costs less than half of standing still', w.hitsStanding >= 4 && w.hitsDodging * 2 <= w.hitsStanding],
  ['Ignivor: the fire wave hurts on the floor and not on a ledge', w.waveOnFloor > 0 && w.waveOnLedge === 0],
  ['Ignivor: plates are armour, the head is not', w.bodyTakes === 0 && w.headTakes === 1],
  ['Ignivor comes down stunned with his head on the floor', w.knockedDown && w.headOnFloor < 50],
  ['Ignivor falls, heals the hero, opens the wards', w.end.felled && w.end.healed && w.end.cleared && w.end.banner.includes('IGNIVOR')],
  ['Vesperon wakes and his roof closes', v.engaged && v.sealed],
  ['Vesperon costs less than a frame to fight', v.frame.p99 < 16.67],
  ['Vesperon dives, throws, calls bats and the blood moon', has(v.moves, 'diveWind', 'dive', 'grounded', 'slashWind', 'swarmWind', 'moon')],
  ['Vesperon marks every dive for half a second', v.dives > 0 && v.diveWindMin >= 0.5],
  ['Vesperon lands in reach after a dive, for a second', v.groundedMax >= 1 && v.groundedOnFloor],
  ['Vesperon: reading him costs less than half of standing still', v.hitsStanding >= 4 && v.hitsDodging * 2 <= v.hitsStanding],
  ['Vesperon never has more than four bats', v.maxBats <= 4],
  ['Vesperon: a parried dive puts him on the roof', (v.parryDive.state === 'stunned' || v.parryDive.state === 'fall') && v.parryDive.onFloor],
  ['Vesperon falls, heals the hero, opens the wards', v.end.felled && v.end.healed && v.end.cleared && v.end.banner.includes('VESPERON')],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}`);
}
if (failed) {
  console.error(`FAIL: ${failed} of ${checks.length} checks.`);
  process.exit(1);
}
console.log(`OK: all ${checks.length} checks - three new bosses, every move announced, every rule holding, every one of them finishable.`);
