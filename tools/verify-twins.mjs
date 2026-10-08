/**
 * Sol und Luna, die Sternzwillinge, on the altar over the drowned stair.
 *
 * Pinned on the same three questions as the other arena bosses (see
 * verify-bosses.mjs):
 *
 *   1. Does the fight do everything it is supposed to? Every move of both
 *      twins shows up, and Finsternis, the one they make together, once they
 *      are in their second half.
 *   2. Is it fair? Every move is announced for at least its minimum, counted
 *      from the first frame of its wind-up, and with a sound; only one twin
 *      attacks at a time; after every attack nothing new starts for a second
 *      and a half; both twins can always be reached by a swing from the floor;
 *      and a hero who reads them takes less than half of what one who stands
 *      still takes. The reader is a bot that plays the way a person does: it
 *      sees the fight 0.3 s late (it acts on what was there 18 frames ago),
 *      swings only from the floor, jumps only to get out of the way of
 *      something, and keeps the twins level so it can finish the second one
 *      inside the seven seconds the call takes.
 *   3. Does the rule hold? "Fällt einer, ruft ihn der andere zurück": felling
 *      one starts the call; seven seconds later the fallen twin stands again
 *      with half its health; felling the caller during the call ends the
 *      fight. A crescent batted back hurts Luna; a parried run or landing
 *      staggers Sol.
 *
 * And they can be finished: they fall, the hero is healed, the wards open,
 * the altar speaks, and the Zwillingsstern and the Mondsichel are his.
 *
 * Usage: node tools/verify-twins.mjs
 *        node tools/verify-twins.mjs bench 10   (only the reading hero, ten
 *        whole fights, and a hero standing still - the tuning numbers)
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

/** What the hero carries by the time the road reaches the altar. */
const RELICS = ['herzkern', 'keilerhaut', 'goldzahn', 'bebenfaust', 'seidenmantel', 'glutklinge'];

/**
 * A fresh page for each part: nothing one part does leaks into the next. The
 * relics are the hero's from the start - the twins size themselves up against
 * them when they wake.
 */
