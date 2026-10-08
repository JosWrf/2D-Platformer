/**
 * Ignivor, read like a person reads him - a hero who has learned his moves
 * and sees them 0.3 s late:
 *
 *   - the glow hunting him: he keeps walking, away from it and towards the
 *     room he has; once it holds still he makes sure he is well clear of it,
 *     then stops and faces the spot - the head comes down short of him, and
 *     sticks. In the second half the first of a pair goes straight back under
 *     to hunt again, so he keeps moving until the second;
 *   - the head stuck, hanging after a spit, knocked down, or pulling back: in
 *     to a sword's length on his side of it, and swing;
 *   - the spit: up towards where the head comes out of the rock, to a few
 *     steps short of it; on the rhythm of the spit (he has seen the wind-up)
 *     the rest of the way in under the head - the clots come down where he
 *     stood and beyond, never between him and the head;
 *   - the fire wave: onto the nearest low ledge, until the floor below has
 *     stopped burning, then down again;
 *   - burning pools and clots in the air: never into them - he waits, goes
 *     round, or, with the head waiting for him, jumps a pool in the way.
 *
 * A wind-up timer he has seen is carried forward to "now" by counting only the
 * frames in which the game moved on: a hit-stop freezes the boss as well as
 * the picture, and the lag counts those frozen frames too.
 */
