/**
 * Tickmar, das Uhrwerk, in his clock tower.
 *
 * Pinned on the three questions every arena boss is (see verify-bosses), and
 * on his own rule - Er schlägt im Takt:
 *
 *   1. Does he do everything he is supposed to? Every move shows up in a fight
 *      of ordinary length: the pendulum, the gears, the bell, the hands.
 *   2. Is he fair? Every move is told for a whole bar before it lands (1.6 s
 *      once the beat has quickened), every blow leaves him on a tick, and after
 *      every attack there is a quiet window of 1.5 s and more. Walking at the
 *      hero hurts nobody. A hero who reads him takes less than half of what one
 *      who stands still takes, and one who reads him the way a person does - a
 *      third of a second late - fells him in 35 to 80 s for four hearts at most.
 *   3. Does his rule hold? The ticking stops while he winds himself, and then
 *      every blow counts double; a gear sent back with the blade lands in him
 *      for two; the pendulum reaches 200 px along the floor and passes under a
 *      plank; a guard that meets it jams it and stalls him.
 *
 * The frame time is the best of five samples: other programs share the machine,
 * and they only ever make a frame read slower than it is, never faster.
 *
 * And then that he falls, heals the hero, opens the wards, speaks, and leaves
 * the Taktgeber and his Pendelschlag.
 *
 * The reading bot is built to play like a person, not like a machine: it acts
 * on what the fight looked like 18 frames (0.3 s) ago, swings only from the
 * floor, jumps only to get over something, and counts the bar the way anyone
 * counts four ticks - give or take forty milliseconds.
 *
 * Usage: node tools/verify-clock.mjs              the checks
 *        node tools/verify-clock.mjs --fights 5   five whole fights of the reading bot, measured, and nothing else
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const fightsArg = process.argv.indexOf('--fights');
const FIGHTS = fightsArg > 0 ? Math.max(1, Number(process.argv[fightsArg + 1]) || 5) : 0;

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

/** What the hero carries by the clock tower: the eight relics of the road before it. */
const RELICS = ['herzkern', 'keilerhaut', 'goldzahn', 'bebenfaust', 'seidenmantel', 'glutklinge', 'zwillingsstern', 'flutklinge'];

/**
 * A fresh page: the relics taken, the helpers installed. The same helpers as
 * verify-bosses, and the reading bot.
 */
