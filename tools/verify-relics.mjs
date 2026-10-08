/**
 * Every boss leaves something, and every something does what it says.
 *
 * Eighteen bosses, eighteen relics. This tool pins both halves on a fresh page each:
 *
 *   1. Each boss, felled in its own arena, says its piece and hands over its
 *      relic - and the relic is still there after a death and gone after a
 *      restart. One of its attacks comes with it, picked and ready (what the
 *      attacks do is verify:skills').
 *   2. Each relic does exactly its one thing, measured on the hero rather than
 *      read off a flag: the heart is a heart, the shield takes a blow and grows
 *      back after twelve quiet seconds and not before, blood and gold pay out
 *      as hearts and wait when there is nothing to fill, the second breath
 *      stops one lethal blow per life and not two, the quake rolls past what
 *      the blade struck, and so on down the list.
 *   3. The monsters take stock: a skeleton that meets a hero with an ember in
 *      his blade carries more health, and a boss that wakes in front of eleven
 *      relics carries more than one that wakes in front of none.
 *
 * Usage: node tools/verify-relics.mjs
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

/** A fresh page, the loop stopped, and a tick helper installed. */
async function fresh() {
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => {
    window.loop.stop();
    const g = window.game;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    const h = {};
    h.tick = (actions = {}) => {
      for (const [a, v] of Object.entries({
        left: false,
        right: false,
        jump: false,
        attack: false,
        parry: false,
        dash: false,
        confirm: false,
        ...actions,
      })) {
        input.forceDown(a, v);
      }
      g.update(1 / 60, input);
      g.render(ctx);
    };
    /** Through whatever is being said, one line at a time. */
    h.read = () => {
      let lines = 0;
      for (let f = 0; f < 60 * 12 && g.dialogue; f++) {
        lines = Math.max(lines, g.dialogue.lines.length);
        h.tick({ confirm: f % 2 === 0 });
      }
      return lines;
    };
    h.arenaOf = (kind) =>
      g.level.arenas.find((a) => g.level.spawns.some((s) => s.kind === kind && s.tx * 32 >= a.left && s.tx * 32 < a.right));
    /**
     * The hero with these relics and no others, and none of what the others
     * left running: each effect is measured on its own, not on top of the
     * last one's - an ember in the blade would put a point on every swing the
     * quake is measured against.
     */
    h.only = (...ids) => {
      const p = g.player;
      p.relics.clear();
      p.shieldUp = false;
      p.shieldTimer = 0;
      p.secondWind = false;
      p.bloodMeter = 0;
      p.goldCount = 0;
      // What it is at full health, which is where every test starts from.
      p.regrowTimer = 18;
      p.sticky = 0;
      for (const id of ids) g.takeRelic(id);
      g.dialogue = null;
    };
    window.__h = h;
  });
}

const results = {};

/* -------------------------------------------- 1. every boss hands one over */

/** The attack each relic brings with it. See skills.ts. */
const SKILL_OF = {
  herzkern: 'klatschsprung',
  keilerhaut: 'felswurf',
  goldzahn: 'goldregen',
  gauklerschritt: 'trugbild',
  bebenfaust: 'sonnenblick',
  lichtkern: 'irrlichter',
  seidenmantel: 'netzschuss',
  glutklinge: 'feuerwelle',
  zwillingsstern: 'mondsichel',
  flutklinge: 'springflut',
  steinblick: 'steinsturz',
  taktgeber: 'pendelschlag',
  blutdurst: 'blutsicheln',
  schattenschritt: 'schattenwelle',
  zweiteratem: 'schattensprung',
  splitterparade: 'splitteransturm',
  hydrablut: 'kronenfeuer',
  klingenwelle: 'splitterregen',
};

