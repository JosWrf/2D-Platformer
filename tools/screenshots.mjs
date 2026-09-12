/**
 * Drives the built game in a real browser and captures screenshots.
 * Usage: node tools/screenshots.mjs [outDir]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'screenshots'));
mkdirSync(OUT, { recursive: true });

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

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });

async function step(frames, actions = {}) {
  await page.evaluate(
    ({ frames, actions }) => {
      const { input, loop } = window;
      for (const [a, v] of Object.entries(actions)) input.forceDown(a, v);
      for (let i = 0; i < frames; i++) loop.step(1 / 60);
    },
    { frames, actions },
  );
}
const release = (...actions) =>
  page.evaluate((list) => list.forEach((a) => window.input.forceDown(a, false)), actions);

async function shot(name) {
  await page.locator('#frame').screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', `${name}.png`);
}

async function open(query = '') {
  await page.goto(`${base}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => window.loop.stop());
}

/** Full-height jump: hold the key long enough that the jump isn't cut short. */
async function jump(framesForward = 26) {
  await step(17, { right: true, jump: true });
  await release('jump');
  await step(framesForward, { right: true });
}

/**
 * Run the boss fight with the same heuristics as the playtest bot, stopping
 * early when the requested moment happens so the shot lands on it.
 * stopWhen: 'phase2' | 'phase3' | 'attack' | 'orbs' | null
 */
async function fightRound(rounds, stopWhen = null, keepDistance = 0) {
  return page.evaluate(({ rounds, stopWhen, keepDistance }) => {
    const g = window.game;
    const input = window.input;
    const DT = 1 / 60;
    let jumpHold = 0;
    let cool = 0;
    for (let i = 0; i < rounds; i++) {
      const p = g.player;
      const boss = g.boss;
      if (!boss || boss.dead || g.state !== 'playing') break;
      const dx = boss.cx - p.cx;
      const wantJump = boss.state === 'slam' || boss.state === 'dash';
      if (wantJump && jumpHold <= 0 && cool <= 0) { jumpHold = 17; cool = 24; }
      input.forceDown('jump', jumpHold-- > 0);
      cool--;
      const near = keepDistance || 44;
      input.forceDown('right', dx > near);
      input.forceDown('left', dx < -near);
      input.forceDown('attack', Math.abs(dx) < 78 && i % 20 < 3);
      g.update(DT, input);
      g.render(document.querySelector('canvas').getContext('2d'));
      // Keep the demo run alive so the fight reaches its later phases.
      if (p.hp <= 2) p.hp = p.maxHp;

      if (stopWhen === 'phase2' && boss.phase >= 2) break;
      if (stopWhen === 'phase3' && boss.phase >= 3) break;
      if (stopWhen === 'attack' && (boss.state === 'slam' || boss.state === 'cast') && g.projectiles.length > 0) break;
      if (stopWhen === 'orbs' && g.projectiles.filter((q) => q.kind === 'orb').length >= 3) break;
      if (stopWhen === 'minions' && g.enemies.filter((e) => !e.dead).length >= 2 && Math.abs(dx) > 120) break;
    }
    ['left', 'right', 'attack', 'jump'].forEach((a) => input.forceDown(a, false));
    return { bossHp: g.boss.hp, phase: g.boss.phase, state: g.state, projectiles: g.projectiles.length };
  }, { rounds, stopWhen, keepDistance });
}

/**
 * The same for Thalassa, who is an enemy rather than the knight, so the boss
 * helper above cannot see her. Stops on the moment worth a picture: a column of
 * her spring tide standing on the floor.
 */
async function drownedRound(rounds, stopWhen = 'tide') {
  return page.evaluate(({ rounds, stopWhen }) => {
    const g = window.game;
    const input = window.input;
    const DT = 1 / 60;
    let seen = null;
    for (let i = 0; i < rounds; i++) {
      const p = g.player;
      const boss = g.enemies.find((e) => e.kind === 'thalassa' && !e.dead);
      if (!boss || g.state !== 'playing') break;
      boss.engaged = true;
      const dx = boss.cx - p.cx;
      input.forceDown('right', dx > 60);
      input.forceDown('left', dx < -60);
      input.forceDown('attack', Math.abs(dx) < 78 && i % 18 < 3);
      g.update(DT, input);
      g.render(document.querySelector('canvas').getContext('2d'));
      // Neither side is allowed to end the demo run early.
      if (p.hp <= 2) p.hp = p.maxHp;
      if (stopWhen === 'tide' && boss.hp <= boss.maxHp * 0.45) boss.hp = boss.maxHp * 0.5;
      const standing = boss.geysers.filter((q) => q.t > q.wind && q.t < q.wind + 0.32);
      if (stopWhen === 'tide' && standing.length >= 2) {
        seen = { columns: standing.length, state: boss.state };
        break;
      }
      if (stopWhen === 'fall' && boss.dead) {
        seen = { fell: true, seconds: +(i / 60).toFixed(1) };
        break;
      }
    }
    for (const a of ['left', 'right', 'attack', 'jump']) input.forceDown(a, false);
    return seen ?? { columns: 0 };
  }, { rounds, stopWhen });
}

