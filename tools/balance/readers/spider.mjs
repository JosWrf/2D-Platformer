/**
 * Arachna, read like a person reads her - a hero who has learned her moves
 * and sees them 0.3 s late:
 *
 *   - up on her thread: out of reach from the floor, so up the low step and
 *     onto the high ledge nearest to him, under her, and swing until she
 *     loses her grip;
 *   - on her back, sitting after a drop, or falling: down to the floor (through
 *     the boards) and in to a sword's length, and swing;
 *   - her drop, when he stands on the floor: he lets the ring settle under
 *     him, steps a little off its middle when it holds still (on the rhythm of
 *     her drawing up), turns to face her and parries as she comes down - with
 *     a person's error in the timing, and only if he saw the drawing-up with
 *     time to spare. If he cannot parry it, he runs out of the ring;
 *   - her swing across the chamber: if the arc passes through where he
 *     stands he steps out of it when there is time, and jumps it when not;
 *   - her young get swatted when they come close, eggs near him on the floor
 *     get popped before they hatch, silk coming down on him on the floor gets
 *     a step aside, and a patch he is stuck in gets cut.
 */
export default function reader(g, h) {
  const p = g.player;
  const level = g.level;
  const TILE = 32;
  const DT = 1 / 60;
  const room = h.room;
  const FLOOR = room.floor;
  const see = h.lag();
  const jump = h.jumper();
  const trace = h.trace ?? null;

  /* ------------------------------------------- what the eye learns of her */

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
  /** The high ledges - level with her - each with the low step up to it. */
  const highs = [];
  for (const hi of ledges) {
    if (hi.y > FLOOR - 140) continue;
    const step = ledges.find((l) => l.y > hi.y && l.y < FLOOR && l.x1 > hi.x0 && l.x0 < hi.x1);
    if (!step) continue;
    hi.step = step;
    hi.upX = (Math.max(hi.x0, step.x0) + Math.min(hi.x1, step.x1)) / 2;
    highs.push(hi);
  }
  const ledgeUnder = () =>
    p.onGround ? (ledges.find((l) => Math.abs(p.bottom - l.y) < 3 && p.x + p.w > l.x0 && p.x < l.x1) ?? null) : null;

  /** Ticks of a timer still to run, counted down a frame at a time, until it is at or below `to`. */
  const ticksTo = (t, to = 0) => {
    let n = 0;
    while (t > to && n < 900) {
      t -= DT;
      n++;
    }
    return n;
  };
  /** Her drop, as learned: she draws up 34 px over her hanging height and lets go from there. */
  let DROP_FALL = 0;
  for (let by = FLOOR - 244, vy = 120; by < FLOOR - 30 && DROP_FALL < 120; DROP_FALL++) {
    vy += 2600 * DT;
    by += vy * DT;
  }
  /** A jump of the hero's own, held for `hold` frames: height above the take-off, per tick from the press. */
  const jumpArc = (sticky, hold) => {
    const out = [];
    let vy = 0;
    let y = 0;
    for (let k = 0; k < 120; k++) {
      const held = k < hold;
      vy = Math.min(780, vy + (vy < 0 && k > 0 && k - 1 < hold ? 1750 : 2250) * DT);
      if (k === 0) vy = -600 * (sticky ? 0.8 : 1);
      if (!held && vy < -280) vy = -280;
      y += vy * DT;
      if (k > 0 && y >= 0) break;
      out.push(-y);
    }
    return out;
  };
  const HOLD = 22;

  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : v > t ? Math.max(v - d, t) : v);
  const overlap = (a1, b1) => a1.x < b1.x + b1.w && a1.x + a1.w > b1.x && a1.y < b1.y + b1.h && a1.y + a1.h > b1.y;
  const clampX = (x) => Math.max(room.left + 14, Math.min(room.right - 14, x));
  const spaceTo = (dir) => (dir > 0 ? room.right - p.cx : p.cx - room.left);
  /** The blade's box in front of him, as he faces now. */
  const blade = () => ({ x: p.facing > 0 ? p.x + p.w - 4 : p.x - 36, y: p.cy - 18, w: 40, h: 32 });

  /**
   * Her swing from what was seen: the ball's centre for each tick to come
   * (index 0 is this frame's tick), null while she is still drawing back.
   */
  const swingPath = (v, ticks) => {
    const R = v.len;
    const ax = v.anchorX;
    const ay = v.ceil;
    let th;
    let om;
    let crossed;
    let wait = 0;
    if (v.state === 'swingWind') {
      // Drawing back to a radian out, on the side away from him: where she
      // will be when she lets go, followed out as she eases there.
      const side = p.cx > ax ? -1 : 1;
      const tx = ax + Math.sin(side) * R;
      const ty = ay + Math.cos(side) * R;
      const left = ticksTo(v.timer);
      let bx = v.bx;
      let by = v.by;
      const k = 1 - Math.exp(-4 * DT);
      for (let i = 0; i < left; i++) {
        bx += (tx - bx) * k;
        by += (ty - by) * k;
      }
      th = Math.atan2(bx - ax, by - ay);
      om = 0;
      crossed = false;
      wait = left - ticks;
    } else {
      th = v.ang;
      om = v.angV;
      crossed = v.crossed;
      wait = -ticks;
    }
    const out = [];
    for (let k = 0; k < Math.max(0, wait); k++) out.push(null);
    let skip = Math.max(0, -wait);
    for (let k = 0; k < 400; k++) {
      om += (-1900 / R) * Math.sin(th) * DT;
      const before = th;
      th += om * DT;
      if (Math.sign(before) !== Math.sign(th)) crossed = true;
      const done = crossed && Math.sign(om) !== Math.sign(th);
      if (skip > 0) skip--;
      else out.push({ x: ax + Math.sin(th) * R, y: ay + Math.cos(th) * R });
      if (done) break;
    }
    return out;
  };
  /** Ticks (from now) in which the ball would touch him, standing at x with his feet at `bottom`. */
  const swingHits = (path, x, bottom, rise = null, at = 0) => {
    const hits = [];
    for (let k = 0; k < path.length; k++) {
      const c = path[k];
      if (!c) continue;
      let b = bottom;
      if (rise && k >= at && k - at < rise.length) b = bottom - rise[k - at];
      if (overlap({ x: c.x - 26, y: c.y - 26, w: 52, h: 52 }, { x: x - p.w / 2, y: b - p.h, w: p.w, h: p.h })) hits.push(k);
    }
    return hits;
  };

  /**
   * Whether walking to x (and standing there) keeps him clear of her swing:
   * his own steps, tick by tick, against where the ball will be.
   */
  const walkClear = (path, x, tol = 3) => {
    let cx = p.cx;
    let vx = p.vx;
    const run = p.sticky > 0 ? 235 * 0.55 : 235;
    for (let k = 0; k < path.length; k++) {
      const d = x - cx;
      vx = Math.abs(d) > tol ? approach(vx, Math.sign(d) * run, 1500 * DT) : approach(vx, 0, 2000 * DT);
      cx += vx * DT;
      const c = path[k];
      if (c && overlap({ x: c.x - 26, y: c.y - 26, w: 52, h: 52 }, { x: cx - p.w / 2, y: p.bottom - p.h, w: p.w, h: p.h })) return false;
    }
    return true;
  };

  /* -------------------------------------------------------------- memory */

  let live = 0;
  let frozen = false;
  let prev = null;
  /** The drop being answered. */
  let drop = null;
  /** A jump planned over her swing, by the frame it is pressed in. */
  let hop = null;
  /** Where he is walking to, out of the arc of her swing. */
  let escape = null;
  /** Frames left to hold "down" while dropping through the boards. */
  let dropHold = 0;

  return (boss) => {
    if (!frozen) live++;
    frozen = g.hitStopTimer > 0;
    const v = see({
      live,
      state: boss.state,
      timer: boss.timer,
      bx: boss.bx,
      by: boss.by,
      anchorX: boss.anchorX,
      dropX: boss.dropX,
      ang: boss.swingAngle,
      angV: boss.swingSpeed,
      crossed: boss.crossed,
      len: boss.swingLength,
      ceil: boss.ceilingY,
      box: { x: boss.x, y: boss.y, w: boss.w, h: boss.h },
      eggs: boss.eggs.map((e) => ({ x: e.x, landed: e.landed, t: e.t })),
      patches: boss.patches.map((q) => ({ x: q.x, life: q.life })),
      webs: g.projectiles
        .filter((q) => q.kind === 'web' && !q.dead && !q.friendly)
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy })),
      young: g.enemies.filter((e) => e.kind === 'spiderling' && !e.dead).map((e) => ({ x: e.cx, y: e.cy, vx: e.vx })),
    });
    const ticks = live - v.live;
    const ago = ticks / 60;
    const s = v.state;
    const a = {};
    const stand = ledgeUnder();
    const onFloor = p.onGround && p.bottom > FLOOR - 3;
    const high = stand && highs.includes(stand) ? stand : null;
    // Her body, led by how she was moving.
    const vbx = prev && prev.state === s ? Math.max(-200, Math.min(200, (v.bx - prev.bx) * 60)) : 0;
    const herX = v.bx + (s === 'hang' || s === 'webWind' || s === 'broodWind' ? vbx * ago : 0);
    const herBox = { x: v.box.x + (herX - v.bx), y: v.box.y, w: v.box.w, h: v.box.h };
    let done = false;
    const walk = (x, tol = 6) => h.walkTo(a, clampX(x), tol);
    const swingAt = (box) => {
      if (overlap(blade(), box)) h.swing(a);
    };
    /** Down through the boards he stands on, holding down until he is through all of them. */
    const getDown = () => {
      if (dropHold === 0 && stand && !jump.busy) {
        dropHold = 34;
        jump.go(30);
      }
    };

    /* ------------------------------------------------------- her drop */
    if (s === 'dropWind' && (!prev || prev.state !== 'dropWind')) {
      const windLeft = ticksTo(v.timer);
      const lock = ticksTo(v.timer, 0.24);
      const canParry = onFloor && (windLeft - ticks) / 60 >= 0.15 && p.hurtTimer <= 0;
      const jitter = Math.round((Math.random() * 2 - 1) * 0.07 * 60);
      const side = spaceTo(1) > spaceTo(-1) ? 1 : -1;
      drop = {
        lockAt: v.live + lock,
        landAt: v.live + windLeft + DROP_FALL - 1,
        pressAt: v.live + windLeft + DROP_FALL - 6 + jitter,
        parry: canParry,
        side,
        mark: null,
        pressed: false,
        settled: false,
      };
      if (trace) trace.push({ f: h.frame, ev: 'dropSeen', live, drop: { ...drop }, ticks });
    }
    if (drop && live > drop.landAt + 3 && s !== 'dropWind' && s !== 'drop') drop = null;
    if (drop) {
      if (drop.parry && p.bottom > FLOOR - 70) {
        if (live >= drop.lockAt) {
          // The ring has stopped following him: it is where he stands.
          if (drop.mark === null) drop.mark = p.cx;
          if (s === 'drop' || (s === 'dropWind' && v.timer <= 0.24)) drop.mark = v.dropX;
          let spot = drop.mark + drop.side * 24;
          if (spot < room.left + 20 || spot > room.right - 20) spot = drop.mark - drop.side * 24;
          if (!drop.settled && Math.abs(p.cx - spot) > 5) walk(spot, 5);
          else {
            drop.settled = true;
            h.face(a, drop.mark);
          }
        }
        if (!drop.pressed && live >= drop.pressAt) {
          a.parry = true;
          drop.pressed = true;
          if (trace) trace.push({ f: h.frame, ev: 'parry', live, cx: p.cx, facing: p.facing, mark: drop.mark });
        }
        done = true;
      } else if (p.bottom > FLOOR - 70) {
        // Out of the ring, and far enough that she cannot land on him.
        const held = s === 'drop' || (s === 'dropWind' && v.timer <= 0.24);
        const mark = held ? v.dropX : p.cx;
        let dir = held ? Math.sign(p.cx - mark) || drop.side : drop.side;
        if (spaceTo(dir) < 40) dir = -dir;
        if (Math.abs(p.cx - mark) < 90) a[dir > 0 ? 'right' : 'left'] = true;
        done = true;
      }
    }

    /* ------------------------------------------------------ her swing */
    const arc = s === 'swingWind' || s === 'swing' ? swingPath(v, ticks) : null;
    if (!arc) {
      hop = null;
      escape = null;
    }
    if (!done && arc) {
      const here = swingHits(arc, p.cx, p.bottom);
      if (trace) trace.push({ f: h.frame, ev: 'swing', s, here: here.slice(0, 2), cx: Math.round(p.cx), esc: escape, hop: hop ? hop.at - live : null });
      if (hop) {
        if (live >= hop.at) {
          if (p.onGround && !jump.busy) jump.go(HOLD);
          hop = null;
        }
        done = true;
      } else if (here.length && p.onGround) {
        // Out of the arc on foot if he can get there in time; over it if not.
        if (escape !== null && !walkClear(arc, escape)) escape = null;
        if (escape === null) {
          const span = stand ? { x0: stand.x0 + 4, x1: stand.x1 - 4 } : { x0: room.left + 12, x1: room.right - 12 };
          for (let d = 4; d < 420 && escape === null; d += 4) {
            for (const dir of [1, -1]) {
              const x = p.cx + dir * d;
              if (x < span.x0 || x > span.x1) continue;
              if (walkClear(arc, x)) {
                escape = x;
                break;
              }
            }
          }
        }
        if (escape !== null) {
          walk(escape, 3);
        } else {
          const rise = jumpArc(p.sticky > 0, HOLD);
          let run = [];
          let bestRun = [];
          for (let j = 0; j <= here[0]; j++) {
            if (swingHits(arc, p.cx, p.bottom, rise, j).length === 0) run.push(j);
            else {
              if (run.length > bestRun.length) bestRun = run;
              run = [];
            }
          }
          if (run.length > bestRun.length) bestRun = run;
          if (bestRun.length) {
            hop = { at: live + bestRun[Math.floor(bestRun.length / 2)] };
            if (trace) trace.push({ f: h.frame, ev: 'hopPlan', live, at: hop.at, run: bestRun.length, first: here[0] });
          }
        }
        done = true;
      } else if (escape !== null && p.onGround) {
        // Out of it: stay out.
        walk(escape, 3);
        done = true;
      }
    }

    /* --------------------------------------------------- her young */
    if (!done && p.onGround) {
      let near = null;
      for (const y of v.young) {
        const x = y.x + Math.max(-150, Math.min(150, y.vx)) * ago;
        if (Math.abs(y.y - p.cy) > 34) continue;
        if (Math.abs(x - p.cx) < 60 && (!near || Math.abs(x - p.cx) < Math.abs(near - p.cx))) near = x;
      }
      if (near !== null) {
        if (Math.sign(near - p.cx) !== p.facing && Math.abs(near - p.cx) > 4) h.face(a, near);
        else h.swing(a);
        done = true;
      }
    }

    /* ------------------------------------------- down: go and hit her */
    const down =
      s === 'stunned' || s === 'righting' || s === 'grounded' || s === 'fall' || (s === 'climb' && v.by > FLOOR - 105);
    if (!done && down) {
      if (stand) {
        getDown();
      } else if (onFloor || (!p.onGround && p.bottom > FLOOR - 90)) {
        const side = p.cx < herX ? -1 : 1;
        const spot = herX + side * 34;
        if (Math.abs(p.cx - spot) > 10) walk(spot, 8);
        else h.face(a, herX);
        const box = s === 'fall' || s === 'climb' ? v.box : { x: herX - 46, y: FLOOR - 58, w: 92, h: 56 };
        swingAt(box);
      }
      done = true;
    }

    /* ------------------------------------------- up: on the ledge with her */
    if (!done && high) {
      const want = Math.max(high.x0 + 10, Math.min(high.x1 - 10, herX + (p.cx < herX ? -26 : 26)));
      if (Math.abs(p.cx - want) > 12) walk(want, 8);
      else h.face(a, herX);
      swingAt(herBox);
      done = true;
    }

    /* ---------------------------------- on the floor: eggs, silk, the climb */
    if (!done && onFloor) {
      // An egg close by, with time to get to it before it hatches.
      let egg = null;
      for (const e of v.eggs) {
        if (!e.landed) continue;
        const left = 2.3 - e.t - ago;
        const d = Math.abs(e.x - p.cx);
        if (d < 150 && left > d / 200 + 0.25 && (!egg || d < Math.abs(egg.x - p.cx))) egg = e;
      }
      if (egg) {
        const side = p.cx < egg.x ? -1 : 1;
        const spot = egg.x + side * 24;
        if (Math.abs(p.cx - spot) > 8) walk(spot, 6);
        else h.face(a, egg.x);
        swingAt({ x: egg.x - 10, y: FLOOR - 22, w: 20, h: 22 });
        done = true;
      }
    }
    if (!done && onFloor && p.sticky > 0) {
      // Stuck in silk: cut it away.
      const patch = v.patches.find((q) => Math.abs(q.x - p.cx) < 36);
      if (patch) {
        h.face(a, patch.x);
        h.swing(a);
        done = true;
      }
    }
    if (!done) {
      // Up to the high ledge nearest him, by way of its step.
      let target = null;
      for (const hi of highs) {
        const cost = stand === hi.step ? -1 : Math.abs(p.cx - hi.upX) + 0.3 * Math.abs(herX - hi.upX);
        if (!target || cost < target.cost) target = { hi, cost };
      }
      const hi = target?.hi;
      if (hi && p.onGround) {
        const from = stand === hi.step ? hi.upX : Math.max(hi.step.x0 + 24, Math.min(hi.step.x1 - 24, hi.upX));
        if (stand && stand !== hi.step) {
          getDown();
        } else if (Math.abs(p.cx - from) > 6) walk(from, 4);
        else if (Math.abs(p.vx) < 40 && p.sticky <= 0 && !jump.busy && !arc) jump.go(HOLD);
      }
    }

    /* ---------------------------------------- silk coming down on him */
    if (onFloor && !(drop && drop.parry) && !hop) {
      for (const q of v.webs) {
        const x = q.x + q.vx * ago;
        const y = q.y + q.vy * ago + 350 * ago * ago;
        const vy = q.vy + 700 * ago;
        const dy = p.cy - y;
        if (dy < -20) continue;
        const t = (-vy + Math.sqrt(Math.max(0, vy * vy + 1400 * dy))) / 700;
        const land = x + q.vx * t;
        if (t < 0.6 && Math.abs(land - p.cx) < 22) {
          a.left = false;
          a.right = false;
          let dir = land > p.cx ? -1 : 1;
          if (spaceTo(dir) < 30) dir = -dir;
          a[dir > 0 ? 'right' : 'left'] = true;
          break;
        }
      }
    }

    if (arc && p.onGround && escape === null && !hop && (a.left || a.right)) {
      // Whatever else he means to do, not into the arc of her swing.
      const dir = a.right ? 1 : -1;
      if (!walkClear(arc, p.cx + dir * 80)) {
        a.left = false;
        a.right = false;
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
