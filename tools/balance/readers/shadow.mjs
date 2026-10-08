/**
 * Umbra, read like a person reads it: everything it does is seen 0.3 s late,
 * and what moves is led by those 0.3 s.
 *
 * Its combo is announced for 0.38 s (0.3 in its second half) - no longer than
 * the eye is behind - so there is no parrying it on sight. What a person can
 * do is be where the first cut does not reach and leave the floor the moment
 * the eyes flare: both cuts and their crescents pass under him, he lands in
 * its follow-through and cuts there. The rest:
 *
 *   - its charged blow: a plain cut first (that one comes unannounced), then
 *     the ring - long enough to be read - and the blow when it is close; that
 *     one he parries, on the rhythm of the ring and the walk in, with a
 *     person's error in the press (up to 0.07 s either way);
 *   - its step through the dark: the pool shows 0.93 s before it rises -
 *     he turns to the pool and parries the first cut;
 *   - its leap: out from under it;
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
  let seenSwing = -1;
  let plan = null;
  let parryHold = 0;
  let guardUntil = -1;
  let doubleAt = -1;
  /** Until when its follow-through is known to last, by the rhythm of a move he dodged. */
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
      x: b.x,
      cx: b.cx,
      vx: b.vx,
      vy: b.vy,
      bottom: b.bottom,
      onGround: b.onGround,
      swingId: b.swingId,
      attackTimer: b.attackTimer,
      charged: b.charged,
      chargeTimer: b.chargeTimer,
      chargeReady: b.chargeReady,
      dashing: b.dashTimer > 0,
      shots: h.hostile(),
    });
    const el = (wf - v.wf) / 60;
    const a = {};
    const onFloor = p.onGround;
    // Where it is now, led by its run.
    const ucx = Math.max(room.left + 9, Math.min(room.right - 9, v.cx + v.vx * el));
    const dx = ucx - p.cx;
    const dist = Math.abs(dx);
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const key = `${v.state}/${v.plan}`;
    const rem = v.state === 'duel' ? v.planTimer - el : v.timer - el;
    const p2 = v.phase === 2;

    const decide = (kind, t, what, face, extra = {}) => {
      plan = { kind, at: wf + Math.max(0, Math.round(t * 60)), face, what, ...extra };
      dbg({ ev: 'plan', kind, what, in: +t.toFixed(2), dist: Math.round(dist), key });
    };

    /* --------------------------------------------- what it does, answered */
    if (key !== seenKey) {
      seenKey = key;
      if (v.plan === 'windup' && v.state === 'duel' && dist < 150) {
        // The eyes flare: off the floor now. Its two cuts and their crescents
        // pass under him; he lands in its follow-through.
        decide('jump', 0, 'combo', Math.sign(dx), { single: true });
        // The combo runs 0.62 s from the end of the flare, then it stands.
        const comboEnd = Math.max(0, rem) + 0.64;
        openUntil = wf + Math.round((comboEnd + (p2 ? 0.67 : 0.8)) * 60);
      } else if (v.plan === 'charge' && v.state === 'duel') {
        // A plain cut (already on him, if he was in reach), the ring for
        // 0.3 s, then in to 52 px and the heavy blow.
        const since = Math.max(0, 1.6 - v.planTimer) + el;
        const walk = Math.max(0, dist - 52) / 235;
        const release = Math.max(0.6, since + walk * 0.9) - since + (dist > 52 ? walk * 0.1 : 0);
        const tHit = release + 0.06;
        if (tHit - 0.3 >= 0.15 - 0.3 + 0.15 && tHit >= 0.15) {
          decide('parry', tHit - 0.09 + jitter(), 'charge', Math.sign(dx));
        }
      } else if (v.state === 'fade') {
        // The pool it will rise from: it strikes 0.93 s after it sank.
        const sinceFade = 0.5 - v.timer + el;
        const tCut = 0.92 + 1 / 60 + 0.06 - sinceFade;
        if (tCut >= 0.15) decide('parry', tCut - 0.09 + jitter(), 'step', Math.sign(v.stepX - p.cx) || p.facing, { spot: v.stepX });
      }
    }
    // A cut of its started that he had not answered (a riposte, a plain cut):
    // nothing to be done about it this late.
    if (v.swingId !== seenSwing) seenSwing = v.swingId;

    // The plan: carried out on its frame; until then he keeps still, facing.
    let holding = false;
    if (plan) {
      if (wf < plan.at) {
        holding = plan.kind === 'parry';
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
          if (!plan.single) doubleAt = wf + 20;
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
      if (Math.abs(q.y - p.cy) > 30) continue;
      const gap = Math.abs(p.cx - q.x) - 9 - q.w / 2;
      shotIn = Math.min(shotIn, Math.max(0, gap) / Math.max(1, Math.abs(q.vx)));
    }
    if (shotIn < 0.2 && shotIn > 0.02 && onFloor && !jump.busy && !guarding) {
      jump.go(18);
      dbg({ ev: 'jump-shot', in: +shotIn.toFixed(2) });
    }

    /* -------------------------------------------------------- its windows */
    let window = -1;
    if (v.state === 'reel') window = rem;
    else if (v.state === 'duel' && v.plan === 'recover') window = rem;
    if (openUntil > wf) window = Math.max(window, (openUntil - wf) / 60);
    // A swing that starts while it stands in its follow-through lands; one
    // that starts once it is free again is turned aside.
    const busyFor = p.attackTimer > 0 ? p.attackTimer : 0;
    const mayStrike = window > busyFor + 0.05;
    const leaping = v.state === 'duel' && v.plan === 'leap';

    let mode = 'wait';
    if (guarding) {
      mode = 'guard';
      const f = plan ? plan.face : 0;
      if (plan && plan.spot !== undefined && Math.abs(Math.abs(plan.spot - p.cx) - 36) > 10 && plan.at - wf > 10) {
        // To within a cut of where it will rise, facing the pool.
        const want = plan.spot - Math.sign(plan.spot - p.cx || 1) * 36;
        h.walkTo(a, want, 6);
      } else if (f && Math.sign(p.facing) !== f && !a.parry) a[f > 0 ? 'right' : 'left'] = true;
    } else if (!onFloor) {
      mode = 'air';
    } else if (leaping) {
      mode = 'leap';
      a[away] = true;
    } else if (mayStrike && v.state !== 'fade') {
      mode = 'strike';
      if (dist > 44) a[toward] = true;
      else if (Math.sign(dx) !== p.facing) a[toward] = true;
      if (dist < 90 && Math.sign(dx) === p.facing) h.swing(a);
    } else if (v.state === 'duel' || v.state === 'reel') {
      // A step outside its blade, facing it: close enough that it commits.
      const want = p2 ? 68 : 62;
      const wallBehind = dx > 0 ? p.cx - room.left < 50 : room.right - p.cx < 50;
      if (dist > want + 10) a[toward] = true;
      else if (dist < want - 6 && !wallBehind) a[away] = true;
      else h.face(a, ucx);
    }

    if (mode !== lastMode) {
      lastMode = mode;
      dbg({ ev: 'mode', mode, key, rem: +rem.toFixed(2), dist: Math.round(dist), ph: v.phase });
    }
    return jump.apply(a);
  };
}
