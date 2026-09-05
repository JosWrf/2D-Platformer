/**
 * The last stretch of the game: the rift behind the broken seal, and the gate
 * that ends the run.
 *
 * Two things used to go wrong here, both at the very last moment of a whole
 * playthrough, which is the worst possible place to lose one:
 *  - the hero kept his controls for the 1.6 seconds the gate takes to close,
 *    so a held right key walked him straight off the ledge behind it and the
 *    finished run turned into a death;
 *  - the rift itself was only ever checked by the static reachability model in
 *    verify-level.mjs, which knows nothing about jump arcs.
 *
 * Usage: node tools/verify-ending.mjs
 * Exits non-zero if the gate can be lost by walking on, or if a bot can no
 * longer travel the rift and reach it.
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
// Just past the throne room, where the rift begins.
await page.goto(`http://127.0.0.1:${server.address().port}/?x=572`, { waitUntil: 'load' });
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
  // The rift is only open once the knight has fallen; skip the fight itself.
  const openTheWay = () => {
    g.level.exitSealed = false;
    g.bossDefeated = true;
    if (g.boss) g.boss.dead = true;
  };
  openTheWay();

  /**
   * A bot that travels towards the gate on real physics: it jumps when the
   * ground ahead runs out, and holds the button in two bursts, because a
   * button held down is one jump, not two.
   */
  const travel = (frames) => {
    let jumpHold = 0;
    let stuck = 0;
    let lastX = p.cx;
    let deaths = 0;
    let furthest = p.cx;
    for (let f = 0; f < frames; f++) {
      if (g.state === 'victory') break;
      if (g.state !== 'playing') {
        tick({ confirm: true });
        if (g.state === 'playing') deaths++;
        continue;
      }
      const dir = g.portal.cx > p.cx + 4 ? 1 : g.portal.cx < p.cx - 4 ? -1 : 0;
      const ahead = Math.floor((p.cx + dir * 26) / 32);
      const foot = Math.floor((p.bottom + 6) / 32);
      const gap = dir !== 0 && !g.level.solidAt(ahead, foot) && !g.level.platformAt(ahead, foot);
      const enemy = g.enemies.some((e) => !e.dead && Math.abs(e.cx - p.cx) < 60 && Math.abs(e.cy - p.cy) < 50);
      stuck = Math.abs(p.cx - lastX) < 0.6 ? stuck + 1 : 0;
      lastX = p.cx;
      if ((gap && p.onGround) || stuck > 20) {
        jumpHold = 40;
        stuck = 0;
      }
      const held = 40 - jumpHold;
      const jump = jumpHold > 0 && (held < 13 || (held >= 22 && held < 34));
      jumpHold--;
      tick({ right: dir > 0, left: dir < 0, jump, attack: enemy && f % 12 < 3 });
      furthest = Math.max(furthest, p.cx);
    }
    return { deaths, furthestTile: Math.round(furthest / 32) };
  };

  const run = travel(60 * 120);
  const reached = g.state === 'victory';

  // Second run: touch the gate and keep walking. The run must still count.
  g.restart();
  g.state = 'playing';
  openTheWay();
  p.x = 678 * 32;
  p.y = 17 * 32;
  p.vx = 0;
  p.vy = 0;
  let touchedAt = -1;
  for (let f = 0; f < 600; f++) {
    tick({ right: true });
    if (touchedAt < 0 && g.portal.overlaps(p.rect)) touchedAt = f;
    if (g.state === 'victory' || g.state === 'dead') break;
  }

  return {
    ok: reached && g.state === 'victory' && touchedAt >= 0,
    rift: { ...run, gateTile: Math.round(g.portal.cx / 32), reachedGate: reached },
    walkingOn: { touchedAtFrame: touchedAt, endState: g.state, endTile: Math.round(p.cx / 32) },
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error('FAIL: the rift no longer leads to the gate, or the gate can be walked past into a death.');
  process.exit(1);
}
console.log('OK: the rift is travelled on real physics, and the gate ends the run even when the key stays down.');
