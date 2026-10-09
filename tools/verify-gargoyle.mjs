/**
 * Grauwacht, der Wasserspeier, on the battlements between the outer wall and
 * the towers - the eleventh boss of the road, met with ten relics and the
 * Flutklinge in hand:
 *
 *   Sieh ihn an, und er ist Stein. The hero looks the way he last walked, and
 *   whatever he looks at is a statue: it does not move, and nothing gets
 *   through it. Turn your back and it comes for you. Looked at in the air, it
 *   falls as stone and breaks - and broken, every blow lands.
 *
 * Pinned on the same questions as the other bosses:
 *
 *   1. Does he do everything he is supposed to? Every move shows up, in both
 *      halves, and every warning is measured from the first frame of its
 *      wind-up; his window is measured too.
 *   2. Does his rule hold, both ways? Faced, nothing gets through and he does
 *      not move - not the blade, not the crescent, not a hero who only ever
 *      faces him and swings. Back turned, he moves. Frozen high in the air, he
 *      falls and cracks, and cracked he takes blows from the floor; frozen low
 *      he only jars. Watched too long, he spits.
 *   3. Is it fair? Nothing that stands still hurts, a reader - who sees him
 *      0.3 s late, as a player does, and swings only from the floor - fells him
 *      within the late band, and reading costs less than half of standing
 *      still.
 *
 * And then that he can be finished, from any state, and that he leaves his
 * gaze and his stone.
 *
 * Built on the balance bench (tools/balance/harness.mjs): the hero carries the
 * relics the road has given him by here, and the reader is the one the bench
 * measures him with (tools/balance/readers/gargoyle.mjs).
 *
 * Usage: node tools/verify-gargoyle.mjs   (after npm run build)
 */
import { open, readerFor, stage, useReader } from './balance/harness.mjs';

const bench = await open();
const { page, errors } = bench;
const reader = await readerFor('gargoyle');

/** A fresh page for each part: nothing one part does leaks into the next. */
async function fresh() {
  await stage(bench, 'gargoyle');
  await useReader(page, reader);
  await page.evaluate(() => {
    const g = window.game;
    const h = window.__bal;
    const p = g.player;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    /** One frame, run and drawn: the frame time is the two together. */
    h.frameFull = (actions = {}) => {
      for (const [a, v] of Object.entries({
        left: false,
        right: false,
        down: false,
        jump: false,
        attack: false,
        parry: false,
        dash: false,
        skill: false,
        confirm: false,
        ...actions,
      })) {
        input.forceDown(a, !!v);
      }
      g.update(1 / 60, input);
      g.render(ctx);
      h.frame++;
    };
    /**
     * The hero whole, and bare of the silk: a test asks what reaches him, not
     * what Arachna's silk would have caught for him.
     */
    h.bare = () => {
      p.hp = p.maxHp;
      p.dead = false;
      p.shieldUp = false;
      p.shieldTimer = 999;
      p.invuln = 0;
      p.dashTimer = 0;
      p.motes = [];
      if (g.state === 'dead') g.state = 'playing';
    };
    /** Hearts that reached him since the last call, and him whole again. */
    h.lost = () => {
      const lost = Math.max(0, p.maxHp - p.hp);
      p.hp = p.maxHp;
      p.dead = false;
      if (g.state === 'dead') g.state = 'playing';
      g.dialogue = null;
      return lost;
    };
    /**
     * Gargoyle and hero where a test wants them, both on the floor: him at bx
     * in the given state, the hero at hx looking `facing`. Nothing of his in
     * the air.
     */
    h.set = (b, bx, hx, facing, state = 'stone') => {
      g.projectiles.length = 0;
      const floor = h.room.floor;
      b.x = bx - b.w / 2;
      b.y = floor - b.h;
      b.vx = 0;
      b.vy = 0;
      b.state = state;
      b.timer = 0;
      b.stare = 0;
      b.gouts = 0;
      b.hitThisMove = false;
      b.awakeFor = 0;
      b.flyAfter = 0.4;
      b.warmth = b.armoured ? 0 : 1;
      b.side = bx > hx ? 1 : -1;
      b.cracks = [];
      b.chips = [];
      b.crackGlow = 0;
      b.slump = 0;
      b.tumble = 0;
      p.x = hx - p.w / 2;
      p.y = floor - p.h - 0.5;
      p.vx = 0;
      p.vy = 0;
      p.facing = facing;
      p.attackTimer = 0;
      h.bare();
    };
    /** Keys for walking: towards x, or away from it. */
    h.towards = (x) => (x > p.cx ? { right: true } : { left: true });
    h.awayFrom = (x) => (x > p.cx ? { left: true } : { right: true });
    /** One frame's key towards x, to face it without going anywhere. */
    h.turnTo = (x) => {
      const want = x > p.cx ? 1 : -1;
      return p.facing === want ? {} : want > 0 ? { right: true } : { left: true };
    };
    /** The states of a run, with how long each lasted, from its first frame. */
    h.spans = (b) => {
      const st = { prev: b.state, at: g.time, list: [] };
      st.step = () => {
        if (b.state !== st.prev) {
          st.list.push({ state: st.prev, dur: +(g.time - st.at).toFixed(3), to: b.state });
          st.prev = b.state;
          st.at = g.time;
        }
      };
      st.of = (name, to) => st.list.filter((s) => s.state === name && (!to || s.to === to)).map((s) => s.dur);
      return st;
    };
  });
}

