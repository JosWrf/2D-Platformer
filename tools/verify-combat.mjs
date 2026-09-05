/**
 * Checks the two timing-based moves against the knight, and the input path
 * they depend on.
 *
 * The parry is the reason this exists: it is answered in a window of a sixth of
 * a second, and a key press swallowed anywhere on the way makes it feel broken
 * rather than hard. Hit stop used to eat exactly those presses.
 *
 * Usage: node tools/verify-combat.mjs
 * Exits non-zero if a parry no longer turns a blow aside, or if the charged
 * strike stops hitting harder than a plain one.
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
await page.goto(`http://127.0.0.1:${server.address().port}/?x=524`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const result = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const p = g.player;
  const ctx = document.querySelector('canvas').getContext('2d');
  const tick = (actions = {}) => {
    for (const [a, v] of Object.entries({ left: false, right: false, attack: false, parry: false, ...actions })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };

  for (let i = 0; i < 400 && !(g.boss && g.boss.engaged); i++) tick({ right: true });
  const boss = g.boss;
  if (!boss || !boss.engaged) return { ok: false, note: 'boss never engaged' };

  /** Puts hero and knight into a known state, in melee range, facing off. */
  const reset = () => {
    p.hp = p.maxHp;
    p.invuln = 0;
    p.hurtTimer = 0;
    p.dead = false;
    p.attackTimer = 0;
    p.attackCombo = 0;
    p.charged = false;
    p.chargeTimer = 0;
    p.chargeReady = false;
    p.parryTimer = 0;
    p.parryCooldown = 0;
    p.parryFlash = 0;
    p.x = boss.cx - 60;
    p.y = boss.y + boss.h - p.h;
    p.vx = 0;
    p.vy = 0;
    boss.hp = boss.maxHp;
    boss.state = 'idle';
    boss.timer = 9;
    boss.vulnerable = true;
    for (let i = 0; i < 3; i++) {
      tick();
      boss.state = 'idle';
      boss.timer = 9;
    }
    p.hp = p.maxHp;
    p.invuln = 0;
    p.facing = 1;
  };

  // The knight slams; the parry has to be answered on the wind-up, because the
  // blow lands on the same frame it starts.
  const parryRun = (useParry) => {
    reset();
    boss.state = 'slamWindup';
    boss.timer = 0.02;
    let staggered = false;
    let parried = false;
    for (let i = 0; i < 40; i++) {
      tick({ parry: useParry && boss.state === 'slamWindup' });
      if (boss.state === 'stagger') staggered = true;
      if (p.parryFlash > 0.5) parried = true;
      if (p.hp < p.maxHp) break;
    }
    return { damage: p.maxHp - p.hp, parried, staggered };
  };

  // A tap is one swing; holding the key winds up the heavy strike.
  const hitRun = (charge) => {
    reset();
    const hold = charge ? 70 : 3;
    for (let i = 0; i < hold; i++) {
      tick({ attack: true });
      boss.state = 'idle';
      boss.timer = 9;
    }
    for (let i = 0; i < 40; i++) {
      tick();
      boss.state = 'idle';
      boss.timer = 9;
    }
    return boss.maxHp - boss.hp;
  };

  const unparried = parryRun(false);
  const parried = parryRun(true);
  const plain = hitRun(false);
  const charged = hitRun(true);

  return {
    ok:
      unparried.damage > 0 &&
      parried.damage === 0 &&
      parried.parried &&
      parried.staggered &&
      charged > plain,
    unparriedDamage: unparried.damage,
    parriedDamage: parried.damage,
    knightStaggered: parried.staggered,
    plainDamage: plain,
    chargedDamage: charged,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error('FAIL: parry or charged strike no longer behaves as expected.');
  process.exit(1);
}
console.log('OK: the parry turns the blow aside and staggers the knight, the charged strike hits harder.');
