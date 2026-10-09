/**
 * Maskarill, der Gaukler, on the stage of the ruined theatre - the fourth boss
 * of the road, and the first whose rule is something the hero has to look for:
 *
 *   Nur einer wirft einen Schatten. The footlights throw him up onto the back
 *   wall, always; the copies he conjures throw nothing at all. Struck in the
 *   bow, the one with the shadow is unmasked and takes double; a copy goes up
 *   in smoke, and every figure left answers with a knife.
 *
 * Pinned on the same three questions as verify-boar.mjs:
 *
 *   1. Does he do everything he is supposed to? Every move shows up, in both
 *      halves, waited for rather than hoped for; every warning is measured from
 *      the first frame of its wind-up, every window until it closes - on his
 *      own clock, so a hit-stop does not make one look longer than it is.
 *   2. Is it fair? A jump clears the wheel, walking clears the salto's ring and
 *      the knives, a swing sends a knife back, nothing that stands still hurts,
 *      every window can be reached from the floor, and a hero who reads him -
 *      the balance bench's reader, who sees him 0.3 s late, swings only from
 *      the floor and jumps only to get out of the way - fells him at a cost of
 *      less than half of what standing still costs.
 *   3. Does his rule hold? In the pixels he draws: the wall above him darkens,
 *      the wall above a copy does not - and in what a blow does.
 *
 * And then that he can be finished from anything he is doing, and that he
 * leaves the Gauklerschritt and the Trugbild.
 *
 * The hero is the one the road brings him: seven hearts and the relics of
 * Gallert, Grimmzahn and Gierschlund - the bench's own stage.
 *
 * Usage: node tools/verify-jester.mjs (after npm run build)
 */
import { open, readerFor, stage, useReader } from './balance/harness.mjs';

const bench = await open();
const { page, errors } = bench;
const reader = await readerFor('jester');

/** A fresh game at his door: the bench's helpers, and a few of this tool's own. */
async function fresh() {
  await stage(bench, 'jester');
  await useReader(page, reader);
  await page.evaluate(() => {
    const g = window.game;
    const h = window.__bal;
    const p = g.player;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    /** A frame run and drawn, timed: for the frame-time measure. */
    h.full = (actions = {}) => {
      for (const [a, v] of Object.entries({ left: false, right: false, down: false, jump: false, attack: false, parry: false, dash: false, ...actions })) {
        input.forceDown(a, !!v);
      }
      const t0 = performance.now();
      g.update(1 / 60, input);
      g.render(ctx);
      h.frame++;
      return performance.now() - t0;
    };
    /** The hero whole and standing, whatever the last frame did to him. */
    h.keep = () => {
      p.hp = p.maxHp;
      p.dead = false;
      if (g.state === 'dead') g.state = 'playing';
    };
    /** Nothing of his left flying, the hero whole and still. */
    h.clear = (boss) => {
      g.projectiles.length = 0;
      boss.rings.length = 0;
      h.keep();
      p.invuln = 0;
      p.vx = 0;
    };
    /** Him and the hero held where a test wants them for a moment, him prancing on the spot. */
    h.place = (boss, x, heroX, frames = 20) => {
      if (boss.copies.length) boss.endTrick(g, false);
      for (let f = 0; f < frames; f++) {
        boss.state = 'strut';
        boss.timer = 99;
        boss.me.x = x;
        boss.me.vx = 0;
        boss.me.y = boss.floorY;
        p.x = heroX - p.w / 2;
        p.y = boss.floorY - p.h - 0.5;
        p.vx = 0;
        p.vy = 0;
        h.tick();
        h.clear(boss);
      }
      boss.me.x = x;
      boss.me.vx = 0;
      p.x = heroX - p.w / 2;
      p.vx = 0;
    };
    /** Seconds on his own clock: hit-stops and the hero's silk do not stretch it. */
    h.clock = (boss) => boss.anim;
    window.__h = h;
  });
}

const results = {};

/* ---------------------------------------------- awake, his moves, his tells */

