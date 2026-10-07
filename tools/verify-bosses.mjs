/**
 * The arena bosses with a fight of their own: Gierschlund in the treasury,
 * Ankhor in the temple, Arachna in the web chamber, Ignivor in the ember
 * chamber, Vesperon on the roof of the keep and Umbra in the rift.
 *
 * Each is pinned on the same three questions the older fights are:
 *
 *   1. Does it actually do everything it is supposed to? Every move has to show
 *      up in a fight of ordinary length, from where the hero happens to be.
 *   2. Is it fair? Every move that hurts is announced, and a hero who reads
 *      the announcements takes far less than one who stands still.
 *   3. Does its rule hold?
 *        Gierschlund - shut it is a strongbox, open it is a mouth; a parried
 *                      bite jams the lid, its own gold batted back finds the
 *                      mouth, and its breath drags whoever stands in it.
 *        Ankhor      - the face takes double, and a broken fist brings his head
 *                      down to sword height.
 *        Arachna     - out of a sword's reach on her thread from the floor, in
 *                      reach from the high ledges; her grip, her thread or a
 *                      parried drop put her on her back on the floor.
 *        Ignivor     - his plates are armour and only the head counts - and
 *                      after every breach and every spit that head is where a
 *                      sword on the floor finds it.
 *        Vesperon    - he comes down after every dive, and lands on his face
 *                      when the dive is parried.
 *        Umbra       - it is the hero: his relics, his silk, his health; it
 *                      turns a masher's blows aside, and loses to patience.
 *
 * And then that each of them can be finished, and that each leaves its relic.
 *
 * Usage: node tools/verify-bosses.mjs
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
const base = `http://127.0.0.1:${server.address().port}/`;

/**
 * A fresh page for each boss: nothing one fight does leaks into the next. The
 * relics are the hero's, from the start - the boss sizes itself up against
 * them when it wakes.
 */
async function stage(kind, relics = []) {
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => window.loop.stop());
  // Shared helpers, installed once per page.
  await page.evaluate(({ kind, relics }) => {
    const g = window.game;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    for (const id of relics) g.takeRelic(id);
    g.dialogue = null;
    g.player.hp = g.player.maxHp;
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
    h.arena = g.level.arenas.find((a) =>
      g.level.spawns.some((s) => s.kind === kind && s.tx * 32 >= a.left && s.tx * 32 < a.right),
    );
    h.find = () => g.enemies.find((e) => e.kind === kind && !e.dead);
    /**
     * In through the door and on towards it until it is awake, the room is
     * shut, and its entrance - Arachna's descent, Umbra rising out of the
     * floor - is over.
     */
    const entering = ['dormant', 'intro', ...({ spider: ['descend'], shadow: ['rise'] }[kind] ?? [])];
    h.wake = () => {
      g.warpTo(h.arena.entryTx + 3);
      for (let f = 0; f < 60 * 8; f++) {
        const boss = h.find();
        if (boss && h.arena.fighting && !entering.includes(boss.state)) break;
        g.player.hp = g.player.maxHp;
        h.tick({ right: f < 40 || !boss?.engaged });
      }
      return h.find();
    };
    /** Through whatever is said over its fall, a line at a time. */
    h.readThrough = () => {
      for (let f = 0; f < 60 * 8 && g.dialogue; f++) h.tick({ confirm: f % 2 === 0 });
    };
    /** Felled, with the hero at two hearts: what its fall does, then its relic. */
    h.end = (relic) => {
      g.player.hp = 2;
      let felled = false;
      for (let f = 0; f < 60 * 4; f++) {
        h.tick();
        if (!h.find()) felled = true;
      }
      const end = { felled, healed: g.player.hp === g.player.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
      end.spoke = !!g.dialogue;
      h.readThrough();
      end.relic = g.player.has(relic);
      return end;
    };
    /** Holds the hero where he is, alive, and counts what reaches him. */
    h.hits = 0;
    /** What the boss was doing each time something got through, by state. */
    h.why = {};
    h.watchHp = () => {
      const p = g.player;
      if (p.hp < p.maxHp) {
        const lost = p.maxHp - p.hp;
        h.hits += lost;
        const state = h.find()?.state ?? 'none';
        h.why[state] = (h.why[state] ?? 0) + lost;
        p.hp = p.maxHp;
      }
      p.dead = false;
    };
    /**
     * What a frame of the fight costs, update and draw together, with the hero
     * swinging at it - the draw is the expensive half of these three.
     */
    h.measure = (seconds) => {
      const times = [];
      for (let f = 0; f < 60 * seconds; f++) {
        const boss = h.find();
        const dx = boss ? boss.cx - g.player.cx : 0;
        const t0 = performance.now();
        h.tick({ attack: f % 20 < 3, right: dx > 90, left: dx < -90 });
        times.push(performance.now() - t0);
        h.watchHp();
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      return { mean: +mean.toFixed(2), p99: +times[Math.floor(times.length * 0.99)].toFixed(2) };
    };
    window.__h = h;
  }, { kind, relics });
}

const results = {};

/* ------------------------------------------------------------------ Ankhor */

await stage('colossus');
results.colossus = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Ankhor' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };

  // 1. Every move, from three places in the court.
  const seen = new Set();
  const winds = { slam: [], sweep: [], beam: [] };
  const tracking = new Map();
  const prev = new Map();
  const standAt = (x, seconds, dodge) => {
    h.hits = 0;
    for (let f = 0; f < 60 * seconds; f++) {
      const actions = {};
      if (dodge) {
        // Read the tells: out from under a locked fist, over a sweeping
        // hand, away from the sun.
        for (const hand of boss.hands) {
          if ((hand.state === 'track' && hand.timer < 0.25) || hand.state === 'drop') {
            if (Math.abs(hand.x - p.cx) < 70) actions[hand.x > p.cx ? 'left' : 'right'] = true;
          }
          if (hand.state === 'sweep' && Math.abs(hand.x - p.cx) < 150 && Math.sign(p.cx - hand.x) === hand.dir) {
            actions.jump = true;
          }
        }
        if (boss.beam && boss.beam.stage !== 'fade' && Math.abs(boss.beam.x - p.cx) < 110) {
          actions[boss.beam.x > p.cx ? 'left' : 'right'] = true;
        }
        if (!actions.left && !actions.right) {
          // Drift back to the post.
          if (p.cx < x - 30) actions.right = true;
          else if (p.cx > x + 30) actions.left = true;
        }
      } else {
        p.x = x - p.w / 2;
        p.vx = 0;
      }
      h.tick(actions);
      h.watchHp();
      seen.add(boss.state);
      for (const [i, hand] of boss.hands.entries()) {
        seen.add(`hand:${hand.state}`);
        const key = `${i}`;
        // Only a wind-up seen from its first frame counts: one already under
        // way when a run starts would measure short.
        const was = prev.get(key);
        prev.set(key, hand.state);
        if (hand.state === 'track' && was === 'lift') tracking.set(key, g.time);
        if (hand.state === 'sweepWind' && was !== undefined && was !== 'sweepWind') tracking.set(`s${key}`, g.time);
        if (hand.state === 'drop' && tracking.has(key)) {
          winds.slam.push(+(g.time - tracking.get(key)).toFixed(2));
          tracking.delete(key);
        }
        if (hand.state === 'sweep' && tracking.has(`s${key}`)) {
          winds.sweep.push(+(g.time - tracking.get(`s${key}`)).toFixed(2));
          tracking.delete(`s${key}`);
        }
      }
      if (boss.beam) {
        seen.add(`beam:${boss.beam.stage}`);
        if (boss.beam.stage === 'mark' && boss.beam.t < 0.02) tracking.set('b', g.time);
        if (boss.beam.stage === 'burn' && tracking.has('b')) {
          winds.beam.push(+(g.time - tracking.get('b')).toFixed(2));
          tracking.delete('b');
        }
      }
    }
    return h.hits;
  };
  const mid = (h.arena.left + h.arena.right) / 2;
  const standing = [standAt(mid - 300, 20, false), standAt(mid + 80, 20, false), standAt(mid + 330, 20, false)];
  const dodging = [standAt(mid - 300, 20, true), standAt(mid + 80, 20, true), standAt(mid + 330, 20, true)];
  // Second half: both fists.
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.enterPhaseTwo(g);
  let doubles = 0;
  for (let f = 0; f < 60 * 30; f++) {
    p.x = mid - 200;
    h.tick();
    h.watchHp();
    const up = boss.hands.filter((q) => q.state === 'lift' || q.state === 'track').length;
    if (up === 2) doubles++;
  }
  out.moves = [...seen].sort();
  out.winds = {
    slamMin: Math.min(...winds.slam),
    sweepMin: Math.min(...winds.sweep),
    beamMin: Math.min(...winds.beam),
    slams: winds.slam,
    sweeps: winds.sweep,
    beams: winds.beam,
  };
  out.hitsStanding = standing.reduce((a, b) => a + b, 0);
  out.hitsDodging = dodging.reduce((a, b) => a + b, 0);
  out.doubleFists = doubles > 0;

  // 3. The face takes double; a fist takes its share and then breaks.
  boss.state = 'idle';
  boss.timer = 99;
  boss.poiseLock = 0;
  boss.beam = null;
  for (const hand of boss.hands) {
    hand.state = 'hover';
    hand.crack = boss.poiseMax;
  }
  for (let f = 0; f < 30; f++) h.tick();
  const head = boss.headRect();
  let before = boss.hp;
  boss.overlaps(head);
  boss.hurt(1, 1, g);
  out.headTakes = before - boss.hp;
  const hand = boss.hands[0];
  const handBox = boss.handRect(hand);
  before = boss.hp;
  boss.overlaps(handBox);
  boss.hurt(1, 1, g);
  out.handTakes = before - boss.hp;
  for (let i = 0; i < 20 && hand.state !== 'broken'; i++) {
    boss.overlaps(boss.handRect(hand));
    boss.hurt(1, 1, g);
  }
  for (let f = 0; f < 50; f++) h.tick();
  const low = boss.headRect();
  out.shatter = {
    broken: hand.state === 'broken',
    slumped: boss.state === 'slumped',
    headBottomAboveFloor: Math.round(boss.floorY - (low.y + low.h)),
    headTopAboveFloor: Math.round(boss.floorY - low.y),
  };
  // A hero on the floor, swinging, reaches the sagging head.
  p.x = boss.headX - 40 - p.w;
  p.y = boss.floorY - p.h - 1;
  p.facing = 1;
  out.shatter.swordReaches = boss.overlaps(p.swordRect());
  for (let f = 0; f < 60 * 8; f++) {
    h.tick();
    h.watchHp();
  }
  out.shatter.reformed = hand.state !== 'broken' && hand.state !== 'reform';
  out.shatter.upAgain = boss.state !== 'slumped';

  // 4. The end.
  boss.overlaps(boss.headRect());
  boss.hurt(999, 1, g);
  out.end = h.end('bebenfaust');
  return out;
});

