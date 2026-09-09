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
    // Topping its health up mid-loop can still let a frame slip through where
    // it counts as dead, and the game drops dead enemies from the list. Put it
    // back before every phase, or the next phase measures a detached object.
    if (!g.enemies.includes(warden)) g.enemies.push(warden);
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
    const counted = new Set();
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
      // Counted as they appear, not as they stand: a shard that hits a wall
      // before the next one leaves the hand made the volley look like two, and
      // the check right at the boundary flaked.
      for (const q of g.projectiles) {
        if (q.friendly || counted.has(q)) continue;
        counted.add(q);
        shots++;
      }
    }
    return { moves: [...seen].filter((s) => s.endsWith('Wind')).sort(), shots, seen: [...seen].sort() };
  };

  const close = moveAt(50);
  const mid = moveAt(150);
  const far = moveAt(280);

  /*
   * Against a player who just mashes attack it still has to land a blow -
   * measured over a fixed twenty seconds with its health topped up. Measuring
   * this up to its death was a coin toss: sixteen health falls to a masher in
   * under three seconds, and whether one of its moves happened to connect in
   * that window was chance rather than behaviour.
   */
  reset(60);
  let taken = 0;
  for (let f = 0; f < 60 * 20; f++) {
    if (p.hp < p.maxHp) {
      taken += p.maxHp - p.hp;
      p.hp = p.maxHp;
      p.dead = false;
    }
    warden.hp = Math.max(warden.hp, 6);
    warden.dead = false;
    const d = warden.cx - p.cx;
    tick({ right: d > 40, left: d < -40, attack: f % 10 < 4 });
  }

  // And separately: a masher still brings it down.
  reset(60);
  let killed = false;
  for (let f = 0; f < 60 * 40 && !killed; f++) {
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = Math.max(p.invuln, 0.3);
    const d = warden.cx - p.cx;
    tick({ right: d > 40, left: d < -40, attack: f % 10 < 4 });
    killed = warden.dead;
  }

  /*
   * And its fall is final. This used to be wrong for every boss that lives in
   * the enemy roster: a checkpoint rebuilds the roster, so dying anywhere in
   * the world put the warden back on its feet with a full bar.
   */
  const alive = () => g.enemies.filter((e) => e.kind === 'warden' && !e.dead).length;
  const aliveAfterWin = alive();
  p.invuln = 0;
  p.hurt(99, 1, g, true);
  for (let f = 0; f < 60 * 6; f++) tick({ confirm: f % 12 < 4 });
  const aliveAfterDying = alive();

  return {
    ok:
      close.moves.includes('slamWind') &&
      // It has to come back out of the slam. It used to land and stay there:
      // the landing asked for a downward speed that the landing collision had
      // already zeroed, so the state only ended when something shook it loose.
      close.seen.includes('recover') &&
      mid.moves.includes('lungeWind') &&
      far.moves.includes('volleyWind') &&
      far.shots >= 3 &&
      taken > 0 &&
      killed &&
      aliveAfterWin === 0 &&
      aliveAfterDying === 0 &&
      g.state === 'playing',
    maxHp: warden.maxHp,
    close,
    mid,
    far,
    damageDealtToMasher: taken,
    killedByMasher: killed,
    stayedDown: { afterWin: aliveAfterWin, afterDying: aliveAfterDying, state: g.state },
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    'FAIL: the warden no longer picks its move by range, no longer answers a masher, cannot be ' +
      'killed, hangs in its own slam, or comes back on its feet after the hero dies.',
  );
  process.exit(1);
}
console.log('OK: the warden slams up close, lunges at mid range, throws shards from afar, dies, and stays dead.');