await fresh();
results.main = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { note: 'no Maskarill' };
  const out = { engaged: boss.engaged, sealed: !!h.arena?.fighting, maxHp: boss.maxHp, barName: boss.barName(), hearts: p.maxHp };
  // When the trick first comes, on his own fight clock, from the moment he
  // woke; and what the banner says before and when they first line up.
  let firstTrick = null;
  let toldAt = null;
  const bannersBefore = new Set();
  const trickWatch = () => {
    if (firstTrick === null && boss.state === 'conjure') firstTrick = +boss.fightTime.toFixed(2);
    if (toldAt === null && boss.state === 'guess') toldAt = g.zoneBanner.text;
    if (toldAt === null && g.zoneBanner.timer > 0) bannersBefore.add(g.zoneBanner.text);
  };

  // What a frame of the fight costs, drawn every frame, with a hero swinging at him.
  const times = [];
  for (let f = 0; f < 60 * 15; f++) {
    boss.hp = boss.maxHp;
    const dx = boss.me.x - p.cx;
    times.push(h.full({ attack: f % 20 < 3, right: dx > 90, left: dx < -90 }));
    h.keep();
    trickWatch();
  }
  times.sort((a, b) => a - b);
  out.frame = { mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), p99: +times[Math.floor(times.length * 0.99)].toFixed(2) };

  /*
   * Every move, with the bench's reader, from the first frame of its wind-up.
   * He is kept whole in his first half until everything has been seen there,
   * then held below half until his second half has shown its own: four of
   * him, and a wheel that goes straight on into the knives.
   */
  const WIND = { juggle: 'throw', crouch: 'wheel', kneel: 'salto', conjure: 'shuffle' };
  const OPEN = ['bow', 'split', 'dizzy', 'guess', 'unmasked', 'encore', 'stagger'];
  const make = () => ({ seen: new Set(), winds: {}, windows: {}, figures: 0, chained: 0 });
  const half = [make(), make()];
  let at = null;
  let prev = boss.state;
  const act = window.__makeReader(g, h);
  const watch = (rec) => {
    const s = boss.state;
    rec.seen.add(s);
    if (g.projectiles.some((q) => q.kind === 'knife' && !q.friendly)) rec.seen.add('knife');
    rec.figures = Math.max(rec.figures, boss.figures.length);
    if (s !== prev) {
      if (at && at.state === prev) {
        const t = +(h.clock(boss) - at.clock).toFixed(3);
        if (WIND[prev] === s) (rec.winds[prev] ??= []).push(t);
        if (OPEN.includes(prev)) (rec.windows[prev] ??= []).push(t);
      }
      if (prev === 'wheel' && s === 'juggle') rec.chained++;
      at = { state: s, clock: h.clock(boss) };
      prev = s;
    }
    trickWatch();
  };
  const phase1 = ['strut', 'juggle', 'throw', 'knife', 'bow', 'crouch', 'wheel', 'split', 'kneel', 'salto', 'dizzy', 'conjure', 'shuffle', 'guess', 'unmasked'];
  let f = 0;
  h.hits = 0;
  for (; f < 60 * 150; f++) {
    const done = phase1.every((m) => half[0].seen.has(m)) && Object.keys(WIND).every((w) => half[0].winds[w]?.length) && ['bow', 'split', 'dizzy', 'guess', 'unmasked'].every((w) => half[0].windows[w]?.length);
    if (done) break;
    boss.hp = boss.maxHp;
    h.tick(act(boss) ?? {});
    h.watchHp(boss);
    watch(half[0]);
  }
  out.phase1Seconds = +(f / 60).toFixed(1);
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  for (f = 0; f < 60 * 150; f++) {
    const done = half[1].figures >= 4 && half[1].chained > 0 && ['juggle', 'crouch', 'kneel', 'conjure'].every((w) => half[1].winds[w]?.length) && ['bow', 'split', 'dizzy', 'guess', 'unmasked'].every((w) => half[1].windows[w]?.length);
    if (done) break;
    // Below half, and never so low that one unmasking fells him.
    if (boss.hp < boss.maxHp * 0.3) boss.hp = Math.floor(boss.maxHp * 0.45);
    h.tick(act(boss) ?? {});
    h.watchHp(boss);
    watch(half[1]);
  }
  out.phase2Seconds = +(f / 60).toFixed(1);
  out.readerHits = h.hits;
  const sum = (rec) => ({
    moves: [...rec.seen].sort(),
    figures: rec.figures,
    chained: rec.chained,
    winds: Object.fromEntries(Object.entries(rec.winds).map(([k, v]) => [k, { n: v.length, min: Math.min(...v) }])),
    windows: Object.fromEntries(Object.entries(rec.windows).map(([k, v]) => [k, { n: v.length, min: Math.min(...v) }])),
  });
  out.half1 = sum(half[0]);
  out.half2 = sum(half[1]);
  out.firstTrick = firstTrick;
  out.told = toldAt;
  out.toldEarly = bannersBefore.has('NUR EINER WIRFT EINEN SCHATTEN');
  return out;
});

/* --------------------------------------------- the rule: only one casts a shadow */