/* ----------------------------------------------------------------- Ignivor */

await stage('wyrm');
results.wyrm = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Ignivor' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };
  const mid = (h.arena.left + h.arena.right) / 2;

  const seen = new Set();
  const locks = [];
  let lockStart = -1;
  /** How long his head lay stuck after each breach, and how high. */
  const stuck = [];
  let stuckStart = -1;
  let stuckHeight = 0;
  /** Where each spit's clots came down, against where the hero and the head were. */
  const spits = [];
  const pending = [];
  let prev = boss.state;
  const watch = () => {
    const s = boss.state;
    seen.add(s);
    if (s === 'hunt' && boss.timer < 0.4 && lockStart < 0) lockStart = g.time;
    if (s === 'breach' && lockStart >= 0) {
      locks.push(+(g.time - lockStart).toFixed(2));
      lockStart = -1;
    }
    if (s === 'stuck' && prev !== 'stuck') {
      stuckStart = g.time;
      stuckHeight = Math.round(boss.floorY - boss.hy);
    }
    if (s !== 'stuck' && prev === 'stuck' && stuckStart >= 0) {
      stuck.push({ t: +(g.time - stuckStart).toFixed(2), height: stuckHeight });
      stuckStart = -1;
    }
    if (s === 'exposed' && prev === 'spitWind') {
      pending.push({ at: g.time, heroX: p.cx, headX: boss.hx, before: new Set(boss.pools) });
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i];
      if (g.time - q.at < 1.2) continue;
      pending.splice(i, 1);
      const away = Math.sign(q.heroX - q.headX) || 1;
      const landed = boss.pools.filter((pool) => !q.before.has(pool)).map((pool) => Math.round((pool.x - q.heroX) * away));
      spits.push({ landed, between: landed.filter((d) => d < -24).length });
    }
    prev = s;
  };

  const fight = (seconds, dodge) => {
    h.hits = 0;
    const post = mid - 150;
    for (let f = 0; f < 60 * seconds; f++) {
      const actions = {};
      const s = boss.state;
      if (dodge) {
        // Clear of him while he is up, too - walking back to the post under a
        // wyrm still coming down is walking into him.
        if (s === 'breach' && Math.abs(boss.hx - p.cx) < 120) actions[boss.hx > p.cx ? 'left' : 'right'] = true;
        const lockedUnder = s === 'hunt' && boss.timer < 0.4;
        const glowing = s === 'hunt' && Math.abs(boss.hx - p.cx) < 80;
        if (lockedUnder && Math.abs(boss.hx - p.cx) < 90) actions[boss.hx > p.cx ? 'left' : 'right'] = true;
        else if (glowing && !actions.left && !actions.right) actions[p.cx < mid ? 'right' : 'left'] = true;
        if (s === 'waveWind' || s === 'wave') {
          // A wave coming: up on the nearest ledge. Stand on it by placement -
          // the climb itself is verify:level's business.
          p.x = h.ledgeX - p.w / 2;
          p.y = h.ledgeY - p.h - 1;
          p.vy = 0;
        } else if (s === 'spitWind') {
          // The clots come down on him and past him, never between: in
          // towards the head is the way out from under them.
          h.spitFrom = null;
          if (Math.abs(boss.hx - p.cx) > 50) actions[boss.hx > p.cx ? 'right' : 'left'] = true;
        } else if (s === 'exposed') {
          // Off the spot they were aimed at, on under the head if need be.
          if (h.spitFrom === null) h.spitFrom = p.cx;
          if (Math.abs(p.cx - h.spitFrom) < 40) actions[boss.hx > h.spitFrom ? 'right' : 'left'] = true;
        } else if (!actions.left && !actions.right && s !== 'breach') {
          if (p.cx < post - 40) actions.right = true;
          else if (p.cx > post + 40) actions.left = true;
        }
        // And not back into a burning pool on the way.
        for (const pool of boss.pools) {
          if (Math.abs(pool.x - p.cx) < 46 && p.onGround && pool.life > 0.3 && s !== 'exposed') {
            actions.left = pool.x > p.cx;
            actions.right = pool.x <= p.cx;
          }
        }
      } else {
        p.x = post - p.w / 2;
        p.vx = 0;
      }
      h.tick(actions);
      h.watchHp();
      watch();
    }
    return h.hits;
  };
  // The high ledge nearest the middle, for the dodger to stand on.
  const L = g.level;
  let best = null;
  for (let tx = Math.floor(h.arena.left / 32); tx < Math.floor(h.arena.right / 32); tx++) {
    for (let ty = 2; ty < 17; ty++) {
      if (L.platformAt(tx, ty) && (!best || ty < best.ty || (ty === best.ty && Math.abs(tx * 32 - mid) < Math.abs(best.tx * 32 - mid)))) {
        best = { tx, ty };
      }
    }
  }
  h.ledgeX = best.tx * 32 + 16;
  h.ledgeY = best.ty * 32;
  h.spitFrom = null;
  out.hitsStanding = fight(45, false);
  h.why = {};
  out.hitsDodging = fight(45, true);
  out.dodgerHitDuring = { ...h.why };
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  out.hitsStandingPhase2 = fight(25, false);
  out.moves = [...seen].sort();
  out.lockMin = Math.min(...locks);
  out.breaches = locks.length;
  out.stuck = stuck;
  out.spits = spits;

  // The wave, twice: once on the floor, once on the ledge.
  const wave = (onLedge) => {
    boss.state = 'waveEdge';
    boss.waveDir = 1;
    boss.pillars.length = 0;
    g.projectiles.length = 0;
    let hits = 0;
    for (let f = 0; f < 60 * 7 && !(boss.state === 'idle' && f > 60); f++) {
      if (onLedge) {
        p.x = h.ledgeX - p.w / 2;
        p.y = h.ledgeY - p.h - 1;
        p.vy = 0;
      } else {
        p.x = mid - p.w / 2;
      }
      const before = p.hp;
      h.tick();
      if (p.hp < before) hits += before - p.hp;
      p.hp = p.maxHp;
      p.invuln = 0;
    }
    return hits;
  };
  out.waveOnFloor = wave(false);
  out.waveOnLedge = wave(true);

  /**
   * His head where it lies after a breach and where it hangs after a spit,
   * against a hero standing on the floor beside it and swinging: the blade has
   * to find the head itself, not a plate.
   */
  g.projectiles.length = 0;
  boss.pools.length = 0;
  const reach = (state) => {
    boss.state = state;
    boss.hx = mid;
    if (state === 'stuck') {
      boss.hole = mid + 70;
      boss.hy = boss.floorY - 22;
    }
    for (let f = 0; f < 40; f++) {
      boss.timer = 99;
      p.x = boss.hx - 40 - p.w;
      p.y = boss.floorY - p.h - 1;
      p.vx = 0;
      h.tick();
      p.hp = p.maxHp;
    }
    p.x = boss.hx - 40 - p.w;
    p.facing = 1;
    const hit = boss.overlaps(p.swordRect()) && boss.struck === 'head';
    const head = boss.headRect();
    return { hit, headBottom: Math.round(boss.floorY - (head.y + head.h)) };
  };
  out.reachStuck = reach('stuck');
  out.reachExposed = reach('exposed');

  // Armour and head, the head held up out of the way of the plates.
  boss.state = 'stuck';
  boss.hx = mid;
  boss.hole = mid + 90;
  for (let f = 0; f < 20; f++) {
    boss.timer = 99;
    h.tick();
  }
  let before = boss.hp;
  const head = boss.headRect();
  const clear = (q) => q.x + 4 < head.x || q.x - 4 > head.x + head.w || q.y + 4 < head.y || q.y - 4 > head.y + head.h;
  const seg = boss.segs.slice(2).find((q) => q.y < boss.floorY - 6 && clear(q));
  if (seg) {
    boss.overlaps({ x: seg.x - 4, y: seg.y - 4, w: 8, h: 8 });
    boss.hurt(3, 1, g);
  }
  out.bodyTakes = seg ? before - boss.hp : null;
  before = boss.hp;
  boss.overlaps(boss.headRect());
  boss.hurt(1, 1, g);
  out.headTakes = before - boss.hp;

  // Beaten down while it hangs after a spit: the long window.
  boss.state = 'exposed';
  boss.timer = 99;
  boss.hy = boss.floorY - 54;
  boss.poiseLock = 0;
  for (let i = 0; i < 20 && boss.state !== 'stunned'; i++) {
    boss.overlaps(boss.headRect());
    boss.hurt(1, 1, g);
  }
  out.knockedDown = boss.state === 'stunned';
  let down = 0;
  for (let f = 0; f < 60 * 5 && boss.state === 'stunned'; f++) {
    h.tick();
    if (f === 30) out.headOnFloor = Math.round(boss.floorY - boss.hy);
    down++;
  }
  out.stunSeconds = +(down / 60).toFixed(2);

  // The end.
  boss.state = 'exposed';
  boss.timer = 99;
  boss.overlaps(boss.headRect());
  boss.hurt(999, 1, g);
  out.end = h.end('glutklinge');
  return out;
});