const ARENA_BOSSES = [
  ['gallert', 'herzkern'],
  ['boar', 'keilerhaut'],
  ['mimic', 'goldzahn'],
  ['jester', 'gauklerschritt'],
  ['colossus', 'bebenfaust'],
  ['gloom', 'lichtkern'],
  ['spider', 'seidenmantel'],
  ['wyrm', 'glutklinge'],
  ['twins', 'zwillingsstern'],
  ['thalassa', 'flutklinge'],
  ['gargoyle', 'steinblick'],
  ['clock', 'taktgeber'],
  ['vesper', 'blutdurst'],
  ['shadow', 'zweiteratem'],
  ['warden', 'splitterparade'],
];
results.bosses = [];
for (const [kind, relic] of ARENA_BOSSES) {
  await fresh();
  results.bosses.push(
    await page.evaluate(
      ({ kind, relic, skill }) => {
        const g = window.game;
        const h = window.__h;
        const p = g.player;
        const arena = h.arenaOf(kind);
        g.warpTo(arena.entryTx + 3);
        for (const e of g.enemies) if (e.kind !== kind && e.x > arena.left - 600 && e.x < arena.right + 200) e.dead = true;
        let boss = null;
        for (let f = 0; f < 60 * 10 && !(boss && boss.engaged); f++) {
          p.hp = p.maxHp;
          boss = g.enemies.find((e) => e.kind === kind && !e.dead);
          const dx = boss ? boss.cx - p.cx : 1;
          h.tick({ right: dx > 60, left: dx < -60 });
        }
        if (!boss || !boss.engaged) return { kind, note: 'never woke' };
        for (let f = 0; f < 30; f++) h.tick();
        if (typeof boss.beginDying === 'function') boss.beginDying(g);
        else {
          boss.overlaps({ x: -1e7, y: -1e7, w: 2e7, h: 2e7 });
          boss.hurt(99999, 1, g);
        }
        let spoke = false;
        for (let f = 0; f < 60 * 6 && !g.dialogue; f++) {
          p.hp = p.maxHp;
          p.invuln = 1;
          h.tick();
        }
        spoke = !!g.dialogue;
        const speaker = g.dialogue?.speaker ?? null;
        const lines = h.read();
        const got = p.relics.has(relic);
        const taught = p.skills.has(skill) && p.skill === skill;
        const banner = g.zoneBanner.text;
        // The world holds still while the words are read; a moment of it
        // running again, and the wards go.
        for (let f = 0; f < 30; f++) {
          p.hp = p.maxHp;
          p.invuln = 1;
          h.tick();
        }
        const cleared = arena.cleared;
        // A death keeps it - a real one: the silk and the second breath would
        // each catch this blow, and that is not what is being asked here.
        p.shieldUp = false;
        p.secondWind = false;
        p.invuln = 0;
        p.hurt(999, 1, g, true);
        const died = p.dead;
        for (let f = 0; f < 60 * 2 && g.state === 'playing'; f++) h.tick();
        const sawDeath = g.state === 'dead';
        for (let f = 0; f < 60 * 5 && g.state !== 'playing'; f++) h.tick({ confirm: f % 2 === 0 });
        for (let f = 0; f < 10; f++) h.tick();
        const keptOverDeath = died && sawDeath && g.state === 'playing' && p.relics.has(relic) && p.skills.has(skill);
        return { kind, relic, spoke, speaker, lines, got, taught, banner, keptOverDeath, cleared };
      },
      { kind, relic, skill: SKILL_OF[relic] },
    ),
  );
}

// The knight and the hydra keep their own ways of falling.
await fresh();
results.knight = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const bossTile = g.level.spawns.find((s) => s.kind === 'boss').tx;
  g.warpTo(bossTile - 10);
  for (let f = 0; f < 60 * 8 && !(g.boss && g.boss.engaged); f++) {
    p.hp = p.maxHp;
    h.tick({ right: true });
  }
  if (!g.boss?.engaged) return { note: 'knight never woke' };
  for (let f = 0; f < 60 * 3; f++) {
    p.hp = p.maxHp;
    h.tick();
  }
  g.boss.vulnerable = true;
  g.boss.hp = 1;
  g.boss.hurt(99, 1, g);
  let spokeAt = -1;
  for (let f = 0; f < 60 * 8 && !g.dialogue; f++) {
    p.hp = p.maxHp;
    p.invuln = 1;
    h.tick();
    if (g.dialogue) spokeAt = f / 60;
  }
  const speaker = g.dialogue?.speaker ?? null;
  h.read();
  return { spokeAt, speaker, got: p.relics.has('schattenschritt') && p.skill === 'schattenwelle', sealOpen: !g.level.exitSealed };
});

