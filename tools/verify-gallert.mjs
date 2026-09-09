/**
 * Gallert, der Aufgequollene - the first boss in the game, at the end of the
 * forest, and the one that teaches the vocabulary the later fights speak.
 *
 * What this pins:
 *
 *   - He picks his move by range: the leap up close, the spit from afar.
 *   - His blobs CAN be batted out of the air with a blind swing. That is the
 *     lesson, and it is the exact rule Thalassa's flood wave later refuses -
 *     which only reads as an exception if the player met the rule first.
 *   - The leap hurts where he lands and nowhere else.
 *   - His split puts two ordinary slimes in the arena, and only twice.
 *   - A parry shakes him loose whatever he has absorbed.
 *   - A masher pays for it, and can still win.
 *   - His fall hands over the Herzkern: six hearts become seven, filled.
 *   - He stays down afterwards, checkpoint or no checkpoint.
 *   - And he is not a wall: the bog has no gate, so he can be walked past.
 *
 * Usage: node tools/verify-gallert.mjs
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
const startTile = await page.evaluate(() => {
  const s = window.game.level.spawns.find((q) => q.kind === 'gallert');
  return Math.max(2, (s?.tx ?? 180) - 14);
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
      confirm: false,
      ...actions,
    })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };

  // Every death rebuilds the roster, so he is looked up rather than held on to.
  const find = () => g.enemies.find((e) => e.kind === 'gallert');
  const first = find();
  if (!first) return { ok: false, note: 'no Gallert in the level' };
  const home = first.x;
  const bossY = first.y;
  const standY = bossY + first.h - p.h;

  /* --------------------------------------------------------- not a wall */

  // First, because it is the only run that needs the hero where the level put
  // him: the bog has no gate.
  first.engaged = true;
  for (let f = 0; f < 60 * 25 && p.cx < home + 300; f++) {
    tick({ right: true, jump: f % 90 < 12 });
  }
  const passHp = { walkedPast: p.cx > home + 200, heartsLeft: p.hp };

  /** Both back on their marks. `pin` holds his poise out of reach. */
  const setUp = (gap, hpRatio = 1, pin = true) => {
    const boss = find() ?? first;
    if (!g.enemies.includes(boss)) g.enemies.push(boss);
    boss.hp = Math.max(1, Math.round(boss.maxHp * hpRatio));
    boss.dead = false;
    boss.stun = 0;
    boss.poise = pin ? 999 : 14;
    boss.poiseLock = 0;
    boss.engaged = true;
    boss.spawned = 0;
    boss.lastMove = '';
    boss.state = 'stalk';
    boss.timer = 0.05;
    boss.x = home;
    boss.y = bossY;
    boss.vx = 0;
    boss.vy = 0;
    p.x = home + boss.w / 2 - gap - p.w / 2;
    p.y = standY;
    p.vx = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 0;
    g.projectiles.length = 0;
    for (const e of g.enemies) if (e.kind === 'slime') e.dead = true;
    g.camera.snapTo(p.cx, p.cy);
    return boss;
  };

  /* ------------------------------------------------ which move, from where */

  const moveAt = (gap) => {
    const boss = setUp(gap);
    const seen = new Set();
    for (let f = 0; f < 60 * 16; f++) {
      boss.x = home;
      boss.vx = 0;
      if (boss.state !== 'hop') boss.y = bossY;
      p.x = home + boss.w / 2 - gap - p.w / 2;
      p.y = standY;
      p.vx = 0;
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 1;
      tick();
      seen.add(boss.state);
    }
    return [...seen].filter((s) => s.endsWith('Wind')).sort();
  };
  const near = moveAt(70);
  const far = moveAt(300);

  /* --------------------------------------- the lesson: slime can be swatted */

  /**
   * A blind swing has to turn his spit aside. This is the one property the
   * whole fight exists to teach.
   */
  const spit = (swing) => {
    const boss = setUp(150);
    boss.state = 'spitWind';
    boss.timer = 0.3;
    let turned = 0;
    let hurt = 0;
    for (let f = 0; f < 60 * 2.5; f++) {
      boss.x = home;
      boss.y = bossY;
      boss.vx = 0;
      p.x = home + boss.w / 2 - 150 - p.w / 2;
      p.vx = 0;
      p.facing = 1;
      // Swinging is measured with the hero untouchable: being hit locks the
      // sword out for a quarter of a second, so the first blob through would
      // decide the measurement instead of the blade.
      if (swing) p.invuln = 999;
      const before = p.hp;
      tick({ right: true, attack: swing && f % 8 < 4 });
      if (p.hp < before) hurt += before - p.hp;
      turned = Math.max(turned, g.projectiles.filter((q) => q.friendly && q.kind === 'blob').length);
      p.hp = p.maxHp;
      p.dead = false;
    }
    return { turned, hurt };
  };
  // Standing there costs a heart; swinging at it turns the slime around.
  const spitIgnored = spit(false);
  const spitSwattedAside = spit(true);

  /* ------------------------------------------------ the leap lands somewhere */

  /** Standing where he comes down costs two hearts; standing clear costs none. */
  const leap = (gap) => {
    const boss = setUp(gap);
    boss.state = 'hopWind';
    boss.timer = 0.4;
    let hurt = 0;
    let landed = false;
    for (let f = 0; f < 60 * 3; f++) {
      // He is allowed to fly, but not to walk: the gap under test has to hold.
      if (boss.state !== 'hop') {
        boss.x = home;
        boss.y = bossY;
      }
      p.x = home + boss.w / 2 - gap - p.w / 2;
      p.vx = 0;
      const before = p.hp;
      tick();
      if (p.hp < before) hurt += before - p.hp;
      if (boss.state === 'recover') landed = true;
      p.hp = p.maxHp;
      p.dead = false;
    }
    return { hurt, landed };
  };
  const leapOnTop = leap(40);
  // Beyond his reach: the leap closes about 230 px, so 420 is standing clear.
  const leapClear = leap(420);

  /* --------------------------------------------------------- and he splits */

  const split = (() => {
    const boss = setUp(120, 0.4);
    boss.state = 'splitWind';
    boss.timer = 0.3;
    let most = 0;
    for (let f = 0; f < 60 * 14; f++) {
      boss.x = home;
      if (boss.state !== 'hop') boss.y = bossY;
      boss.vx = 0;
      p.invuln = 1;
      p.hp = p.maxHp;
      p.dead = false;
      tick();
      most = Math.max(most, g.enemies.filter((e) => e.kind === 'slime' && !e.dead).length);
    }
    return { most, pinchedOff: boss.spawned };
  })();

  /* ------------------------------------------------------ a parry shakes him */

  const parryShook = (() => {
    const boss = setUp(30);
    boss.state = 'spitWind';
    let shook = false;
    for (let f = 0; f < 60 * 3 && !shook; f++) {
      boss.x = home;
      boss.y = bossY;
      boss.vx = 0;
      boss.poise = 999;
      boss.timer = Math.max(boss.timer, 1);
      p.x = home + boss.w / 2 - 30 - p.w / 2;
      p.y = standY;
      p.vx = 0;
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 0;
      tick({ right: true, parry: f % 14 < 5 });
      if (boss.stun > 0) shook = true;
    }
    return shook;
  })();

  /* --------------------------------------- against a masher, and to the end */

  /*
   * Twenty-five seconds of being mashed with his health floored, so the fight
   * cannot simply end first. Measuring "does he answer" up to his death is a
   * coin toss: he has twenty-two hit points and a masher deals about 3.6 a
   * second, so whether he landed anything at all in the seven seconds he has
   * was chance rather than behaviour - one run in three came out at nothing.
   */
  setUp(70, 1, false);
  let taken = 0;
  const masherStates = new Set();
  for (let f = 0; f < 60 * 25; f++) {
    if (g.state !== 'playing' || g.dialogue) {
      tick({ confirm: f % 12 < 4 });
      continue;
    }
    const boss = find();
    if (!boss) break;
    boss.engaged = true;
    boss.hp = Math.max(boss.hp, 8);
    masherStates.add(boss.state);
    const before = p.hp;
    const d = boss.cx - p.cx;
    tick({ right: d > 52, left: d < -52, attack: f % 11 < 4 });
    if (p.hp < before) {
      taken += before - p.hp;
      p.hp = p.maxHp;
      p.dead = false;
    }
  }

  // And separately: he can be felled, and what he leaves behind.
  setUp(70, 1, false);
  let felled = false;
  let frames = 0;
  for (let f = 0; f < 60 * 60 && !felled; f++) {
    frames = f;
    if (g.state !== 'playing' || g.dialogue) {
      tick({ confirm: f % 12 < 4 });
      continue;
    }
    const boss = find();
    if (!boss) {
      felled = true;
      break;
    }
    boss.engaged = true;
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = Math.max(p.invuln, 0.3);
    const d = boss.cx - p.cx;
    tick({ right: d > 52, left: d < -52, attack: f % 11 < 4 });
  }
  // Read the bog out, and see what it left.
  for (let f = 0; f < 60 * 10 && g.dialogue; f++) tick({ confirm: f % 14 < 4 });
  const reward = { maxHp: p.maxHp, hp: p.hp };

  /* ------------------------------------------------------- and he stays down */

  const aliveAfterWin = g.enemies.filter((e) => e.kind === 'gallert' && !e.dead).length;
  p.invuln = 0;
  p.hurt(99, 1, g, true);
  for (let f = 0; f < 60 * 6; f++) tick({ confirm: f % 12 < 4 });
  const stayedDown = { afterWin: aliveAfterWin, afterDying: g.enemies.filter((e) => e.kind === 'gallert' && !e.dead).length, state: g.state };

  return {
    ok:
      near.includes('hopWind') &&
      far.includes('spitWind') &&
      spitIgnored.hurt > 0 &&
      spitSwattedAside.turned > 0 &&
      leapOnTop.hurt >= 2 &&
      leapOnTop.landed &&
      leapClear.hurt === 0 &&
      split.most === 2 &&
      split.pinchedOff === 2 &&
      parryShook &&
      taken >= 3 &&
      felled &&
      reward.maxHp === 7 &&
      reward.hp === 7 &&
      stayedDown.afterWin === 0 &&
      stayedDown.afterDying === 0 &&
      stayedDown.state === 'playing' &&
      passHp.walkedPast &&
      passHp.heartsLeft >= 4,
    maxHp: first.maxHp,
    near,
    far,
    spit: { ignored: spitIgnored, swattedAside: spitSwattedAside },
    leap: { onTop: leapOnTop, clear: leapClear },
    split,
    parryShook,
    damageDealtToMasher: taken,
    secondsToFell: +(frames / 60).toFixed(1),
    masherStates: [...masherStates].sort(),
    felled,
    reward,
    stayedDown,
    walkPast: passHp,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    'FAIL: Gallert no longer picks his move by range, his spit can no longer be batted aside, his ' +
      'leap hits the wrong ground, his split is off, a parry no longer shakes him, he no longer ' +
      'answers a masher, he cannot be felled or walked past, or his fall no longer leaves the ' +
      'Herzkern.',
  );
  process.exit(1);
}
console.log(
  'OK: Gallert leaps up close, spits from afar, his slime can be swatted out of the air, his ' +
    'landing hurts only where he lands, he splits twice, a parry shakes him loose, a masher pays ' +
    'and wins, he can be walked past, and his fall leaves a seventh heart.',
);