export default function reader(g, h) {
  const p = g.player;
  const level = g.level;
  const TILE = 32;
  const room = h.room;
  const FLOOR = room.floor;
  const see = h.lag();
  const jump = h.jumper();
  const trace = h.trace ?? null;

  /* ------------------------------------------ what the eye learns of him */

  /** The chamber's ledges, read off the room. */
  const ledges = [];
  for (let ty = 1; ty < level.height; ty++) {
    let run = null;
    for (let tx = Math.floor(room.left / TILE); tx * TILE < room.right; tx++) {
      if (level.platformAt(tx, ty)) {
        if (run) run.x1 = (tx + 1) * TILE;
        else run = { y: ty * TILE, x0: tx * TILE, x1: (tx + 1) * TILE };
      } else if (run) {
        ledges.push(run);
        run = null;
      }
    }
    if (run) ledges.push(run);
  }
  /** The low ledges, a single jump up and above the fire of the wave. */
  const lows = ledges.filter((l) => l.y > FLOOR - 140 && l.y < FLOOR);
  const ledgeUnder = () =>
    p.onGround ? (ledges.find((l) => Math.abs(p.bottom - l.y) < 3 && p.x + p.w > l.x0 && p.x < l.x1) ?? null) : null;

  /** How long the glow holds still before he bursts out of it. */
  const LOCK = 0.55;
  const HOLD = 22;
  const DT = 1 / 60;
  /** Ticks of a timer still to run, counted down a frame at a time, until it is at or below `to`. */
  const ticksTo = (t, to = 0) => {
    let n = 0;
    while (t > to && n < 900) {
      t -= DT;
      n++;
    }
    return n;
  };
  const overlap = (a1, b1) => a1.x < b1.x + b1.w && a1.x + a1.w > b1.x && a1.y < b1.y + b1.h && a1.y + a1.h > b1.y;
  const clampX = (x) => Math.max(room.left + 14, Math.min(room.right - 14, x));
  const spaceTo = (dir) => (dir > 0 ? room.right - p.cx : p.cx - room.left);
  /** The blade's box in front of him, as he faces now. */
  const blade = () => ({ x: p.facing > 0 ? p.x + p.w - 4 : p.x - 36, y: p.cy - 18, w: 40, h: 32 });

  /**
   * Fire on the floor as the eye has it: the pools that burn, and where the
   * clots in the air will come down and burn. Each one is a stretch of floor
   * that hurts from `from` to `to`, seconds from now, within 26 px of x.
   */
  const fires = (v, ago) => {
    const out = [];
    for (const q of v.pools) {
      const left = q.life - ago - 0.3;
      if (left > 0) out.push({ x: q.x, from: -1, to: left });
    }
    for (const q of v.globs) {
      // Where it comes down, along the arc it was seen on - by now it may be down already.
      const dy = Math.max(0, FLOOR - 9 - q.y);
      const t = (-q.vy + Math.sqrt(Math.max(0, q.vy * q.vy + 1960 * dy))) / 980 - ago;
      // Coming down at his height a moment before the floor, and burning there after.
      out.push({ x: q.x + q.vx * (t + ago), from: t - 0.2, to: t + 2.0, glob: true });
    }
    return out;
  };
  const burns = (list, x, t0, t1, margin = 34) => list.some((f) => f.to >= t0 && f.from <= t1 && Math.abs(f.x - x) < margin);

  /* -------------------------------------------------------------- memory */

  let live = 0;
  let frozen = false;
  let prev = null;
  /** The hunt under way: the way he keeps walking, and where the glow held. */
  let hunt = null;
  /** Breaches seen since the hunt began, and where the last one came out. */
  let breaches = 0;
  let hole = null;
  /** Whether the breach in the air comes down on the floor. */
  let lands = false;
  /** The spit he is answering. */
  let spit = null;
  /** The ledge he is making for while the floor burns. */
  let refuge = null;
  /** Frames left to hold "down" while dropping through the boards. */
  let dropHold = 0;

  return (boss) => {
    if (!frozen) live++;
    frozen = g.hitStopTimer > 0;
    const v = see({
      live,
      state: boss.state,
      timer: boss.timer,
      hx: boss.hx,
      hy: boss.hy,
      hvx: boss.hvx,
      phase2: boss.phaseTwo,
      pools: boss.pools.map((q) => ({ x: q.x, life: q.life })),
      pillars: boss.pillars.map((q) => ({ x: q.x, t: q.t })),
      globs: g.projectiles
        .filter((q) => q.kind === 'magma' && !q.dead && !q.friendly)
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy })),
    });
    const ticks = live - v.live;
    const ago = ticks / 60;
    const s = v.state;
    const was = prev ? prev.state : null;
    const a = {};
    const stand = ledgeUnder();
    const onFloor = p.onGround && p.bottom > FLOOR - 3;
    const fire = fires(v, ago);
    const hx = v.hx;
    const headUp = v.hy < FLOOR + 6;
    let done = false;

    /** Along the floor towards x, not into fire: wait for it, or - when it is worth it - jump it. */
    const goTo = (x, tol = 6, mayHop = false) => {
      x = clampX(x);
      const d = x - p.cx;
      if (Math.abs(d) <= tol) return true;
      const dir = Math.sign(d);
      let blocked = null;
      for (let k = 1; k <= 27 && !blocked; k++) {
        const t = k / 60;
        const at = p.cx + dir * Math.min(Math.abs(d), 235 * t);
        for (const f of fire) {
          if (t < f.from || t > f.to) continue;
          if (Math.abs(f.x - at) < 32 && Math.abs(f.x - p.cx) >= 30) {
            blocked = f;
            break;
          }
        }
      }
      if (!blocked) {
        a[dir > 0 ? 'right' : 'left'] = true;
        return false;
      }
      if (mayHop && !blocked.glob && p.onGround && !jump.busy && Math.abs(p.vx) > 120 && Math.sign(p.vx) === dir) {
        // Over the pool, if he comes down clear of fire.
        const down = p.cx + dir * 150;
        if (!burns(fire, down, 0.5, 1.0) && Math.abs(blocked.x - p.cx) < 60) {
          jump.go(HOLD);
          a[dir > 0 ? 'right' : 'left'] = true;
        }
      }
      return false;
    };
    /** Whether a walk from here to x crosses no fire, and x stays clear a while after. */
    const clearWalk = (x, stay = 0.6) => {
      const n = Math.abs(x - p.cx);
      const dir = Math.sign(x - p.cx);
      for (let e = 20; e < n; e += 6) {
        const t = e / 235 + 0.05;
        if (burns(fire, p.cx + dir * e, t - 0.05, t + 0.1, 30)) return false;
      }
      return !burns(fire, x, n / 235, n / 235 + stay, 34);
    };
    /** The head coming down out of a breach lands short of him: never a step towards it. */
    const towardBite = (x) => s === 'breach' && lands && hole !== null && Math.sign(x - p.cx) === Math.sign(hole - p.cx);
    /** Out of fire that is about to burn where he stands. */
    const outOfFire = () => {
      if (!onFloor || !burns(fire, p.cx, 0, 0.45, 32)) return false;
      for (let d = 8; d < 300; d += 8) {
        for (const dir of [1, -1]) {
          const x = p.cx + dir * d;
          if (x < room.left + 14 || x > room.right - 14 || towardBite(x)) continue;
          if (clearWalk(x)) {
            a.left = false;
            a.right = false;
            h.walkTo(a, x, 2);
            return true;
          }
        }
      }
      return false;
    };
    /** Down through the boards he stands on. */
    const getDown = () => {
      if (dropHold === 0 && stand && !jump.busy) {
        dropHold = 34;
        jump.go(30);
      }
    };
    /** In to a sword's length of the head, on his side of it, and swing. */
    const hitHead = (box, mayHop) => {
      if (Math.abs(p.cx - hx) > 66) {
        const side = Math.sign(hx - p.cx) || p.facing;
        let spot = hx - side * 46;
        if (burns(fire, spot, 0, 1, 34)) {
          const other = hx + side * 46;
          if (!burns(fire, other, 0, 1, 34)) spot = other;
        }
        goTo(spot, 10, mayHop);
      } else h.face(a, hx);
      if (overlap(blade(), box)) h.swing(a);
    };

    /* ----------------------------------------------- what he is doing */
    if (s === 'hunt' && was !== 'hunt' && was !== 'breach') {
      breaches = 0;
      hunt = null;
    }
    if (s === 'hunt' && was === 'breach' && hunt) {
      // Straight back under to hunt again: a new glow, not the old hole.
      hunt.lock = null;
      hole = null;
    }
    if (s === 'breach' && was !== 'breach') {
      breaches++;
      hole = hx;
      // A hunt's breach comes down on the floor - except the first of a pair, in his second half.
      lands = was === 'hunt' && !(v.phase2 && breaches === 1);
      if (trace) trace.push({ f: h.frame, ev: 'breach', hole, lands, breaches, cx: Math.round(p.cx) });
    }
    if (s !== 'hunt' && s !== 'breach') hunt = null;
    if (s !== 'spitWind' && s !== 'exposed' && s !== 'rise') spit = null;
    const waving = s === 'waveEdge' || s === 'waveWind' || s === 'wave';
    if (!waving && !(stand && refuge === stand)) refuge = null;

    /* ------------------------------------------------- the fire wave */
    if (waving || (refuge && stand === refuge)) {
      // Pillars still standing below him, or about to.
      const burning = v.pillars.some((q) => q.t + ago < 0.78 && Math.abs(q.x - p.cx) < 60);
      if (stand && (waving || burning)) {
        refuge = stand;
        h.face(a, hx);
        done = true;
      } else if (!stand && waving) {
        if (!refuge) {
          // The nearest low ledge.
          let best = null;
          for (const l of lows) {
            const c = (l.x0 + l.x1) / 2;
            const d = Math.max(0, Math.abs(p.cx - c) - (l.x1 - l.x0) / 2 + 20);
            if (!best || d < best.d) best = { l, d };
          }
          refuge = best ? best.l : null;
        }
        if (refuge) {
          const c = (refuge.x0 + refuge.x1) / 2;
          const half = (refuge.x1 - refuge.x0) / 2 - 16;
          if (p.onGround) {
            const ahead = p.cx + p.vx * 0.36;
            if (Math.abs(ahead - c) < half && Math.abs(p.cx - c) < half + 70 && !jump.busy) jump.go(HOLD);
            h.walkTo(a, c, 4);
          } else {
            h.walkTo(a, c, 10);
          }
        }
        done = true;
      }
    }
    if (!done && stand) {
      // Nothing to wait out up here: back down to the floor.
      getDown();
      done = true;
    }

    /* --------------------------------------------- his hunt, and the breach */
    if (!done && (s === 'hunt' || s === 'breach')) {
      if (!hunt) hunt = { lock: null };
      if (s === 'hunt' && v.timer < LOCK) hunt.lock = hx;
      if (s === 'breach' && hole !== null) hunt.lock = hole;
      const L = hunt.lock;
      // Where the glow is by now (led along the way it was going), or where it held.
      const glow = L !== null && !(s === 'breach' && !lands) ? L : clampX(hx + (s === 'hunt' ? v.hvx * ago : 0));
      // Clear of a spot that has stopped; well clear of one still coming, or of a
      // breach that goes back under to hunt again.
      const far = L !== null && (s === 'hunt' || lands) ? 130 : 180;
      const d = p.cx - glow;
      if (Math.abs(d) < far) {
        let dir = Math.sign(d) || (spaceTo(1) > spaceTo(-1) ? 1 : -1);
        // Cornered: past it while it still moves, or out of it the other way.
        if (spaceTo(dir) < 40) dir = -dir;
        goTo(p.cx + dir * 60, 2, true);
      } else {
        h.face(a, glow);
      }
      done = true;
    }

    /* ------------------------------------------------- the spit */
    if (!done && (s === 'rise' || s === 'spitWind')) {
      const side = Math.sign(hx - p.cx) || 1;
      if (s === 'spitWind' && !spit) spit = { at: v.live + ticksTo(v.timer) - 1 };
      if (spit && live >= spit.at) {
        // It has gone: in under the head.
        goTo(hx - side * 10, 4, false);
        h.face(a, hx);
      } else {
        const spot = hx - side * 55;
        if (Math.abs(p.cx - spot) > 10) goTo(spot, 6, false);
        else h.face(a, hx);
      }
      done = true;
    }

    /* ------------------------------------------------- the head, in reach */
    if (!done && (s === 'stuck' || s === 'exposed' || s === 'stunned' || (s === 'sink' && headUp))) {
      if (s === 'exposed' && spit && live < spit.at + 50 && Math.abs(p.cx - hx) > 14) {
        // Still on the way in under it, off the spot the clots were aimed at.
        const side = Math.sign(hx - p.cx) || 1;
        goTo(hx - side * 10, 4, false);
        h.face(a, hx);
        if (overlap(blade(), { x: hx - 40, y: v.hy - 32, w: 80, h: 64 })) h.swing(a);
      } else hitHead({ x: hx - 40, y: v.hy - 32, w: 80, h: 64 }, s !== 'sink');
      done = true;
    }

    /* --------------------------------------------- idle: a good place to be */
    if (!done) {
      if (Math.abs(p.cx - room.mid) > 220) goTo(room.mid + Math.sign(p.cx - room.mid) * 160, 20, false);
      done = true;
    }

    // Never stand in fire.
    if (onFloor && !jump.busy) {
      if (outOfFire()) {
        a.attack = false;
      }
    }
    if (dropHold > 0) {
      a.down = true;
      dropHold--;
    }
    prev = v;
    return jump.apply(a);
  };
}
