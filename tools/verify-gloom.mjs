/**
 * Nyktos, der Lichtfresser, in the dark grotto behind the cave mouth - the
 * sixth boss of the road, and the one whose rule is the light:
 *
 *   Im Licht ist er Fleisch. In the dark he is smoke and a blade goes through
 *   him; whenever his centre is inside the light of a lit crystal he is flesh.
 *   The four crystals of the grotto are dark until the hero strikes one. Lit,
 *   it draws him: he comes down onto it and eats - the window - and enough
 *   damage in one meal blinds him on the floor, GEBLENDET, with the crystal
 *   still lit. In the dark he reaches for the hero with a pool (Schattengriff)
 *   and a wave along the floor that puts out every lit floor crystal it passes
 *   (Finsterwelle); in his second half three orbs drift at the hero and at the
 *   light.
 *
 * Pinned on the same questions as verify-boar.mjs: does he do everything he
 * is supposed to (every move, in both halves, each warning measured from the
 * first frame of its wind-up, each window from the moment he is in reach); is
 * it fair (nothing that stands still hurts, a hero who reads him - 0.3 s late,
 * swinging only from the floor, jumping only to dodge - fells him in the
 * middle band for less than half of what standing still costs); and does his
 * rule hold, both ways, measured with real swings. Then that he can be
 * finished, and that he leaves the Lichtkern and the Irrlichter.
 *
 * The hero carries what the road has given him by then, from the shared bench
 * (balance/harness.mjs), and the reader is the one in balance/readers/gloom.mjs.
 *
 * Usage: node tools/verify-gloom.mjs   (after npm run build)
 */
import path from 'node:path';
import { open, stage, useReader } from './balance/harness.mjs';
import reader from './balance/readers/gloom.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const bench = await open(path.join(ROOT, 'dist'));
const { page, errors } = bench;

/** A fresh page for each part: the road's relics, the reader, and the helpers below. */
async function fresh() {
  await stage(bench, 'gloom');
  await useReader(page, reader);
  await page.evaluate(() => {
    const g = window.game;
    const h = window.__bal;
    const p = g.player;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    const G = { floor: h.room.floor };
    /** One frame, drawn: for what has to cost a frame. */
    G.step = (actions = {}) => {
      for (const k of ['left', 'right', 'down', 'jump', 'attack', 'parry', 'dash', 'skill', 'confirm']) input.forceDown(k, !!actions[k]);
      g.update(1 / 60, input);
      g.render(ctx);
    };
    G.keep = () => {
      p.hp = p.maxHp;
      p.dead = false;
      if (g.state === 'dead') g.state = 'playing';
      g.dialogue = null;
    };
    /** His four crystals by name: A and B on the floor, C and D on the ledges, left to right. */
    G.crystals = (b) => {
      const floor = b.crystals.filter((c) => !c.ledge);
      const ledge = b.crystals.filter((c) => c.ledge);
      return { A: floor[0], B: floor[1], C: ledge[0], D: ledge[1] };
    };
    /** Nothing of his left out, every crystal dark, the hero whole and still. */
    G.clear = (b) => {
      g.projectiles.length = 0;
      b.pool = null;
      b.waves.length = 0;
      b.orbs.length = 0;
      for (const c of b.crystals) {
        c.lit = 0;
        c.age = 0;
        c.spent = 0;
        c.eaten = false;
      }
      b.sated = 0;
      b.fear = 0;
      b.fury = false;
      b.chain = 0;
      b.target = -1;
      p.hp = p.maxHp;
      p.invuln = 0;
      p.vx = 0;
      p.vy = 0;
    };
    /** Him held where a test wants him, in a state that does nothing on its own. */
    G.hold = (b, state, x, bottom = G.floor) => {
      b.state = state;
      b.timer = 99;
      b.x = x - b.w / 2;
      b.y = bottom - b.h;
      b.vx = 0;
      b.vy = 0;
    };
    G.hero = (x, facing = 1) => {
      p.x = x - p.w / 2;
      p.y = G.floor - p.h - 0.5;
      p.vx = 0;
      p.vy = 0;
      p.facing = facing;
    };
    /**
     * Real swings, from the floor, from beside him: the hero 46 px to his left
     * and facing him, while he sits low over the floor where a blade reaches
     * him. What it took off him, and whether he said why it took nothing.
     */
    G.swingAt = (b, x, frames) => {
      const before = b.hp;
      let said = false;
      let solid = false;
      for (let f = 0; f < frames; f++) {
        G.hold(b, 'sag', x);
        G.hero(x - 46, 1);
        G.step({ attack: f % 8 < 2 });
        G.keep();
        solid = solid || b.solid;
        if (g.particles.texts.some((t) => t.text === 'NUR IM LICHT!')) said = true;
      }
      return { took: before - b.hp, said, solid };
    };
    window.__g = G;
  });
}

