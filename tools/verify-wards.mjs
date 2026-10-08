/**
 * Every boss is a boss, not a detour.
 *
 * Gallert, Thalassa and the warden used to stand in open ground: the bog, the
 * choir and the middle of the rift had no door, and a player who did not want
 * the fight simply walked past it - measured in the old verify:gallert and
 * verify:thalassa, at a cost of one heart. Every boss arena is warded now, and
 * this pins what the wards promise, arena by arena, on real physics:
 *
 *   - Before the fight the way on already stands, and the way in is open.
 *   - A hero who runs and jumps at the far ward for half a minute - kept alive
 *     the whole time, so the only thing that can stop him is the ward - never
 *     gets past it.
 *   - Once the boss is awake and he is inside, the way in comes down behind
 *     him, and walking back out does not work either.
 *   - Dying in there opens the way in again (the checkpoint is outside), and
 *     the boss is waiting, asleep, with the way on still shut.
 *   - When the boss falls, both wards go - and stay gone after another death.
 *
 * Gierschlund, Arachna and Umbra came with their own warded rooms from the
 * start; they are held to the same promises.
 *
 * Usage: node tools/verify-wards.mjs
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
await page.goto(`http://127.0.0.1:${server.address().port}/?state=playing`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const result = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const L = g.level;
  const ctx = document.querySelector('canvas').getContext('2d');
  const tick = (actions = {}) => {
    for (const [a, v] of Object.entries({
      left: false,
      right: false,
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
  const BOSSES = ['gallert', 'boar', 'mimic', 'jester', 'colossus', 'gloom', 'spider', 'wyrm', 'twins', 'thalassa', 'gargoyle', 'clock', 'vesper', 'shadow', 'warden'];
  const bossIn = (arena) =>
    g.enemies.find((e) => BOSSES.includes(e.kind) && !e.dead && e.x + e.w > arena.left - 40 && e.x < arena.right + 40);
  const keep = () => {
    const p = g.player;
    p.hp = p.maxHp;
    p.invuln = 2;
    p.dead = false;
  };
  const kill = (e) => {
    if (typeof e.beginDying === 'function') {
      e.beginDying(g);
      return;
    }
    e.overlaps({ x: -1e7, y: -1e7, w: 2e7, h: 2e7 });
    e.hurt(9999, 1, g);
  };
  /** Through any dialogue the fall brings, one line at a time. */
  const settle = (frames) => {
    for (let f = 0; f < frames; f++) {
      keep();
      tick({ confirm: f % 2 === 0 });
    }
  };
  const dieAndReturn = () => {
    const p = g.player;
    // By now he carries what the bosses before left him, and Arachna's silk
    // or the shadow's second breath would each catch this blow. A death is
    // what is wanted here, not a test of them.
    p.shieldUp = false;
    p.secondWind = false;
    p.invuln = 0;
    p.hurt(99, 1, g, true);
    for (let f = 0; f < 60 && g.state === 'playing'; f++) tick();
    for (let f = 0; f < 60 * 5 && g.state !== 'playing'; f++) tick({ confirm: f % 2 === 0 });
    for (let f = 0; f < 20; f++) tick();
  };

  const report = [];
  for (const arena of L.arenas) {
    const row = { entryTx: arena.entryTx, exitTx: arena.exitTx };
    report.push(row);
    g.warpTo(arena.entryTx - 6);
    for (let f = 0; f < 20; f++) tick();
    const boss = bossIn(arena);
    row.boss = boss?.kind ?? null;
    if (!boss) continue;
    row.before = { exitStands: L.wardClosed(arena.exitTx), entryOpen: !L.wardClosed(arena.entryTx) };

    // Run at the far ward, jumping, for thirty seconds.
    let furthest = 0;
    let sealedAt = -1;
    for (let f = 0; f < 60 * 30; f++) {
      keep();
      tick({ right: true, jump: f % 40 < 14 });
      furthest = Math.max(furthest, g.player.x + g.player.w);
      if (arena.fighting && sealedAt < 0) sealedAt = f;
    }
    row.run = {
      sealed: arena.fighting,
      sealedAfter: sealedAt >= 0 ? +(sealedAt / 60).toFixed(2) : null,
      furthest: Math.round(furthest),
      wardAt: arena.right,
      passed: furthest > arena.right + 1,
    };

    // And back the way he came.
    let leftmost = Infinity;
    for (let f = 0; f < 60 * 8; f++) {
      keep();
      tick({ left: true, jump: f % 40 < 14 });
      leftmost = Math.min(leftmost, g.player.x);
    }
    row.back = { leftmost: Math.round(leftmost), wardAt: arena.left, escaped: leftmost < arena.left - 1 };

    // Dying inside.
    dieAndReturn();
    const again = bossIn(arena);
    row.afterDeath = {
      entryOpen: !L.wardClosed(arena.entryTx),
      exitStands: L.wardClosed(arena.exitTx),
      bossWaiting: !!again && !again.dead,
      fighting: arena.fighting,
    };

    // Beaten.
    const target = bossIn(arena);
    if (target) {
      // Inside first, so the fall happens with him in the room it is for.
      g.player.x = (arena.left + arena.right) / 2 - 200;
      g.player.y = target.bottom - g.player.h - 40;
      kill(target);
    }
    settle(60 * 6);
    row.cleared = { cleared: arena.cleared, entryOpen: !L.wardClosed(arena.entryTx), exitOpen: !L.wardClosed(arena.exitTx) };
    dieAndReturn();
    row.clearedAfterDeath = {
      entryOpen: !L.wardClosed(arena.entryTx),
      exitOpen: !L.wardClosed(arena.exitTx),
      bossBack: !!bossIn(arena),
    };
  }

  const bad = report.filter(
    (r) =>
      !r.boss ||
      !r.before.exitStands ||
      !r.before.entryOpen ||
      !r.run.sealed ||
      r.run.passed ||
      r.back.escaped ||
      !r.afterDeath.entryOpen ||
      !r.afterDeath.exitStands ||
      !r.afterDeath.bossWaiting ||
      r.afterDeath.fighting ||
      !r.cleared.cleared ||
      !r.cleared.entryOpen ||
      !r.cleared.exitOpen ||
      !r.clearedAfterDeath.entryOpen ||
      !r.clearedAfterDeath.exitOpen ||
      r.clearedAfterDeath.bossBack,
  );
  return { arenas: report.length, bosses: report.map((r) => r.boss), report, bad: bad.map((r) => r.boss ?? r.entryTx) };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

const expected = ['gallert', 'boar', 'mimic', 'jester', 'colossus', 'gloom', 'spider', 'wyrm', 'twins', 'thalassa', 'gargoyle', 'clock', 'vesper', 'shadow', 'warden'];
const ok = result.bad.length === 0 && expected.every((k) => result.bosses.includes(k));
if (!ok) {
  console.error(`FAIL: ${result.bad.length ? `wards broken around ${result.bad.join(', ')}` : 'an expected boss arena is missing'}`);
  process.exit(1);
}
console.log(
  `OK: all ${result.arenas} warded bosses hold the road - the far ward never lets him past, the near one comes down behind him, a death opens it again with the boss waiting, and a fall opens both for good.`,
);