async function stage(relics = RELICS) {
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
    h.arena = g.level.arenas.find((a) => g.level.spawns.some((s) => s.kind === 'clock' && s.tx * 32 >= a.left && s.tx * 32 < a.right));
    h.mid = (h.arena.left + h.arena.right) / 2;
    h.find = () => g.enemies.find((e) => e.kind === 'clock' && !e.dead);
    /** In through the door and on towards him until he is awake, the room is shut and he has wound himself up. */
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
    h.readThrough = () => {
      for (let f = 0; f < 60 * 8 && g.dialogue; f++) h.tick({ confirm: f % 2 === 0 });
    };
    /** Felled, with the hero at two hearts: what his fall does, then his relic and his attack. */
    h.end = () => {
      g.player.hp = 2;
      let felled = false;
      for (let f = 0; f < 60 * 5; f++) {
        h.tick();
        if (!h.find()) felled = true;
      }
      const end = { felled, healed: g.player.hp === g.player.maxHp, banner: g.zoneBanner.text, cleared: h.arena.cleared };
      end.spoke = !!g.dialogue;
      h.readThrough();
      end.relic = g.player.has('taktgeber');
      end.skill = g.player.skills.has('pendelschlag');
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
        const boss = h.find();
        const why = boss ? `${boss.state}:${boss.move ?? '-'}` : 'none';
        h.why[why] = (h.why[why] ?? 0) + lost;
        p.hp = p.maxHp;
      }
      p.dead = false;
    };
    /** What a frame of the fight costs, update and draw together, with the hero swinging at him. */
    h.measure = (seconds) => {
      const times = [];
      for (let f = 0; f < 60 * seconds; f++) {
        const boss = h.find();
        if (boss && boss.hp > 0) boss.hp = boss.maxHp;
        const dx = boss ? boss.cx - g.player.cx : 0;
        const t0 = performance.now();
        h.tick({ attack: f % 20 < 3, right: dx > 70, left: dx < -70 });
        times.push(performance.now() - t0);
        h.watchHp();
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      return { mean: +mean.toFixed(2), p99: +times[Math.floor(times.length * 0.99)].toFixed(2) };
    };

    /** What a player sees of him in one frame. */
    h.snap = (boss) => ({
      clock: boss.clock,
      state: boss.state,
      move: boss.move,
      inState: boss.inState,
      beatLen: boss.beatLen,
      beatTimer: boss.beatTimer,
      phaseTwo: boss.phaseTwo,
      cx: boss.cx,
      pendMode: boss.pendMode,
      pendSide: boss.pendSide,
      bobX: boss.bobX,
      parts: boss.parts
        .filter((q) => !q.dead)
        .map((q) => ({ part: q.part, cx: q.cx, vx: q.vx, mode: q.mode, stage: q.stage, markX: q.markX })),
    });

    /**
     * The reading bot. It sees the fight `lag` frames late, and acts on that:
     *
     *   hands     - off the marks, to the nearest spot clear of all of them;
     *   pendulum  - out of its reach while it is told and swinging, or, with a
     *               wall at its back, over it: one jump timed on the count, and
     *               a second in the air if the passes are far apart;
     *   gears     - a step back while they are told, then a swing at each one
     *               that comes, or a jump if it comes from behind;
     *   bell      - a jump timed on the count, for when the ring reaches it;
     *   otherwise - to his legs, and swinging, from the floor.
     *
     * Counting is what a person does with four ticks: the moment of the blow is
     * worked out from the bar as it was seen, and hit give or take 40 ms.
     */
    h.makeBot = (lag = 18) => {
      const seen = [];
      const jumps = [];
      let f = 0;
      let jumpHold = 0;
      let jumpWasDown = false;
      let planned = null;
      const err = () => (Math.random() * 2 - 1) * 0.04;
      const plan = (at) => {
        if (!jumps.some((t) => Math.abs(t - at) < 0.25)) jumps.push(at);
      };
      return {
        act(boss) {
          f++;
          seen.push(h.snap(boss));
          if (seen.length > lag + 1) seen.shift();
          const S = seen[0];
          const p = g.player;
          const a = {};
          const me = p.cx;
          const side = Math.sign(me - S.cx) || -1;
          const L = h.arena.left + 14;
          const R = h.arena.right - 14;
          const now = boss.clock;
          const strikeAt = S.state === 'tell' ? S.clock + S.beatTimer + (3 - S.inState) * S.beatLen : null;
          const key = S.state === 'tell' ? `${S.move}@${strikeAt.toFixed(2)}` : null;
          let goal = null;
          let swing = false;

          // The hands: off every mark, to the nearest clear floor.
          const marks = S.parts.filter((q) => q.part === 'hand' && ['mark', 'rise', 'hover'].includes(q.stage)).map((q) => q.markX);
          const onMark = (x) => marks.some((m) => Math.abs(m - x) < 33);
          if (marks.length > 0 && onMark(me)) {
            const spots = [];
            for (const m of marks) for (const d of [-38, 38]) if (!onMark(m + d) && m + d > L && m + d < R) spots.push(m + d);
            spots.sort((u, v) => Math.abs(u - me) - Math.abs(v - me));
            if (spots.length > 0) goal = spots[0];
          }

          // The pendulum: out of reach - or, cornered, over it.
          const pendTold = (S.state === 'tell' && S.move === 'pendel') || S.pendMode === 'cock' || S.pendMode === 'sweep';
          if (pendTold && Math.abs(me - S.cx) < 250) {
            const mine = S.cx + side * 255;
            const other = S.cx - side * 255;
            const left = strikeAt !== null ? strikeAt - now : 0;
            if (mine > L && mine < R) goal = mine;
            else if (other > L && other < R && left > Math.abs(other - me) / 235 + 0.15) goal = other;
            else if (strikeAt !== null && planned !== key) {
              // Over it: the passes come where the swing says they will.
              planned = key;
              const B = S.beatLen;
              const c = (S.cx - me) / (S.pendSide * 200);
              if (Math.abs(c) <= 1) {
                const t1 = (B * Math.acos(Math.max(-1, Math.min(1, c)))) / Math.PI;
                const t2 = 2 * B - t1;
                plan(strikeAt + t1 - 0.14 + err());
                if (t2 - t1 > 0.42) plan(strikeAt + t1 + 0.2 + err());
              }
            }
          }

          // The gears: a few steps back while they are told, to have room to
          // meet them; then, through the bar they come on, facing him and
          // swinging in time with the drops - and a jump for one from behind.
          const gearsTold = S.state === 'tell' && S.move === 'gears';
          const gearsBar = S.state === 'strike' && S.move === 'gears';
          if (gearsTold && Math.abs(me - S.cx) < 170 && goal === null) {
            const back = S.cx + side * 185;
            goal = back > L && back < R ? back : S.cx - side * 185;
          }
          for (const q of S.parts) {
            if (q.part !== 'gear' || q.mode === 'back' || Math.sign(q.vx) !== Math.sign(me - q.cx)) continue;
            const d = Math.abs(q.cx - me);
            if (d > 170) continue;
            if (p.facing === Math.sign(q.cx - me)) swing = true;
            else if (d < 105 && p.onGround) plan(now);
          }
          if (gearsBar && Math.abs(me - S.cx) < 240 && p.facing === (Math.sign(S.cx - me) || 1)) swing = true;

          // The bell: a jump counted from the bar, and one more on sight.
          const ringSpeed = S.phaseTwo ? 360 : 320;
          if (S.state === 'tell' && S.move === 'bell' && planned !== key) {
            planned = key;
            const rings = [strikeAt];
            if (S.phaseTwo) rings.push(strikeAt + 2 * S.beatLen);
            for (const r of rings) {
              const arrive = r + Math.max(0, Math.abs(me - S.cx) - 38) / ringSpeed;
              plan(Math.max(r - 0.05, arrive - 0.1) + err());
            }
          }
          for (const q of S.parts) {
            if (q.part !== 'chime' || Math.sign(q.vx) !== Math.sign(me - q.cx)) continue;
            if (Math.abs(q.cx - me) < 150 && p.onGround) plan(now);
          }

          // Otherwise: to his legs - except while gears are coming, when it
          // holds its ground and meets them.
          const busy = pendTold && Math.abs(me - S.cx) < 260;
          if (goal === null && !busy && !gearsBar) {
            const want = S.cx + side * 56;
            goal = onMark(want) ? null : want;
          }
          if (goal !== null) goal = Math.max(L, Math.min(R, goal));

          // Jumps that are due.
          for (let i = jumps.length - 1; i >= 0; i--) {
            if (now >= jumps[i]) {
              jumps.splice(i, 1);
              if (p.onGround || !jumpWasDown) jumpHold = 16;
            }
          }

          if (goal !== null && Math.abs(me - goal) > 5) {
            a[goal > me ? 'right' : 'left'] = true;
          } else if (!busy) {
            // Facing him, to swing.
            const toward = Math.sign(S.cx - me) || 1;
            if (p.facing !== toward && Math.abs(S.cx - me) > 20) a[toward > 0 ? 'right' : 'left'] = true;
          }
          const inReach = Math.abs(S.cx - me) < 78 && p.facing === (Math.sign(S.cx - me) || 1);
          if ((swing || (inReach && !busy)) && p.onGround) a.attack = f % 8 < 2;
          if (jumpHold > 0) {
            // Released for a frame first, so the press counts.
            if (jumpWasDown && jumpHold === 16) {
              a.jump = false;
            } else {
              a.jump = true;
              jumpHold--;
            }
          }
          jumpWasDown = !!a.jump;
          return a;
        },
      };
    };

    /**
     * Writes down, frame by frame, what he does: every tick and every blow (on
     * his own clock and on the game's), how long each warning ran, which moves
     * came in which half, and the quiet between the end of one attack - the last
     * moment anything of it could still reach the hero - and the next blow.
     */
    h.watcher = () => {
      const w = {
        ticks: [],
        strikes: [],
        tells: [],
        windows: [],
        moves: { 1: [], 2: [] },
        winds: [],
        tickGaps: [],
      };
      let prevTicks = -1;
      let prevStrikes = -1;
      let prevState = null;
      let tellFrom = -1;
      let tellMove = null;
      let quietSince = -1;
      let paused = true;
      let lastTickClock = -1;
      let lastBeatLen = 0;
      let wind = null;
      w.step = (boss) => {
        const p = g.player;
        const phase = boss.phaseTwo ? 2 : 1;
        if (prevTicks < 0) {
          prevTicks = boss.ticks;
          prevStrikes = boss.strikes;
        }
        if (['wind', 'jammed', 'intro', 'dormant'].includes(boss.state)) paused = true;
        if (boss.ticks !== prevTicks) {
          // Labelled with the beat that was running when it was scheduled.
          if (!paused && lastTickClock >= 0) w.tickGaps.push({ gap: +(boss.lastTickAt - lastTickClock).toFixed(4), beat: lastBeatLen });
          lastTickClock = boss.lastTickAt;
          lastBeatLen = boss.beatLen;
          paused = false;
          w.ticks.push(g.time);
          if (wind && boss.state === 'wind') wind.ticks += boss.ticks - prevTicks;
          prevTicks = boss.ticks;
        }
        if (boss.state === 'tell' && prevState !== 'tell') {
          tellFrom = g.time;
          tellMove = boss.move;
        }
        if (boss.state === 'wind' && prevState !== 'wind') wind = { from: g.time, ticks: 0 };
        if (boss.state !== 'wind' && prevState === 'wind' && wind) {
          w.winds.push({ seconds: +(g.time - wind.from).toFixed(2), ticks: wind.ticks });
          wind = null;
        }
        if (boss.strikes !== prevStrikes) {
          w.strikes.push({ t: g.time, offBeat: +(boss.lastStrikeAt - boss.lastTickAt).toFixed(4), move: boss.move, phase });
          if (boss.state === 'strike' && boss.inState === 0) {
            if (tellFrom >= 0 && tellMove === boss.move) w.tells.push({ move: boss.move, phase, seconds: +(g.time - tellFrom).toFixed(3) });
            if (quietSince >= 0) w.windows.push({ move: boss.move, seconds: +(g.time - quietSince).toFixed(2) });
            if (!w.moves[phase].includes(boss.move)) w.moves[phase].push(boss.move);
            tellFrom = -1;
          }
          prevStrikes = boss.strikes;
          quietSince = -1;
        }
        // Anything of his that can still reach the hero.
        const danger =
          boss.pendMode === 'sweep' ||
          boss.parts.some(
            (q) => !q.dead && ((q.part === 'gear' && q.rolling && q.live) || (q.part === 'chime' && q.live) || (q.part === 'gear' && q.mode === 'drop')),
          );
        if (danger) quietSince = -1;
        else if (quietSince < 0 && w.strikes.length > 0) quietSince = g.time;
        prevState = boss.state;
        void p;
      };
      return w;
    };

    /** A whole fight, from the shut door to his fall: seconds, and hearts it cost. */
    h.fight = (cap = 150) => {
      const boss = h.find();
      const bot = h.makeBot();
      h.hits = 0;
      h.why = {};
      const t0 = g.time;
      let felledAt = -1;
      for (let f = 0; f < 60 * cap; f++) {
        const b = h.find();
        if (!b) break;
        if (b.state === 'dying') {
          felledAt = g.time - t0;
          break;
        }
        h.tick(bot.act(b));
        h.watchHp();
      }
      return { seconds: felledAt > 0 ? +felledAt.toFixed(1) : null, hearts: h.hits, why: { ...h.why }, maxHp: boss.maxHp };
    };
    window.__h = h;
  }, relics);
}