const results = {};

/* -------------------------------------- awake, his moves, his tells, his windows */

await fresh();
results.main = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const G = window.__g;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Nyktos' };
  const out = { engaged: b.engaged, sealed: h.arena.fighting, barName: b.barName(), maxHp: b.maxHp, poise: b.poiseMax, hearts: p.maxHp };
  out.crystals = b.crystals.map((c) => ({ x: c.x, surface: c.surface, ledge: c.ledge }));
  out.width = h.arena.right - h.arena.left;

  /*
   * What a frame of the fight costs, update and draw together, with the hero
   * swinging at him and two crystals burning. Whole before every frame: a
   * measure, not a fight.
   */
  const { A, B } = G.crystals(b);
  A.lit = 99;
  B.lit = 99;
  const times = [];
  for (let f = 0; f < 60 * 15; f++) {
    b.hp = b.maxHp;
    const dx = b.cx - p.cx;
    const t0 = performance.now();
    G.step({ attack: f % 20 < 3, right: dx > 90, left: dx < -90 });
    times.push(performance.now() - t0);
    h.watchHp(b);
  }
  times.sort((x, y) => x - y);
  out.frame = { mean: +(times.reduce((s, t) => s + t, 0) / times.length).toFixed(2), p99: +times[Math.floor(times.length * 0.99)].toFixed(2) };
  G.clear(b);

  /*
   * Every move, from the first frame of its wind-up, with the reader playing.
   * He is kept whole in his first half until everything there has been seen,
   * then held below half until the second half has shown its own.
   */
  const act = window.__makeReader(g, h);
  const seen = new Set();
  const tells = { grip: [], hold: [], rise: [], gather: [], swipe: [] };
  const windows = { eat: [], blinded: [] };
  let prev = b.state;
  let poolAt = null;
  let poolHeld = null;
  let since = g.time;
  let open = 0;
  let wavesBefore = 0;
  let orbsBefore = 0;
  let swungBefore = false;
  let riseAt = null;
  let gatherAt = null;
  const watch = (half) => {
    const s = b.state;
    const tag = (m) => seen.add(`${half}:${m}`);
    if (s !== prev) {
      if ((prev === 'eat' || prev === 'blinded') && open > 0) windows[prev].push(+(open / 60).toFixed(2));
      open = 0;
      since = g.time;
      prev = s;
      if (['seek', 'swipe', 'eat', 'blinded', 'rise', 'gather', 'grip'].includes(s)) tag(s);
    }
    // A window counts from the moment a blade from the floor reaches him: flesh, and low.
    if ((s === 'eat' || s === 'blinded') && b.solid && b.bottom > G.floor - 30) open++;
    if (b.pool && !poolAt) {
      poolAt = { at: g.time, pool: b.pool };
      poolHeld = null;
    }
    if (poolAt && b.pool === poolAt.pool) {
      const p0 = b.pool;
      if (p0.t >= 0.6 && poolHeld === null) poolHeld = g.time;
      if (b.clawsUp(p0) > 0 && poolAt.at !== null) {
        tells.grip.push(+(g.time - poolAt.at).toFixed(3));
        if (poolHeld !== null) tells.hold.push(+(g.time - poolHeld).toFixed(3));
        poolAt.at = null;
        tag('claws');
      }
    }
    if (!b.pool) poolAt = null;
    if (b.waves.length > wavesBefore) {
      tag('waves');
      // The rise and the slam it came out of: measured from the first frame of the rise.
      if (riseAt !== null) tells.rise.push(+(g.time - riseAt).toFixed(3));
      riseAt = null;
    }
    if (s === 'rise' && riseAt === null) riseAt = g.time;
    wavesBefore = b.waves.length;
    if (b.orbs.length > orbsBefore) {
      tag('orbs');
      if (gatherAt !== null) tells.gather.push(+(g.time - gatherAt).toFixed(3));
      gatherAt = null;
    }
    if (s === 'gather' && gatherAt === null) gatherAt = g.time;
    orbsBefore = b.orbs.length;
    if (s === 'swipe' && b.swung && !swungBefore) tells.swipe.push(+(g.time - since).toFixed(3));
    swungBefore = s === 'swipe' && b.swung;
  };
  const first = ['1:grip', '1:claws', '1:rise', '1:waves', '1:seek', '1:eat', '1:blinded'];
  h.hits = 0;
  let f = 0;
  for (; f < 60 * 150 && !first.every((m) => seen.has(m)); f++) {
    b.hp = b.maxHp;
    h.tick(act(b));
    h.watchHp(b);
    watch(1);
  }
  out.firstSeconds = +(f / 60).toFixed(1);
  b.hp = Math.floor(b.maxHp * 0.45);
  b.phaseTwo = true;
  const second = ['2:gather', '2:orbs', '2:grip', '2:claws', '2:rise', '2:waves', '2:eat', '2:blinded'];
  for (f = 0; f < 60 * 150 && !second.every((m) => seen.has(m)); f++) {
    // Below half, and never so low that a blinding finishes him.
    if (b.hp > Math.floor(b.maxHp * 0.45) || b.hp < 22) b.hp = Math.floor(b.maxHp * 0.45);
    h.tick(act(b));
    h.watchHp(b);
    watch(2);
  }
  out.secondSeconds = +(f / 60).toFixed(1);
  out.readerHits = h.hits;
  out.moves = [...seen].sort();
  const sum = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { n: v.length, min: v.length ? Math.min(...v) : null }]));
  out.tells = sum(tells);
  out.windows = sum(windows);
  return out;
});