const results = {};

/* ---------------------------------------- awake, the arena shut, frame time */

await fresh();
results.main = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false, note: 'no Grauwacht' };
  const out = { engaged: b.engaged, sealed: !!h.arena?.fighting, barName: b.barName(), maxHp: b.maxHp, hearts: p.maxHp, state: b.state };
  // A reader fighting him, whole before every frame: a measure, not a fight.
  const act = window.__makeReader(g, h);
  const times = [];
  for (let f = 0; f < 60 * 12; f++) {
    b.hp = b.maxHp;
    const a = act(b) ?? {};
    const t0 = performance.now();
    h.frameFull(a);
    times.push(performance.now() - t0);
    h.lost();
  }
  times.sort((x, y) => x - y);
  out.frame = { mean: +(times.reduce((s, t) => s + t, 0) / times.length).toFixed(2), p99: +times[Math.floor(times.length * 0.99)].toFixed(2) };
  return out;
});

/* -------------------------------------- his moves and their warnings, twice */

/**
 * Every move, scripted the way a hero meets it, in one half or the other. The
 * warnings are measured from the first frame of each wind-up to the first
 * frame of the move, the window from the first frame broken to the first
 * frame mended.
 */
async function moves(half) {
  await fresh();
  return page.evaluate((half) => {
    const g = window.game;
    const h = window.__bal;
    const p = g.player;
    const b = h.wake();
    if (!b) return { ok: false };
    const two = half === 2;
    const mid = h.room.mid;
    /** Whole in his first half; below half - but far from felled - in his second. */
    const prime = () => {
      b.phaseTwo = two;
      b.hp = two ? Math.floor(b.maxHp * 0.45) : b.maxHp;
    };
    const hold = () => {
      b.phaseTwo = two;
    };
    const out = {};

    /*
     * Speien: looked at on the floor, and nothing else. How long the staring
     * takes, the gurgle, five gouts - and what three heroes take from them:
     * one who stands, one who walks in under the arc once he has seen the
     * gurgle (0.3 s late), one who turns away from it.
     */
    const FLESH = (bb) => ['stalk', 'clawWind', 'claw', 'clawRecover', 'diveWind', 'rise', 'dive', 'land', 'glideWind', 'glide'].includes(bb.state);
    const spit = (mode) => {
      h.set(b, mid + 120, mid - 140, 1);
      prime();
      const sp = h.spans(b);
      let lost = 0;
      let gouts = 0;
      let deflectable = false;
      let seenAt = -1;
      let woke = false;
      const before = new Set(g.projectiles);
      for (let f = 0; f < 60 * 5; f++) {
        const a = {};
        if (b.state === 'gurgle' && seenAt < 0) seenAt = f;
        if (seenAt >= 0 && f >= seenAt + 18) {
          if (mode === 'walk' && b.x - (p.x + p.w) > 8) Object.assign(a, h.towards(b.cx));
          if (mode === 'turn') Object.assign(a, h.awayFrom(b.cx));
        }
        hold();
        h.tick(a);
        sp.step();
        for (const q of g.projectiles) {
          if (q.kind === 'spout' && !before.has(q)) {
            before.add(q);
            gouts++;
            if (q.deflectable) deflectable = true;
          }
        }
        if (FLESH(b)) woke = true;
        lost += h.lost();
        // Turned away, he is awake: that is all this one asks.
        if (mode === 'turn' && seenAt >= 0 && f > seenAt + 18 + 40) break;
        if (seenAt >= 0 && f > seenAt + 100) break;
      }
      const stared = sp.list.find((s) => s.state === 'stone' && s.to === 'gurgle');
      return { stare: stared ? stared.dur : null, gurgle: sp.of('gurgle', 'spit')[0] ?? null, gouts, lost, woke, deflectable };
    };
    out.spit = { stand: spit('stand'), walk: spit('walk'), turn: spit('turn') };
    out.spitDeflectable = out.spit.stand.deflectable || out.spit.walk.deflectable;

    /*
     * Prankenhieb: close behind a hero who has his back to him. One who
     * stands takes the claw; one who turns round 0.3 s into the wind-up
     * freezes it; one who walks on at once is out of its reach.
     */
    const claw = (mode) => {
      h.set(b, mid - 40, mid + 20, 1, 'stalk');
      prime();
      const sp = h.spans(b);
      let lost = 0;
      let windAt = -1;
      for (let f = 0; f < 60 * 2.5; f++) {
        let a = {};
        if (b.state === 'clawWind' && windAt < 0) windAt = f;
        if (mode === 'turn' && windAt >= 0 && f >= windAt + 18) a = h.turnTo(b.cx);
        if (mode === 'walk' && windAt >= 0) a = h.awayFrom(b.cx);
        hold();
        h.tick(a);
        sp.step();
        lost += h.lost();
        if (windAt >= 0 && f > windAt + 70) break;
      }
      return { tell: sp.of('clawWind', 'claw')[0] ?? null, frozen: sp.list.some((s) => s.state === 'clawWind' && s.to === 'stone'), lost };
    };
    out.claw = { stand: claw('stand'), turn: claw('turn'), walk: claw('walk') };

    /*
     * Sturzflug: a hero far enough off with his back to him. One who never
     * turns takes the dive - two hearts; one who turns round once he sees him
     * high (0.3 s late) drops him out of the air, and the statue breaks: the
     * fall's damage, ZERSPRUNGEN, and a window in which a blow from the floor
     * lands - on either side, the crescent of the Flutklinge too.
     */
    const dive = (mode, side = 1) => {
      h.set(b, mid - side * 150, mid + side * 130, side, 'stalk');
      prime();
      // His second half draws dives and glides by the round: this one is a dive.
      b.bag = ['dive'];
      b.lastAir = 'glide';
      let said = false;
      const sp = h.spans(b);
      let lost = 0;
      let highAt = -1;
      let top = 0;
      let froze = null;
      const hp0 = b.hp;
      let hpAtCrack = null;
      let crackedAt = -1;
      let last = b.hp;
      const blows = [];
      for (let f = 0; f < 60 * 6; f++) {
        let a = {};
        top = Math.max(top, b.height);
        if ((b.state === 'rise' || b.state === 'dive') && b.height >= (mode === 'early' ? 20 : 100) && highAt < 0) highAt = f;
        if (mode !== 'never' && highAt >= 0 && froze === null) {
          if (f >= highAt + (mode === 'early' ? 0 : 18)) a = h.turnTo(b.cx);
        }
        if (b.state === 'fall' && froze === null) froze = +b.height.toFixed(0);
        if (b.state === 'cracked' && crackedAt < 0) {
          crackedAt = f;
          hpAtCrack = b.hp;
          last = b.hp;
        }
        if (crackedAt >= 0 && b.state === 'cracked') {
          // Walk up to it from the side the hero is on, and swing from the floor.
          const gap = b.cx > p.cx ? b.x - (p.x + p.w) : p.x - (b.x + b.w);
          if (gap > 10) a = h.towards(b.cx);
          else if (p.facing !== Math.sign(b.cx - p.cx)) a = h.turnTo(b.cx);
          else if (p.onGround && h.frame % 8 < 2) a = { attack: true };
          if (b.hp < last) blows.push({ hp: b.hp, onFloor: p.onGround });
          last = b.hp;
        }
        hold();
        h.tick(a);
        sp.step();
        if (g.particles.texts.some((t) => t.text === 'ZERSPRUNGEN!')) said = true;
        lost += h.lost();
        if (crackedAt >= 0 && b.state !== 'cracked') break;
        if (mode === 'never' && (b.state === 'land' || (sp.list.some((s) => s.state === 'dive') && b.state !== 'dive'))) break;
      }
      return {
        tell: sp.of('diveWind', 'rise')[0] ?? null,
        rise: sp.of('rise')[0] ?? null,
        top: Math.round(top),
        lost,
        froze,
        state: b.state,
        cracked: crackedAt >= 0,
        fall: b.lastFall,
        fallDamage: b.lastFallDamage,
        tookFall: hpAtCrack === null ? null : hp0 - hpAtCrack,
        window: sp.of('cracked')[0] ?? null,
        blows: blows.length,
        blowsFromFloor: blows.every((x) => x.onFloor),
        said,
      };
    };
    out.dive = { never: dive('never'), right: dive('turn', 1), left: dive('turn', -1), early: dive('early') };

    if (two) {
      /*
       * Gleitflug, his second half: a skim at the height of the hero's head.
       * One who stands takes it; one who jumps it as it comes does not; one
       * who freezes it as it passes drops it 16 px - and nothing breaks.
       */
      const glide = (mode) => {
        h.set(b, mid - 170, mid + 150, 1, 'stalk');
        prime();
        b.bag = ['glide'];
        b.lastAir = 'dive';
        const sp = h.spans(b);
        let lost = 0;
        let hold18 = 0;
        let froze = null;
        const hp0 = b.hp;
        for (let f = 0; f < 60 * 4; f++) {
          let a = {};
          // From the front of what hurts - the claws held out ahead of him.
          const r = b.glideRect();
          const gap = p.x - (r.x + r.w);
          if (mode === 'jump' && b.state === 'glide' && gap < 110 && hold18 === 0 && p.onGround) hold18 = 18;
          if (hold18 > 0) {
            a.jump = true;
            hold18--;
          }
          if (mode === 'freeze' && b.state === 'glide' && b.height >= 12 && froze === null) a = h.turnTo(b.cx);
          if (b.state === 'fall' && froze === null) froze = +b.height.toFixed(0);
          hold();
          b.bag = b.bag.length ? b.bag : ['glide'];
          h.tick(a);
          sp.step();
          lost += h.lost();
          if (sp.list.some((s) => s.state === 'glide') && b.state !== 'glide' && b.state !== 'fall') break;
        }
        return { tell: sp.of('glideWind', 'glide')[0] ?? null, lost, froze, state: b.state, cracked: b.state === 'cracked', hpTaken: hp0 - b.hp };
      };
      out.glide = { stand: glide('stand'), jump: glide('jump'), freeze: glide('freeze') };
    }
    return out;
  }, half);
}
results.first = await moves(1);
results.second = await moves(2);

