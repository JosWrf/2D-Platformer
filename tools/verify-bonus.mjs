/**
 * The road behind the world: every gem, a word of warning, the crystal hall,
 * and the Prismarch at the end of it.
 *
 * It is the only content in the game a player has to earn, which makes it the
 * easiest to break without noticing - nobody walks past it by accident. So the
 * whole chain is driven here: the last gem opens the dialogue, the dialogue
 * holds the world still while it is read, finishing it puts the hero in the
 * hall, and the boss there can be fought and beaten.
 *
 * Usage: node tools/verify-bonus.mjs
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
await page.goto(`http://127.0.0.1:${server.address().port}/?x=6`, { waitUntil: 'load' });
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
      confirm: false,
      ...actions,
    })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };

  // Books every gem but the last, then walks onto that one for real: the
  // dialogue has to come from the pickup, not from a counter set by hand.
  const gems = g.pickups.filter((q) => q.kind === 'gem');
  for (const q of gems.slice(0, -1)) {
    q.dead = true;
    g.collected.add(q.id);
    g.gems++;
  }
  const last = gems[gems.length - 1];
  p.x = last.x - 4;
  p.y = last.y - 4;
  g.camera.snapTo(p.cx, p.cy);
  for (let i = 0; i < 30 && !last.dead; i++) {
    p.x = last.x - 4;
    p.y = last.y - 4;
    p.vy = 0;
    tick();
  }
  const opened = !!g.dialogue;
  const lines = g.dialogue ? g.dialogue.lines.length : 0;

  // Nothing may move while it is being read.
  const before = Math.round(p.cx);
  for (let i = 0; i < 60; i++) tick({ right: true });
  const heldStill = Math.round(p.cx) === before;

  for (let i = 0; i < 30 && g.dialogue; i++) {
    tick({ confirm: true });
    tick();
  }
  const teleported = g.inCrystalWorld;
  const zone = g.currentZone;

  const boss = g.enemies.find((e) => e.kind === 'prismarch');
  if (!boss) return { ok: false, note: 'no Prismarch in the hall', opened, teleported };

  /** Which move it picks from which range, with the hero held at that range. */
  const home = boss.x;
  const moveAt = (gap) => {
    boss.hp = boss.maxHp;
    boss.dead = false;
    boss.state = 'stalk';
    boss.timer = 0.1;
    boss.stun = 0;
    boss.engaged = true;
    const seen = new Set();
    for (let f = 0; f < 60 * 25; f++) {
      // Both are pinned: left to chase each other for twenty-five seconds the
      // pair simply walks into the wall, and then the range under test is not
      // the range any more.
      boss.x = home;
      boss.vx = 0;
      p.x = home - gap;
      p.y = 17 * 32;
      p.vx = 0;
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 1;
      tick();
      seen.add(boss.state);
    }
    return [...seen].filter((s) => s.endsWith('Wind')).sort();
  };
  const far = moveAt(300);
  const near = moveAt(70);

  // And then it is actually fought down. Pinning it above may have let the
  // game drop it from the list, so it goes back in first.
  boss.hp = boss.maxHp;
  boss.dead = false;
  boss.engaged = true;
  boss.x = home;
  boss.y = 17 * 32 - 42;
  boss.vx = 0;
  boss.vy = 0;
  if (!g.enemies.includes(boss)) g.enemies.push(boss);
  p.x = home - 90;
  p.y = 17 * 32;
  p.hp = p.maxHp;
  p.dead = false;
  g.camera.snapTo(p.cx, p.cy);
  let sawPhaseTwo = false;
  let hurtThePlayer = 0;
  for (let f = 0; f < 60 * 180 && !boss.dead; f++) {
    if (g.state !== 'playing') {
      tick({ confirm: true });
      continue;
    }
    if (p.hp < p.maxHp) {
      hurtThePlayer += p.maxHp - p.hp;
      p.hp = p.maxHp;
      p.dead = false;
    }
    if (boss.phase === 2) sawPhaseTwo = true;
    const d = boss.cx - p.cx;
    tick({ right: d > 44, left: d < -44, attack: Math.abs(d) < 74 && f % 11 < 4 });
  }
  const killed = boss.dead;
  for (let i = 0; i < 260 && g.state !== 'victory'; i++) tick();

  return {
    ok:
      opened &&
      lines >= 3 &&
      heldStill &&
      teleported &&
      zone === 'Der Kristallhort' &&
      far.includes('fanWind') &&
      near.includes('chargeWind') &&
      killed &&
      sawPhaseTwo &&
      hurtThePlayer > 0 &&
      g.state === 'victory',
    dialogueLines: lines,
    worldHeldStill: heldStill,
    teleported,
    zone,
    movesFar: far,
    movesNear: near,
    bossMaxHp: boss.maxHp,
    sawPhaseTwo,
    damageDealtToPlayer: hurtThePlayer,
    killed,
    endState: g.state,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error('FAIL: the road behind the world no longer opens, or the Prismarch no longer fights.');
  process.exit(1);
}
console.log('OK: the last gem opens the way, the hall takes the hero, and the Prismarch fights and falls.');
