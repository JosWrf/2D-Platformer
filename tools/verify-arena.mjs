/**
 * Regression check for the boss arena softlock: luring the knight to the gate
 * and then dying used to leave him standing there. On the way back he woke up
 * through the wall and the portcullis slammed shut in front of the player, who
 * could never enter again.
 *
 * Usage: node tools/verify-arena.mjs
 * Exits non-zero if the arena cannot be re-entered after dying.
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
// Start at the last checkpoint before the arena, so respawning lands outside it.
await page.goto(`http://127.0.0.1:${server.address().port}/?x=482`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const result = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const ctx = document.querySelector('canvas').getContext('2d');
  const DT = 1 / 60;
  const tick = (actions = {}) => {
    for (const [a, v] of Object.entries({ left: false, right: false, confirm: false, ...actions })) {
      input.forceDown(a, v);
    }
    g.update(DT, input);
    g.render(ctx);
  };

  const arenaLeft = g.level.arenaLeft;
  const checkpointX = g.player.cx;
  const log = [];

  // Getting to the arena on foot is the playtest bot's job; drop the hero in.
  g.player.x = g.boss.cx - 220;
  g.player.y = g.boss.y + g.boss.h - g.player.h;
  for (let i = 0; i < 60 * 6 && !g.boss.engaged; i++) tick();
  if (!g.boss.engaged) return { ok: false, log: ['boss never engaged'] };
  log.push(`fight started, gate closed: ${g.level.gateClosed}`);

  // Lure the knight left, towards the gate.
  for (let i = 0; i < 60 * 20; i++) {
    tick({ left: true });
    g.player.hp = g.player.maxHp;
    if (g.boss.cx < arenaLeft + 120) break;
  }
  log.push(`knight lured to x=${Math.round(g.boss.cx)} (arena starts at ${arenaLeft})`);

  // Die, and wait for the respawn at the checkpoint outside the arena.
  g.player.hp = 0;
  g.player.dead = true;
  for (let i = 0; i < 60 * 12; i++) {
    tick({ confirm: i % 20 === 0 });
    if (i > 4 && g.state === 'playing') break;
  }
  log.push(
    `respawned at x=${Math.round(g.player.cx)}, knight back at ${Math.round(g.boss.cx)}, gate closed: ${g.level.gateClosed}`,
  );

  // Walk back in. Only the gate matters here, so the path is a free ride.
  let closedWhileOutside = false;
  let entered = false;
  for (let i = 0; i < 60 * 20; i++) {
    if (g.player.cx < arenaLeft + 60) g.player.x += 3;
    tick();
    if (g.player.hp <= 2) g.player.hp = g.player.maxHp;
    if (g.state !== 'playing') break;
    if (g.level.gateClosed && g.player.cx < arenaLeft) closedWhileOutside = true;
    if (g.player.cx > arenaLeft + 40 && !closedWhileOutside) {
      entered = true;
      break;
    }
  }
  log.push(`gate closed while still outside: ${closedWhileOutside}`);

  return {
    ok: entered && !closedWhileOutside,
    checkpointX: Math.round(checkpointX),
    arenaLeft,
    bossAfterRespawn: Math.round(g.boss.cx),
    entered,
    closedWhileOutside,
    log,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error('FAIL: the arena cannot be re-entered after dying next to the gate.');
  process.exit(1);
}
console.log('OK: the arena is still reachable after dying next to the gate.');