await fresh();
results.hydra = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const z = g.level.spawns.find((s) => s.kind === 'hydra');
  g.warpTo(z.tx - 8);
  let hy = null;
  for (let f = 0; f < 60 * 8 && !(hy && hy.engaged); f++) {
    p.hp = p.maxHp;
    hy = g.enemies.find((e) => e.kind === 'hydra' && !e.dead);
    h.tick({ right: !!hy && hy.cx - p.cx > 200 });
  }
  if (!hy?.engaged) return { note: 'hydra never woke' };
  // Out the far side of her rise: she cannot be touched while she comes up.
  for (let f = 0; f < 60 * 5 && (hy.state === 'rise' || hy.state === 'wait'); f++) {
    p.hp = p.maxHp;
    p.invuln = 1;
    h.tick();
  }
  // Burn the four shut and put the fire out: her own way down. The fight
  // itself is verify:hydra's.
  for (const neck of hy.necks) {
    if (neck.kind === 'flame') continue;
    neck.state = 'sealed';
    neck.hp = 0;
  }
  hy.struck = hy.necks.findIndex((n) => n.kind === 'flame');
  hy.hurt(999, 1, g);
  for (let f = 0; f < 60 * 4 && !g.dialogue; f++) {
    p.hp = p.maxHp;
    p.invuln = 1;
    h.tick();
  }
  const speaker = g.dialogue?.speaker ?? null;
  h.read();
  return { speaker, got: p.relics.has('hydrablut') && p.skill === 'kronenfeuer', gateOpen: !g.level.lairClosed };
});

// A restart takes every one of them back.
results.restart = await page.evaluate(() => {
  const g = window.game;
  const before = g.player.relics.size;
  const skillsBefore = g.player.skills.size;
  g.restart();
  return {
    before,
    after: g.player.relics.size,
    hearts: g.player.maxHp,
    tier: g.player.beamTier,
    skillsBefore,
    skillsAfter: g.player.skills.size,
  };
});

/* ------------------------------------------------ 2. each one does its job */