/* ------------------------------------------------- the rule, both ways */

await fresh();
results.rule = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false };
  const mid = h.room.mid;
  const out = {};

  // Faced, at a sword's length, and swung at for two seconds: the blade and
  // the crescent ring on him, and he does not move a pixel.
  h.set(b, mid + 40, mid, 1);
  const x0 = b.x;
  let hp0 = b.hp;
  let flesh = 0;
  let said = false;
  for (let f = 0; f < 120; f++) {
    h.tick({ attack: f % 8 < 2 });
    if (!b.armoured) flesh++;
    if (g.particles.texts.some((t) => t.text === 'STEIN!')) said = true;
    h.lost();
  }
  out.faced = { taken: hp0 - b.hp, moved: +Math.abs(b.x - x0).toFixed(2), flesh, said };

  // The crescent alone, from 110 px - out of the blade's reach, in the
  // crescent's: every one spent on him, none of them through.
  h.set(b, mid + 110, mid, 1);
  hp0 = b.hp;
  const beams = new Set();
  let spentOnHim = 0;
  for (let f = 0; f < 90; f++) {
    h.tick({ attack: f % 12 < 2 });
    for (const q of g.projectiles) if (q.kind === 'beam' && q.friendly) beams.add(q);
    for (const q of beams) {
      if (q.dead && !q.counted) {
        q.counted = true;
        if (q.life > 0.02 && Math.abs(q.cx - b.cx) < 50) spentOnHim++;
      }
    }
    h.lost();
  }
  out.crescent = { thrown: beams.size, spentOnHim, taken: hp0 - b.hp };

  /*
   * The flick: swing at the statue from 100 px and turn away as the crescent
   * leaves, so it arrives on him awake. It breaks on flesh as it rings on
   * stone - the crescent lands only where the blade would, on broken stone.
   */
  h.set(b, mid + 100, mid, 1);
  hp0 = b.hp;
  let flickFlesh = 0;
  for (let f = 0; f < 60 * 10; f++) {
    const k = f % 24;
    const a = k === 0 ? h.turnTo(b.cx) : k === 1 || k === 2 ? { attack: true } : k === 7 ? h.awayFrom(b.cx) : {};
    h.tick(a);
    p.x = b.cx - 100 * Math.sign(b.cx - p.cx || 1) - p.w / 2;
    p.vx = 0;
    if (!b.armoured) flickFlesh++;
    h.lost();
  }
  out.flick = { taken: hp0 - b.hp, fleshFrames: flickFlesh };

  // His back turned on him, from out of a dive's reach: he comes.
  h.set(b, mid - 260, mid + 260, 1);
  const from = b.cx;
  let stalked = false;
  for (let f = 0; f < 60; f++) {
    h.tick();
    if (b.state === 'stalk') stalked = true;
    h.lost();
  }
  out.turned = { moved: Math.round(b.cx - from), stalked, warmth: +b.warmth.toFixed(2) };

  // And faced again, he stops dead where he is.
  const at = b.x;
  h.tick({ right: false, left: true });
  for (let f = 0; f < 30; f++) {
    h.tick();
    h.lost();
  }
  out.refaced = { state: b.state, moved: +Math.abs(b.x - at).toFixed(2) };

  /*
   * The hero who only ever faces him and swings - the bench's masher: forty
   * seconds, and not one point off him while he is stone.
   */
  h.set(b, mid + 160, mid - 120, 1);
  hp0 = b.hp;
  const mash = h.masher();
  let lost = 0;
  let stoneHit = 0;
  let notStone = 0;
  for (let f = 0; f < 60 * 40; f++) {
    const before = b.hp;
    h.tick(mash(b) ?? {});
    if (b.armoured && b.hp < before) stoneHit++;
    if (!b.armoured) notStone++;
    lost += h.lost();
  }
  out.masher = { taken: hp0 - b.hp, stoneHit, notStone, lost };

  /*
   * A statue coming down on the hero: frozen right over him, it takes a
   * heart; one who steps out from under it takes nothing.
   */
  const drop = (step) => {
    h.set(b, mid, mid + 30, -1, 'stalk');
    b.state = 'dive';
    b.y = h.room.floor - b.h - 150;
    b.x = p.cx - b.w / 2 - 4;
    b.vx = 0;
    b.vy = 0;
    b.side = -1;
    let lost = 0;
    for (let f = 0; f < 60; f++) {
      let a = f === 0 ? h.turnTo(b.cx) : {};
      if (step && f > 2) a = { right: true };
      h.tick(a);
      lost += h.lost();
      if (b.state === 'cracked' || b.state === 'stone') break;
    }
    return { lost, state: b.state };
  };
  out.drop = { under: drop(false), out: drop(true) };
  return out;
});