/* ---------------------------------------------------------------- Vesperon */

await stage('vesper');
results.vesper = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Vesperon' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };
  const mid = (h.arena.left + h.arena.right) / 2;
  const seen = new Set();
  const winds = [];
  const grounded = [];
  let windStart = -1;
  let groundStart = -1;
  let maxBats = 0;
  const fight = (seconds, dodge) => {
    h.hits = 0;
    const post = mid - 120;
    for (let f = 0; f < 60 * seconds; f++) {
      const actions = {};
      if (dodge) {
        // Off the line of a locked dive, and a roll through a crescent.
        if (boss.state === 'diveWind' && boss.timer < 0.3 && Math.abs(boss.target.x - p.cx) < 90) {
          actions[boss.target.x > p.cx ? 'left' : 'right'] = true;
        }
        for (const q of g.projectiles) {
          if (!q.friendly && q.kind === 'blood' && Math.hypot(q.cx - p.cx, q.cy - p.cy) < 90) actions.dash = true;
        }
        for (const m of boss.marks) if (Math.abs(m.x - p.cx) < 36 && m.t > 0.3) actions[m.x > p.cx ? 'left' : 'right'] = true;
        // His bats get swatted, the way anyone would.
        const bat = g.enemies.find((e) => e.kind === 'bat' && !e.dead && Math.abs(e.cx - p.cx) < 70 && Math.abs(e.cy - p.cy) < 60);
        if (bat) {
          p.facing = bat.cx > p.cx ? 1 : -1;
          actions.attack = f % 12 < 3;
        }
        if (!actions.left && !actions.right) {
          if (p.cx < post - 40) actions.right = true;
          else if (p.cx > post + 40) actions.left = true;
        }
      } else {
        p.x = post - p.w / 2;
        p.vx = 0;
      }
      h.tick(actions);
      h.watchHp();
      seen.add(boss.state);
      maxBats = Math.max(maxBats, g.enemies.filter((e) => e.kind === 'bat' && !e.dead && e.spawnKey === 'vesper').length);
      // From the first frame of a wind-up only: one already under way when a
      // run starts would measure short.
      if (boss.state === 'diveWind' && h.lastState !== undefined && h.lastState !== 'diveWind') windStart = g.time;
      h.lastState = boss.state;
      if (boss.state === 'dive' && windStart >= 0) {
        winds.push(+(g.time - windStart).toFixed(2));
        windStart = -1;
      }
      if (boss.state === 'grounded' && groundStart < 0) groundStart = g.time;
      if (boss.state !== 'grounded' && groundStart >= 0) {
        grounded.push({ t: +(g.time - groundStart).toFixed(2), onFloor: Math.abs(boss.bottom - boss.floorY) < 60 });
        groundStart = -1;
      }
      if (boss.state === 'grounded') out.groundedBottom = Math.round(boss.floorY - boss.bottom);
    }
    return h.hits;
  };
  out.hitsStanding = fight(40, false);
  h.why = {};
  out.hitsDodging = fight(40, true);
  out.dodgerHitDuring = { ...h.why };
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  fight(40, false);
  out.moves = [...seen].sort();
  out.diveWindMin = Math.min(...winds);
  out.dives = winds.length;
  // Of the plain dives - in his second half the first of a pair is short.
  out.groundedMax = Math.max(...grounded.map((q) => q.t));
  out.groundedOnFloor = grounded.every((q) => q.onFloor);
  out.maxBats = maxBats;

  // A parried dive.
  for (const e of g.enemies) if (e.kind === 'bat') e.dead = true;
  g.projectiles.length = 0;
  boss.poiseLock = 0;
  boss.state = 'hover';
  boss.timer = 99;
  for (let f = 0; f < 30; f++) {
    boss.timer = 99;
    h.tick();
  }
  p.x = mid - p.w / 2;
  p.y = boss.floorY - p.h - 1;
  boss.beginDive(p.cx, 0.6);
  let parried = false;
  for (let f = 0; f < 60 * 3 && boss.state !== 'stunned' && boss.state !== 'fall'; f++) {
    p.x = mid - p.w / 2;
    p.vx = 0;
    p.hp = p.maxHp;
    p.invuln = 0;
    const near = boss.state === 'dive' && Math.hypot(boss.cx - p.cx, boss.cy - p.cy) < 150;
    if (near) p.facing = boss.cx > p.cx ? 1 : -1;
    h.tick({ parry: near && !parried });
    if (near) parried = true;
  }
  for (let f = 0; f < 60; f++) h.tick();
  out.parryDive = { state: boss.state, onFloor: Math.abs(boss.bottom - boss.floorY) < 4 };

  // The end.
  boss.state = 'stunned';
  boss.timer = 5;
  boss.hurt(999, 1, g);
  out.end = h.end('blutdurst');
  return out;
});

