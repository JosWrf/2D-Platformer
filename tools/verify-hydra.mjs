/**
 * Die Fünfkronige - the hydra in the shaft at the end of the rift, and the last
 * fight in the game.
 *
 * She is the one boss on the road that cannot be walked past: the gate home
 * stays shut while she lives (verify:ending pins the door itself). Five heads,
 * five phases, and one of them is not a fight on the floor at all - the storm
 * head withdraws to the top of her tower, out of reach of the blade and of the
 * crescent it throws, and the only answer is to climb the steps to it.
 *
 * What this pins:
 *
 *   - Five heads fall one at a time, each one a phase, and cutting one puts the
 *     next up instead of ending her.
 *   - Only the living head is a target. Her body and the heads still waiting
 *     their turn are not, in either direction: walking into her costs nothing.
 *   - Every move is announced before it lands, and the announcement is long
 *     enough to read.
 *   - The storm head cannot be reached from the floor. Twenty seconds of an
 *     untouchable hero with the sharpest blade in the game, jumping and
 *     throwing crescents, take exactly nothing off it - that is what makes the
 *     climb the answer rather than a scenic route.
 *   - The climb works on real physics: every step of the shaft is landed on,
 *     one after another, and from the top the same head is cut in seconds. A
 *     mortal hero on seven hearts makes the same climb with her storm phase
 *     live - a way up that kills him on the way is not a way up.
 *   - A parry breaks her whatever the head has absorbed.
 *   - She sizes up the blade coming at her, like every other boss here.
 *   - She stays down: felled once, a death and a respawn do not rebuild her.
 *   - And she can actually be killed, end to end, without touching her state.
 *
 * Usage: node tools/verify-hydra.mjs
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
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
// Derived from the spawns, never from a tile number: a chunk inserted anywhere
// in the level would otherwise move every tool at once.
const startTile = await page.evaluate(() => {
  const s = window.game.level.spawns.find((q) => q.kind === 'hydra');
  return Math.max(2, (s?.tx ?? 990) - 12);
});
await page.goto(`${base}/?x=${startTile}`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const result = await page.evaluate(() => {
  const TILE = 32;
  const g = window.game;
  const input = window.input;
  const p = g.player;
  const ctx = document.querySelector('canvas').getContext('2d');
  const tick = (actions = {}) => {
    for (const [a, v] of Object.entries({
      left: false,
      right: false,
      down: false,
      jump: false,
      attack: false,
      parry: false,
      confirm: false,
      ...actions,
    })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };
  // Looked up rather than held on to: every death rebuilds the roster.
  const find = () => g.enemies.find((e) => e.kind === 'hydra');
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /** Puts the hero on the floor of her shaft, `gap` pixels aside, and wakes her. */
  const setUp = (tier, gap = 130) => {
    g.restart();
    g.state = 'playing';
    const h = find();
    p.beamTier = tier;
    p.maxHp = 12;
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 0;
    p.x = h.cx - gap;
    p.y = h.bottom - p.h;
    p.vx = 0;
    p.vy = 0;
    g.camera.snapTo(p.cx, p.cy);
    for (let f = 0; f < 60 * 4 && !h.engaged; f++) {
      p.hp = p.maxHp;
      tick();
    }
    return h;
  };

  /* ------------------------------------------ she sizes up the blade, once */

  const bar = (tier) => {
    const h = setUp(tier);
    return { engaged: h.engaged, maxHp: h.maxHp, poise: h.poiseMax, perHead: h.living.maxHp };
  };
  const soft = bar(0);
  const sharp = bar(2);

  /* ---------------------------------------------------- a parry breaks her */

  const parryBroke = (() => {
    const h = setUp(1, 70);
    // The flame head, mid-breath, with poise she could never lose to damage:
    // whatever shakes her here was the parry and nothing else.
    h.head = 1;
    h.heads[0].dead = true;
    h.heads[0].hp = 0;
    h.state = 'act';
    h.timer = 3;
    let broke = false;
    for (let f = 0; f < 60 * 4 && !broke; f++) {
      h.poise = 9999;
      h.stun = 0;
      h.breath = Math.max(h.breath, 0.35);
      h.breathDir = p.cx > h.cx ? 1 : -1;
      h.hitThisMove = false;
      p.x = h.cx + 34;
      p.y = h.bottom - p.h;
      p.vx = 0;
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 0;
      tick({ left: true, parry: f % 14 < 5 });
      if (h.stun > 0) broke = true;
    }
    return broke;
  })();

  /* ------------------------------- and the climb is a climb, not a gauntlet */

  /*
   * The same six steps, but with a mortal hero on seven hearts and her storm
   * phase live: rocks down the shaft and gusts pushing while he is in the air.
   * The climb is the answer to that phase, so it has to be survivable - a way
   * up that kills the hero on the way is not a way up.
   */
  const mortalClimb = (() => {
    const boss = setUp(1);
    boss.head = 2;
    for (let i = 0; i < 2; i++) {
      boss.heads[i].dead = true;
      boss.heads[i].hp = 0;
    }
    boss.state = 'recover';
    boss.timer = 1;
    p.maxHp = 7;
    p.hp = 7;
    const spans = [];
    const L = g.level;
    for (let ty = 1; ty < L.height; ty++) {
      let run = null;
      for (let tx = Math.floor((boss.cx - 700) / TILE); tx <= Math.floor((boss.cx + 700) / TILE); tx++) {
        if (L.platformAt(tx, ty)) {
          if (!run) run = { ty, x0: tx, x1: tx };
          else run.x1 = tx;
        } else if (run) {
          spans.push(run);
          run = null;
        }
      }
      if (run) spans.push(run);
    }
    const rows = [...new Set(spans.map((q) => q.ty))].sort((a, b) => b - a);
    let deaths = 0;
    let reached = 0;
    for (const ty of rows) {
      const step = spans.filter((q) => q.ty === ty)[0];
      const topY = ty * TILE;
      const onIt = () =>
        p.onGround && Math.abs(p.bottom - topY) <= 2 && p.cx > step.x0 * TILE - 8 && p.cx < (step.x1 + 1) * TILE + 8;
      let hold = 0;
      let f = 0;
      for (; f < 60 * 15 && !onIt(); f++) {
        if (g.state !== 'playing') {
          deaths++;
          tick({ confirm: f % 8 < 3 });
          continue;
        }
        const target = Math.max(step.x0 * TILE + 12, Math.min(p.cx, (step.x1 + 1) * TILE - 12));
        const dx = target - p.cx;
        if (p.onGround && p.bottom > topY + 4 && Math.abs(dx) < 100) hold = 16;
        if (hold > 0) hold--;
        tick({ left: dx < -6, right: dx > 6, jump: hold > 0 });
      }
      if (!onIt()) break;
      reached++;
    }
    return { steps: rows.length, reached, deaths, heartsLeft: p.hp };
  })();

  /* ------------------------------------- only the living head is a target */

  const h = setUp(1);
  const headBox = h.headRect();
  const dormantAt = h.neckEnd(h.heads[4]);
  const targets = {
    livingHead: h.overlaps({ x: headBox.x + 4, y: headBox.y + 4, w: 40, h: 32 }),
    waitingHead: h.overlaps({ x: dormantAt.x - 20, y: dormantAt.y - 20, w: 40, h: 40 }),
    body: h.overlaps({ x: h.cx - 20, y: h.cy - 20, w: 40, h: 40 }),
  };

  /* ------------------------------------------ and standing in her costs nothing */

  const contact = (() => {
    h.state = 'rise';
    h.timer = 3;
    p.hp = p.maxHp;
    p.invuln = 0;
    const before = p.hp;
    for (let f = 0; f < 60 * 2; f++) {
      p.x = h.cx - p.w / 2;
      p.y = h.bottom - p.h;
      p.vx = 0;
      p.vy = 0;
      tick();
    }
    return { before, after: p.hp };
  })();

  /* ------------------------------------------------------------- the fight */

  h.state = 'recover';
  h.timer = 0.4;
  p.x = h.cx - 130;
  p.y = h.bottom - p.h;
  p.vx = 0;
  p.vy = 0;

  const phases = [{ phase: h.phase, kind: h.living.kind, frame: 0 }];
  let lastPhase = h.phase;
  let frames = 0;
  // The shortest warning she ever gave, in frames: a move that lands without
  // one is the single thing every boss in this game is not allowed to do.
  let windRun = 0;
  let shortestWind = 1e9;
  const watch = () => {
    const cut = h.phase !== lastPhase || h.dead;
    if (h.state === 'wind') windRun++;
    else {
      // A wind cut short is the hero interrupting her - a stagger, or the head
      // coming off mid-breath - not her skipping the warning. Only the ones she
      // was left alone to finish say anything about the telegraph.
      if (windRun > 0 && h.stun <= 0 && !cut) shortestWind = Math.min(shortestWind, windRun);
      windRun = 0;
    }
    if (cut && !h.dead) {
      lastPhase = h.phase;
      phases.push({ phase: h.phase, kind: h.living.kind, frame: frames });
    }
  };

  /** Chases the living head and swings at it. Untouchable: this measures reach. */
  let jumpHold = 0;
  let dropFor = 0;
  const chase = (budget) => {
    for (let f = 0; f < budget && !h.dead; f++) {
      frames++;
      p.hp = p.maxHp;
      p.dead = false;
      const c = h.headCentre();
      const want = c.x + (p.cx < c.x ? -24 : 24);
      const dx = want - p.cx;
      if (p.onGround && p.cy < c.y - 90) dropFor = 4;
      if (dropFor > 0) dropFor--;
      if (p.onGround && dropFor <= 0 && p.cy + 14 > c.y + 18) jumpHold = 16;
      if (jumpHold > 0) jumpHold--;
      tick({
        left: dx < -4,
        right: dx > 4,
        jump: jumpHold > 0 || dropFor > 0,
        down: dropFor > 0,
        attack: f % 2 === 0,
      });
      watch();
    }
  };

  // Phases one and two happen on the floor.
  chase(60 * 60);
  const reachedStorm = h.living.kind === 'storm';

  /* ------------------------------- the storm head is not a floor fight */

  const stormHp = h.living.hp;
  let lowestBlade = 1e9;
  let highestBeam = 1e9;
  for (let f = 0; f < 60 * 20 && h.living.kind === 'storm'; f++) {
    frames++;
    p.hp = p.maxHp;
    p.dead = false;
    // Pinned to the floor: this is the question "can it be done from down
    // here", so he is not allowed to wander onto a step and answer it there.
    if (p.bottom < h.bottom - 2) {
      p.y = h.bottom - p.h;
      p.vy = 0;
    }
    const c = h.headCentre();
    const dx = c.x + (p.cx < c.x ? -24 : 24) - p.cx;
    if (p.onGround) jumpHold = 16;
    if (jumpHold > 0) jumpHold--;
    tick({ left: dx < -4, right: dx > 4, jump: jumpHold > 0, attack: f % 2 === 0 });
    lowestBlade = Math.min(lowestBlade, p.swordRect().y);
    for (const q of g.projectiles) if (q.friendly && q.kind === 'beam') highestBeam = Math.min(highestBeam, q.y);
    watch();
  }
  const fromTheFloor = {
    headKind: h.living.kind,
    hpBefore: stormHp,
    hpAfter: h.living.hp,
    headBottom: Math.round(h.headRect().y + h.headRect().h),
    bladeGotTo: Math.round(lowestBlade),
    crescentGotTo: Number.isFinite(highestBeam) ? Math.round(highestBeam) : null,
  };

  /* ------------------------------------------------ so he climbs to it */

  // The steps are read out of the level rather than assumed: every run of
  // platform tiles in her shaft, lowest row first.
  const spans = [];
  const L = g.level;
  const from = Math.floor((h.cx - 700) / TILE);
  const to = Math.floor((h.cx + 700) / TILE);
  for (let ty = 1; ty < L.height; ty++) {
    let run = null;
    for (let tx = from; tx <= to; tx++) {
      if (L.platformAt(tx, ty)) {
        if (!run) run = { ty, x0: tx, x1: tx };
        else run.x1 = tx;
      } else if (run) {
        spans.push(run);
        run = null;
      }
    }
    if (run) spans.push(run);
  }
  const rows = [...new Set(spans.map((s) => s.ty))].sort((a, b) => b - a);

  const climbed = [];
  let top = null;
  for (const ty of rows) {
    const centreOf = (s) => ((s.x0 + s.x1 + 1) / 2) * TILE;
    const step = spans
      .filter((s) => s.ty === ty)
      .sort((a, b) => Math.abs(centreOf(a) - p.cx) - Math.abs(centreOf(b) - p.cx))[0];
    top = step;
    const topY = ty * TILE;
    const onIt = () =>
      p.onGround &&
      Math.abs(p.bottom - topY) <= 2 &&
      p.cx > step.x0 * TILE - 8 &&
      p.cx < (step.x1 + 1) * TILE + 8;
    let hold = 0;
    let f = 0;
    for (; f < 60 * 12 && !onIt(); f++) {
      frames++;
      p.hp = p.maxHp;
      p.dead = false;
      const target = Math.max(step.x0 * TILE + 12, Math.min(p.cx, (step.x1 + 1) * TILE - 12));
      const dx = target - p.cx;
      if (p.onGround && p.bottom > topY + 4 && Math.abs(dx) < 100) hold = 16;
      if (hold > 0) hold--;
      tick({ left: dx < -6, right: dx > 6, jump: hold > 0 });
      watch();
    }
    climbed.push({ row: ty, landed: onIt(), seconds: +(f / 60).toFixed(1) });
    if (!onIt()) break;
  }
  const climbedEvery = climbed.length === rows.length && climbed.every((c) => c.landed);

  // From up there the same head answers to the same blade.
  const stormAtTheTop = (() => {
    const before = h.living.kind === 'storm' ? h.living.hp : null;
    let f = 0;
    // He walks to the edge of the step and swings off it - and no further:
    // a bot that strolls off the end is measuring the drop, not the reach.
    const edgeL = top.x0 * TILE + 4;
    const edgeR = (top.x1 + 1) * TILE - p.w - 4;
    for (; f < 60 * 30 && h.living.kind === 'storm'; f++) {
      frames++;
      p.hp = p.maxHp;
      p.dead = false;
      const c = h.headCentre();
      const want = Math.max(edgeL, Math.min(edgeR, c.x + (p.cx < c.x ? -24 : 24) - p.w / 2));
      const dx = want - p.x;
      tick({ left: dx < -3, right: dx > 3, attack: f % 2 === 0 });
      watch();
    }
    return { hpBefore: before, cut: h.living.kind !== 'storm', seconds: +(f / 60).toFixed(1) };
  })();

  /* -------------------------------------------------- and down again, to the end */

  chase(60 * 90);
  const felled = h.dead;
  const secondsToFell = +(frames / 60).toFixed(1);

  /* ------------------------------------------------------- and she stays down */

  const aliveAfterWin = g.enemies.filter((e) => e.kind === 'hydra' && !e.dead).length;
  p.invuln = 0;
  p.hurt(99, 1, g, true);
  for (let f = 0; f < 60 * 6; f++) tick({ confirm: f % 12 < 4 });
  const stayedDown = {
    afterWin: aliveAfterWin,
    afterDying: g.enemies.filter((e) => e.kind === 'hydra' && !e.dead).length,
    state: g.state,
  };

  return {
    ok:
      soft.engaged &&
      sharp.maxHp > soft.maxHp &&
      sharp.poise > soft.poise &&
      parryBroke &&
      targets.livingHead &&
      !targets.waitingHead &&
      !targets.body &&
      contact.after === contact.before &&
      reachedStorm &&
      phases.map((q) => q.kind).join() === 'venom,flame,storm,stone,crown' &&
      fromTheFloor.headKind === 'storm' &&
      fromTheFloor.hpAfter === fromTheFloor.hpBefore &&
      fromTheFloor.bladeGotTo > fromTheFloor.headBottom &&
      climbedEvery &&
      mortalClimb.reached === mortalClimb.steps &&
      mortalClimb.deaths === 0 &&
      mortalClimb.heartsLeft >= 4 &&
      stormAtTheTop.cut &&
      felled &&
      stayedDown.afterWin === 0 &&
      stayedDown.afterDying === 0 &&
      stayedDown.state === 'playing' &&
      shortestWind >= 36,
    scaling: { tier0: soft, tier2: sharp },
    parryBroke,
    targets,
    contact,
    phases,
    shortestWindFrames: Number.isFinite(shortestWind) ? shortestWind : null,
    fromTheFloor,
    climbed,
    mortalClimb,
    stormAtTheTop,
    felled,
    secondsToFell,
    stayedDown,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    'FAIL: the hydra no longer answers head by head, her body or a waiting head can be hit, a move ' +
      'lands without a warning, a parry no longer breaks her, the storm head can be reached from ' +
      'the floor or no longer from the steps, she cannot be climbed to, felled, or she comes back.',
  );
  process.exit(1);
}
console.log(
  'OK: five heads fall one at a time, only the living one is a target, every move is announced, ' +
    'the storm head is out of reach from the floor and in reach from the steps he climbs to it, ' +
    'a parry breaks her, she sizes up the blade, and once felled she stays down.',
);
