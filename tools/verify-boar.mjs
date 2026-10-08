/**
 * Grimmzahn, der Keiler, in his den at the end of the forest - the second boss
 * of the road, and the first whose rule is the room itself:
 *
 *   Lass ihn gegen die Wand laufen. His charge only ends at a wall, the wall
 *   leaves him dazed, and dazed he takes double. A parried charge stops him
 *   dead. In his second half he now and then shakes a wall off and comes
 *   straight back - but never twice running.
 *
 * Pinned on the same three questions as the arena bosses in verify-bosses.mjs:
 *
 *   1. Does he do everything he is supposed to? Every move shows up, waited
 *      for rather than hoped for, and every warning is measured from the first
 *      frame of its wind-up.
 *   2. Is it fair? A jump clears his charge, nothing hurts that is not moving,
 *      every move leaves him open at sword height for a second and a half, and
 *      a hero who reads him - one who sees him 0.3 s late, as a player does,
 *      swings only from the floor and jumps only to dodge - fells him at a cost
 *      of less than half of what standing still costs.
 *   3. Does his rule hold?
 *
 * And then that he can be finished, and that he leaves his hide and his rock.
 *
 * Usage: node tools/verify-boar.mjs
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

/**
 * A fresh page for each part: nothing one part does leaks into the next. The
 * hero comes in as he does on the road - from Gallert, with seven hearts.
 */
