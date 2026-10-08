/**
 * Every boss teaches one of its attacks, and every attack does what it says.
 *
 * On top of its relic each boss leaves the hero one of its own moves, used on
 * F and picked on Q. This tool pins that down with real key presses, through
 * the same input the player uses:
 *
 *   1. Each relic brings its boss's attack, in the order of the road, and the
 *      newest is the one picked. Q runs through them in that order and comes
 *      round again; F with nothing learned does nothing.
 *   2. Each attack, pressed once in front of a pinned skeleton, lands what it
 *      promises - and a second press inside its cooldown does nothing, one
 *      after it works again.
 *   3. Their rules hold: the silk binds and what it binds lives slower, the
 *      spouts, the fire and the sickles take more than one enemy at once, and
 *      the step through the dark does not step through the wall of a sealed
 *      arena - nor does anything get aimed through it.
 *   4. They survive a death and go with a restart, like the relics.
 *   5. What they are worth: twenty seconds of swinging at a pinned dummy, with
 *      and without the attack pressed whenever it is ready.
 *
 * Usage: node tools/verify-skills.mjs
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
const errors = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.error('PAGE ERROR:', e.message);
});
const base = `http://127.0.0.1:${server.address().port}/`;

const ROAD = [
  ['herzkern', 'klatschsprung'],
  ['keilerhaut', 'felswurf'],
  ['goldzahn', 'goldregen'],
  ['bebenfaust', 'sonnenblick'],
  ['seidenmantel', 'netzschuss'],
  ['glutklinge', 'feuerwelle'],
  ['zwillingsstern', 'mondsichel'],
  ['flutklinge', 'springflut'],
  ['taktgeber', 'pendelschlag'],
  ['blutdurst', 'blutsicheln'],
  ['schattenschritt', 'schattenwelle'],
  ['zweiteratem', 'schattensprung'],
  ['splitterparade', 'splitteransturm'],
  ['hydrablut', 'kronenfeuer'],
  ['klingenwelle', 'splitterregen'],
];

/** A fresh page, the loop stopped, and the helpers installed. */
async function fresh() {
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => {
    window.loop.stop();
    const g = window.game;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    g.dialogue = null;
    const h = {};
    h.tick = (actions = {}) => {
      for (const [a, v] of Object.entries({
        left: false,
        right: false,
        jump: false,
        attack: false,
        parry: false,
        dash: false,
        skill: false,
        cycle: false,
        confirm: false,
        ...actions,
      })) {
        input.forceDown(a, v);
      }
      g.update(1 / 60, input);
      g.render(ctx);
    };
    /** Flat open ground at the start of the forest, nobody about, nothing in flight. */
    h.quiet = () => {
      const p = g.player;
      g.warpTo(14);
      for (const e of g.enemies) e.dead = true;
      g.projectiles.length = 0;
      p.hp = p.maxHp;
      p.skillEffects = [];
      p.skillCooldowns.clear();
      p.facing = 1;
      for (let f = 0; f < 30; f++) h.tick();
      g.zoneBanner.timer = 0;
    };
    /** A skeleton that stands and takes it. */
    h.dummy = (gap, hp = 1000) => {
      const p = g.player;
      const d = g.spawnEnemyOfKind('skeleton', p.cx + gap, p.bottom);
      d.hardened = true;
      d.hp = d.maxHp = hp;
      d.pinX = d.x;
      return d;
    };
    h.pin = (d) => {
      d.x = d.pinX;
      d.vx = 0;
      d.stun = 1;
    };
    window.__h = h;
  });
}

const results = {};

/* ------------------------------------------------ 1. taught, and picked */

await fresh();
results.learning = await page.evaluate((road) => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  h.quiet();
  const out = {};
  // F before anything is learned: nothing at all.
  h.tick({ skill: true });
  h.tick();
  out.emptyPress = { effects: p.skillEffects.length, picked: p.skill };
  out.taught = [];
  for (const [relic, skill] of road) {
    g.takeRelic(relic);
    out.taught.push({ relic, skill, has: p.skills.has(skill), picked: p.skill, sub: g.zoneBanner.sub ?? '' });
  }
  out.count = p.skills.size;
  // Q, once round all of them and one more: back to the first.
  out.cycle = [];
  for (let i = 0; i <= road.length; i++) {
    h.tick({ cycle: true });
    h.tick();
    out.cycle.push(p.skill);
  }
  return out;
}, ROAD);

/* ------------------------------------------- 2. each lands what it says */