/* ------------------------------------------------------------- Gierschlund */

await stage('mimic');
results.mimic = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Gierschlund' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };
  const mid = (h.arena.left + h.arena.right) / 2;

  const seen = new Set();
  const WINDS = ['biteWind', 'snapWind', 'spitWind', 'tongueWind', 'gulpWind'];
  const winds = Object.fromEntries(WINDS.map((w) => [w, []]));
  let prev = null;
  let windAt = -1;
  let chained = false;
  const watch = () => {
    const s = boss.state;
    seen.add(s);
    if (s === prev) return;
    if (prev !== null && WINDS.includes(prev) && windAt >= 0 && !chained) winds[prev].push(+(g.time - windAt).toFixed(2));
    // The second bite of a pair comes straight out of the first: the first
    // one's warning is its warning.
    chained = s === 'biteWind' && prev === 'bite';
    windAt = prev !== null && WINDS.includes(s) ? g.time : -1;
    prev = s;
  };

  let jumpHold = 0;
  let dodgeTo = null;
  /** Running round it, and which way: see below. */
  let passing = 0;
  const fight = (seconds, post, dodge) => {
    h.hits = 0;
    prev = null;
    passing = 0;
    for (let f = 0; f < 60 * seconds; f++) {
      const a = {};
      if (dodge) {
        const s = boss.state;
        const dist = Math.abs(boss.cx - p.cx);
        const away = boss.cx > p.cx ? 'left' : 'right';
        const toward = boss.cx > p.cx ? 'right' : 'left';
        const open = s === 'gape' || s === 'jammed';
        if (passing !== 0) {
          // On past it, until well clear - or clear enough, once it shuts.
          const beyond = passing > 0 ? p.cx - boss.cx : boss.cx - p.cx;
          if (beyond > 110 || (!open && beyond > 50)) passing = 0;
          else a[passing > 0 ? 'right' : 'left'] = true;
        }
        if (passing !== 0) {
          // (running)
        } else if (['biteWind', 'bite', 'snapWind', 'snap', 'gulpWind', 'gulp'].includes(s)) {
          // Out of the jaws' way: a bite lunges a good hundred pixels.
          if (dist < 240) a[away] = true;
        } else if (s === 'tongueWind' || s === 'tongue') {
          // Over the tongue: it lashes along the floor.
          if (dist < 300 && (s === 'tongue' || boss.timer < 0.12) && p.onGround) jumpHold = 18;
        } else if (s === 'hop') {
          if (dist < 140) a[away] = true;
          else if (dist > 260) a[toward] = true;
        } else if (open) {
          // Backing off from every lunge ends in a corner, and a chest that
          // has someone in a corner snaps. Its windows are the time to get
          // round it - open and panting, it does not hurt to pass.
          const chestRight = boss.cx > p.cx;
          const behind = chestRight ? p.cx - h.arena.left : h.arena.right - p.cx;
          const room = chestRight ? h.arena.right - boss.cx : boss.cx - h.arena.left;
          if (behind < 200 && room > behind + 120 && boss.timer > 0.45) passing = chestRight ? 1 : -1;
        }
        // The coins come down on him and either side of him, a little over a
        // hero's width apart: half a gap aside is out from under all of them.
        const flying = g.projectiles.some((q) => q.kind === 'coin' && !q.friendly && !q.resting && !q.dead);
        if (flying && dodgeTo === null) dodgeTo = p.cx + (p.cx < mid ? 26 : -26);
        if (!flying) dodgeTo = null;
        if (dodgeTo !== null && !a.left && !a.right) {
          if (p.cx < dodgeTo - 3) a.right = true;
          else if (p.cx > dodgeTo + 3) a.left = true;
        }
        if (jumpHold > 0) {
          a.jump = true;
          jumpHold--;
        }
      } else {
        p.x = post - p.w / 2;
        p.vx = 0;
      }
      h.tick(a);
      h.watchHp();
      watch();
    }
    return h.hits;
  };
  const left = h.arena.left + 150;
  const right = h.arena.right - 150;
  out.hitsStanding = fight(15, left, false) + fight(15, mid, false) + fight(15, right, false);
  h.why = {};
  out.hitsDodging = fight(45, mid, true);
  out.dodgerHitDuring = { ...h.why };
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  fight(15, left, false);
  fight(15, right, false);
  out.moves = [...seen].sort();
  out.winds = Object.fromEntries(WINDS.map((w) => [w, winds[w].length ? Math.min(...winds[w]) : null]));

  /** Held where the tests want it, in the middle of the floor, lid as given. */
  const pin = (state, lid) => {
    boss.state = state;
    boss.timer = 99;
    boss.lid = lid;
    boss.lidTarget = lid;
    boss.tongue = 0;
    boss.x = mid + 80 - boss.w / 2;
    boss.vx = 0;
  };
  const settle = (frames, heroX) => {
    for (let f = 0; f < frames; f++) {
      pin('hop', 0);
      if (heroX !== undefined) {
        p.x = heroX - p.w / 2;
        p.vx = 0;
      }
      h.tick();
      p.hp = p.maxHp;
    }
  };
  g.projectiles.length = 0;

  // Shut, a strongbox: the blow rings off. Open, a mouth.
  settle(20);
  let before = boss.hp;
  boss.overlaps(boss.rect);
  boss.hurt(1, 1, g);
  out.shellTakes = before - boss.hp;
  pin('gape', 0.8);
  before = boss.hp;
  boss.overlaps(boss.mouthRect());
  boss.hurt(1, 1, g);
  out.mouthTakes = before - boss.hp;

  // A parried bite jams the lid wide open.
  settle(20, mid + 80 - 75);
  boss.poiseLock = 0;
  boss.facing = -1;
  boss.chain = false;
  boss.state = 'biteWind';
  boss.timer = 0.3;
  let pressed = false;
  let lost = 0;
  for (let f = 0; f < 120 && boss.state !== 'jammed'; f++) {
    p.facing = 1;
    const a = {};
    if (boss.state === 'bite' && !pressed) {
      a.parry = true;
      pressed = true;
    }
    const hpb = p.hp;
    h.tick(a);
    lost += Math.max(0, hpb - p.hp);
    p.hp = p.maxHp;
  }
  let jammed = 0;
  const wasJammed = boss.state === 'jammed';
  for (let f = 0; f < 60 * 4 && boss.state === 'jammed'; f++) {
    h.tick();
    jammed++;
  }
  out.parriedBite = { jammed: wasJammed, lost, seconds: +(jammed / 60).toFixed(2) };

  /*
   * Its own gold: it comes down around the hero and lies there, lying it
   * hurts nobody, and a swing sends it back - and the chest, shut and minding
   * its own business, cannot keep its lid down for gold coming home.
   */
  g.projectiles.length = 0;
  const gap = 190;
  settle(20, mid + 80 - gap);
  boss.facing = -1;
  boss.state = 'spitWind';
  boss.timer = 0.05;
  const coins = () => g.projectiles.filter((q) => q.kind === 'coin' && !q.dead);
  for (let f = 0; f < 80 && !coins().some((q) => q.resting); f++) {
    p.x = mid + 80 - gap - p.w / 2;
    p.vx = 0;
    h.tick();
    p.hp = p.maxHp;
  }
  for (let f = 0; f < 6; f++) h.tick();
  const lying = coins().filter((q) => q.resting);
  let lyingHurt = 0;
  const under = lying[0];
  if (under) {
    for (let f = 0; f < 15; f++) {
      if (boss.state === 'hop') boss.timer = 99;
      p.x = under.cx - p.w / 2;
      p.vx = 0;
      p.invuln = 0;
      const hpb = p.hp;
      h.tick();
      lyingHurt += Math.max(0, hpb - p.hp);
      p.hp = p.maxHp;
    }
  }
  // Shut tight and minding its own business - and then its gold comes home.
  boss.state = 'hop';
  boss.timer = 99;
  boss.lid = 0;
  boss.lidTarget = 0;
  const goldHp = boss.hp;
  let opened = false;
  let batted = 0;
  for (let f = 0; f < 90; f++) {
    if (boss.state === 'hop') boss.timer = 99;
    const coin = coins()
      .filter((q) => q.resting)
      .sort((a, b) => Math.abs(a.cx - p.cx) - Math.abs(b.cx - p.cx))[0];
    const a = {};
    if (coin) {
      const want = coin.cx - 20;
      if (p.cx < want - 4) a.right = true;
      else if (p.cx > want + 4) a.left = true;
      else {
        p.facing = 1;
        a.attack = f % 6 < 2;
      }
    }
    const shut = boss.state === 'hop';
    h.tick(a);
    p.hp = p.maxHp;
    if (shut && boss.state === 'gape') opened = true;
    batted = Math.max(batted, coins().filter((q) => q.friendly).length);
  }
  out.gold = { lying: lying.length, lyingHurt, batted, opened, took: goldHp - boss.hp };

  /*
   * Its breath: a hero who stands in it is dragged to the mouth and bitten;
   * one who runs gets out.
   */
  const gulp = (run) => {
    g.projectiles.length = 0;
    boss.phaseTwo = true;
    settle(20, mid + 80 - 170);
    boss.facing = -1;
    boss.state = 'gulpWind';
    boss.timer = 0.6;
    const start = boss.cx - p.cx;
    let closest = start;
    let bitten = 0;
    for (let f = 0; f < 60 * 2.5 && (boss.state === 'gulpWind' || boss.state === 'gulp'); f++) {
      const hpb = p.hp;
      h.tick({ left: run });
      bitten += Math.max(0, hpb - p.hp);
      p.hp = p.maxHp;
      closest = Math.min(closest, boss.cx - p.cx);
    }
    return { start: Math.round(start), closest: Math.round(closest), bitten };
  };
  out.gulpStanding = gulp(false);
  out.gulpRunning = gulp(true);

  // The end.
  boss.beginDying(g);
  out.end = h.end('goldzahn');
  return out;
});

