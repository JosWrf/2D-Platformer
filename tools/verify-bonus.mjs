/**
 * The road behind the world: every gem, a word of warning, the crystal hall,
 * and the Prismarch at the end of it.
 *
 * It is the only content in the game a player has to earn, which makes it the
 * easiest to break without noticing - nobody walks past it by accident. So the
 * whole chain is driven here: the last gem opens the dialogue, the dialogue
 * holds the world still while it is read, finishing it puts the hero in the
 * hall, the boss there can be fought and beaten, and beating it hands back both
 * the hero - on the exact spot he was taken from - and the blade upgrade that
 * throws a crescent with every swing.
 *
 * The gate at the end of the rift is checked too. That is where a player who
 * has everything goes looking for the reward, so it has to lead there as well -
 * and it means the whole thing never hangs on one trigger firing.
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
  const arenaTile = (g.level.spawns.find((s) => s.kind === 'warden')?.tx ?? 712) - 12;
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
  for (let i = 0; i < 3; i++) tick();
  const departedFromTile = Math.round(p.cx / 32);
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

  // Back into the hall for the fight itself: the gate runs above left the game
  // wherever they ended.
  g.state = 'playing';
  g.inCrystalWorld = true;

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
  /*
   * Thirty seconds of being mashed with its health floored, to see whether it
   * answers at all. Measuring that on the way to its death made it a coin toss:
   * a fast enough player ends the fight before it has landed anything, and the
   * check "it hurt the player at least once" then fails on luck rather than on
   * behaviour - which is exactly what it did, one run in four.
   */
  let sawPhaseTwo = false;
  let hurtThePlayer = 0;
  for (let f = 0; f < 60 * 30; f++) {
    if (g.state !== 'playing') {
      tick({ confirm: true });
      continue;
    }
    if (p.hp < p.maxHp) {
      hurtThePlayer += p.maxHp - p.hp;
      p.hp = p.maxHp;
      p.dead = false;
    }
    boss.hp = Math.max(boss.hp, 12);
    boss.dead = false;
    if (boss.phase === 2) sawPhaseTwo = true;
    const d = boss.cx - p.cx;
    tick({ right: d > 44, left: d < -44, attack: Math.abs(d) < 74 && f % 11 < 4 });
  }

  // And then, separately, it is actually fought down.
  for (let f = 0; f < 60 * 180 && !boss.dead; f++) {
    if (g.state !== 'playing') {
      tick({ confirm: true });
      continue;
    }
    p.hp = p.maxHp;
    p.dead = false;
    if (boss.phase === 2) sawPhaseTwo = true;
    const d = boss.cx - p.cx;
    tick({ right: d > 44, left: d < -44, attack: Math.abs(d) < 74 && f % 11 < 4 });
  }
  const killed = boss.dead;

  // The reward: read the closing words, land back where he started, and swing.
  const dialogueAfterWin = !!g.dialogue;
  for (let i = 0; i < 40 && g.dialogue; i++) {
    tick({ confirm: i % 2 === 0 });
  }
  for (let i = 0; i < 10; i++) tick();
  const backInTheWorld = !g.inCrystalWorld;
  const landedOnTile = Math.round(p.cx / 32);
  const gotTheBeam = p.bladeBeam;
  // Read here, not in the result: the gate runs below restart the level, and a
  // restart puts the blade back to being a sword.
  const beamTierAfterWin = p.beamTier;

  // Measured on the flat floor of the warden's arena: wherever the hero
  // happens to land, a wall in front of him would eat the crescent and the
  // test would be measuring the terrain instead of the upgrade.
  let reachDamage = 0;
  p.x = arenaTile * 32;
  p.y = 17 * 32;
  p.vx = 0;
  p.vy = 0;
  p.facing = 1;
  g.camera.snapTo(p.cx, p.cy);
  for (let i = 0; i < 20; i++) tick();
  /*
   * One crescent per swing, friendly, and it reaches something out of arm's
   * reach - which is the whole point of the upgrade.
   *
   * Counted as they are created rather than as they stand in the air: a
   * crescent lives two thirds of a second, so "how many are on screen" also
   * counts one left over from a moment ago, and the check came out at two often
   * enough to fail on nothing.
   */
  g.projectiles.length = 0;
  g.state = 'playing';
  p.hp = p.maxHp;
  p.dead = false;
  p.invuln = 9999;
  p.attackTimer = 0;
  p.attackCombo = 0;
  p.charged = false;
  p.facing = 1;
  // Let anything already in flight expire, and any hurt animation run out: a
  // hero who is still flinching does not swing, and the count came out at zero.
  for (let i = 0; i < 40; i++) {
    p.invuln = 9999;
    tick();
  }
  const seenBeams = new Set();
  let beams = 0;
  for (let i = 0; i < 30; i++) {
    p.invuln = 9999;
    tick({ attack: i < 3 });
    for (const q of g.projectiles) {
      if (q.kind !== 'beam' || seenBeams.has(q)) continue;
      seenBeams.add(q);
      beams++;
    }
  }
  const allFriendly = [...seenBeams].every((q) => q.friendly);

  let sharpenedReachDamage = 0;
  /*
   * A skeleton put there on purpose, not whichever enemy happened to be first
   * in the world's roster: that could be a bat, which flies off the line the
   * crescent travels, and then the measurement was about the bat.
   */
  for (const e of g.enemies) if (e.kind !== 'prismarch') e.dead = true;
  const target = g.spawnEnemyOfKind('skeleton', p.x + 130, 18 * 32);
  target.active = true;
  const hitAtGap = (gap) => {
    target.hp = target.maxHp = 20;
    target.x = p.x + gap;
    target.y = 17 * 32 - (target.h - 32);
    target.active = true;
    target.dead = false;
    target.stun = 0;
    g.projectiles.length = 0;
    p.attackTimer = 0;
    p.attackCombo = 0;
    const before = target.hp;
    for (let i = 0; i < 60; i++) {
      target.x = p.x + gap;
      target.vx = 0;
      tick({ attack: i < 3 });
    }
    return before - target.hp;
  };
  if (target) {
    reachDamage = hitAtGap(130);
    // What the Prismarch actually adds: Thalassa's half of the upgrade carries
    // 145 px, this one better carry twice that.
    sharpenedReachDamage = hitAtGap(250);
  }

  /**
   * The second door: a full counter but no dialogue yet, standing in front of
   * the gate. It must open the hall rather than end the run - and with nothing
   * collected the same gate must still end the run the ordinary way.
   */
  const gateWith = (all) => {
    g.restart();
    g.state = 'playing';
    g.level.exitSealed = false;
    g.bossDefeated = true;
    if (g.boss) g.boss.dead = true;
    if (all) {
      for (const q of g.pickups.filter((x) => x.kind === 'gem')) {
        q.dead = true;
        g.collected.add(q.id);
        g.gems++;
      }
    }
    p.x = (g.portal.cx - 300) | 0;
    p.y = 17 * 32;
    p.vx = 0;
    p.vy = 0;
    p.dead = false;
    g.camera.snapTo(p.cx, p.cy);
    for (let f = 0; f < 500; f++) {
      // Confirm has to be released between lines: the key is edge-triggered,
      // so holding it advances the dialogue exactly once and then stalls.
      tick({ right: !g.dialogue, confirm: !!g.dialogue && f % 2 === 0 });
      if (g.inCrystalWorld || g.state === 'victory') break;
    }
    return { crystalWorld: g.inCrystalWorld, state: g.state };
  };
  const gateWithEverything = gateWith(true);
  const gateWithout = gateWith(false);

  return {
    ok:
      opened &&
      lines >= 3 &&
      heldStill &&
      teleported &&
      zone === 'Der Kristallhort' &&
      far.includes('fanWind') &&
      near.includes('chargeWind') &&
      dialogueAfterWin &&
      backInTheWorld &&
      landedOnTile === departedFromTile &&
      gotTheBeam &&
      beamTierAfterWin === 2 &&
      beams === 1 &&
      allFriendly &&
      reachDamage > 0 &&
      sharpenedReachDamage > 0 &&
      gateWithEverything.crystalWorld &&
      !gateWithout.crystalWorld &&
      gateWithout.state === 'victory' &&
      killed &&
      sawPhaseTwo &&
      hurtThePlayer >= 1 &&
      true,
    dialogueLines: lines,
    worldHeldStill: heldStill,
    teleported,
    zone,
    movesFar: far,
    movesNear: near,
    gateWithEverything,
    gateWithout,
    bossMaxHp: boss.maxHp,
    sawPhaseTwo,
    damageDealtToPlayer: hurtThePlayer,
    killed,
    dialogueAfterWin,
    backInTheWorld,
    departedFromTile,
    landedOnTile,
    gotTheBeam,
    beamsPerSwing: beams,
    beamTier: beamTierAfterWin,
    beamDamageAtRange: reachDamage,
    beamDamageAt250px: sharpenedReachDamage,
    endState: g.state,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
  'FAIL: the road behind the world no longer opens, the Prismarch no longer fights, or the way ' +
    'back and the blade upgrade no longer arrive.',
);
  process.exit(1);
}
console.log(
  'OK: the last gem opens the way, the hall takes the hero, the Prismarch fights and falls, ' +
    'and the hero comes back with a blade that shoots.',
);
