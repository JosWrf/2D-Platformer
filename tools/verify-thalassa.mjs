/**
 * Thalassa, the Drowned Crown - the boss of the middle of the game.
 *
 * The three things every boss here has to keep doing: she picks her move by
 * range, she sees a move through instead of being re-stunned out of it by
 * every hit, and she can be killed.
 *
 * And the things that are hers alone, all of them added because the fight
 * measured too easy - a player who simply held the attack key used to kill her
 * in eleven seconds and lose between nothing and four hearts:
 *
 *   - Her flood wave cannot be batted away with a blind swing. That single
 *     rule was most of the problem: the blade deflects what it touches, so a
 *     masher swatted every wave she made and sent it back into her for two.
 *   - She opens the floor under a guest who plants himself in her reach, and
 *     the columns of that spring tide are the one thing in her repertoire the
 *     blade cannot answer. It is still a move you walk out of: the mark
 *     bubbles before the water comes.
 *   - Her second phase answers twice - two volleys of the surge, a pair of
 *     anchors - and her last third chains two moves before she rests, opening
 *     with the crown's call and a ring of five columns.
 *   - A parry breaks her out of any move, whatever her poise.
 *
 * And one thing she must NOT be: a wall. Her choir has no portcullis, so a
 * player who does not want the fight has to be able to walk past it. Measured,
 * that costs one or two hearts.
 *
 * Usage: node tools/verify-thalassa.mjs
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
  const t = window.game.level.spawns.find((s) => s.kind === 'thalassa');
  return Math.max(2, (t?.tx ?? 480) - 14);
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
      ...actions,
    })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };

  const boss = g.enemies.find((e) => e.kind === 'thalassa');
  if (!boss) return { ok: false, note: 'no Thalassa in the level' };
  const home = boss.x;
  const bossY = boss.y;
  const standY = bossY + boss.h - p.h;
  // Everything below reaches into the fight itself. If a field is gone, say so
  // rather than dying with a type error two hundred frames later.
  for (const field of ['geysers', 'crowded', 'tideCool', 'called', 'tideLeft', 'surgeLeft', 'chained']) {
    if (boss[field] === undefined) {
      return { ok: false, note: `Thalassa has no ${field}: this is not the fight this tool describes` };
    }
  }

  /*
   * First of all, because it is the only run that needs the hero where the
   * level itself put him: she is not a gate. Her choir has no portcullis, so a
   * player who does not want the fight has to be able to walk past it.
   */
  boss.engaged = true;
  for (let f = 0; f < 60 * 25 && p.cx < home + 300; f++) {
    tick({ right: true, jump: f % 90 < 12 });
  }
  const passHp = { walkedPast: p.cx > home + 200, heartsLeft: p.hp };

  /**
   * Both fighters put back on their marks, at a chosen gap and a chosen share
   * of her health. `pin` holds her poise out of reach, for the runs that
   * measure what a move does rather than whether it can be interrupted.
   */
  const setUp = (gap, hpRatio = 1, pin = true) => {
    if (!g.enemies.includes(boss)) g.enemies.push(boss);
    boss.hp = Math.max(1, Math.round(boss.maxHp * hpRatio));
    boss.dead = false;
    boss.stun = 0;
    boss.poise = pin ? 999 : 13;
    boss.poiseLock = 0;
    boss.engaged = true;
    boss.x = home;
    boss.y = bossY;
    boss.vx = 0;
    boss.vy = 0;
    boss.geysers.length = 0;
    boss.crowded = 0;
    boss.tideCool = 0;
    boss.chained = false;
    boss.surgeLeft = 0;
    boss.called = hpRatio <= 0.3 ? false : true;
    boss.lastMove = '';
    boss.state = 'stalk';
    boss.timer = 0.05;
    p.x = home + boss.w / 2 - gap - p.w / 2;
    p.y = standY;
    p.vx = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 0;
    g.projectiles.length = 0;
    g.camera.snapTo(p.cx, p.cy);
  };

  /** Counts every hostile shot as it appears, once each. */
  const shotCounter = () => {
    const seen = new Set();
    const kinds = {};
    return {
      look() {
        for (const q of g.projectiles) {
          if (q.friendly || seen.has(q)) continue;
          seen.add(q);
          kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
        }
      },
      get kinds() {
        return kinds;
      },
      get total() {
        return seen.size;
      },
    };
  };

  /* ------------------------------------------------ which move, from where */

  /** Which move she picks from which range, with both sides pinned. */
  const moveAt = (gap) => {
    setUp(gap);
    const seen = new Set();
    let shots = 0;
    for (let f = 0; f < 60 * 18; f++) {
      boss.x = home;
      boss.vx = 0;
      // The crowding rule is measured on its own below; here we want to see
      // her range choice, not her answer to a squatter.
      boss.crowded = 0;
      p.x = home + boss.w / 2 - gap - p.w / 2;
      p.y = standY;
      p.vx = 0;
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 1;
      tick();
      seen.add(boss.state);
      shots = Math.max(shots, g.projectiles.filter((q) => !q.friendly).length);
    }
    return { moves: [...seen].filter((s) => s.endsWith('Wind')).sort(), shots };
  };
  const near = moveAt(80);
  const far = moveAt(300);

  /* ------------------------------------------- the flood answers twice later */

  /** How many waves one surge puts out, and how many anchors one throw. */
  const volley = (state, gap, hpRatio, seconds) => {
    setUp(gap, hpRatio);
    boss.state = state;
    boss.timer = 0.3;
    // So the move she picks after this one cannot be the same one again and
    // add its shots to the count.
    boss.lastMove = state;
    const count = shotCounter();
    for (let f = 0; f < 60 * seconds; f++) {
      boss.x = home;
      boss.vx = 0;
      p.invuln = 1;
      p.hp = p.maxHp;
      p.dead = false;
      tick();
      count.look();
    }
    return count.kinds;
  };
  const surgeOne = volley('surgeWind', 90, 1, 1.9);
  const surgeTwo = volley('surgeWind', 90, 0.5, 1.9);
  const anchorOne = volley('anchorWind', 300, 1, 1.6);
  const anchorTwo = volley('anchorWind', 300, 0.5, 1.6);

  /* ---------------------------------- the wave is jumped, not batted aside */

  /**
   * A blind swing must not answer the flood wave. Stand in front of her,
   * swing at nothing but the wave, and she still lands it.
   */
  const swungAtWave = (() => {
    setUp(120, 1);
    boss.state = 'surgeWind';
    boss.timer = 0.3;
    let hurt = 0;
    let deflected = 0;
    for (let f = 0; f < 60 * 2.2; f++) {
      boss.x = home;
      boss.vx = 0;
      p.x = home + boss.w / 2 - 120 - p.w / 2;
      p.vx = 0;
      const before = p.hp;
      tick({ right: true, attack: f % 9 < 4 });
      if (p.hp < before) hurt += before - p.hp;
      deflected += g.projectiles.filter((q) => q.friendly && q.kind === 'shockwave').length;
      p.hp = p.maxHp;
      p.dead = false;
    }
    return { hurt, deflected };
  })();

  /* --------------------------------------- the tide, and how it is answered */

  /**
   * The spring tide: it takes a heart off someone who stands where the mark
   * came up, and misses someone who walks out of it. Both halves matter - the
   * first is the point of the move, the second is what makes it fair.
   */
  const tide = (walkAway) => {
    setUp(150, 0.5);
    boss.state = 'tideWind';
    boss.timer = 0.5;
    let hurt = 0;
    let columns = 0;
    // Long enough for the first ripple of columns to come up and go, and no
    // longer: the second one asks where he is by then, which is a question
    // about the ripple rather than about stepping aside.
    for (let f = 0; f < 60 * 2.4; f++) {
      boss.x = home;
      boss.vx = 0;
      const before = p.hp;
      tick({ left: walkAway && f > 24 });
      columns = Math.max(columns, boss.geysers.length);
      if (p.hp < before) hurt += before - p.hp;
      p.hp = p.maxHp;
      p.dead = false;
    }
    return { hurt, columns };
  };
  const tideStanding = tide(false);
  const tideStepAside = tide(true);

  /** And she reaches for it herself when he plants himself in her face. */
  const crowding = (() => {
    setUp(70, 0.5);
    let sawTide = false;
    for (let f = 0; f < 60 * 8 && !sawTide; f++) {
      boss.x = home;
      boss.vx = 0;
      p.x = home + boss.w / 2 - 70 - p.w / 2;
      p.vx = 0;
      p.invuln = 1;
      p.hp = p.maxHp;
      p.dead = false;
      tick({ attack: f % 11 < 4 });
      if (boss.state === 'tideWind') sawTide = true;
    }
    return sawTide;
  })();

  /* ------------------------------------------------- the crown's call, once */

  const crownCall = (() => {
    setUp(140, 0.25);
    let entries = 0;
    let columns = 0;
    let prev = boss.state;
    for (let f = 0; f < 60 * 8; f++) {
      boss.x = home;
      boss.vx = 0;
      boss.hp = Math.round(boss.maxHp * 0.25);
      p.invuln = 1;
      p.hp = p.maxHp;
      p.dead = false;
      tick();
      if (boss.state === 'crown' && prev !== 'crown') {
        entries++;
        columns = Math.max(columns, boss.geysers.length);
      }
      prev = boss.state;
    }
    return { entries, columns };
  })();

  /* ------------------------------------------- two moves before she breathes */

  /** A chain is the only way she can enter a stalk straight out of a move. */
  const chains = (hpRatio) => {
    setUp(90, hpRatio);
    let count = 0;
    let prev = boss.state;
    for (let f = 0; f < 60 * 12; f++) {
      boss.x = home;
      boss.vx = 0;
      p.x = home + boss.w / 2 - 90 - p.w / 2;
      p.vx = 0;
      p.invuln = 1;
      p.hp = p.maxHp;
      p.dead = false;
      boss.crowded = 0;
      tick();
      if (boss.state === 'stalk' && prev !== 'stalk' && prev !== 'recover' && prev !== 'wait') count++;
      prev = boss.state;
    }
    return count;
  };
  const chainsEarly = chains(1);
  const chainsLate = chains(0.2);

  /* ---------------------------------------------------- a parry breaks her */

  /**
   * Her poise is high enough now that swinging blindly only buys an
   * interruption now and then. The parry has to buy one every time - so hold
   * her poise out of reach and see her break anyway.
   */
  const parryBreaks = (() => {
    setUp(30, 1);
    boss.state = 'surgeWind';
    boss.tell = 'surge';
    let broke = false;
    for (let f = 0; f < 60 * 3 && !broke; f++) {
      boss.x = home;
      boss.y = bossY;
      boss.vx = 0;
      boss.poise = 999;
      // She must not get the move off: we are measuring the interruption.
      boss.timer = Math.max(boss.timer, 1);
      p.x = home + boss.w / 2 - 30 - p.w / 2;
      p.y = standY;
      p.vx = 0;
      p.hp = p.maxHp;
      p.dead = false;
      p.invuln = 0;
      tick({ right: true, parry: f % 14 < 5 });
      if (boss.stun > 0) broke = true;
    }
    return broke;
  })();

  /* ------------------------------------------------- and against a masher */

  /*
   * Forty seconds of being mashed, with her health topped up so the fight
   * cannot simply end first. Measuring "does she answer" up to her death made
   * the result a coin toss: a fast enough player kills her before she has
   * shown her moves once each, and whether she landed one in that time was
   * chance rather than behaviour. The count is a floor rather than a boast -
   * the sharp tests for the fight being too easy are the two above, the wave
   * that cannot be swatted and the tide that answers a squatter.
   */
  setUp(70, 1, false);
  let taken = 0;
  const masherStates = new Set();
  const masherShots = shotCounter();
  let staggers = 0;
  let lastStun = 0;
  for (let f = 0; f < 60 * 40; f++) {
    if (g.state !== 'playing') {
      tick({ confirm: true });
      continue;
    }
    if (p.hp < p.maxHp) {
      taken += p.maxHp - p.hp;
      p.hp = p.maxHp;
      p.dead = false;
    }
    boss.hp = Math.max(boss.hp, 10);
    boss.dead = false;
    const d = boss.cx - p.cx;
    tick({ right: d > 44, left: d < -44, attack: Math.abs(d) < 72 && f % 11 < 4 });
    masherStates.add(boss.state);
    masherShots.look();
    if (boss.stun > 0 && lastStun <= 0) staggers++;
    lastStun = boss.stun;
  }

  // And separately: she can still be brought down.
  setUp(70, 1, false);
  let sawPhaseTwo = false;
  let sawPhaseThree = false;
  let killFrames = 0;
  for (let f = 0; f < 60 * 90 && !boss.dead; f++) {
    if (g.state !== 'playing') {
      tick({ confirm: true });
      continue;
    }
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = Math.max(p.invuln, 0.3);
    if (boss.phase === 2) sawPhaseTwo = true;
    if (boss.phase === 3) sawPhaseThree = true;
    const d = boss.cx - p.cx;
    tick({ right: d > 44, left: d < -44, attack: Math.abs(d) < 72 && f % 11 < 4 });
    killFrames = f;
  }
  const killed = boss.dead;

  return {
    ok:
      near.moves.includes('surgeWind') &&
      far.moves.includes('anchorWind') &&
      (near.moves.includes('undertowWind') || far.moves.includes('undertowWind')) &&
      far.shots > 0 &&
      (surgeOne.shockwave ?? 0) === 2 &&
      (surgeTwo.shockwave ?? 0) === 4 &&
      (anchorOne.rock ?? 0) === 1 &&
      (anchorTwo.rock ?? 0) === 2 &&
      swungAtWave.hurt > 0 &&
      swungAtWave.deflected === 0 &&
      tideStanding.hurt > 0 &&
      tideStepAside.hurt === 0 &&
      tideStanding.columns >= 3 &&
      crowding &&
      crownCall.entries === 1 &&
      crownCall.columns === 5 &&
      chainsEarly === 0 &&
      chainsLate > 0 &&
      parryBreaks &&
      taken >= 8 &&
      masherStates.has('tide') &&
      sawPhaseTwo &&
      sawPhaseThree &&
      killed &&
      passHp.walkedPast &&
      passHp.heartsLeft >= 3,
    maxHp: boss.maxHp,
    near,
    far,
    surge: { phase1: surgeOne, phase2: surgeTwo },
    anchor: { phase1: anchorOne, phase2: anchorTwo },
    swungAtWave,
    tide: { standing: tideStanding, stepAside: tideStepAside, whenCrowded: crowding },
    crownCall,
    chains: { phase1: chainsEarly, phase3: chainsLate },
    parryBreaks,
    damageDealtToMasher: taken,
    shotsAtMasher: masherShots.total,
    masherStates: [...masherStates].sort(),
    staggers,
    sawPhaseTwo,
    sawPhaseThree,
    killed,
    killSeconds: +(killFrames / 60).toFixed(1),
    walkPast: passHp,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    'FAIL: Thalassa no longer picks her move by range, or her flood can be swatted away, or the ' +
      'spring tide no longer answers a squatter (or no longer spares someone who steps aside), or ' +
      'the crown no longer calls, or a parry no longer breaks her, or she no longer answers a ' +
      'masher, or she cannot be killed or walked past.',
  );
  process.exit(1);
}
console.log(
  'OK: Thalassa surges up close, throws the anchor from afar, opens the floor under a squatter, ' +
    'answers twice in her second phase, calls the crown once for her last third, breaks to a ' +
    'parry, makes a masher pay, can be walked past, and still drowns.',
);
