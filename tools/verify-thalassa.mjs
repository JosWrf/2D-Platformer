/**
 * Thalassa, the Drowned Crown - the boss of the middle of the game.
 *
 * The same three things the other bosses have to keep doing: she picks her move
 * by range, she sees a move through instead of being re-stunned out of it by
 * every hit, and she can be killed. What is hers alone is that two of her moves
 * reach across the whole floor, so the range test also checks that standing far
 * away is answered rather than ignored.
 *
 * And one thing she must NOT be: a wall. Her choir has no portcullis, so a
 * player who does not want the fight has to be able to walk past it. Measured,
 * that costs one heart.
 *
 * Usage: node tools/verify-thalassa.mjs
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
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
const startTile = await page.evaluate(() => {
  const t = window.game.level.spawns.find((s) => s.kind === 'thalassa');
  return Math.max(2, (t?.tx ?? 480) - 14);
});
await page.goto(`http://127.0.0.1:${server.address().port}/?x=${startTile}`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const result = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const p = g.player;
  const ctx = document.querySelector('canvas').getContext('2d');
  const tick = (actions = {}) => {
    for (const [a, v] of Object.entries({ left: false, right: false, jump: false, attack: false, ...actions })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };

  let boss = g.enemies.find((e) => e.kind === 'thalassa');
  if (!boss) return { ok: false, note: 'no Thalassa in the level' };
  const home = boss.x;
  const floorY = boss.y + boss.h - 32;

  // She is not a gate: walking past her has to work, at a price.
  const passHp = (() => {
    boss.engaged = true;
    for (let f = 0; f < 60 * 25 && p.cx < home + 300; f++) {
      tick({ right: true, jump: f % 90 < 12 });
    }
    const got = p.cx > home + 200;
    return { walkedPast: got, heartsLeft: p.hp };
  })();
  g.restart();
  g.state = 'playing';
  boss = g.enemies.find((e) => e.kind === 'thalassa') ?? boss;

  /** Which move she picks from which range, with both sides pinned. */
  const moveAt = (gap) => {
    boss.hp = boss.maxHp;
    boss.dead = false;
    boss.state = 'stalk';
    boss.timer = 0.1;
    boss.stun = 0;
    boss.engaged = true;
    const seen = new Set();
    let shots = 0;
    for (let f = 0; f < 60 * 22; f++) {
      boss.x = home;
      boss.vx = 0;
      p.x = home - gap;
      p.y = floorY;
      p.vx = 0;
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 1;
      tick();
      seen.add(boss.state);
      shots = Math.max(shots, g.projectiles.filter((q) => !q.friendly).length);
    }
    return { moves: [...seen].filter((s) => s.endsWith('Wind')).sort(), shots };
  };
  const near = moveAt(80);
  const far = moveAt(300);

  // Against a player who only mashes attack she still has to land a blow, and
  // still has to die.
  boss.hp = boss.maxHp;
  boss.dead = false;
  boss.engaged = true;
  boss.x = home;
  boss.y = floorY - (boss.h - 32);
  if (!g.enemies.includes(boss)) g.enemies.push(boss);
  p.x = home - 70;
  p.y = floorY;
  p.hp = p.maxHp;
  p.dead = false;
  // The range runs above hold him invulnerable; leaving that standing here
  // would have the first blows land for nothing and read as her missing.
  p.invuln = 0;
  g.camera.snapTo(p.cx, p.cy);
  /*
   * Twenty seconds of being mashed, with her health topped up so the fight
   * cannot simply end first. Measuring "does she answer" up to her death made
   * the result a coin toss: a fast enough player kills her in eleven seconds,
   * and whether she landed one of her three or four moves in that time was
   * chance rather than behaviour.
   */
  let taken = 0;
  const masherStates = new Set();
  let shotsSpawned = 0;
  const seenShots = new Set();
  let staggers = 0;
  let lastStun = 0;
  for (let f = 0; f < 60 * 20; f++) {
    if (g.state !== 'playing') {
      tick({ confirm: true });
      continue;
    }
    if (p.hp < p.maxHp) {
      taken += p.maxHp - p.hp;
      p.hp = p.maxHp;
      p.dead = false;
    }
    boss.hp = Math.max(boss.hp, 10);
    boss.dead = false;
    const d = boss.cx - p.cx;
    tick({ right: d > 44, left: d < -44, attack: Math.abs(d) < 72 && f % 11 < 4 });
    masherStates.add(boss.state);
    for (const q of g.projectiles) {
      if (q.friendly || seenShots.has(q)) continue;
      seenShots.add(q);
      shotsSpawned++;
    }
    if (boss.stun > 0 && lastStun <= 0) staggers++;
    lastStun = boss.stun;
  }

  // And separately: she can still be brought down.
  let sawPhaseTwo = false;
  boss.hp = boss.maxHp;
  boss.dead = false;
  for (let f = 0; f < 60 * 90 && !boss.dead; f++) {
    if (g.state !== 'playing') {
      tick({ confirm: true });
      continue;
    }
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = Math.max(p.invuln, 0.3);
    if (boss.phase === 2) sawPhaseTwo = true;
    const d = boss.cx - p.cx;
    tick({ right: d > 44, left: d < -44, attack: Math.abs(d) < 72 && f % 11 < 4 });
  }

  return {
    ok:
      near.moves.includes('surgeWind') &&
      far.moves.includes('anchorWind') &&
      (near.moves.includes('undertowWind') || far.moves.includes('undertowWind')) &&
      far.shots > 0 &&
      taken > 0 &&
      sawPhaseTwo &&
      shotsSpawned >= 3 &&
      passHp.walkedPast &&
      passHp.heartsLeft >= 3 &&
      boss.dead,
    maxHp: boss.maxHp,
    near,
    far,
    damageDealtToMasher: taken,
    sawPhaseTwo,
    killed: boss.dead,
    masherStates: [...masherStates].sort(),
    staggers,
    shotsSpawned,
    walkPast: passHp,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error('FAIL: Thalassa no longer picks her move by range, no longer answers a masher, or cannot be killed.');
  process.exit(1);
}
console.log(
  'OK: Thalassa surges up close, throws the anchor from afar, drags him in, can be walked past, ' +
    'and still drowns.',
);