/* ---------------------------------------------------- the rule, both ways */

await fresh();
results.rule = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const G = window.__g;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Nyktos' };
  const out = {};
  G.clear(b);
  b.poiseLock = 999;
  const { A } = G.crystals(b);
  // In the dark, low over the floor, the hero at his side and his own glow on
  // him: two seconds of real swings.
  out.dark = G.swingAt(b, A.x + 300, 120);
  // The same, a crystal lit beside him.
  G.clear(b);
  A.lit = 99;
  b.sated = 99;
  out.light = G.swingAt(b, A.x + 50, 120);
  // His centre decides: just inside the edge of the light, and just outside it.
  b.hp = b.maxHp;
  out.inside = G.swingAt(b, A.x + 104, 30);
  b.hp = b.maxHp;
  out.outside = G.swingAt(b, A.x + 118, 30);
  out.edge = { inside: Math.round(Math.hypot(104, b.bottom - 32 - (A.surface - 18))), outside: Math.round(Math.hypot(118, b.bottom - 32 - (A.surface - 18))) };
  out.announced = g.zoneBanner?.text ?? null;
  /*
   * What is thrown obeys it too: the heavy strike's quake (the Bebenfaust),
   * loosed from too far off for the blade itself to reach him. In the dark it
   * goes through him and on; in the light it lands.
   */
  const quake = (x) => {
    b.hp = b.maxHp;
    let through = false;
    let furthest = null;
    let loosed = false;
    for (let f = 0; f < 150; f++) {
      G.hold(b, 'sag', x);
      b.facing = 1;
      if (f === 0) G.hero(x - 110, 1);
      // Held until the strike is ready, then let go.
      if (p.chargeReady) loosed = true;
      G.step({ attack: !loosed });
      G.keep();
      for (const q of g.projectiles) {
        if (q.kind !== 'quake' || !q.friendly || q.dead) continue;
        furthest = Math.max(furthest ?? -Infinity, Math.round(q.cx - x));
        // Past the middle of him and still going.
        if (q.cx > x + 10) through = true;
      }
    }
    return { took: b.maxHp - b.hp, through, furthest };
  };
  G.clear(b);
  out.quakeDark = quake(A.x + 300);
  G.clear(b);
  A.lit = 99;
  b.sated = 99;
  out.quakeLight = quake(A.x + 50);
  return out;
});

/* ----------------------------- the crystals: struck, eaten, blinding, the waves */