async function stage() {
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => window.loop.stop());
  await page.evaluate(() => {
    const g = window.game;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    g.takeRelic('herzkern');
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
      g.level.spawns.some((s) => s.kind === 'boar' && s.tx * 32 >= a.left && s.tx * 32 < a.right),
    );
    h.mid = (h.arena.left + h.arena.right) / 2;
    h.find = () => g.enemies.find((e) => e.kind === 'boar' && !e.dead);
    /** In through the door and on until he is up out of his wallow and the den is shut. */
    h.wake = () => {
      g.warpTo(h.arena.entryTx + 3);
      for (let f = 0; f < 60 * 8; f++) {
        const boss = h.find();
        if (boss && h.arena.fighting && !['dormant', 'intro'].includes(boss.state)) break;
        g.player.hp = g.player.maxHp;
        h.tick({ right: f < 40 || !boss?.engaged });
      }
      return h.find();
    };
    /** Through whatever is said over his fall, a line at a time. */
    h.readThrough = () => {
      for (let f = 0; f < 60 * 8 && g.dialogue; f++) h.tick({ confirm: f % 2 === 0 });
    };
    /** Felled, with the hero at two hearts: what the fall does, then the relic and its attack. */
    h.end = () => {
      g.player.hp = 2;
      let felled = false;
      for (let f = 0; f < 60 * 4; f++) {
        h.tick();
        if (!h.find()) felled = true;
      }
      const end = { felled, healed: g.player.hp === g.player.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
      end.spoke = !!g.dialogue;
      end.speaker = g.dialogue?.speaker ?? null;
      h.readThrough();
      end.relic = g.player.relics.has('keilerhaut');
      end.skill = g.player.skills.has('felswurf');
      end.wardsOpen = !g.level.wardClosed(h.arena.entryTx) && !g.level.wardClosed(h.arena.exitTx);
      return end;
    };
    /** Holds the hero where he is, alive, and counts what reaches him. */
    h.hits = 0;
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
     * swinging at him. Whole before every frame: a measure, not a fight.
     */
    h.measure = (seconds) => {
      const times = [];
      for (let f = 0; f < 60 * seconds; f++) {
        const boss = h.find();
        if (boss && boss.hp > 0) boss.hp = boss.maxHp;
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
    /** Everything thrown or thrown up off him and still out: his waves, his rocks rising and falling. */
    h.rocks = (boss) => [
      ...boss.lobs.map((l) => ({ cx: l.x, cy: l.y, vx: l.vx, vy: l.vy })),
      ...g.projectiles.filter((q) => q.kind === 'rock' && !q.friendly && !q.dead).map((q) => ({ cx: q.cx, cy: q.cy, vx: q.vx, vy: q.vy })),
    ];
    /**
     * A hero who plays him like a person: he sees the boar 0.3 s late - he
     * acts on what was there eighteen frames ago - swings only with his feet
     * on the floor, and jumps only to get out of the way of something.
     *
     *   - a charge coming at him: he jumps it when it is close; right in front
     *     of a boar about to go, on the rhythm of the scrape. Once a charge:
     *     what he still sees coming after the jump is the boar he has jumped
     *     (jumping it again on landing left him in the air while the boar came
     *     back off the wall, two fights in forty);
     *   - a charge going the other way: after it, to the wall;
     *   - the stomp: standing in the boar, up on the rhythm of the rear; close
     *     by, up as he comes down; further off, over the ridge as it comes;
     *   - the dig: he walks in towards the boar - the rock comes down where he
     *     stood - and steps off the spot any rock he sees is coming down on;
     *   - dazed, panting or stumbling: in to a sword's length, and swing;
     *   - otherwise: up to the edge of where the boar likes to keep him.
     */
    h.reader = (delay = 18) => {
      const seen = [];
      let jumpHold = 0;
      let jumpedRun = -1;
      let n = 0;
      let runs = 0;
      let wasRunning = false;
      return () => {
        const boss = h.find();
        const p = g.player;
        n++;
        if (!boss) return {};
        // Which run of his this is: a scrape or a turn and the charge after it.
        const running = boss.state === 'scrape' || boss.state === 'turn' || boss.state === 'charge';
        if (running && !wasRunning) runs++;
        if (boss.state === 'turn' && seen.length && seen[seen.length - 1].state === 'charge') runs++;
        wasRunning = running;
        seen.push({
          run: runs,
          state: boss.state,
          timer: boss.timer,
          x: boss.x,
          w: boss.w,
          cx: boss.cx,
          facing: boss.facing,
          waves: boss.waves.map((w) => ({ x: w.x, dir: w.dir })),
          rocks: h.rocks(boss),
        });
        if (seen.length > delay + 4) seen.shift();
        const v = seen[Math.max(0, seen.length - 1 - delay)];
        const a = {};
        const dx = v.cx - p.cx;
        const toward = dx > 0 ? 'right' : 'left';
        const away = dx > 0 ? 'left' : 'right';
        // From the front of the hero to the near side of the boar.
        const edge = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
        const s = v.state;
        const coming = Math.sign(v.facing) === Math.sign(p.cx - v.cx);
        const floor = p.onGround;
        const swing = () => {
          if (edge < 34 && floor && n % 8 < 2) a.attack = true;
        };
        if (s === 'dazed' || s === 'recover' || s === 'stagger') {
          if (edge > 22) a[toward] = true;
          else if (edge < -30) a[away] = true;
          else if (Math.sign(dx) !== p.facing) a[toward] = true;
          swing();
        } else if (s === 'scrape' || s === 'turn' || s === 'charge') {
          // One jump to a charge: what he saw a moment ago is the boar he has
          // already jumped, not a second one.
          if (coming && floor && jumpHold === 0 && v.run !== jumpedRun) {
            if (s === 'charge' && edge < 175) jumpHold = 18;
            else if (s !== 'charge' && edge < 90 && v.timer < 0.45) jumpHold = 18;
            if (jumpHold) jumpedRun = v.run;
          }
          if (!coming && s !== 'turn') a[toward] = true;
        } else if (s === 'rear') {
          // Up on his hind legs: the ridges start under him. Standing in him,
          // up on the rhythm of the rear; close by, up as he comes down;
          // further off, over the ridge as it comes.
          if (Math.abs(dx) > 200) a[toward] = true;
          if (floor && jumpHold === 0 && Math.abs(dx) < 60 && v.timer < 0.42) jumpHold = 18;
          else if (floor && jumpHold === 0 && Math.abs(dx) < 150 && v.timer < 0.3) jumpHold = 18;
        } else if (s === 'dig') {
          if (edge > 24) a[toward] = true;
        } else {
          if (edge > 110) a[toward] = true;
          else if (edge < 60 && edge > 0) a[away] = true;
          if (edge < 30) {
            if (Math.sign(dx) !== p.facing) a[toward] = true;
            swing();
          }
        }
        for (const w of v.waves) {
          const toMe = Math.sign(p.cx - w.x) === w.dir;
          if (toMe && Math.abs(p.cx - w.x) < 175 && floor && jumpHold === 0) jumpHold = 18;
        }
        for (const q of v.rocks) {
          // Where it comes down to his height, as the eye judges an arc.
          const drop = p.cy - q.cy;
          const t = (-q.vy + Math.sqrt(Math.max(0, q.vy * q.vy + 1800 * drop))) / 900;
          const land = q.cx + q.vx * t;
          if (Math.abs(land - p.cx) < 34) {
            a.left = false;
            a.right = false;
            a[land > p.cx ? 'left' : 'right'] = true;
          }
        }
        if (jumpHold > 0) {
          a.jump = true;
          jumpHold--;
        }
        return a;
      };
    };
    /** Nothing of his left flying, the hero whole and on the floor at x. */
    h.clear = (boss) => {
      g.projectiles.length = 0;
      boss.waves.length = 0;
      boss.lobs.length = 0;
      const p = g.player;
      p.hp = p.maxHp;
      p.invuln = 0;
      p.vx = 0;
    };
    /** Boar and hero held where a test wants them for a moment, the boar trotting on the spot. */
    h.place = (boss, boarX, heroX, frames = 20) => {
      const p = g.player;
      for (let f = 0; f < frames; f++) {
        boss.state = 'trot';
        boss.timer = 99;
        boss.x = boarX - boss.w / 2;
        boss.vx = 0;
        boss.keep = 9999;
        p.x = heroX - p.w / 2;
        p.vx = 0;
        h.tick();
        h.clear(boss);
      }
      boss.x = boarX - boss.w / 2;
      boss.vx = 0;
      p.x = heroX - p.w / 2;
      p.vx = 0;
    };
    window.__h = h;
  });
}

const results = {};

/* ----------------------------------------------- awake, his moves, his tells */

await stage();
results.main = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Grimmzahn' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, hearts: p.maxHp, maxHp: boss.maxHp, barName: boss.barName() };
  out.frame = h.measure(15);

  /*
   * 1. Every move, from the first frame of its wind-up, with a hero who reads
   * him. He is kept whole in his first half until everything has been seen
   * there, then held below half until his second half has shown its own.
   */
  const seen = new Set();
  const winds = { scrape: [], turn: [], rear: [], dig: [] };
  const windows = { stomp: [], toss: [], daze: [], stagger: [] };
  const crashes = [];
  let windStart = null;
  let windowStart = null;
  let prev = boss.state;
  const watch = () => {
    const s = boss.state;
    seen.add(s);
    if (s !== prev) {
      // A wind-up that is ending: how long it ran, if it was seen from its start.
      if (windStart && windStart.state === prev) {
        const t = +(g.time - windStart.at).toFixed(3);
        if ((prev === 'scrape' || prev === 'turn') && s === 'charge') winds[prev].push(t);
        if (prev === 'rear' && s === 'recover') {
          winds.rear.push(t);
          seen.add('slam');
        }
        if (prev === 'dig' && s === 'recover') {
          winds.dig.push(t);
          seen.add('toss');
        }
      }
      windStart = ['scrape', 'turn', 'rear', 'dig'].includes(s) ? { state: s, at: g.time } : null;
      // A window that is ending: how long it stayed open.
      if (windowStart && windowStart.state === prev) {
        windows[windowStart.kind].push(+(g.time - windowStart.at).toFixed(3));
        seen.add(`window:${windowStart.kind}`);
      }
      windowStart = null;
      if (s === 'recover') windowStart = { state: s, kind: prev === 'rear' ? 'stomp' : 'toss', at: g.time };
      if (s === 'dazed') windowStart = { state: s, kind: 'daze', at: g.time };
      if (s === 'stagger') windowStart = { state: s, kind: 'stagger', at: g.time };
      if (prev === 'charge') crashes.push({ to: s, phase2: boss.phaseTwo });
      prev = s;
    }
    if (boss.waves.length) seen.add('waves');
    if (boss.lobs.length) seen.add('rock');
  };
  const reader = h.reader();
  const phase1 = ['trot', 'scrape', 'charge', 'dazed', 'rear', 'slam', 'waves', 'dig', 'toss', 'rock', 'recover', 'window:stomp', 'window:toss', 'window:daze'];
  let f = 0;
  h.hits = 0;
  for (; f < 60 * 150 && !phase1.every((m) => seen.has(m)); f++) {
    boss.hp = boss.maxHp;
    h.tick(reader());
    h.watchHp();
    watch();
  }
  out.phase1Seconds = +(f / 60).toFixed(1);
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  for (f = 0; f < 60 * 150 && !(seen.has('turn') && winds.turn.length > 0); f++) {
    // Below half, and never so low that one blow - six, at most, dazed - fells him.
    boss.hp = Math.min(boss.hp, Math.floor(boss.maxHp * 0.45));
    if (boss.hp < 10) boss.hp = Math.floor(boss.maxHp * 0.45);
    h.tick(reader());
    h.watchHp();
    watch();
  }
  out.phase2Seconds = +(f / 60).toFixed(1);
  out.readerHits = h.hits;
  out.moves = [...seen].sort();
  out.winds = Object.fromEntries(Object.entries(winds).map(([k, v]) => [k, { n: v.length, min: v.length ? Math.min(...v) : null }]));
  out.windows = Object.fromEntries(Object.entries(windows).map(([k, v]) => [k, { n: v.length, min: v.length ? Math.min(...v) : null }]));
  out.crashes = crashes;

  // Back to his first half for the rest.
  boss.phaseTwo = false;
  boss.hp = boss.maxHp;
  boss.poiseLock = 999;
  const left = h.arena.left;
  const right = h.arena.right;
  const floor = boss.bottom;

  /*
   * 2. Nothing that stands still hurts: a hero standing in him while he
   * trots, scrapes, rears, digs, stands dazed or pants takes nothing.
   */
  out.contact = {};
  for (const st of ['trot', 'scrape', 'rear', 'dig', 'dazed', 'recover']) {
    h.place(boss, h.mid, h.mid);
    let lost = 0;
    for (let k = 0; k < 60; k++) {
      boss.state = st;
      boss.timer = 99;
      boss.vx = st === 'trot' ? 60 : 0;
      p.x = boss.cx - p.w / 2;
      p.vx = 0;
      const before = p.hp;
      h.tick();
      lost += Math.max(0, before - p.hp);
      h.clear(boss);
    }
    out.contact[st] = lost;
  }

  /*
   * 3. The charge: a hero who jumps it at the right moment takes nothing, one
   * who stands takes two. The moment is tried at a spread of distances - the
   * gap between his tusks and the hero when the jump goes - to show how wide
   * it is.
   */
  out.chargeBox = boss.chargeRect().h;
  const charge = (jumpAt, parryAt) => {
    h.place(boss, h.mid + 180, h.mid - 140);
    p.facing = 1;
    boss.beginScrape(g);
    let lost = 0;
    let jumped = false;
    let parried = false;
    let hold = 0;
    let over = 0;
    for (let k = 0; k < 60 * 4; k++) {
      const a = {};
      const gap = boss.x - (p.x + p.w);
      if (boss.state === 'charge' && jumpAt !== null && !jumped && gap < jumpAt) {
        jumped = true;
        hold = 18;
      }
      if (boss.state === 'charge' && parryAt !== null && !parried && gap < parryAt) {
        parried = true;
        a.parry = true;
      }
      if (hold > 0) {
        a.jump = true;
        hold--;
      }
      // How high his feet were when the tusks went under them.
      if (boss.state === 'charge' && boss.x < p.x + p.w && boss.x + boss.w > p.x) over = Math.max(over, Math.round(boss.bottom - p.bottom));
      const before = p.hp;
      h.tick(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
      if (boss.state !== 'charge' && boss.state !== 'scrape') break;
    }
    const result = { lost, state: boss.state, timer: +boss.timer.toFixed(2), over };
    h.clear(boss);
    return result;
  };
  out.jumps = {};
  for (const at of [20, 40, 70, 100, 130, 160, 190, 230]) out.jumps[at] = charge(at, null).lost;
  out.standInCharge = charge(null, null).lost;

  // 4. A parried charge stops dead, dazed - and the guard takes nothing.
  const parry = charge(null, 30);
  let parryDaze = 0;
  for (let k = 0; k < 60 * 4 && boss.state === 'dazed'; k++) {
    h.tick();
    h.clear(boss);
    parryDaze++;
  }
  out.parry = { lost: parry.lost, state: parry.state, seconds: +(parryDaze / 60 + (2.6 - parry.timer)).toFixed(2) };

  /*
   * 5. The rule. Out of his way up on the plank by the far wall, the hero
   * watches him run into it: dazed, against the wall, and saying so - and a
   * blow on him now does double what it does once he is up again.
   */
  h.place(boss, h.mid - 100, h.mid);
  boss.hp = boss.maxHp;
  boss.phaseTwo = false;
  boss.facing = 1;
  boss.state = 'scrape';
  boss.timer = 0.75;
  const plank = { x: right - 200, y: floor - 96 };
  let k = 0;
  for (; k < 60 * 4 && (boss.state === 'scrape' || boss.state === 'charge'); k++) {
    p.x = plank.x - p.w / 2;
    p.y = plank.y - p.h - 0.5;
    p.vy = 0;
    p.vx = 0;
    h.tick();
    h.watchHp();
  }
  out.wall = {
    state: boss.state,
    atWall: Math.abs(boss.x + boss.w - right) < 1.5,
    said: g.particles.texts.some((t) => t.text === 'BENOMMEN!'),
  };
  let before = boss.hp;
  boss.overlaps(boss.rect);
  boss.hurt(1, -1, g);
  out.wall.dazedTakes = before - boss.hp;
  let dazed = 0;
  for (k = 0; k < 60 * 5 && boss.state === 'dazed'; k++) {
    h.tick();
    h.clear(boss);
    dazed++;
  }
  out.wall.seconds = +(dazed / 60).toFixed(2);
  boss.state = 'trot';
  boss.timer = 99;
  boss.poiseLock = 999;
  before = boss.hp;
  boss.overlaps(boss.rect);
  boss.hurt(1, -1, g);
  out.wall.upTakes = before - boss.hp;

  /*
   * 6. His windows are at sword height: a hero standing on the floor beside
   * him, on either side, reaches him with an ordinary swing.
   */
  out.reach = {};
  for (const st of ['recover', 'dazed']) {
    for (const side of [-1, 1]) {
      h.place(boss, h.mid, h.mid);
      boss.state = st;
      boss.timer = 99;
      boss.facing = 1;
      p.facing = side > 0 ? -1 : 1;
      p.x = side > 0 ? boss.x + boss.w + 14 : boss.x - 14 - p.w;
      p.y = floor - p.h - 0.5;
      out.reach[`${st}${side > 0 ? 'R' : 'L'}`] = boss.overlaps(p.swordRect());
    }
  }

  /*
   * 7. The rock: up, it is still his and harmless; it comes down where the
   * hero stood when it was thrown. One who stays there is hit, one who walks
   * on towards him is not, and a swing as it comes down bats it away.
   */
  const rock = (mode) => {
    h.place(boss, h.mid + 150, h.mid - 110);
    boss.facing = -1;
    boss.state = 'dig';
    boss.timer = 0.6;
    let lost = 0;
    let batted = false;
    let rose = 0;
    for (let k = 0; k < 60 * 3; k++) {
      const a = {};
      const falling = g.projectiles.find((q) => q.kind === 'rock' && !q.friendly && !q.dead);
      if (boss.lobs.length) rose++;
      if (mode === 'walk' && boss.state !== 'dig') a.right = p.x + p.w < boss.x - 24;
      if (mode === 'bat' && falling && falling.cy > p.y - 40 && Math.abs(falling.cx - p.cx) < 60) a.attack = true;
      p.facing = 1;
      const before = p.hp;
      h.tick(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
      if (g.projectiles.some((q) => q.kind === 'rock' && q.friendly)) batted = true;
      if (boss.state === 'trot' && !boss.lobs.length && !g.projectiles.some((q) => q.kind === 'rock')) break;
    }
    h.clear(boss);
    return { lost, batted, rose };
  };
  out.rock = { stand: rock('stand'), walk: rock('walk'), bat: rock('bat') };

  /*
   * 8. The stomp: two ridges of earth along the floor, one each way. A hero
   * who jumps the one coming at him takes nothing, one who stands takes one,
   * and one up on a plank is out of their way.
   */
  // Next to the low plank by the door, so the ridge running that way passes under it.
  const lowPlank = { x: left + 150, y: floor - 96 };
  const stomp = (mode) => {
    h.place(boss, left + 300, lowPlank.x);
    boss.facing = -1;
    boss.state = 'rear';
    boss.timer = 0.6;
    let lost = 0;
    let hold = 0;
    let waves = 0;
    for (let k = 0; k < 60 * 2.5; k++) {
      const a = {};
      waves = Math.max(waves, boss.waves.length);
      if (mode === 'plank') {
        p.x = lowPlank.x - p.w / 2;
        p.y = lowPlank.y - p.h - 0.5;
        p.vy = 0;
      }
      const near = boss.waves.find((w) => w.dir < 0 && w.x - p.cx < 70 && w.x > p.cx);
      if (mode === 'jump' && near && hold === 0 && p.onGround) hold = 18;
      if (hold > 0) {
        a.jump = true;
        hold--;
      }
      const before = p.hp;
      h.tick(a);
      lost += Math.max(0, before - p.hp);
      p.hp = p.maxHp;
    }
    h.clear(boss);
    return { lost, waves };
  };
  out.stomp = { stand: stomp('stand'), jump: stomp('jump'), plank: stomp('plank') };
  return out;
});

/* ------------------------------------------- his second half: off the wall */

await stage();
results.bounce = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Grimmzahn' };
  boss.hp = Math.floor(boss.maxHp * 0.45);
  boss.phaseTwo = true;
  boss.poiseLock = 999;
  // The hero up on the high plank in the middle, out of the way of all of it.
  const L = g.level;
  let best = null;
  for (let tx = Math.floor(h.arena.left / 32); tx < Math.floor(h.arena.right / 32); tx++) {
    for (let ty = 2; ty < 17; ty++) {
      if (L.platformAt(tx, ty) && (!best || ty < best.ty)) best = { tx, ty };
    }
  }
  const hold = () => {
    p.x = best.tx * 32 + 16 - p.w / 2;
    p.y = best.ty * 32 - p.h - 0.5;
    p.vx = 0;
    p.vy = 0;
  };
  /**
   * Charges, one after another, each across the den towards the farther wall,
   * until he has come straight back off a wall at least twice. What each
   * charge ended in, in order.
   */
  const outcomes = [];
  const turns = [];
  let turnAt = -1;
  let prev = boss.state;
  for (let f = 0; f < 60 * 240 && (outcomes.filter((o) => o === 'turn').length < 2 || outcomes.length < 8); f++) {
    hold();
    if (boss.state === 'trot' || boss.state === 'recover' || boss.state === 'dig' || boss.state === 'rear') {
      g.projectiles.length = 0;
      boss.lobs.length = 0;
      boss.facing = boss.cx < h.mid ? 1 : -1;
      boss.state = 'scrape';
      boss.timer = 0.75;
    }
    h.tick();
    h.watchHp();
    const s = boss.state;
    if (s !== prev) {
      if (prev === 'charge') outcomes.push(s === 'dazed' ? 'daze' : s === 'turn' ? 'turn' : s);
      if (s === 'turn') turnAt = g.time;
      if (prev === 'turn' && s === 'charge' && turnAt >= 0) turns.push(+(g.time - turnAt).toFixed(3));
      prev = s;
    }
    if (s === 'dazed' && boss.timer > 0.2) boss.timer = 0.2;
  }
  let twice = 0;
  for (let i = 1; i < outcomes.length; i++) if (outcomes[i] === 'turn' && outcomes[i - 1] === 'turn') twice++;
  return { outcomes, turnTells: turns, turnMin: turns.length ? Math.min(...turns) : null, twiceRunning: twice, hits: h.hits };
});