/* ------------------------------------------------------- whole fights only */

if (FIGHTS > 0) {
  const runs = [];
  for (let i = 0; i < FIGHTS; i++) {
    await stage();
    const run = await page.evaluate(() => {
      const h = window.__h;
      if (!h.wake()) return null;
      return h.fight();
    });
    runs.push(run);
    console.log(`  fight ${i + 1}: ${run?.seconds ?? 'not felled'} s, ${run?.hearts} hearts lost   ${JSON.stringify(run?.why)}`);
  }
  const done = runs.filter((r) => r && r.seconds !== null);
  if (done.length > 0) {
    const s = done.map((r) => r.seconds);
    const hts = done.map((r) => r.hearts);
    console.log(`  ${done.length} of ${runs.length} felled: ${Math.min(...s)}–${Math.max(...s)} s, ${Math.min(...hts)}–${Math.max(...hts)} hearts (his health: ${done[0].maxHp})`);
  }
  await browser.close();
  server.close();
  process.exit(done.length === runs.length ? 0 : 1);
}

/* ------------------------------------------------------------- the checks */

await stage();
const r = await page.evaluate(() => {
  const g = window.game;
  const h = window.__h;
  const p = g.player;
  const boss = h.wake();
  if (!boss) return { ok: false, note: 'no Tickmar' };
  // Best of five: other things share the machine, and a timer only ever
  // reads high because of them, never low.
  const frames = [h.measure(4), h.measure(4), h.measure(4), h.measure(4), h.measure(4)];
  const frame = frames.reduce((a, b) => (b.p99 < a.p99 ? b : a));
  const out = { engaged: boss.engaged, sealed: h.arena.fighting, maxHp: boss.maxHp, frame, frames };
  const watch = h.watcher();
  /** Holds his health where a test wants it: whole in his first half, at 45 % in his second. */
  const pin = () => {
    if (boss.state === 'dying' || boss.dead) return;
    boss.hp = boss.phaseTwo ? Math.floor(boss.maxHp * 0.45) : boss.maxHp;
  };
  const toPhaseTwo = () => {
    boss.hp = Math.floor(boss.maxHp * 0.45);
    boss.phaseTwo = true;
    boss.tempoPending = true;
  };

  // 1. Standing still at three spots, then reading him, in both halves - and
  //    everything he does meanwhile written down.
  const spots = [h.mid - 260, h.mid + 40, h.mid + 300];
  const stand = (seconds) => {
    let hits = 0;
    for (const x of spots) {
      h.hits = 0;
      for (let f = 0; f < 60 * seconds; f++) {
        p.x = x - p.w / 2;
        p.vx = 0;
        h.tick();
        h.watchHp();
        pin();
        watch.step(boss);
      }
      hits += h.hits;
    }
    return hits;
  };
  const read = (seconds) => {
    const bot = h.makeBot();
    h.hits = 0;
    h.why = {};
    for (let f = 0; f < 60 * seconds; f++) {
      h.tick(bot.act(boss));
      h.watchHp();
      pin();
      watch.step(boss);
    }
    return h.hits;
  };
  out.standing = stand(20);
  out.reading = read(60);
  out.readingWhy = { ...h.why };
  toPhaseTwo();
  out.standing2 = stand(15);
  out.reading2 = read(45);
  out.readingWhy2 = { ...h.why };
  // Until every move has been seen in both halves - wait for it rather than hope.
  for (let f = 0; f < 60 * 120 && (watch.moves[2].length < 4 || watch.winds.length < 1); f++) {
    p.x = h.mid - 200 - p.w / 2;
    p.vx = 0;
    h.tick();
    h.watchHp();
    pin();
    watch.step(boss);
  }
  boss.hp = boss.maxHp;
  boss.phaseTwo = false;
  boss.beatLen = 0.5;
  for (let f = 0; f < 60 * 120 && watch.moves[1].length < 4; f++) {
    p.x = h.mid + 200 - p.w / 2;
    p.vx = 0;
    h.tick();
    h.watchHp();
    pin();
    watch.step(boss);
  }
  out.moves = watch.moves;
  out.tells = watch.tells;
  out.tell1 = Math.min(...watch.tells.filter((t) => t.phase === 1).map((t) => t.seconds));
  out.tell2 = Math.min(...watch.tells.filter((t) => t.phase === 2).map((t) => t.seconds));
  out.offBeat = Math.max(...watch.strikes.map((s) => Math.abs(s.offBeat)));
  out.strikes = watch.strikes.length;
  const gaps = (beat) => watch.tickGaps.filter((q) => q.beat === beat).map((q) => q.gap);
  out.gaps = { half: [Math.min(...gaps(0.5)), Math.max(...gaps(0.5))], fast: [Math.min(...gaps(0.4)), Math.max(...gaps(0.4))] };
  out.windowMin = Math.min(...watch.windows.map((q) => q.seconds));
  out.windows = watch.windows.length;
  out.winds = watch.winds;

  // 2. The winding: wait for one, then a blow during it and a blow after.
  boss.hp = boss.maxHp;
  for (let f = 0; f < 60 * 40 && boss.state !== 'wind'; f++) {
    p.x = h.mid - 300 - p.w / 2;
    p.vx = 0;
    p.hp = p.maxHp;
    h.tick();
  }
  const blow = () => {
    const before = boss.hp;
    boss.overlaps(boss.bodyRect());
    boss.hurt(1, 1, g);
    return before - boss.hp;
  };
  out.windSeen = boss.state === 'wind';
  out.windTakes = boss.state === 'wind' ? blow() : null;
  for (let f = 0; f < 60 * 4 && boss.state === 'wind'; f++) {
    p.hp = p.maxHp;
    h.tick();
  }
  out.walkTakes = blow();

  // 3. Walking at the hero does not hurt: hugging his legs through bars of walking.
  const realTell = boss.beginTell;
  boss.beginTell = () => {};
  g.projectiles.length = 0;
  boss.pendMode = 'rest';
  h.hits = 0;
  for (let f = 0; f < 60 * 8; f++) {
    p.x = boss.cx - p.w / 2 - 20;
    p.vx = 0;
    h.tick();
    h.watchHp();
  }
  out.hugWhileWalking = h.hits;
  boss.beginTell = realTell;

  // 4. A gear sent back with the blade lands in him for two.
  boss.ticking = false;
  boss.state = 'walk';
  for (let f = 0; f < 40; f++) h.tick();
  g.projectiles.length = 0;
  p.x = boss.cx - 240 - p.w / 2;
  p.y = boss.floorY - p.h - 1;
  p.vy = 0;
  h.tick({ right: true });
  const hpGear = boss.hp;
  const heroGear = p.hp;
  boss.dropGear(g);
  const gear = boss.parts[boss.parts.length - 1];
  let batted = false;
  for (let f = 0; f < 60 * 4 && !gear.dead; f++) {
    const close = gear.rolling && gear.cx - p.cx < 62;
    h.tick({ attack: close && f % 4 < 2 });
    p.x = boss.cx - 240 - p.w / 2;
    if (gear.batted) batted = true;
  }
  out.gear = { batted, took: hpGear - boss.hp, heroLost: heroGear - p.hp };

  // 5. The pendulum's reach: a hero on the floor 185 px out is caught, one 235
  //    px out is not, and neither is one up on a plank right over the swing.
  //    He is held where he stands for it, and the hero's silk is kept off so
  //    every blow that lands counts.
  {
    const realChoose = boss.chooseMove;
    const realStep = boss.step;
    boss.chooseMove = () => 'pendel';
    boss.step = () => {};
    const L = g.level;
    let plank = null;
    for (let tx = Math.floor(h.arena.left / 32); tx < Math.floor(h.arena.right / 32); tx++) {
      for (let ty = 2; ty < 17; ty++) if (L.platformAt(tx, ty) && (!plank || ty > plank.ty)) plank = { tx, ty };
    }
    const swing = (dx, onPlank) => {
      g.projectiles.length = 0;
      boss.x = onPlank ? plank.tx * 32 + 16 - dx - boss.w / 2 : h.mid - boss.w / 2;
      boss.stepT = 1;
      boss.lastMove = null;
      boss.resume();
      let hits = 0;
      let out = 0;
      let swept = false;
      for (let f = 0; f < 60 * 8; f++) {
        p.x = boss.cx + dx - p.w / 2;
        if (onPlank) {
          p.y = plank.ty * 32 - p.h - 0.5;
          p.vy = 0;
        }
        p.vx = 0;
        p.shieldUp = false;
        p.shieldTimer = 99;
        const before = p.hp;
        h.tick();
        if (p.hp < before) hits += before - p.hp;
        p.hp = p.maxHp;
        boss.hp = boss.maxHp;
        if (boss.pendMode === 'sweep') {
          swept = true;
          out = Math.max(out, Math.abs(boss.bobX - boss.cx));
        }
        if (swept && boss.pendMode === 'rest') break;
      }
      return { hits, out: Math.round(out), swept };
    };
    out.reach = { near: swing(-185, false), far: swing(-235, false), plank: swing(-150, true) };
    boss.chooseMove = realChoose;
    boss.step = realStep;
  }

  // 6. A guard that meets the pendulum: jammed, stalled, and the hero untouched.
  boss.hp = boss.maxHp;
  boss.poiseLock = 0;
  const realChoose = boss.chooseMove;
  boss.chooseMove = () => 'pendel';
  boss.lastMove = null;
  boss.resume();
  let parried = false;
  const heroBefore = p.hp;
  for (let f = 0; f < 60 * 10 && boss.state !== 'jammed'; f++) {
    p.x = boss.cx - 120 - p.w / 2;
    p.vx = 0;
    p.hp = heroBefore;
    const wantParry = boss.pendMode === 'sweep' && Math.abs(boss.bobX - p.cx) < 95 && !parried;
    h.tick({ parry: wantParry, right: f % 30 === 0 });
    if (wantParry) parried = true;
  }
  boss.chooseMove = realChoose;
  out.jam = { jammed: boss.state === 'jammed', heroLost: heroBefore - p.hp };
  const jamFrom = g.time;
  const jamTicks = boss.ticks;
  out.jam.takes = boss.state === 'jammed' ? blow() : null;
  while (boss.state === 'jammed' && g.time - jamFrom < 5) {
    p.hp = p.maxHp;
    h.tick();
  }
  out.jam.seconds = +(g.time - jamFrom).toFixed(2);
  out.jam.ticks = boss.ticks - jamTicks - (boss.ticks > jamTicks ? 1 : 0);
  return out;
});