await fresh();
results.effects = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const out = {};
  // Flat open ground at the start of the forest, nobody about.
  const quiet = () => {
    if (g.state !== 'playing' || p.dead) {
      for (let f = 0; f < 60 * 5 && g.state !== 'playing'; f++) h.tick({ confirm: f % 2 === 0 });
    }
    g.warpTo(14);
    for (const e of g.enemies) e.dead = true;
    g.projectiles.length = 0;
    p.hp = p.maxHp;
    for (let f = 0; f < 20; f++) h.tick();
  };
  const dummy = (gap, hp = 1000) => {
    const d = g.spawnEnemyOfKind('skeleton', p.cx + gap, p.bottom);
    d.hardened = true;
    d.hp = d.maxHp = hp;
    return d;
  };
  const pin = (d, gap) => {
    d.x = p.cx + gap - d.w / 2;
    d.vx = 0;
    d.stun = 1;
  };
  quiet();

  // Herzkern.
  h.only('herzkern');
  out.herzkern = { maxHp: p.maxHp, full: p.hp === p.maxHp };

  // Goldzahn: ten gems while hurt is a heart; at full health it waits.
  h.only('goldzahn');
  p.hp = p.maxHp - 2;
  for (let i = 0; i < 10; i++) p.onGem();
  h.tick();
  const afterTen = p.hp;
  p.hp = p.maxHp;
  for (let i = 0; i < 10; i++) p.onGem();
  for (let f = 0; f < 30; f++) h.tick();
  const banked = p.goldCount;
  p.hp = p.maxHp - 1;
  h.tick();
  out.goldzahn = { healedOnTenth: afterTen === p.maxHp - 1, banked, paidLater: p.hp === p.maxHp, emptied: p.goldCount === 0 };

  // Glutklinge: the finisher and the heavy strike, one more each.
  const finisherWith = (has) => {
    quiet();
    if (has) h.only('glutklinge');
    else h.only();
    const d = dummy(30);
    let combo = [];
    let before = d.hp;
    for (let f = 0; f < 60; f++) {
      pin(d, 30);
      p.facing = 1;
      h.tick({ attack: f % 8 < 2 && combo.length < 3 });
      if (d.hp < before) {
        combo.push(before - d.hp);
        before = d.hp;
      }
    }
    return combo;
  };
  const plain = finisherWith(false);
  const glowing = finisherWith(true);
  out.glutklinge = { plain, glowing };

  // Bebenfaust: quicker to wind up, and a quake past the blade.
  quiet();
  h.only();
  const slowCharge = p.chargeTime;
  h.only('bebenfaust');
  const quickCharge = p.chargeTime;
  const near = dummy(30);
  const far = dummy(170);
  let quakes = 0;
  // Blow by blow: the press that starts the charge is a cut of its own, then
  // the heavy strike, and the quake must pass the one the blade struck.
  const nearBlows = [];
  const farBlows = [];
  let held = 0;
  for (let f = 0; f < 90; f++) {
    pin(near, 30);
    pin(far, 170);
    p.facing = 1;
    const hold = !p.chargeReady && held < 40;
    if (hold) held++;
    const nb = near.hp;
    const fb = far.hp;
    h.tick({ attack: hold });
    if (near.hp < nb) nearBlows.push(nb - near.hp);
    if (far.hp < fb) farBlows.push(fb - far.hp);
    quakes = Math.max(quakes, g.projectiles.filter((q) => q.kind === 'quake' && q.friendly).length);
  }
  out.bebenfaust = { slowCharge, quickCharge, quakes, nearBlows, farBlows };

  // Seidenmantel: one blow caught, and back after twelve quiet seconds.
  quiet();
  h.only('seidenmantel');
  p.hp = p.maxHp;
  p.invuln = 0;
  p.hurt(2, 1, g);
  const caught = p.hp === p.maxHp && !p.shieldUp;
  p.invuln = 0;
  for (let f = 0; f < 60; f++) h.tick();
  p.invuln = 0;
  p.hurt(1, 1, g);
  const secondHurts = p.hp === p.maxHp - 1;
  let regrewAt = -1;
  for (let f = 0; f < 60 * 14 && regrewAt < 0; f++) {
    h.tick();
    if (p.shieldUp) regrewAt = f / 60;
  }
  out.seidenmantel = { caught, secondHurts, regrewAt: +regrewAt.toFixed(2) };

  // Blutdurst: sixteen dealt is a heart, and it waits for a gap to fill.
  quiet();
  h.only('blutdurst');
  p.hp = p.maxHp - 1;
  p.bloodMeter = 0;
  const d2 = dummy(30);
  let dealt = 0;
  let healedAt = -1;
  for (let f = 0; f < 60 * 12 && healedAt < 0; f++) {
    pin(d2, 30);
    p.facing = 1;
    const before = d2.hp;
    h.tick({ attack: f % 8 < 2 });
    dealt += before - d2.hp;
    if (p.hp === p.maxHp) healedAt = dealt;
  }
  out.blutdurst = { healedAfterDealing: healedAt };

  // Schattenschritt: two rolls in the air - and on the ground no endless chain.
  quiet();
  const airRolls = (has) => {
    quiet();
    if (has) h.only('schattenschritt');
    else h.only();
    let rolls = 0;
    let wasDashing = false;
    let landed = -1;
    // A full jump, and a roll asked for three times on the way down - the
    // second and third ask while the first roll is over and he is still up.
    for (let f = 0; f < 70; f++) {
      const a = { jump: f < 17, dash: f === 8 || f === 24 || f === 25 || f === 34 };
      h.tick(a);
      if (f > 2 && p.onGround && landed < 0) landed = f;
      if (p.isDashing && !wasDashing && landed < 0) rolls++;
      wasDashing = p.isDashing;
    }
    return { rolls, landed };
  };
  const airWithout = airRolls(false);
  const airWith = airRolls(true);
  quiet();
  h.only('schattenschritt');
  let untouchable = 0;
  // Rolling as often as the key allows, turning about every half second so
  // he stays on the open ground at the start.
  for (let f = 0; f < 60 * 4; f++) {
    const right = f % 60 < 30;
    h.tick({ dash: f % 2 === 0, right, left: !right });
    if (p.isDashing) untouchable++;
  }
  out.schattenschritt = { airWithout, airWith, untouchableShare: +(untouchable / (60 * 4)).toFixed(2) };

  // Zweiter Atem: one lethal blow stopped, the next one not, and back in the
  // next life.
  quiet();
  h.only('zweiteratem');
  p.hp = 1;
  p.invuln = 0;
  p.hurt(5, 1, g);
  const firstSaved = !p.dead && p.hp === 1;
  p.invuln = 0;
  p.hurt(5, 1, g);
  const secondKills = p.dead;
  for (let f = 0; f < 60 * 2 && g.state === 'playing'; f++) h.tick();
  for (let f = 0; f < 60 * 5 && g.state !== 'playing'; f++) h.tick({ confirm: f % 2 === 0 });
  out.zweiteratem = { firstSaved, secondKills, backNextLife: g.state === 'playing' && !p.dead && p.secondWind };

  // Splitterparade: a longer window - and, below, three splinters off a parry.
  quiet();
  h.only();
  const shortWindow = p.parryWindow;
  h.only('splitterparade');
  const longWindow = p.parryWindow;
  out.splitterparade = { shortWindow, longWindow };
  return out;
});