await fresh();
results.rule = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { note: 'no Maskarill' };
  const mid = h.room.mid;
  const floor = boss.floorY;
  const out = {};
  boss.poiseLock = 999;

  /**
   * The jester alone, drawn into a clean canvas twice - as he is, and with
   * the real one's shadows taken away - and what changes in a column of wall
   * above each figure and on the boards at its feet. Only the shadows differ
   * between the two, so only they can show up here.
   */
  const shadowsAt = () => {
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = 540;
    const x = c.getContext('2d', { willReadFrequently: true });
    const cam = g.camera;
    const draw = () => {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, 960, 540);
      x.translate(-cam.renderX, -cam.renderY);
      boss.draw(x, g);
      return x.getImageData(0, 0, 960, 540).data;
    };
    const flash = boss.flash;
    boss.flash = 0;
    const lit = draw();
    boss.me.casts = false;
    const bare = draw();
    boss.me.casts = true;
    boss.flash = flash;
    const region = (x0, y0, w, hh) => {
      let d = 0;
      for (let yy = Math.max(0, Math.round(y0 - cam.renderY)); yy < Math.min(540, Math.round(y0 - cam.renderY + hh)); yy++) {
        for (let xx = Math.max(0, Math.round(x0 - cam.renderX)); xx < Math.min(960, Math.round(x0 - cam.renderX + w)); xx++) {
          const i = (yy * 960 + xx) * 4 + 3;
          d += Math.abs(lit[i] - bare[i]);
        }
      }
      return d;
    };
    return boss.figures.map((f) => ({
      x: Math.round(f.x),
      real: Math.abs(f.x - boss.me.x) < 0.5,
      wall: region(f.x - 14, floor - 230, 28, 100),
      floor: region(f.x - 14, floor - 3, 28, 6),
    }));
  };

  /** A trick from the start, the hero standing where he is told; stops at the guess. */
  const toGuess = (heroX) => {
    h.place(boss, mid + 40, heroX);
    boss.beginConjure(g);
    const r = { frames: 0, oneCasts: 0, realCasts: 0, struckable: 0, lost: 0, shuffle: 0 };
    for (let k = 0; k < 60 * 6 && boss.state !== 'guess'; k++) {
      p.x = heroX - p.w / 2;
      p.vx = 0;
      const before = p.hp;
      h.tick();
      r.lost += Math.max(0, before - p.hp);
      h.keep();
      if (boss.state !== 'shuffle') continue;
      r.shuffle++;
      const casting = boss.figures.filter((f) => f.casts);
      r.frames++;
      if (casting.length === 1) r.oneCasts++;
      if (casting.length === 1 && Math.abs(casting[0].x - boss.me.x) < 0.5) r.realCasts++;
      // While they shuffle there is nothing to strike: not him, not a copy.
      if (boss.overlaps({ x: h.room.left, y: floor - 200, w: h.room.right - h.room.left, h: 200 })) r.struckable++;
    }
    return r;
  };

  // The shuffle with the hero in the middle of it: nobody is there to strike,
  // nothing touches him, and in every frame one figure casts a shadow - him.
  out.shuffle = toGuess(mid - 40);
  out.lineup = boss.figures.map((f) => Math.round(f.x));
  out.gaps = out.lineup.slice(1).map((x, i) => x - out.lineup[i]);
  const ws = boss.wallShadow;
  out.wall = ws ? { at: Math.round(ws.x), real: Math.round(boss.me.x), off: Math.round(ws.x - boss.me.x) } : null;
  out.pixels = shadowsAt();

  // 1. The real one, struck in the bow: unmasked, the copies gone, and double.
  let before = boss.hp;
  const r = boss.me.x;
  boss.overlaps({ x: r - 6, y: floor - 40, w: 12, h: 20 });
  boss.hurt(1, 1, g);
  out.unmask = { state: boss.state, copies: boss.copies.length, took: before - boss.hp, said: g.particles.texts.some((t) => t.text === 'ENTLARVT!') };
  before = boss.hp;
  boss.overlaps({ x: r - 6, y: floor - 40, w: 12, h: 20 });
  boss.hurt(1, 1, g);
  out.unmask.then = before - boss.hp;
  let t0 = h.clock(boss);
  for (let k = 0; k < 60 * 5 && boss.state === 'unmasked'; k++) {
    h.tick();
    h.keep();
  }
  out.unmask.seconds = +(h.clock(boss) - t0 + 0).toFixed(2);

  // 2. A copy, struck in the bow: PUFF, nothing taken, and a knife from every figure left.
  toGuess(mid - 40);
  const n = boss.figures.length;
  const copy = boss.figures.find((f) => !f.casts);
  before = boss.hp;
  boss.overlaps({ x: copy.x - 6, y: floor - 40, w: 12, h: 20 });
  boss.hurt(1, 1, g);
  out.puff = { n, state: boss.state, took: before - boss.hp, left: boss.figures.length, said: g.particles.texts.some((t) => t.text === 'PUFF!') };
  const knives = new Set();
  const windSeen = h.clock(boss);
  let thrownAt = null;
  for (let k = 0; k < 60 * 4 && boss.state !== 'encore'; k++) {
    h.tick();
    for (const q of g.projectiles) if (q.kind === 'knife' && !q.friendly) knives.add(q);
    if (knives.size && thrownAt === null) thrownAt = h.clock(boss);
    h.keep();
    p.invuln = 0;
  }
  out.puff.knives = knives.size;
  out.puff.wind = thrownAt === null ? null : +(thrownAt - windSeen).toFixed(3);
  out.puff.after = { state: boss.state, copies: boss.copies.length };
  t0 = h.clock(boss);
  for (let k = 0; k < 60 * 3 && boss.state === 'encore'; k++) {
    h.tick();
    h.clear(boss);
  }
  out.puff.encore = +(h.clock(boss) - t0).toFixed(2);

  // 3. Nothing struck in the bow: the same knives, from all of them.
  toGuess(mid - 40);
  const all = boss.figures.length;
  const guessAt = h.clock(boss);
  knives.clear();
  let guessEnd = null;
  for (let k = 0; k < 60 * 5 && boss.state !== 'encore'; k++) {
    h.tick();
    if (boss.state !== 'guess' && guessEnd === null) guessEnd = h.clock(boss);
    for (const q of g.projectiles) if (q.kind === 'knife' && !q.friendly) knives.add(q);
    h.keep();
    p.invuln = 0;
  }
  out.none = { n: all, knives: knives.size, guess: guessEnd === null ? null : +(guessEnd - guessAt).toFixed(2), after: boss.state };

  // 4. While they shuffle, the real one cannot be hurt by anything at all.
  for (let k = 0; k < 60 * 3 && boss.state === 'encore'; k++) h.tick();
  h.place(boss, mid + 40, mid - 40);
  boss.beginConjure(g);
  for (let k = 0; k < 60 && boss.state !== 'shuffle'; k++) {
    h.tick();
    h.keep();
  }
  for (let k = 0; k < 20; k++) h.tick();
  before = boss.hp;
  boss.struck = boss.me;
  boss.hurt(5, 1, g);
  boss.overlaps({ x: boss.me.x - 20, y: floor - 70, w: 40, h: 70 });
  boss.hurt(5, 1, g);
  out.shuffleProof = { state: boss.state, took: before - boss.hp };
  return out;
});