/* ------------------------------------ a whole fight, as a player reads it */

await stage();
results.reader = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Grimmzahn' };
  const reader = h.reader();
  h.hits = 0;
  h.why = {};
  let f = 0;
  let open = 0;
  for (; f < 60 * 120; f++) {
    if (boss.dead || boss.state === 'dying') break;
    if (['dazed', 'recover', 'stagger'].includes(boss.state)) open++;
    h.tick(reader());
    h.watchHp();
  }
  const out = {
    felled: boss.state === 'dying' || boss.dead,
    seconds: +(f / 60).toFixed(1),
    hits: h.hits,
    why: { ...h.why },
    open: +(open / Math.max(1, f)).toFixed(2),
  };
  out.end = h.end();
  return out;
});

/* ---------------------------------------------------- standing still in it */

await stage();
results.standing = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Grimmzahn' };
  const spots = { left: h.arena.left + 120, middle: h.mid, right: h.arena.right - 120 };
  const out = { seconds: 0, hits: 0, at: {} };
  for (const [name, x] of Object.entries(spots)) {
    h.hits = 0;
    for (let f = 0; f < 60 * 20; f++) {
      boss.hp = boss.maxHp;
      p.x = x - p.w / 2;
      p.vx = 0;
      h.tick();
      h.watchHp();
    }
    out.at[name] = h.hits;
    out.hits += h.hits;
    out.seconds += 20;
  }
  return out;
});