// The splinters: the guard raised with the key, and a blow into it from in
// front - and without the relic, the same parry throws nothing.
results.splinters = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const parryOnce = (relics) => {
    h.only(...relics);
    g.warpTo(14);
    for (const e of g.enemies) e.dead = true;
    g.projectiles.length = 0;
    // Long enough for the last parry's recovery to have run out.
    for (let f = 0; f < 90; f++) h.tick();
    p.facing = 1;
    h.tick({ parry: true });
    const raised = p.parryTimer > 0;
    p.hurt(1, -p.facing, g);
    const caught = p.parryFlash > 0.9 && p.hp === p.maxHp;
    h.tick();
    return { raised, caught, shards: g.projectiles.filter((q) => q.kind === 'shard' && q.friendly).length };
  };
  return { bare: parryOnce([]), armed: parryOnce(['splitterparade']) };
});

// Keilerhaut, Zwillingsstern and Taktgeber: what the three later bosses
// leave, each measured on the hero.
results.later = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const out = {};
  const reset = (...relics) => {
    h.only(...relics);
    g.warpTo(14);
    for (const e of g.enemies) e.dead = true;
    g.projectiles.length = 0;
    p.skillEffects = [];
    p.skillCooldowns.clear();
    // Long enough for the last parry's recovery and any blow's stagger to
    // have run out.
    for (let f = 0; f < 90; f++) h.tick();
    p.hp = p.maxHp;
    p.invuln = 0;
    p.shieldUp = false;
  };
  // Keilerhaut: the same blow throws him a third as far and hardly stops him.
  const knock = (has) => {
    reset(...(has ? ['keilerhaut'] : []));
    p.hurt(1, 1, g);
    return { vx: Math.round(p.vx), stagger: +p.hurtTimer.toFixed(2) };
  };
  out.keilerhaut = { without: knock(false), with: knock(true) };
  // Zwillingsstern: a parry calls the picked attack back.
  const parryRefresh = (has) => {
    reset(...(has ? ['zwillingsstern'] : []));
    p.skills.add('felswurf');
    p.skill = 'felswurf';
    p.skillCooldowns.set('felswurf', 3);
    p.facing = 1;
    h.tick({ parry: true });
    p.hurt(1, -p.facing, g);
    const caught = p.parryFlash > 0.9 && p.hp === p.maxHp;
    h.tick();
    return { caught, cooldown: +p.cooldownLeft('felswurf').toFixed(2) };
  };
  out.zwillingsstern = { without: parryRefresh(false), with: parryRefresh(true) };
  // Taktgeber: one second of cooldown, and how much of it ran down.
  const pace = (has) => {
    reset(...(has ? ['taktgeber'] : []));
    p.skills.add('felswurf');
    p.skill = 'felswurf';
    p.skillCooldowns.set('felswurf', 3);
    for (let f = 0; f < 60; f++) h.tick();
    return +(3 - p.cooldownLeft('felswurf')).toFixed(2);
  };
  out.taktgeber = { without: pace(false), with: pace(true) };
  return out;
});

// Hydrablut: eighteen seconds hurt, and a heart grows back.
results.hydrablut = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  g.warpTo(14);
  for (const e of g.enemies) e.dead = true;
  h.only('hydrablut');
  p.hp = p.maxHp - 2;
  let grewAt = -1;
  for (let f = 0; f < 60 * 25 && grewAt < 0; f++) {
    h.tick();
    if (p.hp === p.maxHp - 1) grewAt = f / 60;
  }
  return { grewAt: +grewAt.toFixed(2) };
});