/* ---------------------------------------- nothing that stands still hurts */

results.contact = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const p = g.player;
  const b = h.find();
  if (!b) return { ok: false };
  const mid = h.room.mid;
  const out = {};
  // In his flesh states the hero stands in his side with his back to him,
  // past the middle - looked at, he would be stone; in his stone states, in
  // him and looking at him.
  for (const st of ['stone', 'gurgle', 'cracked', 'stalk', 'clawWind', 'clawRecover', 'diveWind', 'land', 'glideWind']) {
    const stone = st === 'stone' || st === 'gurgle' || st === 'cracked';
    h.set(b, mid, mid + 20, stone ? -1 : 1, st);
    let lost = 0;
    for (let k = 0; k < 60; k++) {
      b.state = st;
      b.timer = 99;
      b.stare = 0;
      g.projectiles.length = 0;
      p.x = mid + 20 - p.w / 2;
      p.vx = 0;
      h.tick();
      lost += h.lost();
    }
    out[st] = lost;
  }
  return out;
});

/* ------------------------------------ a whole fight, as a player reads it */

await fresh();
results.reader = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const p = g.player;
  if (!h.wake()) return { ok: false };
  const res = h.fight('reader', 150);
  // His fall, with the hero at two hearts: what it does, then the relic.
  p.hp = 2;
  const arena = h.arena;
  let gone = false;
  for (let f = 0; f < 60 * 5 && !g.dialogue; f++) {
    h.tick();
    if (!h.find()) gone = true;
  }
  const end = { gone, healed: p.hp === p.maxHp, banner: g.zoneBanner?.text ?? '', cleared: arena.cleared, spoke: !!g.dialogue, speaker: g.dialogue?.speaker ?? null };
  for (let f = 0; f < 60 * 8 && g.dialogue; f++) h.tick({ confirm: f % 2 === 0 });
  for (let f = 0; f < 30; f++) h.tick();
  end.relic = p.relics.has('steinblick');
  end.skill = p.skills.has('steinsturz');
  end.wardsOpen = !g.level.wardClosed(arena.entryTx) && !g.level.wardClosed(arena.exitTx);
  return { ...res, end };
});