/* ----------------------------------------------------------------- Arachna */

await stage('spider');
results.spider = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Arachna' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };
  const mid = (h.arena.left + h.arena.right) / 2;

  const seen = new Set();
  const WINDS = ['dropWind', 'webWind', 'broodWind', 'swingWind'];
  const winds = Object.fromEntries(WINDS.map((w) => [w, []]));
  /** How long her mark had held still when she let go. */
  const holds = [];
  let prev = null;
  let windAt = -1;
  let markMoved = -1;
  let lastMark = null;
  let maxBrood = 0;
  let swingLow = null;
  const watch = () => {
    const s = boss.state;
    seen.add(s);
    if (s === 'dropWind') {
      if (lastMark !== boss.dropX) markMoved = g.time;
      lastMark = boss.dropX;
    }
    if (s === 'swing') {
      const r = boss.bodyRect();
      const gap = Math.round(boss.floorY - (r.y + r.h));
      if (swingLow === null || gap < swingLow.bottom) swingLow = { bottom: gap, top: Math.round(boss.floorY - r.y) };
    }
    if (s !== prev) {
      if (prev !== null && WINDS.includes(prev) && windAt >= 0) winds[prev].push(+(g.time - windAt).toFixed(2));
      if (s === 'drop' && prev === 'dropWind' && windAt >= 0) holds.push(+(g.time - markMoved).toFixed(2));
      windAt = prev !== null && WINDS.includes(s) ? g.time : -1;
      if (s === 'dropWind') lastMark = null;
      prev = s;
    }
    const brood = g.enemies.filter((e) => e.kind === 'spiderling' && !e.dead).length + boss.eggs.length;
    maxBrood = Math.max(maxBrood, brood);
  };

  let jumpHold = 0;
  let dodgeTo = null;
  const fight = (seconds, dodge) => {
    h.hits = 0;
    prev = null;
    const post = mid - 120;
    for (let f = 0; f < 60 * seconds; f++) {
      const a = {};
      const s = boss.state;
      if (dodge) {
        if (s === 'dropWind' || s === 'drop') {
          // Out of the mark: it follows him, then holds.
          if (Math.abs(p.cx - boss.dropX) < 90) a[p.cx < boss.dropX ? 'left' : 'right'] = true;
        } else if (s === 'swing') {
          if (Math.abs(boss.bx - p.cx) < 150 && boss.by > boss.floorY - 110 && p.onGround) jumpHold = 14;
        } else {
          // Silk coming down: a step aside, between the balls.
          const flying = boss.webs.some((q) => !q.dead && !q.friendly);
          if (flying && dodgeTo === null) dodgeTo = p.cx + (p.cx < mid ? 42 : -42);
          if (!flying) dodgeTo = null;
          if (dodgeTo !== null) {
            if (p.cx < dodgeTo - 3) a.right = true;
            else if (p.cx > dodgeTo + 3) a.left = true;
          }
          // Her young get swatted and her eggs popped, the way anyone would,
          // and silk underfoot gets cut.
          const young = g.enemies.find((e) => e.kind === 'spiderling' && !e.dead && Math.abs(e.cx - p.cx) < 60 && Math.abs(e.cy - p.cy) < 40);
          const egg = boss.eggs.find((e) => e.landed && Math.abs(e.x - p.cx) < 50);
          const target = young ? young.cx : egg ? egg.x : null;
          if (target !== null) {
            p.facing = target > p.cx ? 1 : -1;
            a.attack = f % 10 < 3;
          } else if (p.sticky > 0) {
            a.attack = f % 10 < 3;
          }
          if (!a.left && !a.right && dodgeTo === null) {
            if (p.cx < post - 40) a.right = true;
            else if (p.cx > post + 40) a.left = true;
          }
        }
        if (jumpHold > 0) {
          a.jump = true;
          jumpHold--;
        }
      } else {
        p.x = post - p.w / 2;
        p.vx = 0;
      }
      h.tick(a);
      h.watchHp();
      watch();
    }
    return h.hits;
  };
  out.hitsStanding = fight(40, false);
  h.why = {};
  out.hitsDodging = fight(40, true);
  out.dodgerHitDuring = { ...h.why };
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  h.why = {};
  out.hitsDodgingPhase2 = fight(30, true);
  out.dodgerHitDuringPhase2 = { ...h.why };
  out.moves = [...seen].sort();
  out.winds = Object.fromEntries(WINDS.map((w) => [w, winds[w].length ? Math.min(...winds[w]) : null]));
  out.markHeld = holds.length ? Math.min(...holds) : null;
  out.maxBrood = maxBrood;
  out.swingLow = swingLow;

  const clearFloor = () => {
    for (const e of g.enemies) if (e.kind === 'spiderling') e.dead = true;
    g.projectiles.length = 0;
    boss.eggs.length = 0;
    boss.patches.length = 0;
  };
  /** Up on her thread, over the hero, wherever he is held. */
  const hang = (frames, place) => {
    for (let f = 0; f < frames; f++) {
      clearFloor();
      boss.state = 'hang';
      boss.timer = 99;
      place();
      h.tick();
      p.hp = p.maxHp;
    }
  };
  /** Back up after a fall, the hero kept out of her way. */
  const backUp = () => {
    for (let f = 0; f < 60 * 8 && boss.state !== 'hang'; f++) {
      p.x = h.arena.left + 60;
      p.vx = 0;
      h.tick();
      p.hp = p.maxHp;
    }
  };
  const onFloor = (x) => () => {
    p.x = x - p.w / 2;
    p.y = boss.floorY - p.h - 1;
    p.vx = 0;
    p.vy = 0;
  };

  // From the floor she is out of reach.
  hang(90, onFloor(mid));
  p.facing = boss.bx >= p.cx ? 1 : -1;
  out.fromFloor = { reaches: boss.overlaps(p.swordRect()), bodyAbove: Math.round(boss.floorY - (boss.bodyRect().y + boss.bodyRect().h)) };

  // From the high ledges she is not.
  const L = g.level;
  let ledge = null;
  for (let tx = Math.floor(h.arena.left / 32); tx < Math.floor(h.arena.right / 32); tx++) {
    for (let ty = 2; ty < 17; ty++) if (L.platformAt(tx, ty) && (!ledge || ty < ledge.ty)) ledge = { tx, ty };
  }
  const onLedge = () => {
    p.x = ledge.tx * 32 + 16 - p.w / 2;
    p.y = ledge.ty * 32 - p.h;
    p.vx = 0;
    p.vy = 0;
  };
  // She works her way along the roof to hang over him wherever he is.
  hang(60 * 5, onLedge);
  p.facing = boss.bx >= p.cx ? 1 : -1;
  out.fromLedge = { reaches: boss.overlaps(p.swordRect()) ? boss.struck : null, offset: Math.round(boss.bx - p.cx) };

  // Hit up there, she loses her grip and comes down on her back - in reach.
  boss.poiseLock = 0;
  let blows = 0;
  while (blows < 40 && boss.state !== 'fall') {
    boss.overlaps(boss.bodyRect());
    boss.hurt(1, 1, g);
    blows++;
  }
  const fell = boss.state === 'fall';
  for (let f = 0; f < 60 * 2 && boss.state === 'fall'; f++) h.tick();
  let down = 0;
  const landed = boss.state === 'stunned';
  for (let f = 0; f < 60 * 5 && boss.state === 'stunned'; f++) {
    if (f === 20) {
      p.x = boss.bx - 40 - p.w;
      p.y = boss.floorY - p.h - 1;
      p.facing = 1;
      out.onHerBack = { reaches: boss.overlaps(p.swordRect()) ? boss.struck : null };
    }
    h.tick();
    p.hp = p.maxHp;
    down++;
  }
  out.grip = { blows, poise: boss.poiseMax, fell, landed, seconds: +(down / 60).toFixed(2) };

  // The thread parts.
  backUp();
  hang(30, onFloor(h.arena.left + 60));
  let cuts = 0;
  const thread = boss.threadRect();
  while (thread && cuts < 12 && boss.state !== 'fall') {
    boss.overlaps(thread);
    boss.hurt(1, 1, g);
    cuts++;
  }
  out.thread = { cuts, fell: boss.state === 'fall' };
  for (let f = 0; f < 60 * 2 && boss.state === 'fall'; f++) h.tick();
  out.thread.landed = boss.state === 'stunned';

  // A parried drop puts her on her back.
  backUp();
  hang(30, onFloor(mid));
  boss.poiseLock = 0;
  boss.state = 'dropWind';
  boss.timer = 0.7;
  let pressed = false;
  let lost = 0;
  for (let f = 0; f < 120 && boss.state !== 'stunned' && boss.state !== 'grounded'; f++) {
    // He stands in the mark while it follows him, then a step off its middle,
    // facing her.
    const aside = boss.state === 'drop' || boss.timer <= 0.24;
    p.x = mid + (aside ? 20 : 0) - p.w / 2;
    p.vx = 0;
    p.facing = -1;
    const a = {};
    if (!pressed && boss.state === 'drop' && boss.floorY - 30 - boss.by < 100) {
      a.parry = true;
      pressed = true;
    }
    const hpb = p.hp;
    h.tick(a);
    lost += Math.max(0, hpb - p.hp);
    p.hp = p.maxHp;
  }
  out.parriedDrop = { state: boss.state, lost };

  // Her silk: it binds and does not wound, it slows, and a swing cuts it.
  for (let f = 0; f < 60 * 4 && boss.state !== 'climb' && boss.state !== 'hang'; f++) h.tick();
  backUp();
  hang(30, onFloor(mid));
  p.sticky = 0;
  boss.state = 'webWind';
  boss.timer = 0.05;
  let bound = 0;
  let wounded = 0;
  for (let f = 0; f < 70; f++) {
    if (boss.state === 'hang') boss.timer = 99;
    onFloor(mid)();
    p.invuln = 0;
    const hpb = p.hp;
    h.tick();
    wounded += Math.max(0, hpb - p.hp);
    p.hp = p.maxHp;
    bound = Math.max(bound, p.sticky);
  }
  const patches = boss.patches.length;
  const run = (sticky) => {
    onFloor(h.arena.left + 120)();
    for (let f = 0; f < 30; f++) {
      if (boss.state === 'hang') boss.timer = 99;
      boss.patches.length = 0;
      p.sticky = sticky;
      h.tick({ right: true });
    }
    return p.cx - (h.arena.left + 120);
  };
  const slow = run(1);
  const free = run(0);
  // And a patch cut by a swing.
  hang(5, onFloor(mid));
  boss.patches.push({ x: mid + 30, life: 4 });
  const patchesBefore = boss.patches.length;
  for (let f = 0; f < 20; f++) {
    if (boss.state === 'hang') boss.timer = 99;
    onFloor(mid)();
    p.facing = 1;
    h.tick({ attack: f < 2 });
  }
  out.silk = {
    bound: +bound.toFixed(2),
    wounded,
    patches,
    slowRun: Math.round(slow),
    freeRun: Math.round(free),
    cut: boss.patches.length < patchesBefore,
  };

  // The end.
  boss.beginDying(g);
  out.end = h.end('seidenmantel');
  return out;
});