/* ------------------------------------- felled the way the other tools fell him */

await stage();
results.forced = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  g.warpTo(h.arena.entryTx + 3);
  let boss = null;
  for (let f = 0; f < 60 * 10 && !(boss && boss.engaged); f++) {
    p.hp = p.maxHp;
    boss = h.find();
    h.tick({ right: true });
  }
  if (!boss || !boss.engaged) return { ok: false, note: 'never woke' };
  for (let f = 0; f < 30; f++) h.tick();
  const state = boss.state;
  boss.beginDying(g);
  let spoke = false;
  for (let f = 0; f < 60 * 6 && !g.dialogue; f++) {
    p.hp = p.maxHp;
    h.tick();
  }
  spoke = !!g.dialogue;
  h.readThrough();
  return { from: state, spoke, relic: p.relics.has('keilerhaut'), skill: p.skills.has('felswurf'), cleared: h.arena.cleared };
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

const m = results.main;
const b = results.bounce;
const r = results.reader;
const s = results.standing;
const fz = results.forced;
const has = (list, ...names) => names.every((n) => list?.includes(n));
const readRate = r.hits / Math.max(1, r.seconds);
const standRate = s.hits / Math.max(1, s.seconds);
const jumpsClear = Object.entries(m.jumps ?? {})
  .filter(([, lost]) => lost === 0)
  .map(([at]) => at);