/* ---------------------------------------------------- fair: what hurts and what does not */

await fresh();
results.fair = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { note: 'no Maskarill' };
  const mid = h.room.mid;
  const floor = boss.floorY;
  const out = {};
  boss.poiseLock = 999;

  // Nothing that stands still hurts: a hero standing in him while he prances,
  // juggles, bows, crouches, kneels, does the splits, sways, conjures, bows in
  // the line, kneels unmasked or takes his encore takes nothing.
  out.contact = {};
  for (const st of ['strut', 'juggle', 'bow', 'crouch', 'kneel', 'split', 'dizzy', 'conjure', 'guess', 'unmasked', 'encore', 'stagger']) {
    h.place(boss, mid, mid);
    let lost = 0;
    for (let k = 0; k < 60; k++) {
      boss.state = st;
      boss.timer = 99;
      boss.me.x = mid;
      boss.me.vx = st === 'strut' ? 60 : 0;
      p.x = boss.me.x - p.w / 2;
      p.vx = 0;
      const before = p.hp;
      h.tick();
      lost += Math.max(0, before - p.hp);
      h.clear(boss);
    }
    out.contact[st] = lost;
  }

  // His windows are at sword height: a hero on the floor beside him, on
  // either side, reaches him with an ordinary swing.
  out.reach = {};
  for (const st of ['bow', 'split', 'dizzy', 'unmasked', 'encore']) {
    for (const side of [-1, 1]) {
      h.place(boss, mid, mid);
      boss.state = st;
      boss.timer = 99;
      h.tick();
      boss.me.facing = 1;
      const half = st === 'split' ? 26 : 16;
      p.facing = side > 0 ? -1 : 1;
      p.x = side > 0 ? boss.me.x + half + 14 : boss.me.x - half - 14 - p.w;
      p.y = floor - p.h - 0.5;
      out.reach[`${st}${side > 0 ? 'R' : 'L'}`] = boss.overlaps(p.swordRect());
    }
  }

  // Outside a window the blade finds him gone - and he says so now and then.
  out.evade = {};
  for (const st of ['strut', 'juggle', 'crouch', 'kneel', 'conjure']) {
    h.place(boss, mid, mid - 30);
    const before = boss.hp;
    g.particles.texts.length = 0;
    let said = false;
    for (let k = 0; k < 60; k++) {
      boss.state = st;
      boss.timer = 99;
      boss.me.x = mid;
      boss.me.vx = 0;
      p.x = mid - 30 - p.w / 2;
      p.facing = 1;
      h.tick({ attack: k % 12 < 2 });
      if (g.particles.texts.some((t) => t.text === 'HOPPLA!')) said = true;
      h.clear(boss);
    }
    out.evade[st] = { took: before - boss.hp, said };
  }

  /*
   * The wheel: 48 px high. A hero who jumps it at the right moment takes
   * nothing, one who stands takes one. The moment is tried at a spread of
   * distances - the gap from the wheel's edge to the hero when the jump goes.
   */
  out.wheelH = (() => {
    boss.state = 'wheel';
    boss.me.act = 'wheel';
    return boss.rectOf(boss.me).h;
  })();
  const wheel = (jumpAt, parryAt, two = false) => {
    boss.phaseTwo = two;
    h.place(boss, mid + 200, mid - 140);
    p.facing = 1;
    boss.beginCrouch(g);
    let lost = 0;
    let jumped = false;
    let parried = false;
    let hold = 0;
    let over = 0;
    for (let k = 0; k < 60 * 3; k++) {
      const a = {};
      const gap = boss.me.x - 22 - (p.x + p.w);
      if (boss.state === 'wheel' && jumpAt !== null && !jumped && gap < jumpAt) {
        jumped = true;
        hold = 18;
      }
      if (boss.state === 'wheel' && parryAt !== null && !parried && gap < parryAt) {
        parried = true;
        a.parry = true;
      }
      if (hold > 0) {
        a.jump = true;
        hold--;
      }
      // How high his feet were when the wheel went under them.
      if (boss.state === 'wheel' && Math.abs(boss.me.x - p.cx) < 31) over = Math.max(over, Math.round(floor - p.bottom));
      const before = p.hp;
      h.tick(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
      if (boss.state !== 'wheel' && boss.state !== 'crouch') break;
    }
    const result = { lost, state: boss.state, timer: +boss.timer.toFixed(2), over };
    h.clear(boss);
    boss.phaseTwo = false;
    return result;
  };
  out.jumps = {};
  for (const at of [20, 50, 80, 110, 140, 170, 200]) out.jumps[at] = wheel(at, null).lost;
  out.jumpsTwo = {};
  for (const at of [50, 80, 110, 140]) out.jumpsTwo[at] = wheel(at, null, true).lost;
  out.standInWheel = wheel(null, null).lost;
  // A wheel caught on the guard goes over in a heap - and the guard takes nothing.
  const parry = wheel(null, 18);
  let dizzy = 0;
  const t0 = h.clock(boss);
  for (let k = 0; k < 60 * 3 && boss.state === 'dizzy'; k++) {
    h.tick();
    h.clear(boss);
    dizzy++;
  }
  out.parry = { lost: parry.lost, state: parry.state, seconds: +(h.clock(boss) - t0 + (1.6 - parry.timer)).toFixed(2) };

  /*
   * The salto comes down where the hero stood when it went up: one who stays
   * there takes one, one who walks off as he goes up takes nothing.
   */
  const salto = (walk) => {
    h.place(boss, mid + 160, mid - 100);
    boss.beginKneel(g);
    let lost = 0;
    let from = null;
    for (let k = 0; k < 60 * 3; k++) {
      const a = {};
      if (boss.state === 'salto' && from === null) from = Math.round(p.cx);
      if (walk && boss.state === 'salto') a.left = true;
      const before = p.hp;
      h.tick(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
      if (boss.state === 'dizzy' || boss.state === 'strut') break;
    }
    const r = { lost, from, landed: Math.round(boss.me.x), state: boss.state };
    h.clear(boss);
    return r;
  };
  out.salto = { stand: salto(false), walk: salto(true) };

  /*
   * The knives: a hero who stands where he is takes one (the rest come down
   * in his grace), one who keeps walking takes none, and a swing as one comes
   * in sends it back into him for two.
   */
  const knives = (mode) => {
    h.place(boss, mid + 220, mid - 60);
    boss.beginJuggle(g);
    let lost = 0;
    const startHp = boss.hp;
    let batted = 0;
    for (let k = 0; k < 60 * 3.2; k++) {
      const a = {};
      if (mode === 'walk') a.right = true;
      if (mode === 'bat') {
        // A swing timed so the blade is out as the knife comes through it:
        // its arc run on a few frames, as the eye judges one.
        p.facing = 1;
        const box = { x: p.x + p.w - 4, y: p.cy - 18, w: 40, h: 32 };
        for (const q of g.projectiles) {
          if (q.kind !== 'knife' || q.friendly || q.dead) continue;
          let { cx: x, cy: y, vx, vy } = q;
          for (let f = 1; f <= 8; f++) {
            vy += 760 / 60;
            x += vx / 60;
            y += vy / 60;
            if (f >= 4 && x + 8 > box.x && x - 8 < box.x + box.w && y + 6 > box.y && y - 6 < box.y + box.h) a.attack = !p.isAttacking;
          }
        }
      }
      const before = p.hp;
      h.tick(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
      batted = Math.max(batted, g.projectiles.filter((q) => q.kind === 'knife' && q.friendly).length);
      if (boss.state === 'strut' && !g.projectiles.some((q) => q.kind === 'knife')) break;
    }
    const r = { lost, took: startHp - boss.hp, batted };
    h.clear(boss);
    return r;
  };
  out.knives = { stand: knives('stand'), walk: knives('walk'), bat: knives('bat') };
  return out;
});

/* ------------------------------------------------- a whole fight, as a player reads it */

await fresh();
results.reader = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { note: 'no Maskarill' };
  const act = window.__makeReader(g, h);
  h.hits = 0;
  h.why = {};
  let f = 0;
  let tricks = 0;
  let unmasked = 0;
  let prev = boss.state;
  for (; f < 60 * 120; f++) {
    if (h.felled(boss)) break;
    h.tick(act(boss) ?? {});
    h.watchHp(boss);
    if (boss.state !== prev) {
      if (boss.state === 'conjure') tricks++;
      if (boss.state === 'unmasked') unmasked++;
      prev = boss.state;
    }
  }
  const out = { felled: h.felled(boss), seconds: +(f / 60).toFixed(1), hits: h.hits, why: { ...h.why }, tricks, unmasked };

  // The fall, with the hero at two hearts: what it does, then the relic and its attack.
  p.hp = 2;
  let felled = false;
  for (let k = 0; k < 60 * 4; k++) {
    h.tick();
    if (!h.find()) felled = true;
  }
  const end = { felled, healed: p.hp === p.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
  end.spoke = !!g.dialogue;
  end.speaker = g.dialogue?.speaker ?? null;
  for (let k = 0; k < 60 * 8 && g.dialogue; k++) h.tick({ confirm: k % 2 === 0 });
  end.relic = p.relics.has('gauklerschritt');
  end.skill = p.skills.has('trugbild');
  end.wardsOpen = !g.level.wardClosed(h.arena.entryTx) && !g.level.wardClosed(h.arena.exitTx);
  out.end = end;
  return out;
});