/* ---------------------------------------------------- standing still in it */

await fresh();
results.standing = await page.evaluate(() => {
  const g = window.game;
  const h = window.__bal;
  const p = g.player;
  const b = h.wake();
  if (!b) return { ok: false };
  const spots = { left: h.room.left + 120, middle: h.room.mid, right: h.room.right - 120 };
  const out = { seconds: 0, hits: 0, at: {} };
  for (const [name, x] of Object.entries(spots)) {
    let lost = 0;
    for (let f = 0; f < 60 * 20; f++) {
      b.hp = b.maxHp;
      p.x = x - p.w / 2;
      p.vx = 0;
      h.tick();
      lost += h.lost();
    }
    out.at[name] = lost;
    out.hits += lost;
    out.seconds += 20;
  }
  return out;
});

/* ------------------------------- felled the way the other tools fell him */

/** beginDying from a given moment of the fight: the fall, the words, the relic. */
async function forced(how) {
  await fresh();
  return page.evaluate((how) => {
    const g = window.game;
    const h = window.__bal;
    const p = g.player;
    const arena = h.arena;
    g.warpTo(arena.entryTx + 3);
    let b = null;
    for (let f = 0; f < 60 * 10 && !(b && b.engaged); f++) {
      p.hp = p.maxHp;
      b = h.find();
      h.tick({ right: true });
    }
    if (!b || !b.engaged) return { how, note: 'never woke' };
    if (how === 'intro') {
      for (let f = 0; f < 30; f++) h.tick();
    } else {
      for (let f = 0; f < 60 * 4 && ['intro', 'dormant'].includes(b.state); f++) h.tick();
      const mid = h.room.mid;
      if (how === 'dive') {
        h.set(b, mid - 150, mid + 130, 1, 'stalk');
        for (let f = 0; f < 60 * 3 && b.state !== 'dive'; f++) h.tick();
      } else if (how === 'cracked') {
        h.set(b, mid - 150, mid + 130, 1, 'stalk');
        for (let f = 0; f < 60 * 4 && b.state !== 'cracked'; f++) h.tick(b.state === 'rise' && b.height > 100 ? { left: true } : {});
      }
    }
    const state = b.state;
    const height = Math.round(b.height);
    b.beginDying(g);
    for (let f = 0; f < 60 * 6 && !g.dialogue; f++) {
      p.hp = p.maxHp;
      h.tick();
    }
    const spoke = !!g.dialogue;
    for (let f = 0; f < 60 * 8 && g.dialogue; f++) h.tick({ confirm: f % 2 === 0 });
    for (let f = 0; f < 30; f++) h.tick();
    return { how, from: state, height, spoke, dead: b.dead, relic: p.relics.has('steinblick'), skill: p.skills.has('steinsturz'), cleared: arena.cleared };
  }, how);
}
results.forced = [await forced('intro'), await forced('dive'), await forced('cracked')];

