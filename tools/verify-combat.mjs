/**
 * Checks the two timing-based moves against the knight, and the input path
 * they depend on.
 *
 * The parry is the reason this exists: it is answered in a window of a sixth of
 * a second, and a key press swallowed anywhere on the way makes it feel broken
 * rather than hard. Hit stop used to eat exactly those presses.
 *
 * It also pins what the knight does about the blade upgrade, because that is
 * the difference between an upgrade and a replacement for the whole fight:
 * while he is not committed to a move his sword covers his front and the
 * crescent bursts on it, and the moment he is committed - or reeling - it
 * lands. Measured before he could answer it, a hero standing 250 px away, out
 * of reach of everything he has, put 99 crescents into him and took his entire
 * health bar off in under thirty seconds.
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
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
// Der Startpunkt wird aus den Spawns abgeleitet, nicht aus einer Kachelzahl:
// ein Abschnitt, der irgendwo im Level eingeschoben wird, verschiebt sonst
// jedes Werkzeug auf einmal.
const startTile = await page.evaluate(() => {
  const boss = window.game.level.spawns.find((s) => s.kind === 'boss');
  return Math.max(2, (boss?.tx ?? 550) - 26);
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

  /**
   * The blade upgrade against a knight who carries a sword. While he is not
   * committed to a move, his blade covers his front and the crescent bursts on
   * it; the moment he is - dashing, slamming, leaping, reeling - it lands.
   *
   * This is the difference between an upgrade and a replacement for the fight.
   * Measured before he could answer it: a hero standing 250 px away, outside
   * everything the knight can reach, put 99 crescents into him and took his
   * whole health bar off in under thirty seconds.
   */
  const crescentRun = (state) => {
    reset();
    p.beamTier = 2;
    boss.guardLock = 0;
    const home = boss.x;
    const before = boss.hp;
    let thrown = 0;
    const seen = new Set();
    for (let i = 0; i < 60 * 4; i++) {
      // Both held: the state under test has to hold, and the hero has to stay
      // out of sword reach so only the crescent is being measured.
      boss.state = state;
      boss.timer = 9;
      boss.x = home;
      boss.vx = 0;
      p.x = home - 210;
      p.vx = 0;
      p.facing = 1;
      p.invuln = 999;
      // One swing every half second, so no crescent arrives inside the moment
      // after another was turned aside.
      tick({ attack: i % 30 < 4 });
      for (const q of g.projectiles) {
        if (q.friendly && q.kind === 'beam' && !seen.has(q)) {
          seen.add(q);
          thrown++;
        }
      }
    }
    return { damage: before - boss.hp, thrown };
  };
  const crescentOnGuard = crescentRun('idle');
  const crescentWhileCommitted = crescentRun('stagger');

  /**
   * Down and jump on a one-way platform: the control the README documents as
   * "fall through a wooden platform".
   *
   * It did not work, and no tool had ever asked. ignorePlatforms was set from
   * the two keys correctly, but the jump fired in the same frame and carried
   * him up through the boards above instead - measured with real key presses,
   * 107 px in the wrong direction. So both halves are checked here: a tap of
   * down and jump on a platform puts him below it, and the same two keys on
   * rock still jump, because crouching must not cost the jump.
   */
  const dropRun = (onPlatform) => {
    const spot = (() => {
      const columns = Math.ceil(g.level.pixelWidth / 32);
      for (let tx = 6; tx < columns - 6; tx++) {
        for (let ty = 8; ty < 18; ty++) {
          if (onPlatform) {
            if (!g.level.platformAt(tx, ty) || g.level.solidAt(tx, ty + 1)) continue;
            return { tx, ty };
          }
        }
        if (!onPlatform && g.level.solidAt(tx, 18) && !g.level.hazardAt(tx, 17)) return { tx, ty: 18 };
      }
      return null;
    })();
    if (!spot) return { spot: null };
    g.state = 'playing';
    p.x = spot.tx * 32 + 6;
    p.y = spot.ty * 32 - p.h - 2;
    p.vx = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 9999;
    p.hurtTimer = 0;
    g.camera.snapTo(p.cx, p.cy);
    for (let i = 0; i < 20; i++) tick();
    const from = p.y;
    let highest = p.y;
    // A tap, not a hold: down stays down for a few frames, jump for two.
    for (let i = 0; i < 40; i++) {
      p.invuln = 9999;
      tick({ down: i < 8, jump: i >= 2 && i < 4 });
      highest = Math.min(highest, p.y);
    }
    // Both numbers are needed: a drop is measured by where he ends up, a jump
    // by how high he got - after forty frames he is back on the ground and the
    // net displacement of a jump is zero.
    return {
      spot,
      from: Math.round(from),
      to: Math.round(p.y),
      moved: Math.round(p.y - from),
      rose: Math.round(from - highest),
    };
  };
  const droppedThroughPlatform = dropRun(true);
  const jumpedFromRock = dropRun(false);

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
      charged > plain &&
      crescentOnGuard.thrown >= 6 &&
      crescentOnGuard.damage === 0 &&
      crescentWhileCommitted.damage > 0 &&
      droppedThroughPlatform.moved > 24 &&
      droppedThroughPlatform.rose < 8 &&
      // Twenty is plenty: the two-frame tap is a cut-short jump by design
      // (letting go early clips the rise), and it measures 39 px.
      jumpedFromRock.rose > 20,
    unparriedDamage: unparried.damage,
    parriedDamage: parried.damage,
    knightStaggered: parried.staggered,
    plainDamage: plain,
    chargedDamage: charged,
    crescent: { onGuard: crescentOnGuard, whileCommitted: crescentWhileCommitted },
    droppedThroughPlatform,
    jumpedFromRock,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    'FAIL: parry or charged strike no longer behaves as expected, or the knight no longer turns ' +
      'the blade crescent aside while he is open - or turns it aside even while committed.',
  );
  process.exit(1);
}
console.log('OK: the parry turns the blow aside and staggers the knight, the charged strike hits harder, ' +
    'the knight bats the blade crescent out of the air while he is open but eats it while he is ' +
    'committed, and down plus jump drops through a plank while still jumping off rock.');