await fresh();
results.crystal = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const G = window.__g;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Nyktos' };
  const out = {};
  const { A, C } = G.crystals(b);
  const indexOf = (c) => b.crystals.indexOf(c);

  // A real swing on a dark crystal lights it; then he comes for it, after it
  // has shone a while, and eats it - in its light, so flesh.
  G.clear(b);
  for (let f = 0; f < 30; f++) {
    G.hold(b, 'drift', A.x + 320, G.floor - 80);
    G.hero(A.x - 26, 1);
    G.step();
  }
  b.timer = 0.6;
  let f = 0;
  for (; f < 60 && A.lit <= 0; f++) {
    G.hero(A.x - 26, 1);
    G.step({ attack: f % 8 < 2 });
  }
  out.litByBlade = A.lit > 0;
  const litAt = g.time;
  let seekAt = null;
  let eatAt = null;
  let target = null;
  let solidEating = true;
  for (f = 0; f < 60 * 5 && b.state !== 'eat'; f++) {
    G.step({ left: p.cx > A.x - 80 });
    G.keep();
    if (b.state === 'seek' && seekAt === null) {
      seekAt = g.time;
      target = b.target;
    }
  }
  if (b.state === 'eat') eatAt = g.time;
  out.seek = { delay: seekAt === null ? null : +(seekAt - litAt).toFixed(2), wentForIt: target === indexOf(A), ate: b.state === 'eat' && b.target === indexOf(A), at: Math.round(b.cx - A.x) };
  // The meal, untouched: then the crystal is dark, and empty a while.
  for (f = 0; f < 60 * 4 && b.state === 'eat'; f++) {
    solidEating = solidEating && b.solid;
    G.step();
    G.keep();
  }
  out.meal = { solid: solidEating, seconds: +(f / 60).toFixed(2), after: b.state, lit: A.lit, spent: A.spent > 0 };
  // An emptied crystal will not light straight away.
  for (f = 0; f < 30; f++) {
    G.hero(A.x - 26, 1);
    G.step({ attack: f % 8 < 2 });
    G.keep();
  }
  out.meal.relitAtOnce = A.lit > 0;

  // Blinding: one blow short of his poise in a meal, and he eats on; one more
  // and he is down, GEBLENDET, flesh on the floor, the crystal still lit.
  G.clear(b);
  b.poiseLock = 0;
  A.lit = 6;
  A.age = 5;
  for (f = 0; f < 60 * 5 && b.state !== 'eat'; f++) {
    G.hero(A.x - 150, 1);
    G.step();
    G.keep();
  }
  for (f = 0; f < 18; f++) G.step();
  const short = b.poiseMax - 1;
  for (let i = 0; i < short; i++) b.hurt(1, 1, g);
  out.blind = { poise: b.poiseMax, afterShort: b.state };
  b.hurt(1, 1, g);
  out.blind.afterFull = b.state;
  out.blind.lit = A.lit > 0;
  out.blind.said = g.particles.texts.some((t) => t.text === 'GEBLENDET!');
  let down = 0;
  let solidDown = true;
  for (f = 0; f < 60 * 4 && b.state === 'blinded'; f++) {
    solidDown = solidDown && b.solid;
    if (b.bottom > G.floor - 30) down++;
    G.step();
    G.keep();
  }
  out.blind.seconds = +(f / 60).toFixed(2);
  out.blind.onFloor = +(down / 60).toFixed(2);
  out.blind.solid = solidDown;

  // The wave: a lit floor crystal goes out when it passes, a lit ledge crystal
  // above it does not.
  G.clear(b);
  b.sated = 99;
  A.lit = 99;
  C.lit = 99;
  G.hero(A.x - 180, 1);
  G.hold(b, 'drift', A.x + 320, G.floor - 80);
  for (f = 0; f < 10; f++) {
    G.hold(b, 'drift', A.x + 320, G.floor - 80);
    G.step();
    G.keep();
  }
  b.beginRise();
  for (f = 0; f < 60 * 4 && (b.state === 'rise' || b.state === 'slam' || b.waves.length); f++) {
    p.invuln = 2;
    G.step();
    G.keep();
  }
  out.wave = { floorOut: A.lit <= 0, ledgeLit: C.lit > 0 };

  // An orb at a lit crystal puts it out.
  G.clear(b);
  b.phaseTwo = true;
  b.sated = 99;
  A.lit = 99;
  G.hero(A.x + 400, -1);
  for (f = 0; f < 10; f++) {
    G.hold(b, 'drift', A.x + 220, G.floor - 90);
    G.step();
    G.keep();
  }
  b.beginGather();
  let orbs = 0;
  for (f = 0; f < 60 * 7 && A.lit > 0; f++) {
    G.hero(A.x + 400, -1);
    p.invuln = 2;
    G.step();
    G.keep();
    orbs = Math.max(orbs, b.orbs.length);
  }
  out.orbAtLight = { orbs, out: A.lit <= 0, seconds: +(f / 60).toFixed(2) };

  // And a swing bats one away: an orb drifting at the hero, met with the blade.
  G.clear(b);
  G.hold(b, 'drift', A.x + 400, G.floor - 90);
  b.timer = 99;
  G.hero(A.x, 1);
  b.orbs.push({ x: A.x + 110, y: p.cy, vx: -125, vy: 0, life: 5, target: -1, batted: 0 });
  let lost = 0;
  let batted = false;
  for (f = 0; f < 60 * 2; f++) {
    G.hold(b, 'drift', A.x + 400, G.floor - 90);
    const o = b.orbs[0];
    const near = o && o.batted <= 0 && o.x - p.cx < 46;
    const before = p.hp;
    G.step({ attack: near && f % 8 < 2 });
    lost += Math.max(0, before - p.hp);
    p.hp = p.maxHp;
    if (b.orbs.some((q) => q.batted > 0)) batted = true;
  }
  out.bat = { batted, lost };
  return out;
});