const PLAN = {
  // gap to the dummy, and the least one cast has to land on it
  klatschsprung: [90, 3],
  felswurf: [150, 2],
  goldregen: [150, 2],
  sonnenblick: [200, 3],
  netzschuss: [160, 1],
  feuerwelle: [140, 2],
  mondsichel: [120, 2],
  springflut: [200, 2],
  pendelschlag: [80, 2],
  blutsicheln: [150, 2],
  schattenwelle: [120, 2],
  schattensprung: [150, 3],
  splitteransturm: [70, 2],
  kronenfeuer: [150, 2],
  splitterregen: [200, 2],
};
results.casts = await page.evaluate((plan) => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const out = {};
  // Each at its own cooldown, as the table has it: the Taktgeber runs them all
  // a third faster, and verify:relics measures that.
  p.relics.delete('taktgeber');
  for (const [id, [gap]] of Object.entries(plan)) {
    h.quiet();
    p.skill = id;
    const d = h.dummy(gap);
    let snare = 0;
    for (let f = 0; f < 150; f++) {
      h.pin(d);
      h.tick({ skill: f === 0 });
      snare = Math.max(snare, d.snare);
    }
    const dealt = 1000 - d.hp;
    // Inside the cooldown a press does nothing; after it, it works again.
    const cooldown = p.cooldownLeft(id);
    const before = d.hp;
    p.skillEffects = [];
    h.tick({ skill: true });
    h.tick();
    const blocked = p.skillEffects.length === 0 && p.cooldownLeft(id) > 0;
    for (let f = 0; f < 60 * 6 && p.cooldownLeft(id) > 0; f++) {
      h.pin(d);
      h.tick();
    }
    h.tick({ skill: true });
    const again = p.skillEffects.length > 0;
    for (let f = 0; f < 30; f++) {
      h.pin(d);
      h.tick();
    }
    out[id] = { dealt, snare: +snare.toFixed(2), cooldownAfterCast: +cooldown.toFixed(2), blocked, again, lostInBlock: before - d.hp < 0 };
    d.dead = true;
  }
  return out;
}, PLAN);

/* ------------------------------------------------------- 3. their rules */

results.rules = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const out = {};

  // The silk: what it binds lives slower - here, a skeleton's own clock.
  h.quiet();
  const free = h.dummy(400);
  const bound = h.dummy(160);
  p.skill = 'netzschuss';
  for (let f = 0; f < 60 && bound.snare <= 0; f++) {
    h.pin(free);
    h.pin(bound);
    h.tick({ skill: f === 0 });
  }
  const a0 = free.anim;
  const b0 = bound.anim;
  const held = bound.snare > 0;
  for (let f = 0; f < 30; f++) {
    h.pin(free);
    h.pin(bound);
    h.tick();
  }
  out.silk = { held, pace: +((bound.anim - b0) / (free.anim - a0)).toFixed(2) };

  // More than one at a time: three in a row for the spouts, the fire and
  // the sickles.
  const crowd = (id, gaps) => {
    h.quiet();
    p.skill = id;
    const ds = gaps.map((gap) => h.dummy(gap));
    for (let f = 0; f < 120; f++) {
      for (const d of ds) h.pin(d);
      h.tick({ skill: f === 0 });
    }
    const hit = ds.filter((d) => d.hp < d.maxHp).length;
    for (const d of ds) d.dead = true;
    return hit;
  };
  out.crowd = {
    springflut: crowd('springflut', [120, 200, 280]),
    feuerwelle: crowd('feuerwelle', [80, 150, 220]),
    blutsicheln: crowd('blutsicheln', [90, 160, 230]),
  };

  return out;
});

/*
 * A sealed arena, on a page of its own - everything above has cleared the
 * world of enemies, its bosses too. The hero inside by its door, a skeleton
 * just outside: nothing is aimed at it through the ward, and the step through
 * the dark does not take him out.
 */
await fresh();
results.ward = await page.evaluate((road) => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  for (const [relic] of road) g.takeRelic(relic);
  g.dialogue = null;
  const arena = g.level.arenas.find((a) => g.level.spawns.some((s) => s.kind === 'wyrm' && s.tx * 32 >= a.left && s.tx * 32 < a.right));
  g.warpTo(arena.entryTx + 3);
  let wyrm = null;
  for (let f = 0; f < 60 * 8 && !(wyrm && wyrm.engaged && arena.fighting); f++) {
    p.hp = p.maxHp;
    wyrm = g.enemies.find((e) => e.kind === 'wyrm' && !e.dead);
    h.tick({ right: f < 30 });
  }
  if (!wyrm || !arena.fighting) return { note: 'the chamber never closed' };
  const doorX = arena.entryTx * 32;
  const hold = () => {
    wyrm.state = 'idle';
    wyrm.timer = 99;
    wyrm.hy = wyrm.floorY + 74;
  };
  hold();
  p.x = doorX + 40;
  p.vx = 0;
  for (let f = 0; f < 10; f++) {
    hold();
    h.tick();
  }
  const outside = g.spawnEnemyOfKind('skeleton', doorX - 70, p.bottom);
  outside.hardened = true;
  outside.hp = outside.maxHp = 1000;
  outside.pinX = outside.x;
  for (const id of ['sonnenblick', 'springflut', 'splitterregen', 'schattensprung']) {
    p.skill = id;
    p.skillCooldowns.clear();
    p.facing = -1;
    p.x = doorX + 40;
    for (let f = 0; f < 90; f++) {
      h.pin(outside);
      hold();
      p.hp = p.maxHp;
      h.tick({ skill: f === 0 });
    }
  }
  return { sealed: arena.fighting, outsideHurt: 1000 - outside.hp, heroInside: p.cx > doorX };
}, ROAD);

