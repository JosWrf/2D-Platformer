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
 * It also pins the third thing the gate has to get right: it is shut while the
 * hydra in the shaft still lives, and it says so instead of ignoring the hero.
 *
 * Usage: node tools/verify-ending.mjs
 * Exits non-zero if the gate can be lost by walking on, if it opens while she
 * lives, or if a bot can no longer travel the rift and reach it.
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
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
// Der Startpunkt wird aus den Spawns abgeleitet, nicht aus einer Kachelzahl:
// ein Abschnitt, der irgendwo im Level eingeschoben wird, verschiebt sonst
// jedes Werkzeug auf einmal.
const startTile = await page.evaluate(() => {
  const boss = window.game.level.spawns.find((s) => s.kind === 'boss');
  return (boss?.tx ?? 550) + 22;
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
  // The rift is only open once the knight has fallen; skip the fight itself.
  // The hydra in the shaft holds the gate shut on top of that, and this tool
  // is about the road and the door rather than her fight - verify:hydra is.
  const fellTheHydra = () => {
    for (const e of g.enemies) if (e.kind === 'hydra') e.dead = true;
  };
  const openTheWay = () => {
    g.level.exitSealed = false;
    g.bossDefeated = true;
    if (g.boss) g.boss.dead = true;
    fellTheHydra();
  };

  /*
   * First, the opposite: while she lives the gate is not a gate. A hero
   * standing in it for three seconds is still playing, and the refusal says so
   * out loud rather than silently doing nothing. He is put back where the warp
   * left him afterwards, so the travel run below still starts at the rift.
   */
  g.level.exitSealed = false;
  g.bossDefeated = true;
  if (g.boss) g.boss.dead = true;
  const home = { x: p.x, y: p.y };
  p.x = (g.portal.cx - p.w / 2) | 0;
  p.y = g.portal.y + g.portal.h - p.h;
  p.vx = 0;
  p.vy = 0;
  g.zoneBanner = { text: '', timer: 0 };
  let toldWhy = false;
  for (let f = 0; f < 240; f++) {
    tick();
    if (g.zoneBanner && /FÜNFKRONIGE/.test(g.zoneBanner.text)) toldWhy = true;
    if (g.state !== 'playing') break;
  }
  const sealedByHer = { state: g.state, victoryTimer: g.victoryTimer, toldWhy };
  p.x = home.x;
  p.y = home.y;
  p.vx = 0;
  p.vy = 0;
  p.hp = p.maxHp;
  g.camera.snapTo(p.cx, p.cy);

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
      const foot = Math.floor((p.bottom + 6) / 32);
      const here = Math.floor(p.cx / 32);
      const ground = (t) => g.level.solidAt(t, foot) || g.level.platformAt(t, foot);
      // Take off a tile or two before the edge, the way a player does, and
      // only for a gap whose far side is within reach: a jump off the end of
      // a high ledge is a dive into whatever is under it, while walking off
      // the same edge just drops onto the floor below.
      let edge = -1;
      for (let i = 1; i <= 3 && edge < 0; i++) if (!ground(here + dir * i)) edge = i;
      let landing = false;
      if (edge >= 0) {
        for (let i = edge + 1; i <= edge + 5 && !landing; i++) landing = ground(here + dir * i);
      }
      const gap = dir !== 0 && edge >= 0 && landing;
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
    return { deaths, furthestTile: Math.round(furthest / 32), stuckAt: Math.round(p.cx / 32) };
  };

  const run = travel(60 * 240);
  const reached = g.state === 'victory';

  // Second run: touch the gate and keep walking. The run must still count.
  g.restart();
  g.state = 'playing';
  openTheWay();
  p.x = (g.portal.cx - 300) | 0;
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
    ok:
      reached &&
      g.state === 'victory' &&
      touchedAt >= 0 &&
      sealedByHer.state === 'playing' &&
      sealedByHer.victoryTimer === 0 &&
      sealedByHer.toldWhy,
    sealedByHer,
    rift: { ...run, gateTile: Math.round(g.portal.cx / 32), reachedGate: reached },
    walkingOn: { touchedAtFrame: touchedAt, endState: g.state, endTile: Math.round(p.cx / 32) },
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    'FAIL: the rift no longer leads to the gate, the gate can be walked past into a death, or it ' +
      'no longer stays shut - and says why - while the hydra lives.',
  );
  process.exit(1);
}
console.log(
  'OK: the gate refuses while the hydra lives and says so, the rift is travelled on real physics, ' +
    'and the gate ends the run even when the key stays down.',
);
