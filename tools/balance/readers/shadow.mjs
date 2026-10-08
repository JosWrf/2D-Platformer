/**
 * Umbra, read like a person reads it: everything it does is seen 0.3 s late,
 * and what moves is led by those 0.3 s.
 *
 * Its combo is announced for 0.38 s (0.3 in its second half) - no longer than
 * the eye is behind - so there is no parrying it on sight. A person who knows
 * it can still get out of its way: away at a run the moment the eyes flare
 * (the crescents cannot catch a hero who is already running), or, with a wall
 * at his back, up and over it. Then back in, and cut while it stands in its
 * follow-through. The rest:
 *
 *   - its charged blow: a plain cut first - that one comes unannounced and
 *     he takes it - then the ring, long enough to be read, and the heavy blow
 *     when it is close: that one he parries, on the rhythm of the ring and the
 *     walk in, with a person's error in the press (up to 0.07 s either way);
 *   - its leap: he stands and parries the cut it lands with;
 *   - its step through the dark: the pool shows 0.93 s before it rises - he
 *     turns to the pool and parries the first cut;
 *   - its crescents and its quake coming at him: up as they come;
 *   - its follow-through, its reel: in, and swing - every swing started while
 *     it is still standing in it, because a swing at it once it is free again
 *     gets turned aside and answered;
 *   - otherwise: a step outside its blade, facing it, never swinging.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const dbg = (o) => {
    if (h.dbg) h.dbg.push({ at: +g.time.toFixed(2), ...o });
  };
  const room = { left: h.room.left, right: h.room.right };

  /** A person's error on a timed press: up to 0.07 s either way. */
  const jitter = () => (Math.random() * 2 - 1) * 0.07;

  // World frames: the frames in which the fight moved (hit-stop is a freeze
  // anyone sees; its timers do not run through it).
  let wf = 0;
  let frozen = null;

  let seenKey = '';
  let plan = null;
  let parryHold = 0;
  let guardUntil = -1;
  let doubleAt = -1;
  /** Running from its combo, until this frame. */
  let fleeUntil = -1;
  let fleeDir = 0;
  /** Its follow-through, known by the rhythm of the move he got out of the way of. */
  let openFrom = -1;
  let openUntil = -1;
  let lastMode = '';

  return (boss) => {
    if (frozen === false) wf++;
    frozen = g.hitStopTimer > 0;
    const b = boss.body;
    const v = see({
      wf,
      state: boss.state,
      plan: boss.plan,
      planTimer: boss.planTimer,
      timer: boss.timer,
      stepX: boss.stepX,
      phase: boss.phase,
      cx: b.cx,
      vx: b.vx,
      vy: b.vy,
      bottom: b.bottom,
      onGround: b.onGround,
      attackTimer: b.attackTimer,
      charged: b.charged,
      chargeTimer: b.chargeTimer,
      chargeReady: b.chargeReady,
      shots: h.hostile(),
    });
    const el = (wf - v.wf) / 60;
    const a = {};
    const onFloor = p.onGround;
    // Where it is now. In the air or rolling it keeps going and is led by
    // its speed; on its feet it plants the moment it acts, so it is only led
    // while it walks up - and never closer than the 34 px it keeps.
    let lead = 0;
    if (v.plan === 'leap' || v.plan === 'roll' || !v.onGround) lead = v.vx * el;
    else if (v.plan === 'stalk' || v.plan === 'riposte') {
      lead = v.vx * el;
      const gapNow = Math.abs(v.cx - p.cx);
      if (Math.sign(lead) === Math.sign(p.cx - v.cx)) lead = Math.sign(lead) * Math.min(Math.abs(lead), Math.max(0, gapNow - 40));
    }
    const ucx = Math.max(room.left + 9, Math.min(room.right - 9, v.cx + lead));
    const dx = ucx - p.cx;
    const dist = Math.abs(dx);
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const key = `${v.state}/${v.plan}`;
    const rem = v.state === 'duel' ? v.planTimer - el : v.timer - el;
    const p2 = v.phase === 2;
    const face = Math.sign(v.cx - p.cx) || Math.sign(dx) || p.facing;
    // Where the hero comes to a stop once he lets go of the keys.
    const stopX = p.cx + (Math.sign(p.vx) * p.vx * p.vx) / 4000;
    const stopDist = Math.abs(ucx - stopX);

    const decide = (kind, t, what, f, extra = {}) => {
      plan = { kind, at: wf + Math.max(0, Math.round(t * 60)), face: f, what, ...extra };
      dbg({ ev: 'plan', kind, what, in: +t.toFixed(2), dist: Math.round(dist), key });
    };

    /* --------------------------------------------- what it does, answered */
    if (key !== seenKey) {
      seenKey = key;
      if (v.state === 'duel' && v.plan === 'windup' && dist < 170) {
        // The eyes flare. The combo comes when the flare runs out - two cuts,
        // 0.62 s - then it stands for 0.8 s (0.67 in its second half). Straight
        // up as the first cut comes: both cuts and their crescents pass under
        // him, and he comes down in its follow-through.
        const start = Math.max(0, rem);
        openFrom = wf + Math.round((start + 0.62) * 60);
        openUntil = openFrom + Math.round((p2 ? 0.67 : 0.8) * 60);
        decide('jump', Math.max(0, start - (dist < 56 ? 0.06 : 0)), 'combo', face);
      } else if (v.state === 'duel' && v.plan === 'charge') {
        // A plain cut (on him already, if he was in reach), the ring: ready
        // 0.585 s into the move. Then in to 52 px of him, the blow loosed, and
        // its blade out 0.055 s later.
        const since = Math.max(0, 1.6 - v.planTimer) + el;
        const gap = Math.max(0, stopDist - 52);
        const walk = gap > 18.4 ? 0.157 + (gap - 18.4) / 235 : Math.sqrt((2 * gap) / 1500);
        const tHit = 0.585 + walk + 1 / 60 + 0.06 - since;
        if (tHit >= 0.15) decide('parry', tHit - 0.09 + jitter(), 'charge', face, { hit: wf + Math.round(tHit * 60) });
      } else if (v.state === 'duel' && v.plan === 'leap') {
        // It lands 0.65 s after it left the floor, cutting as it comes down:
        // the cut that reaches him is the one it lands with. It steers at him
        // in the air and coasts once it is over him - it comes down past him,
        // and that is the way to face.
        const since = Math.max(0, 1 - v.planTimer) + el;
        const tHit = 0.6 - since;
        let x = v.cx;
        let vx = v.vx;
        for (let t = since - el; t < 0.62; t += 1 / 60) {
          const d = stopX - x;
          if (Math.abs(d) > 20) vx += Math.sign(Math.sign(d) * 235 - vx) * Math.min(Math.abs(Math.sign(d) * 235 - vx), 950 / 60);
          else vx -= Math.sign(vx) * Math.min(Math.abs(vx), 332 / 60);
          x += vx / 60;
        }
        const lf = Math.sign(x - stopX) || face;
        if (tHit >= 0.15) decide('parry', tHit - 0.07 + jitter(), 'leap', lf, { hit: wf + Math.round(tHit * 60), landX: x });
      } else if (v.state === 'fade') {
        // The pool it will rise from: the first cut 0.99 s after it sank.
        const sinceFade = 0.5 - v.timer + el;
        const tCut = 0.92 + 1 / 60 + 0.06 - sinceFade;
        if (tCut >= 0.15) {
          decide('parry', tCut - 0.09 + jitter(), 'step', Math.sign(v.stepX - p.cx) || p.facing, { spot: v.stepX, hit: wf + Math.round(tCut * 60) });
        }
        openFrom = -1;
        openUntil = -1;
      }
    }

    // The plan: carried out on its frame; until then he keeps still, facing.
    let holding = false;
    if (plan) {
      if (plan.kind === 'parry' && wf >= plan.at && p.hurtTimer > 0 && plan.hit !== undefined && wf < plan.hit) {
        // Still knocked about by a cut that got through: the press as soon as
        // he has his feet again, if that is still in time.
        holding = true;
      } else if (wf < plan.at) {
        holding = true;
      } else if (plan.kind === 'parry') {
        a.parry = true;
        holding = true;
        parryHold++;
        if (parryHold >= 2) {
          parryHold = 0;
          guardUntil = wf + 12;
          plan = null;
        }
      } else {
        if (onFloor && !jump.busy) {
          jump.go(18);
          if (plan.dbl) doubleAt = wf + Math.round(plan.dbl * 60);
          plan = null;
        } else if (wf > plan.at + 6) {
          plan = null;
        }
      }
    }
    if (doubleAt >= 0 && wf >= doubleAt && !onFloor && !jump.busy) {
      jump.go(16);
      doubleAt = -1;
    } else if (doubleAt >= 0 && wf >= doubleAt + 12) {
      doubleAt = -1;
    }
    const guarding = holding || guardUntil > wf;

    /* ----------------------------------------------- its crescents, its quake */
    let shotIn = 99;
    for (const q of h.threats(v.shots)) {
      if (Math.sign(q.vx) !== Math.sign(p.cx - q.x)) continue;
      if (q.y < p.y - 14 || q.y > p.bottom + 10) continue;
      const gap = Math.abs(p.cx - q.x) - 9 - q.w / 2;
      shotIn = Math.min(shotIn, Math.max(0, gap) / Math.max(1, Math.abs(q.vx)));
    }
    if (shotIn < 0.2 && shotIn > 0.02 && onFloor && !jump.busy && !guarding && fleeUntil <= wf) {
      jump.go(18);
      dbg({ ev: 'jump-shot', in: +shotIn.toFixed(2) });
    }

    /* -------------------------------------------------------- its windows */
    let window = -1;
    if (v.state === 'reel') window = rem;
    else if (v.state === 'duel' && v.plan === 'recover') window = rem;
    if (openFrom >= 0 && wf >= openFrom && openUntil > wf) window = Math.max(window, (openUntil - wf) / 60);
    // A swing that starts while it stands in its follow-through lands; one
    // that starts once it is free again is turned aside.
    const busyFor = p.attackTimer > 0 ? p.attackTimer : 0;
    const mayStrike = window > busyFor + 0.05;

    let mode = 'wait';
    if (guarding) {
      mode = 'guard';
      const f = plan ? plan.face : 0;
      if (plan && plan.spot !== undefined && Math.abs(Math.abs(plan.spot - p.cx) - 36) > 10 && plan.at - wf > 10) {
        // To within a cut of where it will rise, facing the pool.
        const want = plan.spot - Math.sign(plan.spot - p.cx || 1) * 36;
        h.walkTo(a, want, 6);
      } else if (f && Math.sign(p.facing) !== f && !a.parry) a[f > 0 ? 'right' : 'left'] = true;
    } else if (fleeUntil > wf) {
      mode = 'flee';
      a[fleeDir > 0 ? 'right' : 'left'] = true;
    } else if (!onFloor) {
      mode = 'air';
      if (Math.abs(p.vx) > 30) a[p.vx > 0 ? 'left' : 'right'] = true;
    } else if (mayStrike && v.state !== 'fade') {
      mode = 'strike';
      // Within 90 px its roll does not take it out of a crescent's way.
      if (dist > 44) a[toward] = true;
      else h.face(a, ucx);
      if (dist < 88 && Math.sign(dx) === p.facing) h.swing(a);
    } else if (v.state === 'duel' || v.state === 'reel') {
      // A step outside its blade, facing it: close enough that it commits.
      const want = p2 ? 72 : 70;
      const behind = dx > 0 ? p.cx - room.left : room.right - p.cx;
      if (dist > want + 10) a[toward] = true;
      else if (dist < want - 6 && behind > 40) a[away] = true;
      else h.face(a, ucx);
    }

    if (mode !== lastMode) {
      lastMode = mode;
      dbg({ ev: 'mode', mode, key, rem: +rem.toFixed(2), dist: Math.round(dist), ph: v.phase });
    }
    return jump.apply(a);
  };
}