console.log(JSON.stringify(results, null, 2));
await bench.close();

/* ------------------------------------------------------------- the checks */

const m = results.main;
const f1 = results.first;
const f2 = results.second;
const ru = results.rule;
const c = results.contact;
const r = results.reader;
const s = results.standing;
const at = (x) => (x == null ? '-' : x);
const readRate = r.hearts / Math.max(1, r.seconds ?? 150);
const standRate = s.hits / Math.max(1, s.seconds);
const mashRate = ru.masher.lost / 40;
const fallOk = (d) => d.cracked && d.fall >= 60 && d.fallDamage === Math.round(3 + Math.min(d.fall, 200) / 60) && d.tookFall === d.fallDamage;
const checks = [
  ['Grauwacht wakes and the battlements close', m.engaged && m.sealed && m.barName?.startsWith('GRAUWACHT')],
  [`Grauwacht costs less than a frame to fight (p99 ${m.frame?.p99} ms)`, m.frame?.p99 < 16.67],
  [
    `Speien: stared at for ${at(f1.spit?.stand.stare)} s (second half ${at(f2.spit?.stand.stare)} s), he gurgles ` +
      `${at(f1.spit?.stand.gurgle)} / ${at(f2.spit?.stand.gurgle)} s and pours five gouts that no blade turns`,
    Math.abs(f1.spit.stand.stare - 2.2) < 0.05 &&
      Math.abs(f2.spit.stand.stare - 1.6) < 0.05 &&
      f1.spit.stand.gurgle >= 0.5 &&
      f2.spit.stand.gurgle >= 0.5 &&
      f1.spit.stand.gouts === 5 &&
      !f1.spitDeflectable,
  ],
  [
    'Speien: standing in it costs one heart, walking in under the arc (seen 0.3 s late) costs none, and turning away wakes him before he pours',
    f1.spit.stand.lost === 1 && f1.spit.walk.lost === 0 && f2.spit.walk.lost === 0 && f1.spit.turn.gouts === 0 && f1.spit.turn.woke && f1.spit.turn.lost === 0,
  ],
  [
    `Prankenhieb: he rears ${at(f1.claw?.stand.tell)} / ${at(f2.claw?.stand.tell)} s behind a hero who stands - one heart; turning round in the wind-up freezes it, walking on is out of reach`,
    f1.claw.stand.tell >= 0.5 && f2.claw.stand.tell >= 0.5 && f1.claw.stand.lost === 1 && f1.claw.turn.frozen && f1.claw.turn.lost === 0 && f1.claw.walk.lost === 0 && f2.claw.turn.lost === 0,
  ],
  [
    `Sturzflug: wings and screech ${at(f1.dive?.never.tell)} s (second half ${at(f2.dive?.never.tell)} s), up ${at(f1.dive?.never.top)} px in ${at(f1.dive?.never.rise)} s - and two hearts to a hero who never turns`,
    f1.dive.never.tell >= 0.6 && f2.dive.never.tell >= 0.5 && f1.dive.never.top >= 140 && f1.dive.never.top <= 190 && f1.dive.never.lost === 2,
  ],
  [
    `Sieh ihn an: turned on in the air (${at(f1.dive?.right.froze)} px up), he falls as stone and breaks - ZERSPRUNGEN, ${at(f1.dive?.right.fallDamage)} for a fall of ${at(f1.dive?.right.fall)} px`,
    fallOk(f1.dive.right) && fallOk(f1.dive.left) && fallOk(f2.dive.right) && f1.dive.right.said && f1.dive.right.lost === 0 && f1.dive.left.lost === 0,
  ],
  [
    `Zersprungen: ${at(f1.dive?.right.window)} s broken (at least 1.2), and blows from the floor land on either side (${f1.dive?.right.blows} / ${f1.dive?.left.blows})`,
    f1.dive.right.window >= 1.2 && f1.dive.left.window >= 1.2 && f2.dive.right.window >= 1.2 && f1.dive.right.blows >= 2 && f1.dive.left.blows >= 2 && f1.dive.right.blowsFromFloor,
  ],
  [
    `A statue frozen low only jars: turned on at ${at(f1.dive?.early.froze)} px it lands whole, and takes nothing`,
    f1.dive.early.froze !== null && f1.dive.early.froze < 60 && !f1.dive.early.cracked && f1.dive.early.tookFall === null,
  ],
  [
    `Gleitflug (second half): ${at(f2.glide?.stand.tell)} s of warning, a heart to a hero who stands, none to one who jumps it, and frozen it drops ${at(f2.glide?.freeze.froze)} px - nothing breaks`,
    f2.glide.stand.tell >= 0.5 && f2.glide.stand.lost === 1 && f2.glide.jump.lost === 0 && f2.glide.freeze.froze !== null && f2.glide.freeze.froze < 60 && !f2.glide.freeze.cracked && f2.glide.freeze.hpTaken === 0 && f2.glide.freeze.lost === 0,
  ],
  [
    `Faced, he is stone: two seconds of blade and crescent take ${ru.faced.taken}, he moves ${ru.faced.moved} px, and says STEIN!`,
    ru.faced.taken === 0 && ru.faced.moved < 0.5 && ru.faced.flesh === 0 && ru.faced.said,
  ],
  [
    `The Flutklinge's crescent clangs off the stone too: ${ru.crescent.spentOnHim} of ${ru.crescent.thrown} spent on him, ${ru.crescent.taken} taken`,
    ru.crescent.thrown >= 4 && ru.crescent.spentOnHim >= ru.crescent.thrown - 1 && ru.crescent.taken === 0,
  ],
  [
    `A crescent thrown at the statue that arrives once he is awake breaks on him: flicking round after every swing for 10 s takes ${ru.flick.taken} (he spent ${ru.flick.fleshFrames} frames awake)`,
    ru.flick.taken === 0 && ru.flick.fleshFrames > 120,
  ],
  [
    `Back turned, he is flesh and comes (${ru.turned.moved} px in a second); faced again, he stops dead`,
    ru.turned.stalked && Math.abs(ru.turned.moved) >= 60 && ru.turned.warmth > 0.9 && ru.refaced.state === 'stone' && ru.refaced.moved < 0.5,
  ],
  [
    `A hero who only ever faces him and swings takes ${ru.masher.lost} hearts in 40 s and not one point off him while he is stone`,
    ru.masher.taken === 0 && ru.masher.stoneHit === 0 && ru.masher.lost >= 7,
  ],
  [
    'A statue frozen over the hero comes down on him for a heart; stepping out from under it costs nothing',
    ru.drop.under.lost === 1 && ru.drop.out.lost === 0,
  ],
  [
    'Nothing that stands still hurts: standing in him as stone, gurgling, broken, scuttling or winding up costs nothing',
    Object.keys(c).length === 9 && Object.values(c).every((v) => v === 0),
  ],
  [
    `A hero who sees him 0.3 s late fells him in ${r.seconds} s for ${r.hearts} hearts (late band: at most 90 s and 4)`,
    r.felled && r.seconds <= 90 && r.hearts <= 4,
  ],
  [
    `Reading him costs less than half of standing still and of mashing (${(readRate * 60).toFixed(1)} against ${(standRate * 60).toFixed(1)} and ${(mashRate * 60).toFixed(1)} hearts a minute)`,
    s.hits >= 6 && readRate * 2 <= standRate && readRate * 2 <= mashRate,
  ],
  [
    'Grauwacht falls, heals the hero, opens the wards, speaks, and leaves the Steinblick and the Steinsturz',
    r.end?.gone && r.end.healed && r.end.cleared && r.end.wardsOpen && r.end.banner.includes('GRAUWACHT') && r.end.spoke && r.end.relic && r.end.skill,
  ],
  [
    `beginDying fells him from wherever he is - ${results.forced.map((x) => `${x.from}${x.height ? ` ${x.height} px up` : ''}`).join(', ')}`,
    results.forced.every((x) => x.spoke && x.dead && x.relic && x.skill && x.cleared) && results.forced[1].height > 40,
  ],
  ['no page errors', errors.length === 0],
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
console.log(
  `OK: all ${checks.length} checks - looked at, Grauwacht is stone; looked away from, he comes; turned on in the air he breaks, ` +
    `and a hero who reads him fells him in ${r.seconds} s for ${r.hearts} hearts.`,
);