/* ---------------------------------------------------------- standing still in it */

await fresh();
results.standing = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { note: 'no Maskarill' };
  const spots = { left: h.room.left + 140, middle: h.room.mid, right: h.room.right - 140 };
  const out = { seconds: 0, hits: 0, at: {} };
  for (const [name, x] of Object.entries(spots)) {
    h.hits = 0;
    for (let f = 0; f < 60 * 20; f++) {
      boss.hp = boss.maxHp;
      p.x = x - p.w / 2;
      p.vx = 0;
      h.tick();
      h.watchHp(boss);
    }
    out.at[name] = h.hits;
    out.hits += h.hits;
    out.seconds += 20;
  }
  return out;
});

/* ------------------------------------------------- felled the way the other tools fell him */

results.forced = [];
for (const st of ['shuffle', 'salto', 'wheel', 'juggle']) {
  await fresh();
  results.forced.push(
    await page.evaluate((st) => {
      const g = window.game;
      const h = window.__h;
      const p = g.player;
      const boss = h.wake();
      if (!boss) return { st, note: 'never woke' };
      h.place(boss, h.room.mid + 120, h.room.mid - 120);
      if (st === 'shuffle') boss.beginConjure(g);
      if (st === 'salto') boss.beginKneel(g);
      if (st === 'wheel') boss.beginCrouch(g);
      if (st === 'juggle') boss.beginJuggle(g);
      for (let f = 0; f < 60 * 3 && boss.state !== st; f++) {
        h.tick();
        h.keep();
      }
      for (let f = 0; f < 6; f++) h.tick();
      const from = boss.state;
      const copies = boss.copies.length;
      boss.beginDying(g);
      const after = boss.copies.length;
      for (let f = 0; f < 60 * 6 && !g.dialogue; f++) {
        h.keep();
        h.tick();
      }
      const spoke = !!g.dialogue;
      for (let f = 0; f < 60 * 8 && g.dialogue; f++) h.tick({ confirm: f % 2 === 0 });
      for (let f = 0; f < 30; f++) h.tick();
      return { st, from, copies, after, spoke, relic: p.relics.has('gauklerschritt'), skill: p.skills.has('trugbild'), cleared: h.arena.cleared, gone: !h.find() };
    }, st),
  );
}

