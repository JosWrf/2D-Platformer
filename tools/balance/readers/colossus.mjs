/**
 * Ankhor, read like a person reads him - 0.3 s late, from the floor:
 *
 *   - waiting: near him, a little off his face on the side he is on;
 *   - a fist rising over him and following: he stands until it stops dead -
 *     he knows the rhythm of its follow - then steps out of its shadow,
 *     towards Ankhor's middle;
 *   - the fist on the floor: in to a sword's length of it, and swing;
 *   - the sweep: a parry as the hand reaches him, timed off the scrape he saw
 *     and its speed as the eye leads it (with PARRY_SWEEP off: a low hop);
 *   - the sun: as Ankhor looks up he knows the light comes down where he
 *     stands; then he goes, to the side with more room, and keeps ahead of it;
 *   - his second half: a low hop over the shockwaves along the floor - the
 *     ones from a fist landing beside him timed off its fall, the others as
 *     the eye leads them - one hop for as many as it can clear;
 *   - sagging, his head at sword height: to it, and swing.
 *
 * The rhythms are counted in the game's own time, as the hero feels it: a
 * hit-stop freezes him and the clock alike.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const FLOOR = h.room.floor;
  /** Parries the sweep - a fist coming across, from one side, plainly. */
  const PARRY_SWEEP = true;
  /** Parries the slam as well, stepping a hand's breadth aside under it to know which way to face. */
  const PARRY_SLAM = false;
  /** A human's error on a press timed off a rhythm: 0.07 s either way, in frames. */
  const JIT = 0.07 * 60;
  const jit = () => Math.round((Math.random() * 2 - 1) * JIT);
  /** The same error on his dodges (steps and hops), in frames; 0 like the boar's reader, 0.07 * 60 to test the margins. */
  const DODGE_JIT = 0;
  const djit = () => Math.round((Math.random() * 2 - 1) * DODGE_JIT);
  let hopJit = null;
  /** Sim frames until a timer now at t runs out (the update in which it does; <= 0: it has, that long ago). */
  const runsOut = (t) => Math.ceil(t * 60 - 1e-6);
  /** A shockwave's speed along the floor, px a frame; it overlaps him within 22 px. */
  const WV = 250 / 60;
  let sim = 0;
  let lastRun = null;
  const prevHand = [null, null];
  /** Per hand: what he means to do about its current move. */
  const plan = [null, null];
  let pressing = 0;
  let beamDir = 0;
  let rollAt = -1;
  return (boss) => {
    // His own clock: it stops when the game stops for a blow.
    if (p.runCycle !== lastRun) {
      sim++;
      lastRun = p.runCycle;
    }
    const v = see({
      sim,
      state: boss.state,
      timer: boss.timer,
      slump: boss.slump,
      phase: boss.phase,
      baseX: boss.baseX,
      headY: boss.headY,
      hands: boss.hands.map((q) => ({ state: q.state, timer: q.timer, x: q.x, y: q.y, dir: q.dir })),
      beam: boss.beam ? { stage: boss.beam.stage, x: boss.beam.x } : null,
      waves: g.projectiles.filter((q) => q.kind === 'shockwave' && !q.dead && !q.friendly).map((q) => ({ x: q.cx, vx: q.vx })),
    });
    /** Sim frames since what he sees happened. */
    const ago = sim - v.sim;
    const a = {};
    const two = v.phase === 2;
    const haste = two ? 0.8 : 1;
    const base = v.baseX;
    const side = Math.sign(p.cx - base) || 1;
    const floor = p.onGround;
    /** Where a hazard says he has to be; standing still for one; where he would like to be. */
    let must = null;
    let still = false;
    let goal = null;
    let swingAt = null;
    let hopNow = false;

    /* ------------------------------------------------- the hands, one by one */
    for (let i = 0; i < 2; i++) {
      const q = v.hands[i];
      if (q.state !== prevHand[i]) {
        if (q.state === 'lift') plan[i] = { kind: 'slam', dj: djit() };
        if (q.state === 'toEdge') plan[i] = { kind: 'sweep', dj: djit() };
        prevHand[i] = q.state;
      }
      const pl = plan[i];
      if (pl && pl.kind === 'slam') {
        if (q.state === 'track' && pl.lockX === undefined) {
          const tn = q.timer - ago / 60;
          pl.drop = sim + runsOut(tn);
          // A parry is timed off the follow he saw - if he saw enough of it.
          if (pl.parryOk === undefined) pl.parryOk = PARRY_SLAM && tn >= 0.15;
          if (tn - 0.2 + pl.dj / 60 <= 1 / 60) {
            // It has stopped, over where he stands.
            pl.lockX = Math.max(h.room.left + 40, Math.min(h.room.right - 40, p.cx));
            let dir = Math.sign(base - p.cx) || 1;
            if (h.room.space(dir) < 90) dir = -dir;
            if (pl.parryOk) {
              pl.stand = pl.lockX + dir * 8;
              pl.face = -dir;
              pl.parryAt = pl.drop + 20 - 5 + jit();
            } else {
              pl.stand = pl.lockX + dir * 64;
            }
          }
        }
        if ((q.state === 'lift' || q.state === 'track' || q.state === 'drop') && sim <= (pl.drop ?? sim) + 24) {
          if (pl.lockX !== undefined) {
            must = pl.stand;
            if (pl.parryOk && Math.abs(p.cx - pl.stand) < 3 && p.facing !== pl.face) a[pl.face > 0 ? 'right' : 'left'] = true;
          } else if (q.state === 'track' && q.timer - ago / 60 < 0.45) {
            // Standing for it: it comes down on the spot it stops over.
            still = true;
          }
        }
        if (pl.parryAt !== undefined && !pl.pressed && sim >= pl.parryAt - 1) {
          pl.pressed = true;
          pressing = 2;
        }
        if (q.state === 'floor' || (q.state === 'drop' && q.y > 500)) {
          // Lying there: just stone, and a window.
          const gap = Math.abs(q.x - p.cx);
          if (goal === null || gap < Math.abs(goal - p.cx)) {
            const from = Math.sign(p.cx - q.x) || -side;
            goal = gap > 72 || gap < 48 ? q.x + from * 62 : p.cx;
          }
          if (gap < 74) swingAt = q.x;
        }
      } else if (pl && pl.kind === 'sweep') {
        if (q.state === 'lower' || q.state === 'sweepWind' || q.state === 'sweep') {
          const speed = two ? 660 : 560;
          const dir = q.dir;
          let start;
          let x0;
          if (q.state === 'sweepWind') {
            const tn = q.timer - ago / 60;
            const n = runsOut(tn);
            start = sim + n;
            x0 = q.x - (dir * 14 * (ago + n)) / 60;
            if (pl.parryOk === undefined) pl.parryOk = PARRY_SWEEP && tn >= 0.15;
          } else if (q.state === 'lower') {
            const wind = Math.round(0.78 * haste * 60);
            start = sim + runsOut(q.timer - ago / 60) + wind;
            x0 = q.x - (dir * 14 * wind) / 60;
            if (pl.parryOk === undefined) pl.parryOk = PARRY_SWEEP;
          } else {
            start = sim - ago;
            x0 = q.x;
            if (pl.parryOk === undefined) pl.parryOk = false;
          }
          // The first frame its hand is on him, if he stays where he is.
          let hit = -1;
          if (Math.sign(p.cx - x0) === dir) {
            for (let k = 1; k < 200; k++) {
              if (Math.abs(x0 + (dir * speed * k) / 60 - p.cx) < 33) {
                hit = start + k;
                break;
              }
            }
          }
          if (hit > 0 && hit - sim < 45) {
            still = true;
            if (pl.parryOk) {
              if (pl.jit === undefined) pl.jit = jit();
              const face = dir > 0 ? -1 : 1;
              if (p.facing !== face) a[face > 0 ? 'right' : 'left'] = true;
              if (!pl.pressed && sim >= hit - 5 + pl.jit - 1) {
                pl.pressed = true;
                pressing = 2;
              }
            } else if (!pl.hopped && sim >= hit - 12 - 1 + pl.dj) {
              // A low hop: clear of the hand from 7 frames after the press for 19.
              pl.hopped = true;
              hopNow = true;
            }
          }
        }
      }
    }

    /* ------------------------------------------------------------ the sun */
    if (v.state === 'gaze' && !v.beam) {
      // It comes down where he stands as Ankhor's look ends: he goes then.
      if (v.timer - ago / 60 <= 1 / 60) {
        if (!beamDir) beamDir = h.room.space(1) > h.room.space(-1) ? 1 : -1;
        must = p.cx + beamDir * 120;
      }
    } else if (v.beam && v.beam.stage !== 'fade') {
      const speed = two ? 185 : 150;
      let bx = v.beam.x;
      if (v.beam.stage === 'burn') bx += Math.sign(p.cx - bx) * Math.min(Math.abs(p.cx - bx), (speed * ago) / 60);
      const gap = p.cx - bx;
      if (!beamDir) beamDir = Math.sign(gap) || (h.room.space(1) > h.room.space(-1) ? 1 : -1);
      if (Math.sign(gap) && Math.sign(gap) !== beamDir && Math.abs(gap) > 30) beamDir = Math.sign(gap);
      if (Math.abs(gap) < 100 || v.beam.stage === 'mark') {
        must = p.cx + beamDir * 120;
        // Cornered: through it, rolling, timed off where he sees it.
        if (h.room.space(beamDir) < 20 && v.beam.stage === 'burn' && rollAt < 0 && Math.abs(gap) < 80) {
          rollAt = sim + Math.max(0, Math.round((Math.abs(gap) - 36) / (speed / 60))) + jit();
        }
      }
    } else {
      beamDir = 0;
      rollAt = -1;
    }
    if (rollAt >= 0 && v.beam) {
      const toward = Math.sign(v.beam.x - p.cx) || 1;
      must = null;
      still = true;
      if (p.facing !== toward) a[toward > 0 ? 'right' : 'left'] = true;
      if (sim >= rollAt - 1 && p.facing === toward) {
        a.dash = true;
        rollAt = -1;
      }
    }

    /* ------------------------------------------------------ his head, sagging */
    if (v.state === 'slumped' || (v.slump > 0.8 && v.state !== 'dying')) {
      const off = p.cx - base;
      goal = Math.abs(off) > 72 || Math.abs(off) < 40 ? base + (Math.sign(off) || 1) * 58 : p.cx;
      if (v.headY + 36 > 548 && Math.abs(off) < 37 + 44) swingAt = base;
    }

    /* ----------------------------------------------------------- shockwaves */
    // Every passage of a shockwave over the spot he is at (or making for), as
    // sim frames [in, out]: the ones a landing fist is about to throw, and
    // the ones he sees, led.
    const at = must !== null ? must : p.cx;
    const passes = [];
    if (two) {
      for (const pl of plan) {
        if (!pl || pl.kind !== 'slam' || pl.lockX === undefined || pl.parryAt !== undefined) continue;
        const land = pl.drop + 22;
        if (sim > land + ago + 2) continue;
        const off = Math.abs(at - pl.lockX);
        if (off < 12) continue;
        passes.push([land + Math.max(0, Math.ceil((off - 56) / WV)), land + Math.floor((off - 12) / WV)]);
      }
      for (const w of v.waves) {
        const x = w.x + (w.vx * ago) / 60;
        const d = Math.abs(at - x);
        if (Math.sign(at - x) === Math.sign(w.vx)) passes.push([sim + Math.max(1, Math.ceil((d - 22) / WV)), sim + Math.floor((d + 22) / WV)]);
        else if (d < 22) passes.push([sim + 1, sim + Math.ceil((22 - d) / WV)]);
      }
    }
    const next = passes.filter((s) => s[1] > sim).sort((m, n) => m[0] - n[0]);
    if (next.length && floor && !jump.busy) {
      // A low hop is clear of a wave from 3 frames after the press to 30:
      // as late as clears the first, as early as clears the most after it.
      const first = next[0][0];
      let last = next[0][1];
      for (const s of next) if (s[1] - 30 <= first - 3) last = Math.max(last, s[1]);
      const press = Math.min(first - 3, Math.max(last - 30, Math.round((first - 3 + last - 30) / 2)));
      if (hopJit === null) hopJit = djit();
      if (sim + 1 >= press + hopJit) {
        hopNow = true;
        hopJit = null;
      }
    }

    /* --------------------------------------------------------------- moving */
    if (goal === null) goal = base + side * 110;
    const to = must !== null ? must : still ? null : goal;
    if (to !== null) {
      // Off the key in time to stop where he means to - on the floor his
      // run carries him on a little, in the air a good deal: he steers back.
      const dir = Math.sign(to - p.cx);
      const run = p.vx * dir;
      const stop = run > 0 ? (run * run) / (floor ? 4000 : 1900) : 0;
      if (Math.abs(to - p.cx) > 3 + stop) a[dir > 0 ? 'right' : 'left'] = true;
      else if (!floor && run > 30) a[dir > 0 ? 'left' : 'right'] = true;
    }
    if (swingAt !== null && must === null && !a.dash) {
      const face = Math.sign(swingAt - p.cx) || p.facing;
      if (p.facing !== face && !a.left && !a.right) a[face > 0 ? 'right' : 'left'] = true;
      if (p.facing === face) h.swing(a);
    }

    /* Ledges are for the sweep; down off one otherwise. */
    if (floor && p.bottom < FLOOR - 8 && !jump.busy && !hopNow) {
      a.down = true;
      jump.go(2);
    }
    if (hopNow && floor && !jump.busy) jump.go(9);
    if (pressing > 0) {
      a.parry = true;
      pressing--;
    }
    return jump.apply(a);
  };
}