/*
 * The three the theatre, the grotto and the battlements hand over, each on
 * the hero: a roll through a blow owes one doubled cut; a blow knocks a heart
 * out as a light that comes back if it is fetched; and what flies at him while
 * he looks at it comes a third slower.
 */
await fresh();
results.newer = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const out = {};
  const quiet = () => {
    for (let f = 0; f < 60 * 5 && g.state !== 'playing'; f++) h.tick({ confirm: f % 2 === 0 });
    g.warpTo(14);
    for (const e of g.enemies) e.dead = true;
    g.projectiles.length = 0;
    p.hp = p.maxHp;
    p.invuln = 0;
    // Out of whatever the last check left him in: a stagger swallows a swing.
    p.hurtTimer = 0;
    p.motes = [];
    p.tumble = 0;
    for (let f = 0; f < 20; f++) h.tick();
  };
  const dummy = (gap) => {
    const d = g.spawnEnemyOfKind('skeleton', p.cx + gap, p.bottom);
    d.hardened = true;
    d.hp = d.maxHp = 1000;
    return d;
  };

  // Gauklerschritt: a roll, a blow that meets it, and the cuts after.
  const tumble = (has) => {
    quiet();
    if (has) h.only('gauklerschritt');
    else h.only();
    p.facing = 1;
    h.tick({ dash: true });
    p.hurt(1, -1, g);
    const owed = p.tumble;
    const unhurt = p.hp === p.maxHp;
    for (let f = 0; f < 30; f++) h.tick();
    const d = dummy(30);
    const blows = [];
    let before = d.hp;
    for (let f = 0; f < 90 && blows.length < 2; f++) {
      d.x = p.cx + 30 - d.w / 2;
      d.vx = 0;
      d.stun = 1;
      p.facing = 1;
      h.tick({ attack: f % 14 < 2 });
      if (d.hp < before) {
        blows.push(before - d.hp);
        before = d.hp;
      }
    }
    d.dead = true;
    return { owed: +owed.toFixed(2), unhurt, blows };
  };
  out.gauklerschritt = { with: tumble(true), without: tumble(false) };

  // Lichtkern: the heart goes out of him as a light, a little way off.
  const mote = (fetch) => {
    quiet();
    h.only('lichtkern');
    p.hurt(1, 1, g);
    const dropped = p.motes.length;
    const hurt = p.hp === p.maxHp - 1;
    let back = -1;
    let off = null;
    for (let f = 0; f < 60 * 4; f++) {
      const m = p.motes[0];
      if (m && m.landed && off === null) off = Math.round(Math.abs(m.x - p.cx));
      const a = {};
      if (fetch && m && m.landed && Math.abs(m.x - p.cx) > 2) a[m.x > p.cx ? 'right' : 'left'] = true;
      h.tick(a);
      if (back < 0 && p.hp === p.maxHp) back = +(f / 60).toFixed(2);
    }
    return { dropped, hurt, back, off, gone: p.motes.length === 0 };
  };
  out.lichtkern = { fetched: mote(true), left: mote(false) };
  quiet();
  h.only();
  p.hurt(1, 1, g);
  out.lichtkern.bare = p.motes.length;

  // Steinblick: a wave sent along the floor at him, faced and with his back to it.
  quiet();
  h.only('flutklinge');
  p.facing = 1;
  for (let f = 0; f < 20; f++) h.tick({ attack: f < 2 });
  const Shot = g.projectiles.find((q) => q.kind === 'beam')?.constructor;
  g.projectiles.length = 0;
  const flight = (has, facing) => {
    quiet();
    if (has) h.only('steinblick');
    else h.only();
    p.invuln = 99;
    p.facing = facing;
    const q = new Shot('shockwave', p.cx + 300, p.cy - 15, -200, 0);
    g.projectiles.push(q);
    const x0 = q.x;
    for (let f = 0; f < 60; f++) {
      p.facing = facing;
      h.tick();
    }
    q.dead = true;
    p.invuln = 0;
    return Math.round(x0 - q.x);
  };
  out.steinblick = { faced: flight(true, 1), turned: flight(true, -1), bare: flight(false, 1) };
  return out;
});