/* ------------------------------------------ 4. a death keeps, a restart takes */

await fresh();

results.keeping = await page.evaluate((road) => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  for (const [relic] of road) g.takeRelic(relic);
  g.dialogue = null;
  h.quiet();
  const had = p.skills.size;
  p.shieldUp = false;
  p.secondWind = false;
  p.invuln = 0;
  p.hurt(999, 1, g, true);
  for (let f = 0; f < 60 * 2 && g.state === 'playing'; f++) h.tick();
  const died = g.state === 'dead';
  for (let f = 0; f < 60 * 5 && g.state !== 'playing'; f++) h.tick({ confirm: f % 2 === 0 });
  const kept = p.skills.size;
  g.restart();
  return { had, died, kept, afterRestart: p.skills.size, picked: p.skill };
}, ROAD);

/* ------------------------------------------------- 5. what they are worth */

await fresh();
results.worth = await page.evaluate((road) => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  // Every skill, no relic: the sword the measurement in the README is against.
  for (const [relic] of road) g.takeRelic(relic);
  p.relics.clear();
  p.beamTier = 0;
  p.maxHp = 6;
  p.shieldUp = false;
  p.secondWind = false;
  g.dialogue = null;
  const run = (id) => {
    h.quiet();
    p.skill = id;
    const d = h.dummy(30, 100000);
    const home = p.x;
    for (let f = 0; f < 60 * 20; f++) {
      h.pin(d);
      p.hp = p.maxHp;
      // Back in front of it whenever an attack has carried him off.
      if (p.skillEffects.length === 0 && p.onGround && !p.isDashing) {
        p.x = home;
        p.facing = 1;
      }
      h.tick({ attack: f % 8 < 2, skill: !!id && p.cooldownLeft(id) <= 0 && f % 4 === 0 });
    }
    return +((100000 - d.hp) / 20).toFixed(2);
  };
  const sword = run(null);
  const out = { sword };
  for (const [, id] of road) out[id] = run(id);
  return out;
}, ROAD);

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

const L = results.learning;
const C = results.casts;
const R = results.rules;
const K = results.keeping;
const W = results.worth;
const gain = (id) => W[id] / W.sword - 1;
const checks = [
  ['F does nothing before an attack is learned', L.emptyPress.effects === 0 && L.emptyPress.picked === null],
  [
    'every relic brings its boss attack, the newest picked and named on the banner',
    L.taught.every((t) => t.has && t.picked === t.skill && t.sub.includes('NEUER ANGRIFF')) && L.count === ROAD.length,
  ],
  [
    'Q runs through them in the order of the road and comes round again',
    L.cycle.slice(0, ROAD.length).join() === ROAD.map(([, s]) => s).join() && L.cycle[ROAD.length] === ROAD[0][1],
  ],
  ...Object.entries(PLAN).map(([id, [, least]]) => [`${id}: one press lands at least ${least}`, C[id].dealt >= least]),
  ['every attack waits out its cooldown, and works again after it', Object.values(C).every((c) => c.blocked && c.again)],
  ['the silk binds, and what it binds lives at a third of its pace', R.silk.held && R.silk.pace < 0.4 && results.casts.netzschuss.snare > 2],
  ['the springtide, the wave of fire and the sickles take three at once', R.crowd.springflut === 3 && R.crowd.feuerwelle === 3 && R.crowd.blutsicheln === 3],
  ['nothing is aimed through the wall of a sealed arena, and nothing steps through it', results.ward.sealed && results.ward.outsideHurt === 0 && results.ward.heroInside],
  ['the attacks survive a death and go with a restart', K.died && K.kept === K.had && K.had === ROAD.length && K.afterRestart === 0 && K.picked === null],
  [
    'used whenever ready, no attack adds more than half to the sword - and every one adds something',
    Object.keys(PLAN).every((id) => gain(id) > 0 && gain(id) < 0.5),
  ],
  ['no page errors', errors.length === 0],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(
  `\n  worth (damage a second, 20 s on a pinned dummy): sword ${W.sword}; ` +
    Object.keys(PLAN)
      .map((id) => `${id} ${W[id]} (+${Math.round(gain(id) * 100)} %)`)
      .join(', '),
);
console.log(failed === 0 ? '\nAll skill checks passed.' : `\n${failed} skill check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