/* ------------------------------------------------------------------- Umbra */

// What it is made of: the hero himself, relics and all.
await stage('shadow', ['herzkern', 'glutklinge', 'seidenmantel']);
results.shadowMirror = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Umbra' };
  const b = boss.body;
  const out = {
    relics: [...p.relics],
    carried: [...p.relics].every((r) => b.relics.has(r)),
    maxHp: boss.maxHp,
    perHeart: 5 * p.maxHp,
    silkUp: boss.shieldUp,
  };
  // The first blow tears its silk, whole, and the next one is felt.
  const before = boss.hp;
  b.parryTimer = 0;
  b.dashTimer = 0;
  boss.overlaps(b.rect);
  boss.hurt(1, 1, g);
  out.silkTook = before - boss.hp;
  out.silkAfter = boss.shieldUp;
  b.parryTimer = 0;
  b.dashTimer = 0;
  boss.hurt(1, 1, g);
  out.thenTook = before - boss.hp;
  return out;
});

await stage('shadow');
results.shadow = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Umbra' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, frame: h.measure(15) };
  const b = boss.body;

  const seen = new Set();
  const windups = [];
  const fades = [];
  let windAt = -1;
  let fadeAt = -1;
  let lastPlan = boss.plan;
  let lastState = boss.state;
  // Every blow it turns aside, counted where it turns it: its riposte comes
  // out of the same frame, so the plan never shows between two ticks.
  let turned = 0;
  const turnAside = boss.turnAside.bind(boss);
  boss.turnAside = (...args) => {
    turned++;
    return turnAside(...args);
  };
  const watch = () => {
    seen.add(boss.state);
    if (boss.plan !== lastPlan) {
      if (boss.plan === 'windup') windAt = g.time;
      if (lastPlan === 'windup' && boss.plan === 'combo' && windAt >= 0) windups.push(+(g.time - windAt).toFixed(2));
      lastPlan = boss.plan;
    }
    if (boss.state !== lastState) {
      if (boss.state === 'fade') fadeAt = g.time;
      if (lastState === 'fade' && fadeAt >= 0) fades.push(+(g.time - fadeAt).toFixed(2));
      lastState = boss.state;
    }
  };
  /**
   * Back to the start of the duel: full health, first half, both of them in
   * the middle of the floor a little way apart. Placing him beside it wherever
   * it stood once put him on the far side of the ward, with it pinning him
   * there for the rest of the run.
   */
  const mid = (h.arena.left + h.arena.right) / 2;
  const reset = () => {
    boss.hp = boss.maxHp;
    boss.phaseTwo = false;
    boss.poise = boss.poiseMax;
    boss.poiseLock = 0;
    boss.state = 'duel';
    b.beamTier = p.beamTier;
    boss.setPlan('stalk', 0.4);
    b.x = mid + 65 - b.w / 2;
    b.y = boss.floorY - b.h;
    b.vx = 0;
    b.vy = 0;
    p.x = mid - 65 - p.w / 2;
    p.y = boss.floorY - p.h;
    p.vx = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.invuln = 0;
  };

  let jumpHold = 0;
  const duel = (seconds, style) => {
    h.hits = 0;
    let dealt = 0;
    let killedAt = -1;
    for (let f = 0; f < 60 * seconds; f++) {
      if (boss.state === 'dying' || boss.dead) {
        killedAt = +(f / 60).toFixed(1);
        break;
      }
      const a = {};
      const dx = b.cx - p.cx;
      const dist = Math.abs(dx);
      const toward = dx > 0 ? 'right' : 'left';
      const away = dx > 0 ? 'left' : 'right';
      const swingAt = (reach, every) => {
        if (dist > reach) a[toward] = true;
        else {
          p.facing = dx > 0 ? 1 : -1;
          a.attack = f % every < 2;
        }
      };
      if (style === 'mash') {
        swingAt(36, 4);
      } else if (style === 'read') {
        // Its blade has started to move, or a crescent of its is about to
        // arrive: the parry, facing it. Its follow-through and its reel are
        // the windows; its wind-up is a cue to stand and wait for the blade.
        const open = boss.plan === 'recover' || boss.state === 'reel';
        const crescent = g.projectiles.some((q) => !q.friendly && !q.dead && Math.abs(q.cx - p.cx) < 46 && Math.abs(q.cy - p.cy) < 30);
        if ((b.attackTimer > 0.22 && dist < 90) || crescent) {
          if (p.parryTimer <= 0) {
            p.facing = dx > 0 ? 1 : -1;
            a.parry = true;
          }
        } else if (open) swingAt(36, 8);
        else if (boss.plan === 'windup' || boss.plan === 'combo') p.facing = dx > 0 ? 1 : -1;
        else if (b.chargeReady || boss.plan === 'leap') {
          if (dist < 110) a[away] = true;
        } else if (dist < 90) a[away] = true;
        else if (dist > 150) a[toward] = true;
        for (const q of g.projectiles) {
          if (q.friendly || q.dead) continue;
          if (Math.abs(q.cx - p.cx) < 80 && Math.abs(q.cy - p.cy) < 40 && Math.sign(q.vx) === Math.sign(p.cx - q.cx)) jumpHold = 14;
        }
        if (jumpHold > 0) {
          a.jump = true;
          jumpHold--;
        }
      }
      const before = boss.hp;
      h.tick(a);
      dealt += Math.max(0, before - boss.hp);
      h.watchHp();
      watch();
    }
    return { hits: h.hits, dealt, killedAt };
  };

  reset();
  turned = 0;
  out.masher = duel(30, 'mash');
  out.masher.turned = turned;
  out.masher.hearts = p.maxHp;
  // In its second half, left alone: the step through the dark.
  reset();
  boss.phaseTwo = true;
  duel(20, 'stand');
  out.moves = [...seen].sort();
  reset();
  h.why = {};
  out.reader = duel(150, 'read');
  out.readerHitDuring = { ...h.why };
  out.windupMin = windups.length ? Math.min(...windups) : null;
  out.fadeMin = fades.length ? Math.min(...fades) : null;
  out.fades = fades.length;

  // The end - the reader's, or a forced one if he did not get there.
  if (boss.state !== 'dying' && !boss.dead) boss.beginDying(g);
  out.end = h.end('zweiteratem');
  return out;
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

