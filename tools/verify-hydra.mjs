/**
 * Die Fünfkronige - the hydra in the lair at the end of the rift, and the last
 * fight in the game.
 *
 * She is not five bosses in a queue. All five heads are awake and all five can
 * be cut, but cutting one is not killing it: the stump counts down and the head
 * comes back. Steel alone never finishes a hydra. What does is her own fire -
 * the flame head lobs embers, and an ember turned aside with a parry flies dead
 * flat and burns a stump shut for good. Because a turned ember flies flat, the
 * height the hero is standing at is the height he is aiming at, and the four
 * stumps droop to the heights of four different ledges. That is what her tower
 * is for.
 *
 * What this pins, in the order the fight teaches it:
 *
 *   - Every head is a target, all the time. Her body, her necks and her stumps
 *     are not, in either direction: walking into her costs nothing and steel
 *     does nothing at all to a cut neck.
 *   - A cut neck grows back, and a hero who only swings never finishes her: a
 *     hundred seconds of mashing leave her standing with heads he has had to
 *     cut twice. (The blade bats an ember aside as well as a parry does - the
 *     rule Gallert teaches with his spit - so a masher can seal one by luck.
 *     Luck is not a plan: it is still her fire doing the work.)
 *   - Her own fire, parried into a stump, closes it for good.
 *   - Each of the four closes from its own ledge - floor, and three steps up
 *     the tower - which is the whole reason the tower is there.
 *   - The fifth neck is the fire itself and can never be sealed, so cutting it
 *     early costs time and nothing else. With the other four burned out, putting
 *     it out finishes her.
 *   - The storm head is out of reach from the floor, and the six steps are
 *     climbed on real physics, mortal, with her storm phase live.
 *   - Her lair shuts behind the hero when she wakes and opens when she falls.
 *   - Nothing she does crosses that room.
 *   - Every move is announced, a parry breaks her, she sizes up the blade, and
 *     once felled she stays down.
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
  /** Tile.LairGate - her own portcullis, as the tile map stores it. */
  const LAIR_GATE = 9;
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
  const find = () => g.enemies.find((e) => e.kind === 'hydra');
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /** Puts the hero on the floor of her lair, `gap` pixels aside, and wakes her. */
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
    // And out the far side of her rise: she is untouchable while she comes up,
    // so a check that starts during it measures the intro, not the fight.
    for (let f = 0; f < 60 * 4 && (h.state === 'rise' || h.state === 'wait'); f++) {
      p.hp = p.maxHp;
      p.invuln = 999;
      p.x = h.cx - gap;
      p.y = h.bottom - p.h;
      p.vx = 0;
      p.vy = 0;
      tick();
    }
    p.invuln = 0;
    return h;
  };

  /** Takes a named head off, for setting a state up rather than fighting to it. */
  const cut = (h, i) => {
    h.struck = i;
    h.hurt(999, 1, g);
  };

  /** Every surface the hero can stand on inside her room: the floor and the steps. */
  const surfaces = (h) => {
    const L = g.level;
    const out = [{ top: h.bottom, x0: Math.floor((h.cx - 640) / TILE), x1: Math.floor((h.cx + 640) / TILE) }];
    for (let ty = 1; ty < L.height; ty++) {
      let run = null;
      for (let tx = Math.floor((h.cx - 700) / TILE); tx <= Math.floor((h.cx + 700) / TILE); tx++) {
        if (L.platformAt(tx, ty)) {
          if (!run) run = { top: ty * TILE, x0: tx, x1: tx };
          else run.x1 = tx;
        } else if (run) {
          out.push(run);
          run = null;
        }
      }
      if (run) out.push(run);
    }
    return out;
  };

  /**
   * Where the hero has to stand to burn a given stump shut: the surface whose
   * standing height matches it, at the end nearest the stump. Derived, never
   * counted in tiles - the room can be rebuilt without rewriting this.
   */
  const firingPoint = (h, neck) => {
    const stump = h.stumpCentre(neck);
    const want = stump.y + p.h / 2;
    const surface = surfaces(h).sort((a, b) => Math.abs(a.top - want) - Math.abs(b.top - want))[0];
    const left = surface.x0 * TILE;
    const right = (surface.x1 + 1) * TILE;
    const onTheRight = stump.x > (left + right) / 2;
    // The floor is continuous, so there he simply stands back from it.
    const wide = right - left > 900;
    const x = wide ? stump.x - 120 : onTheRight ? right - p.w - 4 : left + 4;
    return { x, top: surface.top, facing: stump.x > x ? 1 : -1, off: Math.abs(surface.top - want) };
  };

  /**
   * Bait an ember and turn it into the stump. Real timing: the hero parries
   * when one is actually about to reach him, and the ember does the rest.
   */
  const burnShut = (h, i, seconds = 26) => {
    const neck = h.necks[i];
    const spot = firingPoint(h, neck);
    let embers = 0;
    const seen = new Set();
    let f = 0;
    for (; f < 60 * seconds && neck.state === 'stump'; f++) {
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 0;
      p.x = spot.x;
      p.y = spot.top - p.h;
      p.vx = 0;
      p.vy = 0;
      p.facing = spot.facing;
      let incoming = null;
      for (const q of g.projectiles) {
        if (q.kind !== 'ember') continue;
        if (!seen.has(q)) {
          seen.add(q);
          embers++;
        }
        if (q.friendly) continue;
        if (!incoming || Math.abs(q.cx - p.cx) < Math.abs(incoming.cx - p.cx)) incoming = q;
      }
      // Tight on purpose. The parry has a cooldown, so a bot that stabs the
      // button while the coal is still thirty pixels overhead has spent the
      // window before it arrives - which is exactly what a player pressing too
      // early does, and is not the same measurement as "can it be turned".
      const near = incoming && Math.abs(incoming.cx - p.cx) < 30 && Math.abs(incoming.cy - p.cy) < 26;
      tick({ parry: !!near });
    }
    return {
      kind: neck.kind,
      sealed: neck.state === 'sealed',
      seconds: +(f / 60).toFixed(1),
      embers,
      ledgeAbove: Math.round(h.bottom - spot.top),
      aimOff: Math.round(spot.off),
    };
  };

  /* ------------------------------------------ she sizes up the blade, once */

  const bar = (tier) => {
    const h = setUp(tier);
    return { engaged: h.engaged, maxHp: h.maxHp, poise: h.poiseMax, perNeck: h.necks[0].maxHp };
  };
  const soft = bar(0);
  const sharp = bar(2);

  /* ---------------------------------------------------- a parry breaks her */

  const parryBroke = (() => {
    const h = setUp(1, 70);
    h.acting = 2;
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

  /* ------------------------------------ her door, and the length of her arm */

  const theRoom = (() => {
    const h = setUp(1, 130);
    const closedOnWaking = g.level.lairClosed;
    const floorTy = Math.round(h.bottom / TILE);
    let doorTx = Math.floor(h.cx / TILE);
    while (doorTx > 1 && g.level.tileAt(doorTx, floorTy - 1) !== LAIR_GATE) doorTx--;
    const farX = (doorTx + 2) * TILE;

    p.maxHp = 12;
    p.hp = p.maxHp;
    p.invuln = 0;
    let closestThrow = Infinity;
    for (let f = 0; f < 60 * 20; f++) {
      // Pinned against the far wall: this measures her arm, not his footwork.
      p.x = farX;
      p.y = h.bottom - p.h;
      p.vx = 0;
      p.vy = 0;
      p.dead = false;
      tick();
      for (const q of g.projectiles) {
        if (q.friendly) continue;
        closestThrow = Math.min(closestThrow, Math.abs(q.cx - p.cx));
      }
    }
    const atTheWall = {
      tilesAway: Math.round(Math.abs(h.cx - p.cx) / TILE),
      hp: p.hp,
      closestThrow: Number.isFinite(closestThrow) ? Math.round(closestThrow) : null,
    };

    // The control, so "she cannot reach him" is not just "she is broken".
    p.hp = p.maxHp;
    p.invuln = 0;
    let hurtClose = 0;
    for (let f = 0; f < 60 * 20 && hurtClose === 0; f++) {
      p.x = h.cx - 150;
      p.y = h.bottom - p.h;
      p.vx = 0;
      p.vy = 0;
      p.dead = false;
      if (p.hp < p.maxHp) {
        hurtClose = p.maxHp - p.hp;
        p.hp = p.maxHp;
      }
      tick();
    }
    return { closedOnWaking, atTheWall, hurtClose };
  })();

  /* ------------------------------------------ every head is a target, always */

  const targets = (() => {
    const h = setUp(1);
    const boxAt = (c) => ({ x: c.x - 18, y: c.y - 14, w: 36, h: 28 });
    const onHeads = h.necks.map((n) => h.overlaps(boxAt(h.headCentre(n))));
    const onBody = h.overlaps({ x: h.cx - 20, y: h.cy - 20, w: 40, h: 40 });
    // And a cut neck stops being one: steel does nothing to a stump.
    cut(h, 0);
    const stump = h.necks[0];
    const onStump = h.overlaps(boxAt(h.stumpCentre(stump)));
    const before = stump.regrow;
    for (let f = 0; f < 60 * 2; f++) {
      p.hp = p.maxHp;
      p.x = h.stumpCentre(stump).x - 26;
      p.y = h.bottom - p.h;
      p.vx = 0;
      p.facing = 1;
      tick({ attack: f % 2 === 0 });
    }
    return {
      everyHead: onHeads.every(Boolean),
      body: onBody,
      stump: onStump,
      stumpStillOpen: stump.state === 'stump',
      clockRan: before > stump.regrow,
    };
  })();

  /* --------------------------------------- and standing in her costs nothing */

  const contact = (() => {
    const h = setUp(1);
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

  /* ------------------------------------- steel alone never finishes a hydra */

  const steelAlone = (() => {
    const h = setUp(2);
    let jumpHold = 0;
    let frames = 0;
    for (; frames < 60 * 100 && !h.dead; frames++) {
      p.hp = p.maxHp;
      p.dead = false;
      // Chase whichever head is lowest and hack at it, for ever.
      const heads = h.necks.filter((n) => n.state === 'head');
      if (heads.length === 0) {
        tick();
        continue;
      }
      const target = heads.sort((a, b) => b.hy - a.hy)[0];
      const c = h.headCentre(target);
      const want = c.x + (p.cx < c.x ? -24 : 24);
      const dx = want - p.cx;
      if (p.onGround && p.cy + 14 > c.y + 18) jumpHold = 16;
      if (jumpHold > 0) jumpHold--;
      tick({ left: dx < -4, right: dx > 4, jump: jumpHold > 0, attack: frames % 2 === 0 });
    }
    return {
      seconds: +(frames / 60).toFixed(1),
      alive: !h.dead,
      regrowths: h.regrowths,
      sealed: h.sealed,
    };
  })();

  /* ------------------------------------- her own fire is what closes a neck */

  const byFire = (() => {
    const h = setUp(1);
    cut(h, 0);
    const first = burnShut(h, 0);
    // Sealed means sealed: fifteen more seconds must not bring it back.
    for (let f = 0; f < 60 * 15; f++) {
      p.hp = p.maxHp;
      p.invuln = 999;
      tick();
    }
    return { ...first, stillSealedAfter15s: h.necks[0].state === 'sealed' };
  })();

  /* ------------------------- and if it is left alone instead, it comes back */

  const leftAlone = (() => {
    const h = setUp(1);
    cut(h, 2);
    const neck = h.necks[2];
    let f = 0;
    for (; f < 60 * 16 && neck.state === 'stump'; f++) {
      p.hp = p.maxHp;
      p.invuln = 999;
      p.x = h.cx - 300;
      p.y = h.bottom - p.h;
      p.vx = 0;
      tick();
    }
    return { state: neck.state, seconds: +(f / 60).toFixed(1), hpBack: neck.hp, ofMax: neck.maxHp };
  })();

  /* ------------------------------- four stumps, four ledges, one at a time */

  const ledges = (() => {
    const h = setUp(1);
    const out = [];
    for (const i of [0, 2, 3, 4]) {
      cut(h, i);
      out.push(burnShut(h, i));
    }
    return out;
  })();

  /* ------------------------------- the fire itself can never be burned shut */

  const theFire = (() => {
    const h = setUp(1);
    cut(h, 1);
    const spot = firingPoint(h, h.necks[1]);
    let f = 0;
    for (; f < 60 * 13 && h.necks[1].state === 'stump'; f++) {
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 999;
      p.x = spot.x;
      p.y = spot.top - p.h;
      p.vx = 0;
      p.vy = 0;
      tick({ parry: f % 6 < 3 });
    }
    return { state: h.necks[1].state, seconds: +(f / 60).toFixed(1) };
  })();

  /* --------------------------------- the storm head is not a floor fight */

  const h = setUp(2);
  let lowestBlade = 1e9;
  let highestBeam = 1e9;
  const storm = h.necks[4];
  const stormHpBefore = storm.hp;
  let jumpHold = 0;
  for (let f = 0; f < 60 * 20; f++) {
    p.hp = p.maxHp;
    p.dead = false;
    if (p.bottom < h.bottom - 2) {
      p.y = h.bottom - p.h;
      p.vy = 0;
    }
    const c = h.headCentre(storm);
    const dx = c.x + (p.cx < c.x ? -24 : 24) - p.cx;
    if (p.onGround) jumpHold = 16;
    if (jumpHold > 0) jumpHold--;
    tick({ left: dx < -4, right: dx > 4, jump: jumpHold > 0, attack: f % 2 === 0 });
    lowestBlade = Math.min(lowestBlade, p.swordRect().y);
    for (const q of g.projectiles) if (q.friendly && q.kind === 'beam') highestBeam = Math.min(highestBeam, q.y);
  }
  const fromTheFloor = {
    hpBefore: stormHpBefore,
    hpAfter: storm.hp,
    headBottom: Math.round(h.headRect(storm).y + h.headRect(storm).h),
    bladeGotTo: Math.round(lowestBlade),
    crescentGotTo: Number.isFinite(highestBeam) ? Math.round(highestBeam) : null,
  };

  /* ------------------------------------------------ so he climbs to it */

  const steps = surfaces(h).filter((s) => s.top < h.bottom - 8);
  const rows = [...new Set(steps.map((s) => s.top))].sort((a, b) => b - a);
  const standingOn = (step) =>
    p.onGround &&
    Math.abs(p.bottom - step.top) <= 2 &&
    p.cx > step.x0 * TILE - 8 &&
    p.cx < (step.x1 + 1) * TILE + 8;

  /** One step at a time, on real physics, from wherever he is standing now. */
  const climbTheSteps = () => {
    const log = [];
    for (const top of rows) {
      if (p.bottom <= top + 2) continue;
      const step = steps
        .filter((q) => q.top === top)
        .sort(
          (a, b) =>
            Math.abs(((a.x0 + a.x1 + 1) / 2) * TILE - p.cx) - Math.abs(((b.x0 + b.x1 + 1) / 2) * TILE - p.cx),
        )[0];
      let hold = 0;
      let f = 0;
      for (; f < 60 * 12 && !standingOn(step); f++) {
        p.hp = p.maxHp;
        p.dead = false;
        const target = Math.max(step.x0 * TILE + 12, Math.min(p.cx, (step.x1 + 1) * TILE - 12));
        const dx = target - p.cx;
        if (p.onGround && p.bottom > step.top + 4 && Math.abs(dx) < 100) hold = 16;
        if (hold > 0) hold--;
        tick({ left: dx < -6, right: dx > 6, jump: hold > 0 });
      }
      log.push({ row: Math.round(top / TILE), landed: standingOn(step), seconds: +(f / 60).toFixed(1) });
      if (!standingOn(step)) break;
    }
    return log;
  };

  const climbed = climbTheSteps();
  const climbedEvery = climbed.length === rows.length && climbed.every((c) => c.landed);

  // And the storm head answers to the same blade from up there.
  const stormAtTheTop = (() => {
    let f = 0;
    const top = steps.filter((s) => s.top === rows[rows.length - 1])[0];
    const edgeL = top.x0 * TILE + 4;
    const edgeR = (top.x1 + 1) * TILE - p.w - 4;
    for (; f < 60 * 30 && storm.state === 'head'; f++) {
      if (p.bottom > top.top + 4 && p.onGround) {
        climbTheSteps();
        continue;
      }
      p.hp = p.maxHp;
      p.dead = false;
      const c = h.headCentre(storm);
      const want = Math.max(edgeL, Math.min(edgeR, c.x + (p.cx < c.x ? -24 : 24) - p.w / 2));
      const dx = want - p.x;
      tick({ left: dx < -3, right: dx > 3, attack: f % 2 === 0 });
    }
    return { cut: storm.state !== 'head', seconds: +(f / 60).toFixed(1) };
  })();

  /* ------------------------------- a mortal hero makes the same climb alive */

  const mortalClimb = (() => {
    const boss = setUp(1);
    cut(boss, 0);
    cut(boss, 1);
    cut(boss, 2);
    cut(boss, 3);
    p.maxHp = 7;
    p.hp = 7;
    let deaths = 0;
    let reached = 0;
    for (const top of rows) {
      if (p.bottom <= top + 2) continue;
      const step = steps.filter((q) => q.top === top)[0];
      let hold = 0;
      let f = 0;
      for (; f < 60 * 15 && !standingOn(step); f++) {
        if (g.state !== 'playing') {
          deaths++;
          tick({ confirm: f % 8 < 3 });
          continue;
        }
        const target = Math.max(step.x0 * TILE + 12, Math.min(p.cx, (step.x1 + 1) * TILE - 12));
        const dx = target - p.cx;
        if (p.onGround && p.bottom > step.top + 4 && Math.abs(dx) < 100) hold = 16;
        if (hold > 0) hold--;
        tick({ left: dx < -6, right: dx > 6, jump: hold > 0 });
      }
      if (!standingOn(step)) break;
      reached++;
    }
    return { steps: rows.length, reached, deaths, heartsLeft: p.hp };
  })();

  /* -------------------------------------- burn out four, put out the fifth */

  const theEnd = (() => {
    const boss = setUp(2);
    p.maxHp = 12;
    // The shortest warning she ever gave herself time to finish, in frames.
    let windRun = 0;
    let shortestWind = 1e9;
    let lastSealed = 0;
    const watch = () => {
      const settled = boss.sealed === lastSealed && boss.stun <= 0 && !boss.dead;
      if (boss.state === 'wind') windRun++;
      else {
        if (windRun > 0 && settled) shortestWind = Math.min(shortestWind, windRun);
        windRun = 0;
      }
      lastSealed = boss.sealed;
    };
    const burned = [];
    for (const i of [0, 2, 3, 4]) {
      cut(boss, i);
      const neck = boss.necks[i];
      const spot = firingPoint(boss, neck);
      for (let f = 0; f < 60 * 26 && neck.state === 'stump'; f++) {
        p.hp = p.maxHp;
        p.dead = false;
        p.invuln = 0;
        p.x = spot.x;
        p.y = spot.top - p.h;
        p.vx = 0;
        p.vy = 0;
        p.facing = spot.facing;
        let incoming = null;
        for (const q of g.projectiles) {
          if (q.kind !== 'ember' || q.friendly) continue;
          if (!incoming || Math.abs(q.cx - p.cx) < Math.abs(incoming.cx - p.cx)) incoming = q;
        }
        const near = incoming && Math.abs(incoming.cx - p.cx) < 30 && Math.abs(incoming.cy - p.cy) < 26;
        tick({ parry: !!near });
        watch();
      }
      burned.push(neck.state);
    }
    const fourSealed = boss.sealed;
    // And now the fire goes out, with nothing left to feed the others.
    const aliveBeforeLastCut = !boss.dead;
    cut(boss, 1);
    for (let f = 0; f < 60 * 3; f++) tick();
    return {
      burned,
      fourSealed,
      aliveBeforeLastCut,
      felled: boss.dead || !find(),
      shortestWindFrames: Number.isFinite(shortestWind) ? shortestWind : null,
      doorOpen: !g.level.lairClosed,
    };
  })();

  /* ------------------------------------------------------- and she stays down */

  const aliveAfterWin = g.enemies.filter((e) => e.kind === 'hydra' && !e.dead).length;
  p.invuln = 0;
  p.hurt(99, 1, g, true);
  for (let f = 0; f < 60 * 6; f++) tick({ confirm: f % 12 < 4 });
  const stayedDown = {
    afterWin: aliveAfterWin,
    afterDying: g.enemies.filter((e) => e.kind === 'hydra' && !e.dead).length,
    state: g.state,
    doorOpen: !g.level.lairClosed,
  };

  return {
    ok:
      soft.engaged &&
      sharp.maxHp > soft.maxHp &&
      sharp.poise > soft.poise &&
      parryBroke &&
      theRoom.closedOnWaking &&
      theRoom.atTheWall.hp === 12 &&
      (theRoom.atTheWall.closestThrow === null || theRoom.atTheWall.closestThrow > 260) &&
      theRoom.hurtClose > 0 &&
      targets.everyHead &&
      !targets.body &&
      !targets.stump &&
      targets.stumpStillOpen &&
      targets.clockRan &&
      contact.after === contact.before &&
      steelAlone.alive &&
      steelAlone.regrowths >= 2 &&
      byFire.sealed &&
      byFire.stillSealedAfter15s &&
      leftAlone.state === 'head' &&
      leftAlone.hpBack < leftAlone.ofMax &&
      ledges.length === 4 &&
      ledges.every((l) => l.sealed) &&
      new Set(ledges.map((l) => l.ledgeAbove)).size === 4 &&
      ledges.every((l) => l.aimOff <= 4) &&
      theFire.state === 'head' &&
      fromTheFloor.hpAfter === fromTheFloor.hpBefore &&
      fromTheFloor.bladeGotTo > fromTheFloor.headBottom &&
      climbedEvery &&
      stormAtTheTop.cut &&
      mortalClimb.reached === mortalClimb.steps &&
      mortalClimb.deaths === 0 &&
      theEnd.burned.every((s) => s === 'sealed') &&
      theEnd.fourSealed === 4 &&
      theEnd.aliveBeforeLastCut &&
      theEnd.felled &&
      theEnd.doorOpen &&
      theEnd.shortestWindFrames !== null &&
      theEnd.shortestWindFrames >= 36 &&
      stayedDown.afterWin === 0 &&
      stayedDown.afterDying === 0 &&
      stayedDown.state === 'playing' &&
      stayedDown.doorOpen,
    scaling: { tier0: soft, tier2: sharp },
    parryBroke,
    theRoom,
    targets,
    contact,
    steelAlone,
    byFire,
    leftAlone,
    ledges,
    theFire,
    fromTheFloor,
    climbed,
    stormAtTheTop,
    mortalClimb,
    theEnd,
    stayedDown,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    'FAIL: the hydra fight no longer works as designed - a head is not a target or her body is, ' +
      'steel alone finishes her or a cut neck no longer grows back, her fire no longer seals a ' +
      'stump or seals one it should not, a stump no longer hangs at its own ledge, the storm head ' +
      'is reachable from the floor or no longer from the steps, a move lands without a warning, ' +
      'her lair or her reach is wrong, or she cannot be felled and stay down.',
  );
  process.exit(1);
}
console.log(
  'OK: all five heads are targets and none of the rest of her is, steel alone never finishes her ' +
    'because a cut neck grows back, her own fire parried into a stump burns it shut for good, each ' +
    'of the four burns shut from its own ledge, the fire itself never can, the storm head is only ' +
    'reachable from the steps he climbs to it, her lair shuts and opens, nothing she throws crosses ' +
    'it, and four burned necks plus the fire put out finish her for good.',
);