async function stage() {
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => window.loop.stop());
  await page.evaluate((relics) => {
    const g = window.game;
    const input = window.input;
    const ctx = document.querySelector('canvas').getContext('2d');
    for (const id of relics) g.takeRelic(id);
    g.dialogue = null;
    g.player.hp = g.player.maxHp;
    const h = {};
    h.frame = 0;
    // Every sound asked for, by frame: a tell has to be heard as well as seen.
    h.sounds = [];
    const play = window.audio.play.bind(window.audio);
    window.audio.play = (name, pitch) => {
      h.sounds.push({ frame: h.frame, name });
      if (h.sounds.length > 4000) h.sounds.splice(0, 2000);
      return play(name, pitch);
    };
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
      h.frame++;
      g.update(1 / 60, input);
      g.render(ctx);
    };
    h.arena = g.level.arenas.find((a) => g.level.spawns.some((s) => s.kind === 'twins' && s.tx * 32 >= a.left && s.tx * 32 < a.right));
    h.find = () => g.enemies.find((e) => e.kind === 'twins' && !e.dead);
    /** In through the door and on until they are up, apart, and the altar is shut. */
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
    /** Through whatever is said over their fall, a line at a time. */
    h.readThrough = () => {
      for (let f = 0; f < 60 * 8 && g.dialogue; f++) h.tick({ confirm: f % 2 === 0 });
    };
    /** Felled, with the hero at two hearts: what their fall does, then the relic and the attack. */
    h.end = (relic, skill) => {
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
      end.skill = g.player.skills.has(skill);
      return end;
    };
    /** Holds the hero alive and counts what reaches him, by what the twins were doing. */
    h.hits = 0;
    h.why = {};
    h.watchHp = () => {
      const p = g.player;
      if (p.hp < p.maxHp) {
        const lost = p.maxHp - p.hp;
        h.hits += lost;
        const b = h.find();
        const key = b ? `${b.sol.state}/${b.luna.state}` : 'none';
        h.why[key] = (h.why[key] ?? 0) + lost;
        p.hp = p.maxHp;
      }
      p.dead = false;
    };

    /*
     * The fairness watch, frame by frame: which states show up, how long each
     * wind-up runs from its first frame, whether a tell is heard, whether both
     * twins are ever attacking at once, how long it stays quiet after
     * something that can hurt, and whether a swing from the floor reaches both.
     */
    const WINDS = { leapWind: 'leap', dashWind: 'dash', throwWind: 'throw', iceWind: 'iceRest', eclipse: 'eclipseRest' };
    const ATTACK = new Set(['leapWind', 'leap', 'dashWind', 'dash', 'throwWind', 'throw', 'iceWind']);
    const RESTS = new Set(['leapRest', 'dashRest', 'throwRest', 'iceRest', 'eclipseRest']);
    h.obs = {
      seen: new Set(),
      tells: {},
      heard: 0,
      silent: [],
      both: 0,
      windows: [],
      rests: [],
      reach: { frames: 0, misses: 0, lunaHigh: 0 },
      rings: 0,
      batted: 0,
    };
    const prev = { sol: null, luna: null };
    const windAt = { sol: -1, luna: -1 };
    const restAt = { sol: -1, luna: -1 };
    let quietFrom = -1;
    let windowFrame = -1;
    h.watch = () => {
      const boss = h.find();
      if (!boss || boss.state !== 'fight') {
        prev.sol = prev.luna = null;
        return;
      }
      const F = boss.floorY;
      // The last frame before this one in which anything of theirs could
      // hurt: a wind-up's own marks on the floor do not count against it.
      const lastThreat = quietFrom;
      if (boss.threat) quietFrom = h.frame;
      for (const t of [boss.sol, boss.luna]) {
        const s = t.state;
        h.obs.seen.add(s);
        const was = prev[t.who];
        if (was !== null && s !== was) {
          if (WINDS[s] !== undefined) {
            windAt[t.who] = h.frame;
            if (h.sounds.some((q) => q.frame === h.frame && q.name === 'tell')) h.obs.heard++;
            else h.obs.silent.push(s);
            if (lastThreat >= 0 && windowFrame !== h.frame) h.obs.windows.push(+((h.frame - lastThreat) / 60).toFixed(2));
            windowFrame = h.frame;
          }
          if (WINDS[was] === s && windAt[t.who] >= 0) {
            (h.obs.tells[was] ??= []).push(+((h.frame - windAt[t.who]) / 60).toFixed(3));
          }
          if (WINDS[was] !== undefined) windAt[t.who] = -1;
          if (RESTS.has(s)) restAt[t.who] = h.frame;
          if (RESTS.has(was) && s === 'idle' && restAt[t.who] >= 0) h.obs.rests.push(+((h.frame - restAt[t.who]) / 60).toFixed(2));
          if (RESTS.has(was)) restAt[t.who] = -1;
        }
        prev[t.who] = s;
        // In reach of a standing swing - floor-33 to floor-1 - unless in the air on purpose.
        if (s !== 'fallen' && s !== 'leap' && s !== 'hop' && s !== 'vault') {
          h.obs.reach.frames++;
          const top = t.y - 44;
          if (!(top < F - 1 && t.y > F - 33)) h.obs.reach.misses++;
          if (t.who === 'luna' && F - t.y > 10) h.obs.reach.lunaHigh++;
        }
      }
      if (ATTACK.has(boss.sol.state) && ATTACK.has(boss.luna.state)) h.obs.both++;
      h.obs.rings = Math.max(h.obs.rings, boss.rings.length);
      if (boss.crescents.some((c) => c.batted)) h.obs.batted++;
    };

    /**
     * What a frame of the fight costs, update and draw together, with the hero
     * swinging - and both twins whole before every frame: this is a measure of
     * a frame, not a fight.
     */
    h.measure = (seconds) => {
      const times = [];
      for (let f = 0; f < 60 * seconds; f++) {
        const boss = h.find();
        if (boss && boss.state === 'fight') {
          for (const t of [boss.sol, boss.luna]) if (t.state !== 'fallen') t.hp = t.maxHp;
          boss.hp = boss.maxHp;
        }
        const dx = boss ? boss.cx - g.player.cx : 0;
        const t0 = performance.now();
        h.tick({ attack: f % 20 < 3, right: dx > 60, left: dx < -60 });
        times.push(performance.now() - t0);
        h.watchHp();
        h.watch();
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      return { mean: +mean.toFixed(2), p99: +times[Math.floor(times.length * 0.99)].toFixed(2) };
    };

    /**
     * The duel. 'stand' does nothing at all. 'read' plays it like a person:
     * see the note at the top of this file. It acts on a snapshot of the twins
     * 18 frames old; only moving things are carried forward by the 0.3 s it is
     * behind, the way anyone leads something they see flying at them.
     */
    h.duel = (seconds, style) => {
      const boss = h.find();
      const p = g.player;
      const L = h.arena.left;
      const R = h.arena.right;
      const LAG = 18;
      const LAGS = LAG / 60;
      const hist = [];
      let jumpHold = 0;
      let leapSide = 0;
      let killedAt = -1;
      let dealt = 0;
      h.hits = 0;
      h.why = {};
      const snap = () => ({
        sol: { who: 'sol', state: boss.sol.state, timer: boss.sol.timer, x: boss.sol.x, hp: boss.sol.hp, dir: boss.sol.dir, toX: boss.sol.toX },
        luna: { who: 'luna', state: boss.luna.state, timer: boss.luna.timer, x: boss.luna.x, hp: boss.luna.hp },
        mark: boss.mark ? { x: boss.mark.x, locked: boss.mark.locked } : null,
        crescents: boss.crescents.filter((c) => !c.dead && !c.batted && c.fade <= 0 && c.delay <= 0).map((c) => ({ x: c.x, vx: c.vx, back: c.returning })),
        icicles: boss.icicles.filter((i) => !i.fell && !i.cancelled).map((i) => ({ x: i.x, surface: i.surface })),
        flames: boss.flames.filter((fl) => !fl.out).map((fl) => ({ x: fl.x })),
        rings: boss.rings.map((r) => ({ x: r.x, dir: r.dir })),
        revive: boss.revive ? { channeler: boss.revive.channeler.who } : null,
        eclipseT: boss.sol.state === 'eclipse' ? boss.sol.timer : null,
      });
      const decide = (seen, f) => {
        const a = {};
        const s = seen.sol;
        const l = seen.luna;
        const onFloor = p.onGround;
        const room = (d) => (d > 0 ? R - p.cx : p.cx - L);
        let busy = false;
        let move = 0;
        // Sol crouches: keep moving, away from the ring that follows, until he is down.
        if (s.state === 'leapWind' || s.state === 'leap') {
          const land = seen.mark ? seen.mark.x : p.cx;
          if (leapSide === 0) leapSide = room(1) >= room(-1) ? 1 : -1;
          if (Math.abs(p.cx - land) < 70 + 45 || !seen.mark?.locked) {
            busy = true;
            move = leapSide;
            if (room(move) < 24) {
              leapSide = -leapSide;
              move = leapSide;
            }
          }
        } else leapSide = 0;
        // Sol lowers the glaive: out of the line of embers. Already on the way
        // to him, or with no room ahead: on at him, through him while he still
        // stands, over him as he comes - the fire starts where he started, so
        // over him early is behind it. Otherwise: run for the end of the line.
        if (s.state === 'dashWind' || s.state === 'dash') {
          const d = s.dir;
          // How much of the glaive's tell is left by now, and where he is by now.
          const left = s.state === 'dashWind' ? s.timer - LAGS : -LAGS;
          const solNow = left < 0 ? s.x + d * 400 * -left : s.x;
          const ahead = (p.cx - solNow) * d;
          const beyond = (p.cx - (s.toX + d * 15)) * d;
          if (ahead > -26 && beyond < 12) {
            busy = true;
            const atHim = p.vx * -d > 60;
            if (!atHim && room(d) > -beyond + 22 && ahead > 60) move = d;
            else {
              move = -d;
              if ((left < 0.08 || s.state === 'dash') && ahead < 95 && onFloor && jumpHold === 0) jumpHold = 22;
            }
          }
        }
        // Crescents: over them, when they are about to arrive - led by how far
        // they have come since, slowing on the way out and quickening home.
        for (const c of seen.crescents) {
          if (Math.abs(c.vx) < 30) continue;
          const gap = p.cx - (c.x + c.vx * LAGS * (c.back ? 1.2 : 0.6));
          if (Math.sign(gap) !== Math.sign(c.vx)) continue;
          if (Math.abs(gap) / Math.abs(c.vx) < 0.3 && onFloor && jumpHold === 0) jumpHold = 18;
        }
        // Frost on the floor: out of the rings, and not back into one.
        const marks = seen.icicles.filter((ic) => Math.abs(ic.surface - p.bottom) < 8);
        const frosty = (x) => marks.some((ic) => Math.abs(x - ic.x) < 18 + 9 + 5);
        if (marks.length > 0 && frosty(p.cx)) {
          busy = true;
          let best = null;
          for (let x = p.cx - 160; x <= p.cx + 160; x += 3) {
            if (x < L + 12 || x > R - 12 || frosty(x)) continue;
            if (best === null || Math.abs(x - p.cx) < Math.abs(best - p.cx)) best = x;
          }
          if (best !== null) move = best > p.cx ? 1 : -1;
        }
        // Finsternis: away from the middle while it gathers, over the ring when it comes.
        if (s.state === 'toMiddle' || s.state === 'eclipse') {
          const c = (s.x + l.x) / 2;
          if (Math.abs(p.cx - c) < 160) {
            busy = true;
            move = p.cx >= c ? 1 : -1;
            if (room(move) < 40) move = -move;
          }
        }
        if (seen.eclipseT !== null) {
          const eta = seen.eclipseT - LAGS + Math.abs(p.cx - (s.x + l.x) / 2) / 300;
          if (eta < 0.16 && eta > -0.1 && onFloor && jumpHold === 0) jumpHold = 18;
        }
        for (const r of seen.rings) {
          const ahead = (p.cx - (r.x + r.dir * 300 * LAGS)) * r.dir;
          if (ahead > -12 && ahead / 300 < 0.16 && onFloor && jumpHold === 0) jumpHold = 18;
        }
        // The rest of the time: the one calling the other back, or the nearer
        // one - unless that would leave the other too whole to finish inside
        // the call.
        if (!busy) {
          let target = null;
          const up = [s, l].filter((t) => t.state !== 'fallen');
          if (seen.revive) target = seen.revive.channeler === 'sol' ? s : l;
          else if (up.length > 0) {
            target = up.reduce((x, y) => (Math.abs(x.x - p.cx) <= Math.abs(y.x - p.cx) ? x : y));
            if (up.length === 2) {
              const [lo, hi] = s.hp <= l.hp ? [s, l] : [l, s];
              if (lo.hp <= 8 && hi.hp > 14) target = hi;
            }
          }
          if (target) {
            const dx = target.x - p.cx;
            if (Math.abs(dx) > 30) move = Math.sign(dx);
            else {
              if (Math.sign(dx) !== 0 && Math.sign(dx) !== p.facing) move = Math.sign(dx);
              if (onFloor && f % 6 < 2) a.attack = true;
            }
          }
        }
        // Fire on the floor: not into it, and out of it by the shorter way.
        const burning = (x) => seen.flames.some((fl) => Math.abs(x - fl.x) < 8 + 9 + 4);
        if (move !== 0 && onFloor && !busy && burning(p.cx + move * 12)) move = 0;
        if (onFloor && !busy && burning(p.cx)) {
          const xs = seen.flames.map((fl) => fl.x);
          move = p.cx - Math.min(...xs) < Math.max(...xs) - p.cx ? -1 : 1;
        }
        if (move !== 0 && marks.length > 0 && !frosty(p.cx) && frosty(p.cx + move * 10)) move = 0;
        if (move > 0) a.right = true;
        if (move < 0) a.left = true;
        if (jumpHold > 0) {
          a.jump = true;
          jumpHold--;
        }
        return a;
      };
      for (let f = 0; f < 60 * seconds; f++) {
        if (!h.find() || boss.state === 'dying') {
          killedAt = +(f / 60).toFixed(1);
          break;
        }
        hist.push(snap());
        if (hist.length > LAG + 1) hist.shift();
        const a = style === 'read' ? decide(hist[0], f) : {};
        const before = boss.hp;
        h.tick(a);
        dealt += Math.max(0, before - boss.hp);
        h.watchHp();
        h.watch();
      }
      return { killedAt, hits: h.hits, why: { ...h.why }, dealt, revivals: boss.revivals };
    };

    /**
     * A twin's own move, started by hand, with the other one standing idle and
     * nothing of either still out.
     */
    h.force = (who, state, timer) => {
      const boss = h.find();
      boss.crescents.length = 0;
      boss.icicles.length = 0;
      boss.flames.length = 0;
      boss.rings.length = 0;
      boss.mark = null;
      for (const t of [boss.sol, boss.luna]) {
        t.state = 'idle';
        t.glow = 0;
      }
      const t = boss[who];
      boss.acting = t;
      boss.gap = 99;
      t.state = state;
      t.timer = timer;
      t.hit = false;
      return t;
    };
    window.__h = h;
  }, RELICS);
}

