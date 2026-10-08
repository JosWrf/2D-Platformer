/**
 * Thalassa, the Drowned Crown, read like a person who has learned her four
 * moves reads her - 0.3 s late, from the floor, in her reach:
 *
 *   - between moves (recovering, stalking, reeling) and while she only fills
 *     her crown: up to a sword's length of her hem, facing her, and swing.
 *     Never into her robe - touching her costs a heart;
 *   - the surge (two arcs at her hem): standing in her reach, a parry timed
 *     off the wind-up, the way her design asks for it - it breaks her and
 *     sends the wave back. Out of her reach, or with the guard not ready: up
 *     and over the wave on her rhythm, and again for the second volley from
 *     her second phase on. Waves seen running along the floor are jumped as
 *     they come;
 *   - the undertow (water winding at her feet): she stands still, so the
 *     blade keeps going; the orbs at its end are parried off its rhythm in
 *     her reach, and batted with the blade further off;
 *   - the anchor: off the spot it comes down on, as the eye judges the arc;
 *   - the spring tide (both arms up): out of her reach while it is coming -
 *     and while its second ripple is still to come, from her second phase
 *     on - so that the mark under his feet leaves him somewhere to step to;
 *     then off every mark he sees bubbling before it bursts, to the nearest
 *     dry spot he can reach in time, and back to her after. The crown's call
 *     the same way;
 *   - parries obey the bench's rules: planned only off a wind-up seen through
 *     the lag with at least 0.15 s of it left, pressed with up to 0.07 s of
 *     error either way.
 *
 * The world stands still for a moment whenever a blow lands (hit stop). The
 * eye sees that, so the rhythm he keeps counts only the moments that moved.
 */