const c = results.colossus;
const w = results.wyrm;
const v = results.vesper;
const m = results.mimic;
const s = results.spider;
const u = results.shadow;
const um = results.shadowMirror;
const has = (list, ...names) => names.every((n) => list?.includes(n));
const ends = (e, name) => e.felled && e.healed && e.cleared && e.banner.includes(name) && e.spoke && e.relic;
const checks = [
  ['Gierschlund wakes and its vault closes', m.engaged && m.sealed],
  ['Gierschlund costs less than a frame to fight', m.frame.p99 < 16.67],
  [
    'Gierschlund bites, snaps, spits gold, lashes its tongue, and breathes in in its second half',
    has(m.moves, 'biteWind', 'bite', 'snapWind', 'snap', 'spitWind', 'tongueWind', 'tongue', 'gulpWind', 'gulp', 'gape'),
  ],
  [
    'Gierschlund announces its bite for 0.6 s, everything else for half a second - its snap, for a hero hugging it, for 0.4',
    m.winds.biteWind >= 0.6 && m.winds.spitWind >= 0.5 && m.winds.tongueWind >= 0.5 && m.winds.gulpWind >= 0.5 && m.winds.snapWind >= 0.4,
  ],
  ['Gierschlund: reading it costs less than half of standing still', m.hitsStanding >= 4 && m.hitsDodging * 2 <= m.hitsStanding],
  ['Gierschlund: shut it is a strongbox, open it is a mouth', m.shellTakes === 0 && m.mouthTakes === 1],
  ['Gierschlund: a parried bite jams the lid open, for two seconds', m.parriedBite.jammed && m.parriedBite.lost === 0 && m.parriedBite.seconds >= 2],
  [
    'Gierschlund: its gold lies where it lands and hurts nobody there, and batted back it opens the chest and finds the mouth',
    m.gold.lying >= 3 && m.gold.lyingHurt === 0 && m.gold.batted >= 1 && m.gold.opened && m.gold.took >= 2,
  ],
  [
    'Gierschlund: its breath drags a hero who stands in it to the mouth, and one who runs gets out',
    m.gulpStanding.start - m.gulpStanding.closest >= 60 && m.gulpStanding.bitten > 0 && m.gulpRunning.bitten === 0,
  ],
  ['Gierschlund falls, heals the hero, opens the wards, and leaves the Goldzahn', ends(m.end, 'GIERSCHLUND')],
  ['Ankhor wakes and his court closes', c.engaged && c.sealed],
  ['Ankhor costs less than a frame to fight', c.frame.p99 < 16.67],
  ['Ankhor slams, sweeps and calls the sun', has(c.moves, 'hand:drop', 'hand:sweep', 'beam:burn')],
  [
    'Ankhor announces every move for half a second',
    c.winds.slams.length > 0 && c.winds.slamMin >= 0.5 && c.winds.sweepMin >= 0.5 && c.winds.beamMin >= 0.5,
  ],
  ['Ankhor: reading him costs less than half of standing still', c.hitsStanding >= 4 && c.hitsDodging * 2 <= c.hitsStanding],
  ['Ankhor brings both fists in his second half', c.doubleFists],
  ['Ankhor: the face takes double, a fist single', c.headTakes === 2 && c.handTakes === 1],
  ['Ankhor sags when a fist breaks, head at sword height', c.shatter.broken && c.shatter.slumped && c.shatter.swordReaches],
  ['Ankhor reforms the fist and stands up again', c.shatter.reformed && c.shatter.upAgain],
  ['Ankhor falls, heals the hero, opens the wards, and leaves the Bebenfaust', ends(c.end, 'ANKHOR')],
  ['Arachna wakes and her chamber closes', s.engaged && s.sealed],
  ['Arachna costs less than a frame to fight', s.frame.p99 < 16.67],
  [
    'Arachna drops, spits silk, lays eggs, and swings across in her second half',
    has(s.moves, 'dropWind', 'drop', 'grounded', 'climb', 'webWind', 'broodWind', 'swingWind', 'swing'),
  ],
  [
    'Arachna announces every move for half a second, her drop for 0.6, and her mark holds still before she lets go',
    s.winds.dropWind >= 0.6 && s.winds.webWind >= 0.5 && s.winds.broodWind >= 0.5 && s.winds.swingWind >= 0.6 && s.markHeld >= 0.2,
  ],
  [
    'Arachna: reading her costs less than half of standing still, in her second half too',
    s.hitsStanding >= 4 && s.hitsDodging * 2 <= s.hitsStanding && s.hitsDodgingPhase2 * 2 <= s.hitsStanding,
  ],
  ['Arachna never has more than four young and eggs out', s.maxBrood <= 4],
  ['Arachna swings low enough to need jumping, not crawling under', s.swingLow && s.swingLow.bottom < 20 && s.swingLow.top <= 70],
  ['Arachna is out of reach from the floor and in reach from the high ledges', !s.fromFloor.reaches && s.fromLedge.reaches === 'body'],
  [
    'Arachna: hit up there she loses her grip and lies on her back, in reach, for two seconds',
    s.grip.fell && s.grip.landed && s.grip.blows <= s.grip.poise && s.onHerBack?.reaches === 'body' && s.grip.seconds >= 2,
  ],
  ['Arachna: four cuts part her thread', s.thread.fell && s.thread.cuts === 4 && s.thread.landed],
  ['Arachna: a parried drop puts her on her back', s.parriedDrop.state === 'stunned' && s.parriedDrop.lost === 0],
  [
    'Arachna: her silk binds and does not wound, it slows, and a swing cuts it',
    s.silk.bound > 1 && s.silk.wounded === 0 && s.silk.patches > 0 && s.silk.slowRun < s.silk.freeRun * 0.75 && s.silk.cut,
  ],
  ['Arachna falls, heals the hero, opens the wards, and leaves the Seidenmantel', ends(s.end, 'ARACHNA')],
  ['Ignivor wakes and his chamber closes', w.engaged && w.sealed],
  ['Ignivor costs less than a frame to fight', w.frame.p99 < 16.67],
  ['Ignivor hunts, breaches, sticks, spits and burns the floor', has(w.moves, 'hunt', 'breach', 'stuck', 'spitWind', 'exposed', 'wave')],
  ['Ignivor holds still under the hero before he breaks through', w.breaches > 0 && w.lockMin >= 0.3],
  ['Ignivor: reading him costs less than half of standing still', w.hitsStanding >= 4 && w.hitsDodging * 2 <= w.hitsStanding],
  [
    'Ignivor: after a breach his head lies stuck on the floor for over a second',
    w.stuck.length > 0 && w.stuck.every((q) => q.t >= 1.1 && q.height < 40),
  ],
  ['Ignivor: his spit lands on the hero and beyond him, never between him and the head', w.spits.length > 0 && w.spits.every((q) => q.between === 0)],
  ['Ignivor: from the floor a sword finds his head, stuck or hanging after a spit', w.reachStuck.hit && w.reachExposed.hit],
  ['Ignivor: the fire wave hurts on the floor and not on a ledge', w.waveOnFloor > 0 && w.waveOnLedge === 0],
  ['Ignivor: plates are armour, the head is not', w.bodyTakes === 0 && w.headTakes === 1],
  ['Ignivor comes down stunned with his head on the floor, for two seconds', w.knockedDown && w.headOnFloor < 50 && w.stunSeconds >= 2],
  ['Ignivor falls, heals the hero, opens the wards, and leaves the Glutklinge', ends(w.end, 'IGNIVOR')],
  ['Vesperon wakes and his roof closes', v.engaged && v.sealed],
  ['Vesperon costs less than a frame to fight', v.frame.p99 < 16.67],
  ['Vesperon dives, throws, calls bats and the blood moon', has(v.moves, 'diveWind', 'dive', 'grounded', 'slashWind', 'swarmWind', 'moon')],
  ['Vesperon marks every dive for half a second', v.dives > 0 && v.diveWindMin >= 0.5],
  ['Vesperon lands in reach after a dive, for a second', v.groundedMax >= 1 && v.groundedOnFloor],
  ['Vesperon: reading him costs less than half of standing still', v.hitsStanding >= 4 && v.hitsDodging * 2 <= v.hitsStanding],
  ['Vesperon never has more than four bats', v.maxBats <= 4],
  ['Vesperon: a parried dive puts him on the roof', (v.parryDive.state === 'stunned' || v.parryDive.state === 'fall') && v.parryDive.onFloor],
  ['Vesperon falls, heals the hero, opens the wards, and leaves the Blutdurst', ends(v.end, 'VESPERON')],
  ['Umbra wakes and the rift closes', u.engaged && u.sealed],
  ['Umbra costs less than a frame to fight', u.frame.p99 < 16.67],
  ['Umbra carries the hero\'s relics, and more health for them than his five a heart', um.carried && um.maxHp > um.perHeart],
  ['Umbra wears his silk too: the first blow tears it, the next one lands', um.silkUp && um.silkTook === 0 && !um.silkAfter && um.thenTook === 1],
  ['Umbra winds its combo up where it can be seen, and shows the pool it steps out of', u.windupMin >= 0.28 && u.fadeMin >= 0.8],
  ['Umbra steps through the dark in its second half', has(u.moves, 'fade')],
  [
    'Umbra turns a masher\'s blows aside and answers them - two lives\' worth of blows before it falls, if it falls',
    u.masher.turned >= 4 && u.masher.hits >= 2 * u.masher.hearts,
  ],
  ['Umbra loses to a hero who parries and waits for its openings', u.reader.killedAt > 0 && u.reader.hits <= 3],
  ['Umbra falls, heals the hero, opens the wards, and leaves the Zweiter Atem', ends(u.end, 'SCHATTEN')],
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
console.log(`OK: all ${checks.length} checks - six arena bosses, every move announced, every rule holding, every one of them finishable, and every one leaving its relic.`);