/*
 * `node tools/verify-twins.mjs bench 6`: only the reading hero, six whole
 * fights, and a hero standing still in three places for comparison - the
 * numbers the fight was tuned with, without the checks.
 */
if (process.argv[2] === 'bench') {
  const n = Math.max(1, Number(process.argv[3] ?? 5));
  const runs = [];
  for (let i = 0; i < n; i++) {
    await stage();
    const run = await page.evaluate(() => {
      const h = window.__h;
      h.wake();
      const q = h.duel(150, 'read');
      q.both = h.obs.both;
      return q;
    });
    runs.push(run);
    console.log(`fight ${i + 1}: felled at ${run.killedAt} s, ${run.hits} hearts lost, ${run.revivals} called back`, JSON.stringify(run.why));
  }
  await stage();
  const standing = await page.evaluate(() => {
    const g = window.game;
    const h = window.__h;
    const p = g.player;
    h.wake();
    const mid = (h.arena.left + h.arena.right) / 2;
    return [h.arena.left + 256, mid + 60, h.arena.right - 120].map((x) => {
      h.hits = 0;
      for (let f = 0; f < 60 * 20; f++) {
        p.x = x - p.w / 2;
        p.vx = 0;
        h.tick();
        h.watchHp();
      }
      return h.hits;
    });
  });
  const done = runs.filter((q) => q.killedAt > 0);
  const t = done.map((q) => q.killedAt);
  const hits = runs.map((q) => q.hits);
  const seconds = runs.reduce((s, q) => s + (q.killedAt > 0 ? q.killedAt : 150), 0);
  console.log(`felled ${done.length} of ${n}: ${Math.min(...t)} to ${Math.max(...t)} s, mean ${(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1)} s`);
  console.log(`hearts lost: ${Math.min(...hits)} to ${Math.max(...hits)}, mean ${(hits.reduce((a, b) => a + b, 0) / n).toFixed(2)}, ${(hits.reduce((a, b) => a + b, 0) / seconds * 60).toFixed(2)} a minute`);
  console.log(`standing still: ${standing.join(' + ')} hearts in 60 s`);
  await browser.close();
  server.close();
  process.exit(0);
}