export default function reader(g, h) {
  const p = g.player;
  const DT = 1 / 60;
  const LAG = h.LAG;
  const room = h.room;
  /** The designed answer in her reach. False measures her without it: waves jumped, orbs batted. */
  const PARRY = true;
  const see = h.lag();
  const jump = h.jumper();
  /** For each tick he has lived through: did the world stand still in it? */
  const still = [];
  let calls = 0;
  /** Ticks of the world that have run so far - the still ones do not count. */
  let ticks = 0;
  /** Moves seen begin: a new announcement, or a new volley of the surge. */
  let shown = 0;
  let lastState = null;
  let lastTimer = 0;
  let ripple = 0;
  /** A parry planned off a wind-up, and the frames the key is still held. */
  let plan = null;
  let hold = 0;
  let pressedAt = -999;
  const spent = new Set();
  /** The dry spot he is making for while the floor bubbles. */
  let refuge = null;
  let refugeFor = '';

  return (boss) => {
    const s0 = boss.state;
    if (s0 !== lastState && (s0.endsWith('Wind') || s0 === 'crown')) shown++;
    if (s0 === 'surge' && lastState === 'surge' && boss.timer > lastTimer + 0.1) shown++;
    // The spring tide comes up a second time from her second phase on.
    if (s0 === 'tide' && lastState !== 'tide') ripple = 1;
    if (s0 === 'tide' && lastState === 'tide' && boss.timer > lastTimer + 0.1) ripple++;
    lastState = s0;
    lastTimer = boss.timer;
    const ratio = boss.hp / boss.maxHp;
    const v = see({
      id: shown,
      state: s0,
      timer: boss.timer,
      x: boss.x,
      w: boss.w,
      vx: boss.vx,
      reeling: boss.stun > 0,
      ripple,
      phase: ratio > 0.62 ? 1 : ratio > 0.3 ? 2 : 3,
      marks: boss.geysers.map((m) => ({ x: m.x, left: m.wind - m.t })),
      shots: h.hostile(),
    });
    // How much of the world has moved since what he sees now.
    const age = Math.min(LAG, calls);
    let ran = 0;
    for (let i = Math.max(0, still.length - age); i < still.length; i++) if (!still[i]) ran++;
    const frozenNow = g.hitStopTimer > 0;
    still.push(frozenNow);
    if (still.length > LAG + 4) still.shift();
    calls++;
    /** Ticks from now until a timer he saw runs out (1 = the coming tick). */
    const until = (t) => Math.ceil(t / DT - 1e-6) - ran;
    /** Where something he saw is now, led by its speed. */
    const lead = (x, vx) => x + (vx * ran) / 60;

    const a = {};
    const bx = lead(v.x, v.vx);
    const bcx = bx + v.w / 2;
    const dx = bcx - p.cx;
    const dir = dx > 0 ? 1 : -1;
    const toward = dir > 0 ? 'right' : 'left';
    const away = dir > 0 ? 'left' : 'right';
    const gap = dir > 0 ? bx - (p.x + p.w) : p.x - (bx + v.w);
    // Walking up to her, the nearer of where she was and where she is going:
    // something sliding comes to rest, and a robe walked into costs a heart.
    const near = dir > 0 ? Math.min(v.x, bx) : Math.max(v.x, bx) + v.w;
    const safeGap = dir > 0 ? near - (p.x + p.w) : p.x - near;
    const brake = (p.vx * dir > 0 ? p.vx * p.vx : 0) / 4000;
    const dist = Math.abs(dx);
    const floor = p.onGround;
    const s = v.state;

    /**
     * A surge wave let go in `out` ticks: the wave on his side starts at her
     * hem and runs 250 px/s (4.17 a tick). When it reaches him and leaves
     * him, and when it reaches the guard held up in front of him.
     */
    const waveAt = (out) => {
      const front = dir > 0 ? bx + v.w / 2 - 22 - (p.x + p.w) : p.x - (bx + v.w / 2 + 48);
      return {
        enter: out + Math.max(0, Math.ceil((front - 4.17) / 4.17)),
        leave: out - 1 + (front + 26 + p.w) / 4.17,
        guard: out + 1 + Math.max(0, Math.ceil((front - 34) / 4.17)),
      };
    };

    /* ------------------------------------------------ the guard */

    // The next blow that can be answered with the guard, in ticks from now.
    let event = null;
    if (!v.reeling) {
      if (s === 'surgeWind' || (s === 'surge' && v.timer > 0)) {
        const out = until(v.timer) + (s === 'surgeWind' ? 1 : 0);
        event = { key: v.id, kind: 'wave', at: waveAt(out).guard, windLeft: (out - 1) * DT };
      } else if (s === 'undertowWind' || s === 'undertow') {
        const out = until(v.timer) + (s === 'undertowWind' ? 66 : 0);
        const reach = Math.max(0, Math.ceil((gap - 12) / 3.2));
        event = { key: v.id, kind: 'orbs', at: out + 1 + reach, windLeft: out * DT };
      }
    }
    // In her reach a parry breaks her; out of it, only the blow is turned.
    const inReach = dist < 56 && gap > -2;
    if (PARRY && !plan && event && !spent.has(event.key) && event.windLeft >= 0.15 && inReach) {
      // A person's timing: up to 0.07 s early or late on the moment he means.
      const jitter = Math.round((Math.random() * 2 - 1) * 0.07 * 60);
      const press = ticks + event.at - 5 + jitter;
      if (press - pressedAt > 35) {
        plan = { key: event.key, kind: event.kind, at: ticks + event.at, jitter, pressed: false };
        spent.add(event.key);
      }
    }
    if (plan && !plan.pressed) {
      if (event && event.key === plan.key) plan.at = ticks + event.at;
      if (v.reeling || !event || event.key !== plan.key) {
        // What he planned for is not coming: she has been thrown out of it.
        plan = null;
      } else if (ticks + 1 >= plan.at - 5 + plan.jitter) {
        plan.pressed = true;
        hold = 2;
        pressedAt = ticks + 1;
      }
    }
    if (plan && plan.pressed && ticks > plan.at + 12) plan = null;

    /* ------------------------------------------------ the floor bursting */

    // Each mark: ticks until its column stands, and until it has sunk again.
    const marks = v.marks
      .map((m) => {
        const up = Math.ceil(m.left / DT) - ran;
        return { x: m.x, from: up + 2, to: up + 28 };
      })
      .filter((m) => m.to > 0);
    // A column is 30 wide and he is 18: clear of it 24 px off its middle.
    const CLEAR = 26;
    const wetAt = (x, within) => marks.some((m) => Math.abs(x - m.x) < CLEAR && m.from <= within);
    const inHer = (x) => Math.abs(x - bcx) < v.w / 2 + p.w / 2 + 3;
    /** Ticks to run a distance from the speed he has now (towards it, if positive). */
    const travel = (d, v0) => {
      const ta = Math.max(0, (235 - v0) / 1500);
      const da = ((v0 + 235) / 2) * ta;
      const t = d <= da ? (-v0 + Math.sqrt(Math.max(0, v0 * v0 + 3000 * d))) / 1500 : ta + (d - da) / 235;
      return t * 60 + 2;
    };
    /** How late he would be past the columns on the way to x (<= 0: in time). */
    const late = (x) => {
      const sgn = Math.sign(x - p.cx) || 1;
      const v0 = p.vx * sgn;
      let worst = -99;
      for (const m of marks) {
        const off = (m.x - p.cx) * sgn;
        if (off <= -CLEAR || off > Math.abs(x - p.cx) + CLEAR) continue;
        // Past it before it stands, or there only after it has sunk.
        if (off - CLEAR > 0 && travel(off - CLEAR, v0) > m.to + 1) continue;
        worst = Math.max(worst, travel(off + CLEAR, v0) - m.from);
      }
      return worst;
    };
    const soaked = marks.some((m) => Math.abs(p.cx - m.x) < CLEAR);
    const fresh = marks.map((m) => Math.round(m.x)).join(',');
    if (marks.length === 0) refuge = null;
    if (refuge !== null && (wetAt(refuge, 999) || inHer(refuge) || late(refuge) > 3)) refuge = null;
    if (soaked && (refuge === null || fresh !== refugeFor)) {
      // The dry stretches of floor round him, not through her.
      const spans = [];
      let open = null;
      for (let x = Math.max(room.left + 14, p.cx - 320); x <= Math.min(room.right - 14, p.cx + 320); x++) {
        const ok = !inHer(x) && !wetAt(x, 999) && !((bcx - x) * (bcx - p.cx) < 0);
        if (ok && open === null) open = x;
        if ((!ok || x + 1 > Math.min(room.right - 14, p.cx + 320)) && open !== null) {
          spans.push([open, ok ? x : x - 1]);
          open = null;
        }
      }
      let best = null;
      for (const [lo, hi] of spans) {
        const inset = Math.min(8, (hi - lo) / 2);
        const x = Math.min(Math.max(p.cx, lo + inset), hi - inset);
        const score = late(x) + Math.abs(x - p.cx) / 40;
        if (!best || (late(x) <= 0) > (best.late <= 0) || ((late(x) <= 0) === (best.late <= 0) && score < best.score)) {
          best = { x, late: late(x), score };
        }
      }
      if (best) {
        refuge = best.x;
        refugeFor = fresh;
      }
    }
    // Once nothing near him is still to come up, he is free again.
    if (refuge !== null && !marks.some((m) => Math.abs(refuge - m.x) < 70 || Math.abs(p.cx - m.x) < CLEAR)) refuge = null;
    /** To x and stopping there: let go in time for the floor to brake him. */
    const arrive = (x) => {
      const d = x - p.cx;
      const coming = p.vx * Math.sign(d) > 0 ? (p.vx * p.vx) / 4000 : 0;
      if (Math.abs(d) > coming + 1.5) a[d > 0 ? 'right' : 'left'] = true;
    };

    /* ------------------------------------------------ moving */

    // Her arms up (the tide on its way), or its second ripple still to come.
    const wary = !v.reeling && (s === 'tideWind' || (s === 'tide' && v.phase >= 2 && v.ripple < 2));

    let busy = false;
    if (refuge !== null) {
      busy = true;
      arrive(refuge);
      // Walking off with his back to her: the guard he meant to raise is gone.
      if (plan && !plan.pressed && Math.abs(refuge - p.cx) > 6) plan = null;
    } else if (wary) {
      // The floor is about to open where he stands, and again from her second
      // phase on: off out of her reach, where a mark under his feet leaves
      // him somewhere to step to.
      const x = Math.max(room.left + 20, Math.min(room.right - 20, bcx - dir * 150));
      if (!wetAt(x, 60)) arrive(x);
    } else {
      // Where he wants to be: a sword's length off her hem, on his side -
      // walked to on the floor; in the air only kept off her robe.
      const wantGap = 10;
      if (gap > wantGap + 6 && safeGap > brake + 10 && (floor || gap > 40)) {
        const x = p.cx + dir * Math.min(40, gap - wantGap);
        if (!wetAt(x, 60)) a[toward] = true;
      } else if (safeGap < (floor ? 1 : 6) && !plan) a[away] = true;
      if (!a.left && !a.right && dir !== p.facing) a[toward] = true;
    }
    const guarding = !!plan;
    if (guarding && !busy) {
      // Facing her when the guard goes up, whatever else.
      a.left = false;
      a.right = false;
      if (dir !== p.facing) a[toward] = true;
    }

    /* ------------------------------------------------ the blade */

    if (!busy && !wary && floor && gap < 30 && gap > -4 && dir === p.facing) h.swing(a);

    /* ------------------------------------------------ over the wave */

    const waveJump = (enter, leave) => {
      if (enter <= 9 && leave > 0 && floor && !jump.busy) jump.go(18);
    };
    if (!guarding && !v.reeling) {
      // Too close to her to see the wave come: up on her rhythm.
      if (s === 'surgeWind' || (s === 'surge' && v.timer > 0)) {
        const w = waveAt(until(v.timer) + (s === 'surgeWind' ? 1 : 0));
        if (w.enter < 30) waveJump(w.enter, w.leave);
      }
    }

    /* ------------------------------------------------ what flies */

    for (const q0 of v.shots) {
      const q = { ...q0, x: lead(q0.x, q0.vx), y: lead(q0.y, q0.vy) };
      if (q.kind === 'shockwave') {
        // Along the floor: over it, as it comes - unless the guard is for it.
        if (Math.sign(p.cx - q.x) !== Math.sign(q.vx)) continue;
        if (plan && plan.kind === 'wave' && Math.abs(q.x - bcx) < 100) continue;
        const speed = Math.abs(q.vx) / 60;
        const front = Math.abs(p.cx - q.x) - q.w / 2 - p.w / 2;
        waveJump(front / speed, (front + q.w + p.w) / speed);
      } else if (q.kind === 'rock') {
        // Where it comes down to his height, as the eye judges an arc.
        const drop = p.cy - q.y;
        const t = (-q.vy + Math.sqrt(Math.max(0, q.vy * q.vy + 1800 * drop))) / 900;
        const land = q.x + q.vx * t;
        if (Math.abs(land - p.cx) < 36 && t < 0.7) {
          a.left = false;
          a.right = false;
          a[land > p.cx ? 'left' : 'right'] = true;
        }
      } else if (q.kind === 'orb') {
        // Batted back with the blade as it gets close.
        if (Math.hypot(q.x - p.cx, q.y - p.cy) < 80 && floor && !busy) {
          const side = Math.sign(q.x - p.cx) || p.facing;
          if (side !== p.facing && !guarding) {
            a.left = false;
            a.right = false;
            a[side > 0 ? 'right' : 'left'] = true;
          }
          h.swing(a);
        }
      }
    }

    if (hold > 0) {
      a.parry = true;
      hold--;
    }
    if (!frozenNow) ticks++;
    return jump.apply(a);
  };
}