const results = {};

/* 01 — title ------------------------------------------------------------- */
await open();
await step(60);
await shot('01-titel');

/* 02 — first steps in the forest ----------------------------------------- */
// Die Sprungpunkte hinter den Höhlen aus den Spawns ableiten: ein neuer
// Abschnitt mitten im Level verschiebt sonst jedes Bild um dieselbe Zahl.
await open('?x=6');
const marken = await page.evaluate(() => {
  const spawns = window.game.level.spawns;
  const at = (kind) => spawns.find((s) => s.kind === kind)?.tx ?? 0;
  return {
    boss: at('boss'),
    gallert: at('gallert'),
    thalassa: at('thalassa'),
    hydra: at('hydra'),
    portal: at('portal'),
  };
});
await step(30);
await step(50, { right: true });
await release('right');
await step(3, { attack: true });
await release('attack');
await step(4);
await shot('02-nebelwald');

/* 03 — slime combat ------------------------------------------------------ */
await open('?x=19');
await step(30);
await step(26, { right: true });
await release('right');
await step(3, { attack: true });
await release('attack');
await step(4);
await shot('03-schwertkampf');

/* 04 — jumping the pits -------------------------------------------------- */
await open('?x=43');
await step(20);
await step(18, { right: true });
await step(17, { right: true, jump: true });
await release('jump');
await step(12, { right: true });
await release('right');
await shot('04-spruenge');

/* 05 — skeletons over spikes --------------------------------------------- */
await open('?x=86');
await step(30);
await step(46, { right: true });
await release('right');
await step(3, { attack: true });
await release('attack');
await step(4);
await shot('05-skelett-und-stacheln');

/* 06 — lava crossing ----------------------------------------------------- */
await open('?x=124');
await step(30);
await step(20, { right: true });
await jump(20);
await release('right');
await shot('06-lava');

/* 07 — the ruins --------------------------------------------------------- */
await open('?x=168');
await step(30);
await step(24, { right: true });
await jump(24);
await release('right');
await shot('07-ruinen');

/* 08 — climbing the ruins ------------------------------------------------ */
await open('?x=216');
await step(30);
await step(10, { right: true });
await jump(6);
await step(17, { right: true, jump: true });
await release('jump', 'right');
await step(8);
await shot('08-ruinen-aufstieg');

/* 09 — crystal caverns --------------------------------------------------- */
await open('?x=282');
await step(40);
await step(24, { right: true });
await jump(18);
await release('right');
await shot('09-kristallhoehlen');

/* 10 — the drowned hall --------------------------------------------------- */
await open(`?x=${marken.thalassa - 86}`);
await step(30);
await step(40, { right: true });
await release('right');
await step(6);
await shot('10-ertrunkene-halle');

/* 11 — Thalassa ----------------------------------------------------------- */
await open(`?x=${marken.thalassa - 14}`);
await step(20);
await step(60, { right: true });
await release('right');
results['11-tide'] = await drownedRound(900);
await shot('11-thalassa');

/* 20 — the Flutklinge, the reward for her ------------------------------- */
// Carried out for real: the same fight to its end, the closing words read, and
// then a swing. The first tier of the blade cannot be shown any other way
// without simply handing it over, which would prove nothing.
results['20-flutklinge'] = await drownedRound(60 * 200, 'fall');
await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const ctx = document.querySelector('canvas').getContext('2d');
  const t = (a = {}) => {
    for (const [k, v] of Object.entries({ left: false, right: false, attack: false, confirm: false, ...a })) {
      input.forceDown(k, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };
  for (let i = 0; i < 60 * 10 && g.dialogue; i++) t({ confirm: i % 16 < 4 });
  for (let i = 0; i < 40; i++) t();
  g.player.facing = 1;
  for (let i = 0; i < 12; i++) t({ attack: i < 3 });
});
results['20-tier'] = await page.evaluate(() => window.game.player.beamTier);
await shot('20-flutklinge');