console.log(JSON.stringify(results, null, 2));
await bench.close();

/* ----------------------------------------------------------------- the checks */

const m = results.main;
const rule = results.rule;
const fair = results.fair;
const r = results.reader;
const s = results.standing;
const fz = results.forced;
const has = (list, ...names) => names.every((n) => list?.includes(n));
const at = (x) => (x == null ? '-' : x);
const w1 = m.half1?.winds ?? {};
const w2 = m.half2?.winds ?? {};
const o1 = m.half1?.windows ?? {};
const o2 = m.half2?.windows ?? {};
const minOf = (a, b, k) => Math.min(a[k]?.min ?? Infinity, b[k]?.min ?? Infinity);
const tell = (k) => minOf(w1, w2, k);
const win = (k) => minOf(o1, o2, k);
const readRate = r.hits / Math.max(1, r.seconds);
const standRate = s.hits / Math.max(1, s.seconds);
const jumpsClear = Object.entries(fair.jumps ?? {})
  .filter(([, lost]) => lost === 0)
  .map(([d]) => d);
const real = rule.pixels?.find((f) => f.real);
const copies = rule.pixels?.filter((f) => !f.real) ?? [];
const both = ['juggle', 'crouch', 'kneel', 'conjure'];
const checks = [
  ['Maskarill wakes and his stage closes', m.engaged && m.sealed && m.barName?.startsWith('MASKARILL')],
  [`Maskarill costs less than a frame to fight, drawn every frame (p99 ${m.frame?.p99} ms)`, m.frame?.p99 < 16.67],
  [
    'Maskarill prances, juggles and throws, bows, wheels and does the splits, leaps and sways, and shuffles, lines up and is unmasked',
    has(m.half1?.moves, 'strut', 'juggle', 'throw', 'knife', 'bow', 'crouch', 'wheel', 'split', 'kneel', 'salto', 'dizzy', 'conjure', 'shuffle', 'guess', 'unmasked'),
  ],
  [
    `Maskarill: in his second half there are ${m.half2?.figures} of him, and a wheel goes straight on into the knives (${m.half2?.chained} times)`,
    m.half2?.figures === 4 && m.half1?.figures === 3 && m.half2?.chained > 0 && has(m.half2?.moves, 'wheel', 'juggle', 'salto', 'shuffle', 'unmasked'),
  ],
  [
    'Maskarill announces every move half a second ahead, in both halves - knives 0.6 ' +
      `(juggle ${at(tell('juggle'))} / crouch ${at(tell('crouch'))} / kneel ${at(tell('kneel'))} / smoke ${at(tell('conjure'))} / volley ${at(rule.puff?.wind)} s)`,
    both.every((k) => w1[k]?.n > 0 && w2[k]?.n > 0) && tell('juggle') >= 0.6 && tell('crouch') >= 0.5 && tell('kneel') >= 0.5 && tell('conjure') >= 0.5 && rule.puff?.wind >= 0.5,
  ],
  [
    // The line is measured where nobody strikes it: the reader's ends with his first blow.
    'Maskarill: every move leaves him open at least 1.2 s ' +
      `(bow ${at(win('bow'))} / splits ${at(win('split'))} / dizzy ${at(win('dizzy'))} / line ${at(rule.none?.guess)} / unmasked ${at(win('unmasked'))} / encore ${at(rule.puff?.encore)} s)`,
    ['bow', 'split', 'dizzy', 'unmasked'].every((k) => win(k) >= 1.2) && rule.none?.guess >= 1.2 && rule.puff?.encore >= 1.2,
  ],
  [
    `Maskarill: the trick waits until the rest has been seen - first at ${m.firstTrick} s - and its rule is said once, when they first line up`,
    m.firstTrick >= 6 && m.told === 'NUR EINER WIRFT EINEN SCHATTEN' && !m.toldEarly,
  ],
  [
    `Maskarill's rule, in pixels: the wall above him darkens by ${real?.wall}, above each copy by ${copies.map((c) => c.wall).join(' / ')}; at his feet ${real?.floor}, at theirs ${copies.map((c) => c.floor).join(' / ')}`,
    real?.wall > 20000 && real?.floor > 200 && copies.length >= 2 && copies.every((c) => c.wall === 0 && c.floor === 0),
  ],
  [
    `Maskarill: through the whole shuffle one figure casts the shadow, and it is always him (${rule.shuffle?.realCasts} of ${rule.shuffle?.frames} frames)`,
    rule.shuffle?.frames > 60 && rule.shuffle.realCasts === rule.shuffle.frames,
  ],
  [
    `Maskarill: in the line the shadow hangs over him and no one else (${rule.wall?.off} px off him, the line ${rule.gaps?.join(' / ')} px apart)`,
    rule.wall && Math.abs(rule.wall.off) <= 24 && rule.gaps?.every((g) => g >= 100) && rule.gaps.every((g) => Math.abs(rule.wall.off) < g / 2 - 30),
  ],
  [
    'Maskarill: while they shuffle nothing can be struck, nothing touches the hero, and not even a blow aimed at him lands',
    rule.shuffle?.struckable === 0 && rule.shuffle.lost === 0 && rule.shuffleProof?.took === 0,
  ],
  [
    `Maskarill: struck in the bow he is ENTLARVT! - the copies gone, ${rule.unmask?.took} and then ${rule.unmask?.then} for a blow of one, for ${rule.unmask?.seconds} s`,
    rule.unmask?.state === 'unmasked' && rule.unmask.copies === 0 && rule.unmask.said && rule.unmask.took === 2 && rule.unmask.then === 2 && rule.unmask.seconds >= 2.4,
  ],
  [
    `Maskarill: a copy struck goes PUFF, costs him nothing, and the ${rule.puff?.left} left throw ${rule.puff?.knives} knives; struck nothing, all ${rule.none?.n} throw ${rule.none?.knives}`,
    rule.puff?.said && rule.puff.took === 0 && rule.puff.left === rule.puff.n - 1 && rule.puff.knives === rule.puff.n - 1 && rule.puff.after.copies === 0 && rule.none?.knives === rule.none.n && rule.none.guess >= 1.7,
  ],
  [
    'Maskarill: nothing that stands still hurts - standing in him prancing, juggling, bowing, crouching, kneeling, in the splits, dizzy, conjuring, in the line, unmasked or at his encore costs nothing',
    Object.values(fair.contact ?? {}).length === 12 && Object.values(fair.contact).every((v) => v === 0),
  ],
  [
    'Maskarill: open, he is at sword height for a hero on the floor, on either side',
    Object.values(fair.reach ?? {}).length === 10 && Object.values(fair.reach).every(Boolean),
  ],
  [
    'Maskarill: outside a window the blade finds him gone - HOPPLA! - and takes nothing',
    Object.values(fair.evade ?? {}).length === 5 && Object.values(fair.evade).every((e) => e.took === 0) && Object.values(fair.evade).some((e) => e.said),
  ],
  [
    `Maskarill: his wheel is ${fair.wheelH} px high; a normal jump clears it, taken ${jumpsClear.join(' / ')} px out (and at 400 px/s in his second half), and standing in it costs one`,
    fair.wheelH <= 48 && fair.jumps?.[50] === 0 && fair.jumps?.[80] === 0 && fair.jumps?.[110] === 0 && fair.jumpsTwo?.[80] === 0 && fair.jumpsTwo?.[110] === 0 && fair.standInWheel === 1,
  ],
  [
    `Maskarill: a parried wheel goes over in a heap - dizzy for ${fair.parry?.seconds} s - and the guard takes nothing`,
    fair.parry?.state === 'dizzy' && fair.parry.lost === 0 && fair.parry.seconds >= 1.5,
  ],
  [
    `Maskarill: the salto comes down where the hero stood (${fair.salto?.stand.from} → ${fair.salto?.stand.landed}) - staying costs one, walking off costs nothing`,
    fair.salto?.stand.lost === 1 && Math.abs(fair.salto.stand.from - fair.salto.stand.landed) <= 2 && fair.salto.walk.lost === 0,
  ],
  [
    `Maskarill: his knives cost a hero who stands one, one who walks on none, and a swing sends one back into him (${fair.knives?.bat.took} taken)`,
    fair.knives?.stand.lost === 1 && fair.knives.walk.lost === 0 && fair.knives.bat.batted > 0 && fair.knives.bat.took >= 2 && fair.knives.bat.took % 2 === 0,
  ],
  [
    `Maskarill: a hero who sees him 0.3 s late fells him in ${r.seconds} s for ${r.hits} hearts, unmasking him ${r.unmasked} times in ${r.tricks} tricks`,
    // One fight, not a median: the bench's own spread runs from none to four (see verify:balance).
    r.felled && r.seconds >= 25 && r.seconds <= 60 && r.hits <= 4 && r.unmasked === r.tricks,
  ],
  [
    'Maskarill: reading him costs less than half of standing still ' + `(${(readRate * 60).toFixed(1)} against ${(standRate * 60).toFixed(1)} hearts a minute)`,
    s.hits >= 6 && readRate * 2 <= standRate,
  ],
  [
    'Maskarill falls, heals the hero, opens the wards, speaks, and leaves the Gauklerschritt and the Trugbild',
    r.end?.felled && r.end.healed && r.end.cleared && r.end.wardsOpen && r.end.banner?.includes('MASKARILL') && r.end.spoke && r.end.speaker === 'DAS THEATER' && r.end.relic && r.end.skill,
  ],
  [
    `Maskarill: beginDying fells him from wherever he is, the copies with him (${fz.map((x) => x.from).join(' / ')})`,
    fz.length === 4 && fz.every((x) => x.from === x.st && x.spoke && x.relic && x.skill && x.cleared && x.gone && x.after === 0) && fz[0].copies >= 2,
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
  `OK: all ${checks.length} checks - only Maskarill himself casts a shadow, struck in his bow he is unmasked and takes double, ` +
    `every move is announced, and a hero who reads him fells him in ${r.seconds} s for ${r.hits} hearts.`,
);