/* ---------------------------------------------- 3. the monsters take stock */

await fresh();
results.scaling = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  g.warpTo(14);
  for (const e of g.enemies) e.dead = true;
  for (let f = 0; f < 10; f++) h.tick();
  const bare = g.spawnEnemyOfKind('skeleton', p.cx + 300, p.bottom);
  for (let f = 0; f < 3; f++) h.tick();
  const bareHp = bare.maxHp;
  bare.dead = true;
  for (const id of ['glutklinge', 'flutklinge', 'bebenfaust']) g.takeRelic(id);
  g.dialogue = null;
  const armed = g.spawnEnemyOfKind('skeleton', p.cx + 300, p.bottom);
  for (let f = 0; f < 3; f++) h.tick();
  return { bareHp, armedHp: armed.maxHp };
});

// Ankhor, woken in front of nothing and in front of eleven relics.
const ankhorWith = async (relics) => {
  await fresh();
  return page.evaluate((relics) => {
    const g = window.game;
    const h = window.__h;
    const p = g.player;
    for (const id of relics) g.takeRelic(id);
    g.dialogue = null;
    const arena = h.arenaOf('colossus');
    g.warpTo(arena.entryTx + 3);
    let boss = null;
    for (let f = 0; f < 60 * 8 && !(boss && boss.engaged); f++) {
      p.hp = p.maxHp;
      boss = g.enemies.find((e) => e.kind === 'colossus' && !e.dead);
      h.tick({ right: true });
    }
    return { maxHp: boss?.maxHp ?? null, poise: boss?.poiseMax ?? null };
  }, relics);
};
results.ankhorBare = await ankhorWith([]);
results.ankhorAll = await ankhorWith([
  'herzkern',
  'goldzahn',
  'bebenfaust',
  'seidenmantel',
  'glutklinge',
  'flutklinge',
  'blutdurst',
  'schattenschritt',
  'zweiteratem',
  'splitterparade',
  'hydrablut',
]);

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