/* ------------------------------------------ his attacks: read them, or pay */

await fresh();
results.attacks = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const G = window.__g;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Nyktos' };
  const out = {};
  const { A } = G.crystals(b);
  const mid = (h.room.left + h.room.right) / 2;

  /** Schattengriff on a hero in the dark: one who stays, one who walks out of it 0.3 s after it shows. */
  const grip = (mode) => {
    G.clear(b);
    b.sated = 99;
    G.hero(mid, 1);
    for (let f = 0; f < 20; f++) {
      G.hold(b, 'drift', mid + 260, G.floor - 80);
      G.step();
      G.keep();
    }
    b.beginGrip(g);
    let lost = 0;
    let poolSeen = null;
    for (let f = 0; f < 60 * 2; f++) {
      const a = {};
      if (b.pool && poolSeen === null) poolSeen = f;
      if (mode === 'walk' && poolSeen !== null && f - poolSeen >= 18) a.left = true;
      const before = p.hp;
      G.step(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
      if (!b.pool && poolSeen !== null) break;
    }
    return lost;
  };
  out.grip = { stand: grip('stand'), walk: grip('walk') };

  // In the light, no pool: he does not reach into it. Twenty chances to choose.
  G.clear(b);
  A.lit = 99;
  b.sated = 99;
  const picks = {};
  for (let i = 0; i < 20; i++) {
    G.hero(A.x + 70, 1);
    G.hold(b, 'drift', A.x + 330, G.floor - 80);
    b.timer = 0;
    b.pool = null;
    G.step();
    G.keep();
    picks[b.state] = (picks[b.state] ?? 0) + 1;
    b.waves.length = 0;
    b.orbs.length = 0;
  }
  out.inLight = { picks, pools: picks.grip ?? 0 };

  /** The Finsterwelle at a hero on the floor: one who stands, one who jumps it when it is close. */
  const wave = (mode) => {
    G.clear(b);
    b.sated = 99;
    G.hero(mid - 120, 1);
    for (let f = 0; f < 20; f++) {
      G.hold(b, 'drift', mid + 140, G.floor - 80);
      G.step();
      G.keep();
    }
    b.beginRise();
    let lost = 0;
    let hold = 0;
    let jumped = false;
    for (let f = 0; f < 60 * 3; f++) {
      const a = {};
      const w = b.waves.find((q) => q.dir < 0);
      if (mode === 'jump' && w && !jumped && w.x - p.cx < 70 && w.x > p.cx) {
        jumped = true;
        hold = 18;
      }
      if (hold > 0) {
        a.jump = true;
        hold--;
      }
      const before = p.hp;
      G.step(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
      if (b.state !== 'rise' && b.state !== 'slam' && !b.waves.length) break;
    }
    return lost;
  };
  out.wave = { stand: wave('stand'), jump: wave('jump'), height: 22 };

  /**
   * The shove: a hero standing at the crystal when he gets there - 30 px off
   * it - is swiped off it and pushed away; one waiting 80 px off is not
   * swiped at all; one who parries it blinds him.
   */
  const swipe = (mode) => {
    G.clear(b);
    b.poiseLock = 0;
    A.lit = 6;
    A.age = 5;
    const at = mode === 'far' ? A.x + 80 : A.x + 30;
    G.hero(at, -1);
    for (let f = 0; f < 10; f++) {
      G.hold(b, 'drift', A.x + 300, G.floor - 80);
      G.step();
      G.keep();
    }
    b.timer = 0;
    let lost = 0;
    let swiped = false;
    let tell = null;
    let tellFrom = null;
    let parried = false;
    for (let f = 0; f < 60 * 4; f++) {
      const a = {};
      if (b.state === 'swipe') {
        swiped = true;
        if (tellFrom === null) tellFrom = g.time;
        if (b.swung && tell === null) tell = +(g.time - tellFrom).toFixed(3);
        if (mode === 'parry' && !parried && b.timer <= 0.09 && !b.swung) {
          a.parry = true;
          parried = true;
        }
      }
      if (b.state === 'seek' || b.state === 'swipe') p.facing = -1;
      const before = p.hp;
      G.step(a);
      lost += Math.max(0, before - p.hp);
      p.hp = Math.max(p.hp, p.maxHp - 1);
      if (b.state === 'eat' || b.state === 'blinded') break;
    }
    // Where the hero is a moment later, against where he stood.
    for (let f = 0; f < 24; f++) {
      G.step();
      G.keep();
    }
    return { swiped, lost, tell, state: b.state, pushed: Math.round(Math.abs(p.cx - at)) };
  };
  out.swipe = { near: swipe('near'), far: swipe('far'), parry: swipe('parry') };

  /*
   * Nothing that stands still hurts: a hero standing in him while he hangs in
   * the dark, sits spent after a slam, eats, or lies blinded takes nothing.
   */
  out.contact = {};
  for (const st of ['drift', 'sag', 'eat', 'blinded']) {
    G.clear(b);
    b.sated = 99;
    let lost = 0;
    for (let k = 0; k < 60; k++) {
      if (st === 'eat' || st === 'blinded') {
        A.lit = 99;
        A.eaten = st === 'eat';
        b.target = b.crystals.indexOf(A);
        b.lieY = G.floor;
      }
      G.hold(b, st, A.x, st === 'drift' ? G.floor - 20 : G.floor);
      G.hero(A.x, 1);
      const before = p.hp;
      G.step();
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
    }
    out.contact[st] = lost;
  }
  return out;
});