/* 21 — Gallert in the bog ----------------------------------------------- */
// The first boss, caught mid-spit: his three blobs on the way over are the
// picture, because batting them out of the air is what he is there to teach.
await open(`?x=${marken.gallert - 12}`);
await step(20);
await step(40, { right: true });
await release('right');
results['21-gallert'] = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const ctx = document.querySelector('canvas').getContext('2d');
  const t = (a = {}) => {
    for (const [k, v] of Object.entries({ left: false, right: false, attack: false, ...a })) {
      input.forceDown(k, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };
  for (let i = 0; i < 60 * 40; i++) {
    const p = g.player;
    const boss = g.enemies.find((e) => e.kind === 'gallert' && !e.dead);
    if (!boss) break;
    boss.engaged = true;
    // Neither side ends the demo early.
    if (p.hp <= 3) p.hp = p.maxHp;
    if (boss.hp <= boss.maxHp * 0.55) boss.hp = boss.maxHp * 0.6;
    // Held at the range he spits from, not the one he leaps at.
    const dx = boss.cx - p.cx;
    t({ right: dx > 240, left: dx < 200, attack: Math.abs(dx) < 78 && i % 18 < 3 });
    const blobs = g.projectiles.filter((q) => !q.friendly && q.kind === 'blob');
    // Out in the open between the two of them, or the picture is just his glow.
    if (
      blobs.length >= 2 &&
      blobs.every((q) => Math.abs(q.cx - p.cx) > 55 && Math.abs(q.cx - boss.cx) > 55)
    ) {
      for (const a of ['left', 'right', 'attack']) input.forceDown(a, false);
      return { blobs: blobs.length, state: boss.state, seconds: +(i / 60).toFixed(1) };
    }
  }
  return { blobs: 0 };
});
await shot('21-gallert');

/* 22 — the knight answers the crescent ---------------------------------- */
// Shown with the upgraded blade in hand, which a run only carries this far
// after the crystal hall: he bats the crescent out of the air while he is not
// committed to anything, and the picture has to make that readable.
await open(`?x=${marken.boss - 22}`);
await step(20);
results['22-parry'] = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const p = g.player;
  const ctx = document.querySelector('canvas').getContext('2d');
  const t = (a = {}) => {
    for (const [k, v] of Object.entries({ left: false, right: false, attack: false, jump: false, ...a })) {
      input.forceDown(k, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };
  p.beamTier = 2;
  const boss = g.boss;
  for (let f = 0; f < 60 * 25 && !boss.engaged; f++) t({ right: true, jump: f % 90 < 12 });
  for (let f = 0; f < 60 * 4 && boss.state === 'intro'; f++) t();
  const home = boss.x;
  for (let f = 0; f < 60 * 12; f++) {
    // Held in his open stance, and the hero held out of sword reach: the shot
    // is about the blade, not about who is winning.
    boss.state = 'idle';
    boss.timer = 9;
    boss.x = home;
    boss.vx = 0;
    p.x = home - 190;
    p.vx = 0;
    p.facing = 1;
    p.invuln = 999;
    p.hp = p.maxHp;
    const before = boss.guardFlash;
    t({ attack: f % 24 < 4 });
    if (boss.guardFlash > before && boss.guardFlash > 0.85) {
      g.camera.snapTo((p.cx + boss.cx) / 2, boss.cy);
      t();
      for (const a of ['left', 'right', 'attack', 'jump']) input.forceDown(a, false);
      return { guarded: true, atSecond: +(f / 60).toFixed(1) };
    }
  }
  return { guarded: false };
});
await shot('22-klinge-pariert');


/* 12 — castle ------------------------------------------------------------- */
await open(`?x=${marken.boss - 146}`);
await step(30);
await step(40, { right: true });
await release('right');
await step(3, { attack: true });
await release('attack');
await step(4);
await shot('12-burg-nachtfall');

/* 13 — entering the throne room ------------------------------------------ */
await open(`?x=${marken.boss - 26}`);
await step(20);
await step(70, { right: true });
await release('right');
await step(40);
await shot('13-boss-erscheint');

/* 12 — boss fight, phase 1 ----------------------------------------------- */
results.phase1 = await fightRound(60 * 7);
await shot('14-bosskampf-phase-1');

/* 13 — phase 2: shockwaves and summoned minions -------------------------- */
results.phase2 = await fightRound(60 * 60, 'phase2');
results.phase2attack = (await fightRound(60 * 20, 'orbs', 210)) ?? null;
await shot('15-bosskampf-phase-2');