const e = results.effects;
const byKind = Object.fromEntries(results.bosses.map((b) => [b.kind, b]));
const checks = [
  ...ARENA_BOSSES.map(([kind, relic]) => [
    `${kind} falls, speaks and hands over ${relic} and ${SKILL_OF[relic]}, which outlive a death`,
    byKind[kind]?.spoke && byKind[kind].lines >= 2 && byKind[kind].got && byKind[kind].taught && byKind[kind].keptOverDeath && byKind[kind].cleared,
  ]),
  ['the knight speaks after the seal has had its moment, and hands over Schattenschritt and Schattenwelle', results.knight.spokeAt >= 1 && results.knight.got && results.knight.sealOpen],
  ['the hydra opens the gate and hands over Hydrablut and Kronenfeuer', results.hydra.got && results.hydra.gateOpen],
  [
    'a restart takes every relic and every attack back',
    results.restart.before > 0 &&
      results.restart.after === 0 &&
      results.restart.hearts === 6 &&
      results.restart.tier === 0 &&
      results.restart.skillsBefore > 0 &&
      results.restart.skillsAfter === 0,
  ],
  ['Herzkern: seven hearts, full', e.herzkern.maxHp === 7 && e.herzkern.full],
  ['Goldzahn: the tenth gem is a heart, banked while full', e.goldzahn.healedOnTenth && e.goldzahn.banked === 10 && e.goldzahn.paidLater && e.goldzahn.emptied],
  [
    'Glutklinge: the finisher hits one harder',
    e.glutklinge.plain.join() === '1,1,2' && e.glutklinge.glowing.join() === '1,1,3',
  ],
  [
    'Bebenfaust: quicker charge, and a quake that passes what the blade struck',
    e.bebenfaust.quickCharge < e.bebenfaust.slowCharge &&
      e.bebenfaust.quakes >= 1 &&
      e.bebenfaust.nearBlows.join() === '1,3' &&
      e.bebenfaust.farBlows.join() === '2',
  ],
  ['Seidenmantel: one blow caught, the next one lands, back after twelve quiet seconds', e.seidenmantel.caught && e.seidenmantel.secondHurts && e.seidenmantel.regrewAt >= 11.5 && e.seidenmantel.regrewAt <= 12.5],
  ['Blutdurst: a heart for every sixteen dealt', e.blutdurst.healedAfterDealing >= 16 && e.blutdurst.healedAfterDealing <= 19],
  [
    'Schattenschritt: two rolls in the air, and no endless roll on the ground',
    e.schattenschritt.airWithout.rolls === 1 &&
      e.schattenschritt.airWith.rolls === 2 &&
      e.schattenschritt.airWithout.landed > 26 &&
      e.schattenschritt.airWith.landed > 26 &&
      e.schattenschritt.untouchableShare < 0.5,
  ],
  ['Zweiter Atem: one lethal blow stopped per life, not two', e.zweiteratem.firstSaved && e.zweiteratem.secondKills && e.zweiteratem.backNextLife],
  [
    'Splitterparade: a longer guard that throws three splinters',
    e.splitterparade.longWindow > e.splitterparade.shortWindow &&
      results.splinters.armed.caught &&
      results.splinters.armed.shards === 3 &&
      results.splinters.bare.caught &&
      results.splinters.bare.shards === 0,
  ],
  [
    'Keilerhaut: a blow throws him a third as far, and hardly staggers him',
    Math.abs(results.later.keilerhaut.with.vx) * 2.5 <= Math.abs(results.later.keilerhaut.without.vx) &&
      results.later.keilerhaut.with.stagger < results.later.keilerhaut.without.stagger,
  ],
  [
    'Zwillingsstern: a parry makes the picked attack ready again',
    results.later.zwillingsstern.with.caught && results.later.zwillingsstern.with.cooldown === 0 && results.later.zwillingsstern.without.cooldown > 2.5,
  ],
  [
    'Taktgeber: the attacks come back a third faster',
    Math.abs(results.later.taktgeber.with - 4 / 3) < 0.05 && Math.abs(results.later.taktgeber.without - 1) < 0.05,
  ],
  ['Hydrablut: a lost heart grows back after eighteen seconds', results.hydrablut.grewAt >= 17.5 && results.hydrablut.grewAt <= 18.5],
  [
    `Gauklerschritt: a roll through a blow owes one doubled cut (${results.newer.gauklerschritt.with.blows.join(', ')} against ${results.newer.gauklerschritt.without.blows.join(', ')})`,
    results.newer.gauklerschritt.with.owed > 2.5 &&
      results.newer.gauklerschritt.with.unhurt &&
      results.newer.gauklerschritt.with.blows.join() === '2,1' &&
      results.newer.gauklerschritt.without.owed === 0 &&
      results.newer.gauklerschritt.without.blows.join() === '1,1',
  ],
  [
    `Lichtkern: a lost heart lands ${results.newer.lichtkern.fetched.off} px off as a light, comes back when fetched, goes out when left`,
    results.newer.lichtkern.fetched.dropped === 1 &&
      results.newer.lichtkern.fetched.hurt &&
      results.newer.lichtkern.fetched.back > 0 &&
      results.newer.lichtkern.fetched.off >= 40 &&
      results.newer.lichtkern.left.back < 0 &&
      results.newer.lichtkern.left.gone &&
      results.newer.lichtkern.bare === 0,
  ],
  [
    `Steinblick: a wave he faces covers ${results.newer.steinblick.faced} px in a second, with his back to it ${results.newer.steinblick.turned}, without the relic ${results.newer.steinblick.bare}`,
    Math.abs(results.newer.steinblick.faced / results.newer.steinblick.bare - 2 / 3) < 0.05 && Math.abs(results.newer.steinblick.turned - results.newer.steinblick.bare) <= 2,
  ],
  ['a skeleton meets an armed hero with more health', results.scaling.armedHp > results.scaling.bareHp],
  ['Ankhor wakes stronger in front of eleven relics', results.ankhorAll.maxHp > results.ankhorBare.maxHp && results.ankhorAll.poise > results.ankhorBare.poise],
  ['no errors on the page', errors.length === 0],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}`);
}
if (failed) {
  console.error(`FAIL: ${failed} of ${checks.length} checks.`);
  process.exit(1);
}
console.log(`OK: all ${checks.length} checks - every boss hands over its relic, and every relic does what it says.`);