/* ------------------------------------------ a whole fight, as a player reads it */

await fresh();
results.reader = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const G = window.__g;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Nyktos' };
  const act = window.__makeReader(g, h);
  h.hits = 0;
  h.why = {};
  let f = 0;
  let open = 0;
  let blinds = 0;
  let meals = 0;
  let prev = b.state;
  for (; f < 60 * 120; f++) {
    if (b.dead || b.state === 'dying') break;
    if (b.solid && b.bottom > G.floor - 30) open++;
    h.tick(act(b));
    h.watchHp(b);
    if (b.state !== prev) {
      if (b.state === 'blinded') blinds++;
      if (b.state === 'eat') meals++;
      prev = b.state;
    }
  }
  const out = {
    felled: b.state === 'dying' || b.dead,
    seconds: +(f / 60).toFixed(1),
    hits: h.hits,
    why: { ...h.why },
    open: +(open / Math.max(1, f)).toFixed(2),
    meals,
    blinds,
  };
  // Felled, with the hero at two hearts: what the fall does, then the relic and its attack.
  p.hp = 2;
  let felled = false;
  for (let k = 0; k < 60 * 4; k++) {
    G.step();
    if (!h.find()) felled = true;
  }
  const end = { felled, healed: p.hp === p.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
  end.spoke = !!g.dialogue;
  end.speaker = g.dialogue?.speaker ?? null;
  for (let k = 0; k < 60 * 8 && g.dialogue; k++) G.step({ confirm: k % 2 === 0 });
  end.relic = p.relics.has('lichtkern');
  end.skill = p.skills.has('irrlichter');
  end.wardsOpen = !g.level.wardClosed(h.arena.entryTx) && !g.level.wardClosed(h.arena.exitTx);
  out.end = end;
  return out;
});

/* -------------------------------------------------- standing still in it */

await fresh();
results.standing = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Nyktos' };
  const spots = { left: h.room.left + 120, middle: (h.room.left + h.room.right) / 2, right: h.room.right - 120 };
  const out = { seconds: 0, hits: 0, at: {} };
  for (const [name, x] of Object.entries(spots)) {
    h.hits = 0;
    for (let f = 0; f < 60 * 20; f++) {
      b.hp = b.maxHp;
      p.x = x - p.w / 2;
      p.vx = 0;
      h.tick();
      h.watchHp(b);
    }
    out.at[name] = h.hits;
    out.hits += h.hits;
    out.seconds += 20;
  }
  return out;
});

/* ---------------------------------- felled the way the other tools fell him */

