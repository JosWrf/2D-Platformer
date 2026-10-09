/**
 * Grauwacht, read like a person reads him - the same reader verify-gargoyle.mjs
 * fights him with. His rule is that the hero looks where he last walked, and
 * whatever he looks at is stone. So this hero:
 *
 *   - turns his back on a statue and walks off, towards the side of the walk
 *     with room in it, to make him fly - some 200 to 380 px off, then he
 *     stands, his back to him, and watches over his shoulder (through the lag);
 *   - turns round when he sees him high in the air, rising or diving: a turn
 *     off a seen tell, so 0.07 s after he sees it, give or take 0.07 - the
 *     same jitter a parry gets;
 *   - steps out from under a statue that is coming down on him;
 *   - walks up to a broken one and swings from the floor until he sees the
 *     cracks start to close, then turns his back and walks off again;
 *   - walks on out of reach of a claw he sees raised behind him, or turns and
 *     freezes it when there is a wall in front of him;
 *   - faced with the gurgle, walks in under the arc if he is far enough off,
 *     and turns away from it if he is not;
 *   - freezes a glide on its wind-up, and jumps one he only sees going.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  /** The frame a turn he has decided on comes due, or -1. */
  let turnAt = -1;
  /** Which way he is walking off to make him fly; 0 while he has not decided. */
  let baitDir = 0;
  const schedule = () => {
    if (turnAt < 0) turnAt = h.frame + Math.max(0, Math.round((0.07 + (Math.random() * 2 - 1) * 0.07) * 60));
  };
  return (boss) => {
    const v = see({
      state: boss.state,
      timer: boss.timer,
      x: boss.x,
      w: boss.w,
      cx: boss.cx,
      bottom: boss.bottom,
      vx: boss.vx,
      vy: boss.vy,
      height: boss.height,
      gouts: h.hostile().filter((q) => q.kind === 'spout'),
    });
    const a = {};
    const dx = v.cx - p.cx;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || p.facing;
    const toward = dir > 0 ? 'right' : 'left';
    const away = dir > 0 ? 'left' : 'right';
    const facingHim = p.facing === dir;
    const edge = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
    const floor = p.onGround;
    const s = v.state;
    const behind = h.room.space(-dir);

    /** Off to where there is room to turn his back in: his own side, or through the statue to the other. */
    const leave = () => {
      if (baitDir === 0) baitDir = behind >= 240 || behind >= h.room.space(dir) - dist ? -dir : dir;
      a[baitDir > 0 ? 'right' : 'left'] = true;
    };

    // A turn he decided on comes due: one frame towards him.
    if (turnAt >= 0 && h.frame >= turnAt) {
      turnAt = -1;
      h.face(a, v.cx);
      return jump.apply(a);
    }

    // Stone coming down on him: out from under it.
    if (s === 'fall' && dist < 42 && v.bottom < p.y + 6) {
      const out = h.room.space(-dir) > 40 ? away : toward;
      a[out] = true;
      return jump.apply(a);
    }

    // Broken: in, and swing - until he sees the cracks closing.
    if (s === 'cracked') {
      if (v.timer > 0.4) {
        baitDir = 0;
        if (edge > 12) a[toward] = true;
        else if (!facingHim) a[toward] = true;
        if (edge < 30) h.swing(a);
      } else {
        leave();
      }
      return jump.apply(a);
    }

    // High in the air and still flesh: turn round and he drops.
    if ((s === 'rise' || s === 'dive') && !facingHim) {
      if (v.height >= 50) schedule();
      return jump.apply(a);
    }

    // The glide: frozen on its wind-up, or jumped if it is already going.
    if (s === 'glideWind' && !facingHim) {
      schedule();
      return jump.apply(a);
    }
    if (s === 'glide') {
      // His claws reach half his length ahead of him: up while they are still
      // a hundred pixels off.
      const lx = h.lead(v.cx, v.vx);
      const coming = Math.sign(v.vx) === Math.sign(p.cx - lx);
      if (coming && Math.abs(lx - p.cx) < 150 && floor && !jump.busy) jump.go(18);
      return jump.apply(a);
    }

    // A claw raised behind him: on out of reach, or round to freeze it at a wall.
    if ((s === 'clawWind' || s === 'claw') && !facingHim) {
      if (behind > 70) a[away] = true;
      else schedule();
      return jump.apply(a);
    }

    // The gurgle: far enough off, in under the arc and stay there; close, away.
    if ((s === 'gurgle' || s === 'spit') && facingHim) {
      if (dist > 110 || s === 'spit') {
        if (edge > 10) a[toward] = true;
      } else {
        leave();
      }
      return jump.apply(a);
    }

    // Gouts in the air that will come down on him: in under them, or off.
    for (const q of v.gouts) {
      const x = h.lead(q.x, q.vx);
      const y = h.lead(q.y, q.vy) + (900 * (18 / 60) ** 2) / 2;
      const vy = q.vy + 900 * (18 / 60);
      const drop = p.cy - y;
      if (drop < 0) continue;
      const t = (-vy + Math.sqrt(Math.max(0, vy * vy + 1800 * drop))) / 900;
      const land = x + q.vx * t;
      if (Math.abs(land - p.cx) < 22) {
        if (facingHim && edge > 10) a[toward] = true;
        else a[land > p.cx ? 'left' : 'right'] = true;
        return jump.apply(a);
      }
    }

    // Stone, and he is looking at it: turn his back - and walk off first if
    // it is too close for a dive.
    if (s === 'stone' || s === 'gurgle' || s === 'spit' || s === 'land' || s === 'stalk' || s === 'clawRecover' || s === 'diveWind') {
      if (facingHim) {
        if (dist < 230 || baitDir !== 0) leave();
        else a[away] = true;
        return jump.apply(a);
      }
      // His back to him: far enough off for the air, and stand.
      if (baitDir !== 0 && (dist >= 230 || h.room.space(baitDir) < 30)) baitDir = 0;
      if (baitDir !== 0) {
        a[baitDir > 0 ? 'right' : 'left'] = true;
      } else if (dist < 200 && behind > 50) {
        a[away] = true;
      } else if (dist < 110 && behind <= 50) {
        // Cornered with him close behind: round, freeze him, and go past.
        schedule();
      }
    }
    return jump.apply(a);
  };
}