const results = {};

/* ------------------------------------------- moves, tells, standing still */

await stage();
results.fight = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { note: 'no twins' };
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, maxHp: boss.maxHp, sol: boss.sol.maxHp, luna: boss.luna.maxHp };
  out.frame = h.measure(15);
  const mid = (h.arena.left + h.arena.right) / 2;

  // Standing still, in three places in the open (not under a board, where
  // the ice cannot reach): what every move costs a hero who does not move.
  const stand = (x, seconds) => {
    h.hits = 0;
    for (let f = 0; f < 60 * seconds; f++) {
      p.x = x - p.w / 2;
      p.vx = 0;
      h.tick();
      h.watchHp();
      h.watch();
    }
    return h.hits;
  };
  const spots = [h.arena.left + 256, mid + 60, h.arena.right - 120];
  out.standing = spots.map((x) => stand(x, 20));
  out.standingSeconds = 60;

  // Every one of their moves, waited for rather than hoped for: the hero goes
  // where each of them can be made, until it has been.
  const want = (state, place) => {
    for (let f = 0; f < 60 * 40 && !(h.obs.tells[state]?.length > 0); f++) {
      const x = place();
      if (x !== null) {
        p.x = x - p.w / 2;
        p.vx = 0;
      }
      h.tick();
      h.watchHp();
      h.watch();
    }
  };
  const L = h.arena.left + 40;
  const R = h.arena.right - 40;
  // The run wants him 200 px off Sol with room behind him; the crescents want
  // him 250 px off Luna, on the floor.
  const off = (t, d) => () => {
    const side = t.x < mid ? 1 : -1;
    return Math.max(L, Math.min(R, t.x + side * d));
  };
  want('dashWind', off(boss.sol, 200));
  want('throwWind', off(boss.luna, 250));
  want('iceWind', () => null);
  want('leapWind', () => null);

  // Their second half: Finsternis, from the side of the floor.
  for (const t of [boss.sol, boss.luna]) t.hp = Math.floor(t.maxHp * 0.45);
  boss.syncHp();
  boss.enterPhaseTwo(g);
  want('eclipse', () => h.arena.left + 200);
  for (let f = 0; f < 60 * 6; f++) {
    p.x = h.arena.left + 200 - p.w / 2;
    h.tick();
    h.watchHp();
    h.watch();
  }
  out.moves = [...h.obs.seen].sort();
  out.tells = Object.fromEntries(Object.entries(h.obs.tells).map(([k, v]) => [k, { min: Math.min(...v), n: v.length }]));
  out.heard = h.obs.heard;
  out.silent = h.obs.silent;
  out.both = h.obs.both;
  out.windowMin = h.obs.windows.length ? Math.min(...h.obs.windows) : null;
  out.windows = h.obs.windows.length;
  out.restMin = h.obs.rests.length ? Math.min(...h.obs.rests) : null;
  out.reach = h.obs.reach;
  out.rings = h.obs.rings;
  return out;
});

