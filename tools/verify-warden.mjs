/**
 * The Shard Warden, the mini-boss in the rift.
 *
 * The thing worth guarding here is that it gets to act at all. Every hit used
 * to re-stun it, so a player who simply held the attack key never saw one of
 * its three moves - it was a sandbag with a health bar. It now shrugs off a
 * few points of damage mid-move, and only a parry or a real beating breaks it.
 *
 * Usage: node tools/verify-warden.mjs
 * Exits non-zero if the warden stops choosing its move by range, stops
 * answering a button-masher, or can no longer be killed.
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
// Der Startpunkt wird aus den Spawns abgeleitet, nicht aus einer Kachelzahl:
// ein Abschnitt, der irgendwo im Level eingeschoben wird, verschiebt sonst
// jedes Werkzeug auf einmal.
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
    for (const [a, v] of Object.entries({ left: false, right: false, jump: false, attack: false, parry: false, ...actions })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };
  g.level.exitSealed = false;
  g.bossDefeated = true;
  if (g.boss) g.boss.dead = true;

  const warden = g.enemies.find((e) => e.kind === 'warden');
  if (!warden) return { ok: false, note: 'no warden in the level' };
  /** Where the level puts her; every reset goes back to this. */
  const home = warden.x;

  /** Puts both back on their feet, a given distance apart. */
  const reset = (gap) => {
    // A death in an earlier phase would leave the game paused on its death
    // screen, and every tick after that would do nothing at all.
    g.state = 'playing';
    warden.hp = warden.maxHp;
    warden.dead = false;
    warden.state = 'stalk';
    warden.timer = 0.1;
    warden.stun = 0;
    warden.engaged = true;
    warden.x = home;
    warden.y = 17 * 32 - 14;
    warden.vx = warden.vy = 0;
    p.x = warden.x - gap;
    p.y = 17 * 32;
    p.vx = p.vy = 0;
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 0;
  };

  // Which move does it pick from which range? The player holds his distance
  // and never swings, so nothing interrupts the choice.
  const moveAt = (gap) => {
    reset(gap);
    const seen = new Set();
    let shots = 0;
    for (let f = 0; f < 60 * 20; f++) {
      // The player is held at exactly this range rather than walking it: over
      // twenty seconds a chase drifts the pair right out of the arena, and
      // then the range under test is not the range any more.
      p.x = warden.x - gap;
      p.y = 17 * 32;
      p.vx = 0;
      p.hp = p.maxHp;
      p.invuln = 1;
      tick();
      seen.add(warden.state);
      shots = Math.max(shots, g.projectiles.filter((q) => !q.friendly).length);
    }
    return { moves: [...seen].filter((s) => s.endsWith('Wind')).sort(), shots, seen: [...seen].sort() };
  };

  const close = moveAt(50);
  const mid = moveAt(150);
  const far = moveAt(280);

  // Against a player who just mashes attack it still has to land a blow.
  reset(60);
  let taken = 0;
  for (let f = 0; f < 60 * 30 && !warden.dead; f++) {
    if (p.hp < p.maxHp) {
      taken += p.maxHp - p.hp;
      p.hp = p.maxHp;
    }
    if (p.dead) break;
    const d = warden.cx - p.cx;
    tick({ right: d > 40, left: d < -40, attack: f % 10 < 4 });
  }
  const killed = warden.dead;

  return {
    ok:
      close.moves.includes('slamWind') &&
      mid.moves.includes('lungeWind') &&
      far.moves.includes('volleyWind') &&
      far.shots >= 3 &&
      taken > 0 &&
      killed,
    maxHp: warden.maxHp,
    close,
    mid,
    far,
    damageDealtToMasher: taken,
    killedByMasher: killed,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error('FAIL: the warden no longer picks its move by range, no longer answers a masher, or cannot be killed.');
  process.exit(1);
}
console.log('OK: the warden slams up close, lunges at mid range, throws shards from afar, and still dies.');
