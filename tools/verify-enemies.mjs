/**
 * The three enemy types that ask a question the roaming skeletons do not.
 *
 * Each of them exists for one answer, and each of those answers is checked here
 * because each of them is a thing that can silently stop working:
 *
 *  - Zunder goes off. Killing it point-blank goes off too, which is the whole
 *    trap; killing it from across the room does not touch the hero, which is
 *    what makes the thrown crescent worth having.
 *  - Schildwache cannot be beaten by holding the attack key: everything into
 *    the shield stops there. Behind it, or after a parry, blows land.
 *  - Klingenläufer crosses the room, and a charge into a wall leaves it dazed
 *    and taking double - the level is the weapon.
 *
 * And one thing that is not about behaviour at all: an explosion must not cost
 * a frame. The hit flash is a canvas filter, every enemy caught in the blast
 * carries one for a dozen frames, and each filtered draw makes the browser
 * allocate a layer the size of the view. Measured before the fix: 97 ms
 * frames, six in a row, every time a Zunder went off.
 *
 * Usage: node tools/verify-enemies.mjs
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
// The flat floor of the warden's arena: no ledges, no hazards, so what is
// measured is the enemy and not the terrain.
const startTile = await page.evaluate(() => {
  const w = window.game.level.spawns.find((s) => s.kind === 'warden');
  return Math.max(2, (w?.tx ?? 712) - 12);
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
    for (const [a, v] of Object.entries({
      left: false,
      right: false,
      jump: false,
      attack: false,
      parry: false,
      ...actions,
    })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };

  // Flat ground in the middle of the warden's arena. A hard-coded tile would
  // be a hole in the floor the next time a section is inserted anywhere.
  const stageX = ((g.level.spawns.find((s) => s.kind === 'warden')?.tx ?? 712) - 10) * 32;
  const floorTop = 18 * 32;
  /** Clears the arena and puts one fresh enemy of a kind at a given offset. */
  const stage = (kind, gap) => {
    for (const e of g.enemies) e.dead = true;
    g.enemies.length = 0;
    g.projectiles.length = 0;
    g.state = 'playing';
    p.x = stageX;
    p.y = floorTop - p.h;
    p.vx = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 0;
    p.attackTimer = 0;
    p.attackCombo = 0;
    p.parryTimer = 0;
    p.facing = 1;
    g.camera.snapTo(p.cx, p.cy);
    const e = g.spawnEnemyOfKind(kind, p.x + gap, floorTop);
    e.active = true;
    for (let i = 0; i < 4; i++) tick();
    p.hp = p.maxHp;
    p.invuln = 0;
    return e;
  };

  const out = {};

  /* ------------------------------------------------------------ Zunder */

  // Walks at him and goes off on its own.
  {
    const z = stage('bomber', 120);
    let lit = false;
    for (let f = 0; f < 60 * 8 && !z.dead; f++) {
      p.invuln = 0;
      tick();
      if (z.state === 'fuse') lit = true;
    }
    out.bomberWalksAndBursts = { litItself: lit, exploded: z.dead, heartsLost: p.maxHp - p.hp };
  }

  // Killed point-blank: the burst still catches him.
  {
    const z = stage('bomber', 30);
    z.hp = 1;
    z.hurt(5, 1, g);
    for (let i = 0; i < 40; i++) {
      p.invuln = 0;
      tick();
    }
    out.bomberKilledClose = { exploded: z.dead, heartsLost: p.maxHp - p.hp };
  }

  // Killed from across the room: nothing reaches him.
  {
    const z = stage('bomber', 300);
    z.hp = 1;
    z.hurt(5, 1, g);
    for (let i = 0; i < 40; i++) {
      p.invuln = 0;
      tick();
    }
    out.bomberKilledFar = { exploded: z.dead, heartsLost: p.maxHp - p.hp };
  }

  // And it takes its neighbours with it.
  {
    const z = stage('bomber', 200);
    const other = g.spawnEnemyOfKind('skeleton', z.x + 24, floorTop);
    other.active = true;
    const before = other.hp;
    z.hp = 1;
    z.hurt(5, 1, g);
    for (let i = 0; i < 40; i++) {
      p.invuln = 0;
      tick();
    }
    out.bomberHurtsNeighbours = { damage: before - other.hp };
  }

  /* ------------------------------------------------------ Schildwache */

  {
    const w = stage('shieldman', 40);
    w.hp = w.maxHp = 20;
    w.facing = -1; // Facing the hero, who stands to its left.
    const before = w.hp;
    for (let i = 0; i < 60; i++) {
      w.facing = -1;
      w.x = p.x + 40;
      tick({ attack: i % 12 < 4 });
    }
    out.shieldBlocksFront = { damage: before - w.hp };
  }
  {
    const w = stage('shieldman', 40);
    w.hp = w.maxHp = 20;
    const before = w.hp;
    // Hit from behind: the shield is on the other side.
    for (let i = 0; i < 60; i++) {
      w.facing = 1;
      w.x = p.x + 40;
      tick({ attack: i % 12 < 4 });
    }
    out.shieldOpenFromBehind = { damage: before - w.hp };
  }
  {
    const w = stage('shieldman', 40);
    w.hp = w.maxHp = 20;
    w.facing = -1;
    // A parry drops the shield; after that a frontal blow lands.
    w.onParried(g);
    const exposed = w.exposed;
    const before = w.hp;
    for (let i = 0; i < 40; i++) {
      w.facing = -1;
      w.x = p.x + 40;
      tick({ attack: i % 12 < 4 });
    }
    out.shieldBrokenByParry = { exposed, damage: before - w.hp };
  }

  /* ----------------------------------------------------- Klingenläufer */

  {
    const r = stage('charger', 170);
    const seen = new Set();
    let hearts = 0;
    for (let f = 0; f < 60 * 8; f++) {
      p.invuln = 0;
      if (p.hp < p.maxHp) {
        hearts += p.maxHp - p.hp;
        p.hp = p.maxHp;
      }
      tick();
      seen.add(r.state);
    }
    out.chargerRuns = { states: [...seen].sort(), heartsLost: hearts };
  }
  {
    /*
     * Into a wall. Staged in the crystal hall, because that is the one place
     * in the level with a wall that runs from the floor to the ceiling - the
     * arenas are open floor, and a charge across open floor never lands.
     */
    const boss = g.level.spawns.find((s) => s.kind === 'prismarch');
    const wallTile = (boss?.tx ?? 855) - 33;
    for (const e of g.enemies) e.dead = true;
    g.enemies.length = 0;
    g.state = 'playing';
    p.x = (wallTile + 12) * 32;
    p.y = floorTop - p.h;
    p.vx = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.dead = false;
    g.camera.snapTo(p.cx, p.cy);
    const r = g.spawnEnemyOfKind('charger', (wallTile + 6) * 32, floorTop);
    r.active = true;
    for (let i = 0; i < 4; i++) tick();
    r.state = 'run';
    r.timer = 0.62;
    r.facing = -1;
    r.vx = -420;
    let dazed = false;
    for (let f = 0; f < 120 && !dazed; f++) {
      p.invuln = 0;
      p.x = (wallTile + 12) * 32;
      tick();
      if (r.state === 'dazed') dazed = true;
    }
    let doubled = 0;
    if (dazed) {
      r.hp = r.maxHp = 40;
      const before = r.hp;
      r.hurt(2, 1, g);
      doubled = before - r.hp;
    }
    out.chargerDazedOnWall = { dazed, damageFromTwo: doubled };
  }

  /* -------------------------------------------------- cost of a burst */

  {
    const z = stage('bomber', 90);
    // Two neighbours, so the blast flashes several sprites at once.
    for (const dx of [40, 130]) {
      const other = g.spawnEnemyOfKind('skeleton', z.x + dx, floorTop);
      other.active = true;
      other.hp = other.maxHp = 30;
    }
    for (let i = 0; i < 20; i++) tick();
    z.hp = 1;
    z.hurt(5, 1, g);
    let worst = 0;
    for (let f = 0; f < 90; f++) {
      p.invuln = 9999;
      p.hp = p.maxHp;
      const t0 = performance.now();
      tick();
      worst = Math.max(worst, performance.now() - t0);
    }
    out.burstWorstFrameMs = +worst.toFixed(1);
  }

  out.ok =
    out.bomberWalksAndBursts.litItself &&
    out.bomberWalksAndBursts.exploded &&
    out.bomberWalksAndBursts.heartsLost > 0 &&
    out.bomberKilledClose.exploded &&
    out.bomberKilledClose.heartsLost > 0 &&
    out.bomberKilledFar.exploded &&
    out.bomberKilledFar.heartsLost === 0 &&
    out.bomberHurtsNeighbours.damage > 0 &&
    out.shieldBlocksFront.damage === 0 &&
    out.shieldOpenFromBehind.damage > 0 &&
    out.shieldBrokenByParry.exposed &&
    out.shieldBrokenByParry.damage > 0 &&
    out.chargerRuns.states.includes('wind') &&
    out.chargerRuns.states.includes('run') &&
    out.chargerRuns.heartsLost > 0 &&
    out.chargerDazedOnWall.dazed &&
    out.chargerDazedOnWall.damageFromTwo === 4 &&
    out.burstWorstFrameMs < 16.67;
  return out;
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error('FAIL: one of the three new enemies no longer does the one thing it is there for.');
  process.exit(1);
}
console.log(
  'OK: Zunder goes off (and only reaches what is near it) without costing a frame, the shield ' +
    'holds from the front, and a charge into a wall pays.',
);