/* ------------------------------------------------------- a hero who reads */

results.readers = [];
for (let run = 0; run < 2; run++) {
  await stage();
  results.readers.push(
    await page.evaluate(() => {
      const h = window.__h;
      const boss = h.wake();
      if (!boss) return { note: 'no twins' };
      const r = h.duel(150, 'read');
      r.both = h.obs.both;
      return r;
    }),
  );
}

/* ---------------------------------------------------------------- the rule */

await stage();
results.rule = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const boss = h.wake();
  if (!boss) return { note: 'no twins' };
  const out = {};
  const fell = (t) => {
    boss.overlaps(boss.rectOf(t));
    boss.hurt(999, 1, g);
  };
  const ATTACK = ['leapWind', 'leap', 'dashWind', 'dash', 'throwWind', 'throw', 'iceWind', 'toMiddle', 'eclipse'];
  // Sol goes down: Luna calls him back.
  fell(boss.sol);
  const pips = boss.barPips();
  out.first = {
    solFallen: boss.sol.state === 'fallen',
    lunaCalls: boss.luna.state === 'channel' && boss.revive?.channeler === boss.luna,
    pips: pips?.pips,
    urgency: pips?.urgency.map((u) => +u.toFixed(2)),
  };
  h.hits = 0;
  let frames = 0;
  let attacked = false;
  let half = null;
  while (boss.revive && frames < 60 * 10) {
    h.tick();
    h.watchHp();
    frames++;
    if (ATTACK.includes(boss.luna.state) || ATTACK.includes(boss.sol.state)) attacked = true;
    if (frames === 210) half = +boss.barPips().urgency[0].toFixed(2);
  }
  out.call = {
    seconds: +(frames / 60).toFixed(2),
    attacked,
    hits: h.hits,
    halfway: half,
    solHp: boss.sol.hp,
    solMax: boss.sol.maxHp,
    solUp: boss.sol.state === 'rise' || boss.sol.state === 'idle',
    phase: boss.phase,
    revivals: boss.revivals,
  };
  for (let f = 0; f < 60; f++) {
    h.tick();
    h.watchHp();
  }
  // Luna goes down: Sol calls her - and goes down himself, two seconds in.
  fell(boss.luna);
  out.second = { solCalls: boss.sol.state === 'channel' && boss.revive?.channeler === boss.sol };
  for (let f = 0; f < 120; f++) {
    h.tick();
    h.watchHp();
  }
  out.second.stillCalling = !!boss.revive;
  fell(boss.sol);
  out.second.over = boss.state === 'dying';
  out.end = h.end('zwillingsstern', 'mondsichel');
  return out;
});