await fresh();
results.forced = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const G = window.__g;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Nyktos' };
  // In the middle of a meal - a crystal inside him - is the hardest place to stop.
  const { A } = G.crystals(b);
  A.lit = 6;
  A.age = 5;
  for (let f = 0; f < 60 * 5 && b.state !== 'eat'; f++) {
    G.hero(A.x - 150, 1);
    G.step();
    G.keep();
  }
  const from = b.state;
  b.beginDying(g);
  for (let f = 0; f < 60 * 6 && !g.dialogue; f++) {
    p.hp = p.maxHp;
    G.step();
  }
  const spoke = !!g.dialogue;
  for (let f = 0; f < 60 * 8 && g.dialogue; f++) G.step({ confirm: f % 2 === 0 });
  return { from, spoke, relic: p.relics.has('lichtkern'), skill: p.skills.has('irrlichter'), cleared: h.arena.cleared, gone: !h.find() };
});

console.log(JSON.stringify(results, null, 2));
await bench.close();

const m = results.main;
const r = results.rule;
const c = results.crystal;
const a = results.attacks;
const rd = results.reader;
const s = results.standing;
const fz = results.forced;
const has = (list, ...names) => names.every((n) => list?.includes(n));
const t = m.tells ?? {};
const win = m.windows ?? {};
const at = (x) => (x == null ? '-' : x);
const readRate = rd.hits / Math.max(1, rd.seconds);
const standRate = s.hits / Math.max(1, s.seconds);
const checks = [
  ['Nyktos wakes and the grotto closes', m.engaged && m.sealed && m.barName?.startsWith('NYKTOS')],
  [`Nyktos costs less than a frame to fight (p99 ${m.frame?.p99} ms)`, m.frame?.p99 < 16.67],
  [
    'Nyktos has four crystals of his own: two on the floor at a quarter and three quarters of the room, two on the high ledges',
    m.crystals?.length === 4 &&
      m.crystals.filter((k) => !k.ledge).length === 2 &&
      m.crystals.filter((k) => k.ledge).length === 2 &&
      m.crystals.filter((k) => k.ledge).every((k) => k.surface < m.crystals.find((q) => !q.ledge).surface - 150),
  ],
  [
    'Nyktos: in his first half he grips, raises the wave, comes for the light, eats it and is blinded',
    has(m.moves, '1:grip', '1:claws', '1:rise', '1:waves', '1:seek', '1:eat', '1:blinded'),
  ],
  [
    'Nyktos: in his second half the orbs come, and everything else still does',
    has(m.moves, '2:gather', '2:orbs', '2:grip', '2:claws', '2:rise', '2:waves', '2:eat', '2:blinded'),
  ],
  [
    'Nyktos announces every move half a second ahead, from the first frame: the pool before the claws, the rise before the wave, ' +
      `the orbs gathering, the shove (${at(t.grip?.min)} / ${at(t.rise?.min)} / ${at(t.gather?.min)} / ${at(a.swipe?.near?.tell)} s), ` +
      `and the pool stands still before it closes (${at(t.hold?.min)} s)`,
    t.grip?.n > 0 && t.grip.min >= 0.5 && t.rise?.n > 0 && t.rise.min >= 0.5 && t.gather?.n > 0 && t.gather.min >= 0.5 && a.swipe?.near?.tell >= 0.5 && t.hold?.min >= 0.3,
  ],
  [
    `Nyktos: his windows - the meal and the blinding - stay open in reach of the floor for 1.2 s and more (${at(win.eat?.min)} / ${at(win.blinded?.min)} s)`,
    win.eat?.n > 0 && win.eat.min >= 1.2 && win.blinded?.n > 0 && win.blinded.min >= 1.2,
  ],
  [
    `Nyktos: in the dark a blade goes through him - two seconds of swings at his side, the hero's own glow on him, take ${r.dark?.took} - and he says why`,
    r.dark?.took === 0 && !r.dark.solid && r.dark.said,
  ],
  [`Nyktos: in a lit crystal's light the same swings land (${r.light?.took})`, r.light?.took >= 4 && r.light.solid],
  [
    `Nyktos: his centre decides - ${r.edge?.inside} px from the crystal he is flesh (${r.inside?.took} taken), ${r.edge?.outside} px he is smoke (${r.outside?.took})`,
    r.inside?.took > 0 && r.inside.solid && r.outside?.took === 0 && !r.outside.solid,
  ],
  ['Nyktos: the first time he is flesh, the rule is said: IM LICHT IST ER FLEISCH', r.announced === 'IM LICHT IST ER FLEISCH'],
  [
    `Nyktos: what is thrown obeys it too - the heavy strike's quake goes through him in the dark (${r.quakeDark?.took}) and lands in the light (${r.quakeLight?.took})`,
    r.quakeDark?.took === 0 && r.quakeDark.through && r.quakeLight?.took > 0,
  ],
  [
    `Nyktos: a swing lights a crystal, and once it has shone ${at(c.seek?.delay)} s he goes for it and eats it, flesh all through the meal`,
    c.litByBlade && c.seek?.delay >= 0.8 && c.seek.wentForIt && c.seek.ate && c.meal?.solid,
  ],
  [
    'Nyktos: a meal he finishes leaves the crystal dark, and empty for a moment - it will not light again at once',
    c.meal?.lit === 0 && c.meal.spent && !c.meal.relitAtOnce,
  ],
  [
    `Nyktos: ${c.blind?.poise} damage in one meal blinds him (one less does not) - GEBLENDET!, flesh on the floor ${c.blind?.onFloor} s, and the crystal stays lit`,
    c.blind?.afterShort === 'eat' && c.blind.afterFull === 'blinded' && c.blind.said && c.blind.lit && c.blind.solid && c.blind.onFloor >= 2.4,
  ],
  ['Nyktos: his wave puts out a lit floor crystal and not the one on the ledge above it', c.wave?.floorOut && c.wave.ledgeLit],
  [`Nyktos: an orb that reaches a lit crystal puts it out (${c.orbAtLight?.seconds} s)`, c.orbAtLight?.orbs === 3 && c.orbAtLight.out],
  ['Nyktos: a swing bats an orb away, and it costs nothing', c.bat?.batted && c.bat.lost === 0],
  ['Nyktos: the Schattengriff takes one from a hero who stays in the pool and none from one who walks out of it', a.grip?.stand === 1 && a.grip.walk === 0],
  [`Nyktos: no pool reaches into the light (${JSON.stringify(a.inLight?.picks ?? {})} of 20 choices)`, a.inLight?.pools === 0],
  ['Nyktos: his wave takes one from a hero who stands, none from one who jumps it', a.wave?.stand === 1 && a.wave.jump === 0],
  [
    `Nyktos: a hero at the crystal is shoved off it (one heart, ${a.swipe?.near?.pushed} px away), one waiting 80 px off is not swiped at all, and a parried shove blinds him`,
    a.swipe?.near?.swiped && a.swipe.near.lost === 1 && a.swipe.near.pushed >= 50 && !a.swipe.far.swiped && a.swipe.parry.state === 'blinded' && a.swipe.parry.lost === 0,
  ],
  [
    'Nyktos: nothing that stands still hurts - standing in him hanging in the dark, spent after a slam, eating or blinded costs nothing',
    Object.values(a.contact ?? {}).length === 4 && Object.values(a.contact).every((v) => v === 0),
  ],
  [
    `Nyktos: a hero who sees him 0.3 s late fells him in ${rd.seconds} s for ${rd.hits} hearts (${rd.meals} meals, ${rd.blinds} blindings, flesh in reach ${Math.round(rd.open * 100)} % of the fight)`,
    rd.felled && rd.seconds <= 75 && rd.hits <= 3,
  ],
  [
    `Nyktos: reading him costs less than half of standing still (${(readRate * 60).toFixed(1)} against ${(standRate * 60).toFixed(1)} hearts a minute)`,
    s.hits >= 6 && readRate * 2 <= standRate,
  ],
  [
    'Nyktos falls, heals the hero, opens the wards, speaks, and leaves the Lichtkern and the Irrlichter',
    rd.end?.felled && rd.end.healed && rd.end.cleared && rd.end.wardsOpen && rd.end.banner === 'DAS LICHT KEHRT ZURÜCK' && rd.end.spoke && rd.end.relic && rd.end.skill,
  ],
  [`Nyktos: beginDying fells him from the middle of a meal, as the other tools do it (${fz.from})`, fz.from === 'eat' && fz.spoke && fz.relic && fz.skill && fz.cleared && fz.gone],
  ['no page errors', errors.length === 0],
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
console.log(
  `OK: all ${checks.length} checks - in the dark Nyktos is smoke and in the light he is flesh, every move is announced, ` +
    `a hero who reads him fells him in ${rd.seconds} s for ${rd.hits} hearts, and he leaves the Lichtkern.`,
);