/* 14 — phase 3: the enraged knight --------------------------------------- */
results.phase3 = await fightRound(60 * 90, 'phase3');
results.phase3attack = await fightRound(60 * 20, 'attack', 150);
await shot('16-bosskampf-phase-3');

/* 15 — the seal breaks, the rift opens ------------------------------------ */
results.finish = await fightRound(60 * 120);
await page.evaluate(() => {
  const g = window.game;
  if (g.boss && !g.boss.dead) {
    g.boss.vulnerable = true;
    g.boss.hurt(g.boss.hp, 1, g);
  }
});
await step(60 * 5);
results.sealOpen = await page.evaluate(() => !window.game.level.exitSealed);

/* 16 — the rift ----------------------------------------------------------- */
await open(`?x=${marken.boss + 35}`);
await step(40);
await step(40, { right: true });
await release('right');
await step(10);
await shot('17-der-riss');

/* 16b — Die Fünfkronige, mid-fight ---------------------------------------- */
// The whole mechanic in one frame: five necks, one already burned shut, one an
// open stump counting down, and her fire in the air on its way to the hero.
await open(`?x=${marken.hydra - 9}`);
await step(30);
results.hydraFight = await page.evaluate(() => {
  const g = window.game;
  const p = g.player;
  const h = g.enemies.find((e) => e.kind === 'hydra');
  p.x = h.cx - 250;
  p.y = h.bottom - p.h;
  p.vx = 0;
  p.vy = 0;
  p.invuln = 999;
  p.facing = 1;
  g.camera.snapTo(p.cx + 120, p.cy - 70);
  h.engaged = true;
  h.necks[0].state = 'sealed';
  h.necks[0].hp = 0;
  h.necks[3].state = 'stump';
  h.necks[3].regrow = 6.2;
  h.acting = 1;
  h.state = 'wind';
  h.glow = 1;
  h.timer = 3;
  h.necks[1].jaw = 1;
  h.lobEmbers(g, h.headCentre(h.necks[1]), 1);
  return { sealed: h.sealed, open: h.openStumps.length, heads: h.heads.length };
});
await step(26);
await shot('23-fuenfkronige');

/* 16c — the climb, with the storm neck up the shaft ------------------------ */
await open(`?x=${marken.hydra - 9}`);
await step(30);
results.hydraClimb = await page.evaluate(() => {
  const g = window.game;
  const p = g.player;
  const TILE = 32;
  const h = g.enemies.find((e) => e.kind === 'hydra');
  h.engaged = true;
  h.state = 'recover';
  h.timer = 3;
  h.acting = 4;
  h.glow = 0.8;
  // Third step from the bottom, read out of the level rather than assumed.
  const spans = [];
  for (let ty = 1; ty < g.level.height; ty++) {
    let run = null;
    for (let tx = Math.floor((h.cx - 700) / TILE); tx <= Math.floor((h.cx + 700) / TILE); tx++) {
      if (g.level.platformAt(tx, ty)) {
        if (!run) run = { ty, x0: tx, x1: tx };
        else run.x1 = tx;
      } else if (run) {
        spans.push(run);
        run = null;
      }
    }
    if (run) spans.push(run);
  }
  spans.sort((a, b) => b.ty - a.ty);
  const step3 = spans[2];
  p.x = (step3.x0 + 1) * TILE;
  p.y = step3.ty * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.invuln = 999;
  g.camera.snapTo(p.cx + 40, p.cy);
  h.markDrops(g, [p.cx + 30, h.cx - 120, h.cx + 150], 1.6);
  return { row: step3.ty };
});
await step(40);
await shot('24-der-aufstieg');

/* 17 — the gate home ------------------------------------------------------ */
// Within sight of the gate rather than a hundred tiles short of it: the view is
// 960 px wide, so nine tiles back puts the door in frame with room to walk at
// it - and not so close that the shot walks into it and ends the run.
await open(`?x=${marken.portal - 9}`);
// The gate is hers until the last head falls; these two shots are about the
// door, so she is taken off the board rather than fought here.
await page.evaluate(() => {
  for (const e of window.game.enemies) if (e.kind === 'hydra') e.dead = true;
});
await step(40);
await step(20, { right: true });
await release('right');
await step(10);
await shot('18-das-tor');

/* 18 — victory ------------------------------------------------------------ */
await page.evaluate(() => {
  const g = window.game;
  for (const e of g.enemies) if (e.kind === 'hydra') e.dead = true;
  g.player.x = g.portal.cx - 8;
  g.player.y = g.portal.y + 10;
});
await step(60 * 5);
await shot('19-sieg');
results.finalState = await page.evaluate(() => window.game.state);

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();