/* --------------------------------------------- crescents batted, parries */

await stage();
results.answers = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { note: 'no twins' };
  const out = {};
  const mid = (h.arena.left + h.arena.right) / 2;
  const settle = () => {
    for (let f = 0; f < 30; f++) {
      h.tick();
      h.watchHp();
    }
  };

  // A crescent batted back flies at Luna and hurts her. A swing timed by a
  // script can still miss one; she throws again, up to three times.
  out.batted = { batted: false, took: 0, throws: 0 };
  for (let attempt = 0; attempt < 3 && !(out.batted.batted && out.batted.took >= 2); attempt++) {
    boss.sol.x = h.arena.left + 60;
    boss.luna.x = mid + 150;
    boss.luna.hp = boss.luna.maxHp;
    boss.syncHp();
    const heroX = boss.luna.x - 200;
    h.force('luna', 'throwWind', 0.05);
    out.batted.throws++;
    const before = boss.luna.hp;
    for (let f = 0; f < 60 * 4 && boss.luna.hp === before; f++) {
      p.x = heroX - p.w / 2;
      p.vx = 0;
      p.facing = 1;
      const c = boss.crescents.find((q) => !q.batted && q.delay <= 0 && q.fade <= 0);
      const near = c && c.x - p.cx < 64 && c.x - p.cx > -8;
      h.tick({ attack: !!near && f % 4 < 2 });
      h.watchHp();
      if (boss.crescents.some((q) => q.batted)) out.batted.batted = true;
    }
    out.batted.took = before - boss.luna.hp;
    for (let f = 0; f < 60 * 4 && boss.luna.state !== 'idle'; f++) {
      h.tick();
      h.watchHp();
    }
  }

  // A parried run staggers Sol, for 1.8 s, and costs the hero nothing.
  const parryRun = () => {
    boss.flames.length = 0;
    boss.luna.x = h.arena.right - 60;
    boss.sol.x = mid - 150;
    const s = h.force('sol', 'dashWind', 0.05);
    s.dir = 1;
    s.fromX = s.x;
    s.toX = s.x + 300;
    s.facing = 1;
    let pressed = false;
    let lost = 0;
    for (let f = 0; f < 90 && s.state !== 'stagger'; f++) {
      p.x = mid - p.w / 2;
      p.vx = 0;
      p.facing = -1;
      const close = s.state === 'dash' && p.x - (s.x + 15) < 34;
      const hp = p.hp;
      h.tick({ parry: close && !pressed });
      if (close) pressed = true;
      lost += Math.max(0, hp - p.hp);
      h.watchHp();
    }
    const staggered = s.state === 'stagger';
    let frames = 0;
    while (s.state === 'stagger' && frames < 60 * 4) {
      h.tick();
      h.watchHp();
      frames++;
    }
    return { staggered, seconds: +(frames / 60).toFixed(2), lost };
  };
  settle();
  out.parriedRun = parryRun();

  // And a parried landing.
  settle();
  boss.luna.x = h.arena.right - 60;
  boss.sol.x = mid - 160;
  const s = h.force('sol', 'leapWind', 0.05);
  boss.mark = { x: mid - 25, locked: true };
  let pressed = false;
  let lost = 0;
  for (let f = 0; f < 90 && s.state !== 'stagger'; f++) {
    p.x = mid - p.w / 2;
    p.vx = 0;
    p.facing = -1;
    if (boss.mark) {
      boss.mark.x = mid - 25;
      boss.mark.locked = true;
    }
    const late = s.state === 'leap' && s.t / s.flight > 0.82;
    const hp = p.hp;
    h.tick({ parry: late && !pressed });
    if (late) pressed = true;
    lost += Math.max(0, hp - p.hp);
    h.watchHp();
  }
  out.parriedLanding = { staggered: s.state === 'stagger', lost };
  return out;
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