// The whole fight, read like a person reads it, and the end of it.
await stage();
const fight = await page.evaluate(() => {
  const h = window.__h;
  if (!h.wake()) return null;
  const run = h.fight();
  run.end = h.end();
  return run;
});

console.log(JSON.stringify({ ...r, fight }, null, 1));
await browser.close();
server.close();

const has = (list, ...names) => names.every((n) => list?.includes(n));
const four = ['pendel', 'gears', 'bell', 'hands'];
const e = fight?.end;
const checks = [
  ['Tickmar wakes and his tower closes', r.engaged && r.sealed],
  [`Tickmar costs less than a frame to fight (p99 ${r.frame?.p99} ms, mean ${r.frame?.mean} ms, best of five samples)`, r.frame?.p99 < 16.67],
  ['Tickmar swings his pendulum, drops his gears, rings his bell and brings his hands down - in both halves', has(r.moves?.[1], ...four) && has(r.moves?.[2], ...four)],
  [
    `Tickmar tells every move for a whole bar before it lands: ${r.tell1} s, and ${r.tell2} s once the beat has quickened`,
    r.tells?.length >= 8 && r.tell1 >= 1.98 && r.tell2 >= 1.58,
  ],
  [
    `Tickmar ticks every half second, every 0.4 s from half health, and every one of his ${r.strikes} blows leaves him on a tick`,
    r.gaps?.half[0] >= 0.499 && r.gaps?.half[1] <= 0.501 && r.gaps?.fast[0] >= 0.399 && r.gaps?.fast[1] <= 0.401 && r.offBeat === 0 && r.strikes >= 20,
  ],
  [`After every attack he leaves a quiet window: at least ${r.windowMin} s before the next blow`, r.windows >= 8 && r.windowMin >= 1.5],
  ['Walking at the hero hurts nobody: hugging his legs through bars of it costs nothing', r.hugWhileWalking === 0],
  [
    'While he winds himself the ticking stops, for 2.5 s, and every blow counts double',
    r.windSeen && r.winds?.length > 0 && r.winds.every((q) => q.ticks === 0 && q.seconds >= 2.45) && r.windTakes === 2 && r.walkTakes === 1,
  ],
  ['A gear sent back with the blade lands in him for two', r.gear?.batted && r.gear.took === 2 && r.gear.heroLost === 0],
  [
    `The pendulum sweeps ${r.reach?.near.out} px out either way: it catches a hero on the floor 185 px off, not one 235 px off, and passes under one on a plank`,
    r.reach?.near.swept && r.reach.near.out >= 190 && r.reach.near.hits >= 1 && r.reach.far.hits === 0 && r.reach.plank.swept && r.reach.plank.hits === 0,
  ],
  [
    `A guard that meets the pendulum jams it: he stands ${r.jam?.seconds} s without a tick, takes his blows as usual, and the hero loses nothing`,
    r.jam?.jammed && r.jam.heroLost === 0 && r.jam.seconds >= 1.75 && r.jam.ticks === 0 && r.jam.takes === 1,
  ],
  [
    `Reading him costs less than half of standing still: ${r.reading + r.reading2} hearts against ${r.standing + r.standing2}`,
    r.standing + r.standing2 >= 4 && (r.reading + r.reading2) * 2 <= r.standing + r.standing2,
  ],
  [
    `A hero who sees him 0.3 s late and swings only from the floor fells him in 35-80 s for at most 4 hearts: ${fight?.seconds} s, ${fight?.hearts} hearts`,
    fight?.seconds !== null && fight?.seconds >= 35 && fight?.seconds <= 80 && fight?.hearts <= 4,
  ],
  [
    'Tickmar falls, heals the hero, opens the wards, speaks, and leaves the Taktgeber and his Pendelschlag',
    e?.felled && e.healed && e.cleared && e.banner.includes('TICKMAR') && e.spoke && e.relic && e.skill,
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
console.log(`OK: all ${checks.length} checks - Tickmar keeps his beat, tells every blow a bar ahead, opens up when he winds himself, and can be felled by a hero who reads him late.`);