const w = m.winds ?? {};
const win = m.windows ?? {};
const at = (x) => (x == null ? '-' : x);
const turns = b.outcomes?.filter((o) => o === 'turn').length ?? 0;
const checks = [
  ['Grimmzahn wakes and his den closes', m.engaged && m.sealed && m.barName?.startsWith('GRIMMZAHN')],
  [`Grimmzahn costs less than a frame to fight (p99 ${m.frame?.p99} ms)`, m.frame?.p99 < 16.67],
  [
    'Grimmzahn trots, charges into the wall, stomps, throws rocks, and comes straight back off a wall in his second half',
    has(m.moves, 'trot', 'scrape', 'charge', 'dazed', 'rear', 'slam', 'waves', 'dig', 'toss', 'rock', 'recover', 'turn'),
  ],
  [
    'Grimmzahn scrapes 0.6 s before he charges, turns 0.55 s before he comes back, rears and digs half a second ' +
      `(${at(w.scrape?.min)} / ${at(w.turn?.min)} / ${at(w.rear?.min)} / ${at(w.dig?.min)} s)`,
    w.scrape?.n > 0 && w.scrape.min >= 0.6 && w.turn?.n > 0 && w.turn.min >= 0.55 && w.rear?.n > 0 && w.rear.min >= 0.5 && w.dig?.n > 0 && w.dig.min >= 0.5,
  ],
  [
    `Grimmzahn: after a stomp and a rock he stands open for 1.5 s, dazed for 2 (${at(win.stomp?.min)} / ${at(win.toss?.min)} / ${at(win.daze?.min)} s)`,
    win.stomp?.n > 0 && win.stomp.min >= 1.5 && win.toss?.n > 0 && win.toss.min >= 1.5 && win.daze?.n > 0 && win.daze.min >= 2,
  ],
  [
    'Grimmzahn: open, he is at sword height for a hero on the floor, on either side',
    Object.values(m.reach ?? {}).length === 4 && Object.values(m.reach).every(Boolean),
  ],
  [
    'Grimmzahn: nothing hurts that is not moving - standing in him trotting, scraping, rearing, digging, dazed or panting costs nothing',
    Object.values(m.contact ?? {}).length === 6 && Object.values(m.contact).every((v) => v === 0),
  ],
  [
    `Grimmzahn: his charge is ${m.chargeBox} px high; a normal jump clears it, taken ${jumpsClear.join(' / ')} px out, and standing in it costs two`,
    m.chargeBox <= 40 && m.jumps?.[70] === 0 && m.jumps?.[100] === 0 && m.jumps?.[130] === 0 && m.standInCharge === 2,
  ],
  [
    'Grimmzahn: a parried charge stops dead, dazed for 2.5 s, and the guard takes nothing',
    m.parry?.state === 'dazed' && m.parry.lost === 0 && m.parry.seconds >= 2.5,
  ],
  [
    'Grimmzahn: his charge ends at the wall - dazed, BENOMMEN!, for two seconds - and dazed he takes double',
    m.wall?.state === 'dazed' && m.wall.atWall && m.wall.said && m.wall.seconds >= 2 && m.wall.dazedTakes === 2 && m.wall.upTakes === 1,
  ],
  [
    `Grimmzahn: in his second half he comes straight back off a wall (${turns} of ${b.outcomes?.length}), but never twice running`,
    turns >= 2 && b.twiceRunning === 0 && b.outcomes.every((o) => o === 'daze' || o === 'turn') && b.turnMin >= 0.55,
  ],
  [
    'Grimmzahn: his rock is harmless on the way up and comes down where the hero stood - walking on avoids it, a swing bats it away',
    m.rock?.stand.rose > 0 && m.rock.stand.lost === 1 && m.rock.walk.lost === 0 && m.rock.bat.batted && m.rock.bat.lost === 0,
  ],
  [
    'Grimmzahn: his stomp sends a ridge of earth each way - jumped it costs nothing, stood in it one, and it does not reach the planks',
    m.stomp?.stand.waves === 2 && m.stomp.stand.lost === 1 && m.stomp.jump.lost === 0 && m.stomp.plank.lost === 0,
  ],
  [
    `Grimmzahn: a hero who sees him 0.3 s late fells him in ${r.seconds} s for ${r.hits} hearts, open ${Math.round(r.open * 100)} % of the fight`,
    r.felled && r.seconds >= 20 && r.seconds <= 80 && r.hits <= 4 && r.open >= 0.3,
  ],
  [
    'Grimmzahn: reading him costs less than half of standing still ' +
      `(${(readRate * 60).toFixed(1)} against ${(standRate * 60).toFixed(1)} hearts a minute)`,
    s.hits >= 6 && readRate * 2 <= standRate,
  ],
  [
    'Grimmzahn falls, heals the hero, opens the wards, speaks, and leaves the Keilerhaut and the Felswurf',
    r.end?.felled && r.end.healed && r.end.cleared && r.end.wardsOpen && r.end.banner.includes('GRIMMZAHN') && r.end.spoke && r.end.relic && r.end.skill,
  ],
  ['Grimmzahn: beginDying fells him from wherever he is, as the other tools do it', fz.spoke && fz.relic && fz.skill && fz.cleared],
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
  `OK: all ${checks.length} checks - Grimmzahn announces every move, a jump clears his charge, the wall dazes him and dazed he ` +
    `takes double, a hero who reads him fells him in ${r.seconds} s for ${r.hits} hearts, and he leaves the Keilerhaut.`,
);