const f = results.fight;
const rs = results.readers;
const r = results.rule;
const a = results.answers;
const has = (list, ...names) => names.every((n) => list?.includes(n));
const readerHits = rs.reduce((s, q) => s + q.hits, 0);
const readerSeconds = rs.reduce((s, q) => s + (q.killedAt > 0 ? q.killedAt : 150), 0);
const standRate = f.standing ? f.standing.reduce((x, y) => x + y, 0) / f.standingSeconds : 0;
const readRate = readerHits / readerSeconds;
const tell = (k, min) => f.tells?.[k] && f.tells[k].n > 0 && f.tells[k].min >= min - 0.005;
const checks = [
  ['Sol and Luna wake and the altar closes', f.engaged && f.sealed],
  ['They cost less than a frame to fight', f.frame?.p99 < 16.67],
  [
    'Sol bounds and runs, Luna throws her crescents and calls the ice, and in their second half they bring on Finsternis',
    has(f.moves, 'leapWind', 'leap', 'leapRest', 'dashWind', 'dash', 'dashRest', 'throwWind', 'throw', 'throwRest', 'iceWind', 'iceRest', 'toMiddle', 'eclipse', 'eclipseRest') &&
      f.rings > 0,
  ],
  [
    'Every move is announced from its first frame: bound 0.6 s, run 0.6, crescents 0.6, ice 0.8, Finsternis 1.0',
    tell('leapWind', 0.6) && tell('dashWind', 0.6) && tell('throwWind', 0.6) && tell('iceWind', 0.8) && tell('eclipse', 1.0),
  ],
  ['Every wind-up is heard as well as seen', f.heard > 0 && f.silent.length === 0],
  ['Only one of them attacks at a time', f.both === 0 && rs.every((q) => q.both === 0)],
  ['After every attack it stays quiet for a second and a half, and the one who attacked stands still for it', f.windowMin >= 1.5 && f.restMin >= 1.5],
  ['Both are always in reach of a swing from the floor; Luna floats within ten pixels of it', f.reach.frames > 0 && f.reach.misses === 0 && f.reach.lunaHigh === 0],
  ['A hero who reads them fells them, inside two minutes', rs.every((q) => q.killedAt > 0 && q.killedAt <= 120)],
  [
    `Reading them costs less than half of standing still (${readRate.toFixed(3)} against ${standRate.toFixed(3)} hearts a second)`,
    standRate > 0 && readRate * 2 <= standRate,
  ],
  [
    'Felling one starts the call: the other stands still and calls, and the bar shows a star counting down',
    r.first?.solFallen && r.first.lunaCalls && r.first.pips?.[0] === 'stump' && r.first.pips?.[1] === 'head' && r.first.urgency?.[0] >= 0.99,
  ],
  [
    // Seven seconds of the fight's own time; the hit stop of the fall itself
    // holds everything for a few frames on top.
    'The call takes seven seconds, attacks nobody, and the fallen one rises with half its health',
    r.call?.seconds >= 7 && r.call.seconds <= 7.3 && !r.call.attacked && r.call.hits === 0 && r.call.halfway > 0.4 && r.call.halfway < 0.6 &&
      r.call.solUp && r.call.solHp === Math.ceil(r.call.solMax / 2) && r.call.phase === 2,
  ],
  ['Felling the one who calls, during the call, ends the fight', r.second?.solCalls && r.second.stillCalling && r.second.over],
  ['A crescent batted back flies at Luna and hurts her', a.batted?.batted && a.batted.took >= 2],
  ['A parried run staggers Sol for 1.8 s and costs nothing', a.parriedRun?.staggered && a.parriedRun.seconds >= 1.75 && a.parriedRun.lost === 0],
  ['A parried landing staggers Sol and costs nothing', a.parriedLanding?.staggered && a.parriedLanding.lost === 0],
  [
    'They fall, heal the hero, open the wards, speak, and leave the Zwillingsstern and the Mondsichel',
    r.end?.felled && r.end.healed && r.end.cleared && r.end.banner.includes('SOL UND LUNA') && r.end.spoke && r.end.relic && r.end.skill,
  ],
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
console.log(`OK: all ${checks.length} checks - both twins announce every move, take turns, can always be reached, call each other back, and can be finished.`);
