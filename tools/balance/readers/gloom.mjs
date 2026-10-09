/**
 * Nyktos, read like a person reads him - the same reader verify-gloom.mjs
 * fights him with. Everything about him comes 0.3 s late; he swings only from
 * the floor and jumps only to clear a wave:
 *
 *   - the light first: no lit floor crystal, he walks to the nearest one that
 *     will take light (dark, and not just emptied) and strikes it. One that is
 *     lit, he waits at - 80 px off, inside its light (no pool forms there) and
 *     far enough off not to be shoved (72 px), so Nyktos goes straight down to
 *     eat. A light going out with nobody coming for it, he strikes again once
 *     it is dark;
 *   - eating, blinded, or flesh and low enough for a blade: in to a sword's
 *     length, and swing. The shove drawn back: out of its reach first;
 *   - a pool under him: he walks out of it, towards the side with room;
 *   - a wave coming along the floor: he jumps it, once it is close;
 *   - an orb close by: he bats it, or steps off its line.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  /** Where he waits for the meal, from the crystal's middle: in its light, and far enough not to be shoved. */
  const WAIT = 80;
  /** Where he strikes a crystal from. */
  const STRIKE = 26;
  return (boss) => {
    const v = see({
      state: boss.state,
      x: boss.x,
      w: boss.w,
      cx: boss.cx,
      bottom: boss.bottom,
      solid: boss.solid,
      swung: boss.swung,
      crystals: boss.crystals.map((c) => ({
        x: c.x,
        surface: c.surface,
        ledge: c.ledge,
        lit: c.lit > 0,
        // The last second flickers: it is going out.
        fading: c.lit > 0 && c.lit < 1.1,
        eaten: c.eaten,
        spent: c.spent > 0,
      })),
      pool: boss.pool ? { x: boss.pool.x, surface: boss.pool.surface } : null,
      waves: boss.waves.map((w) => ({ x: w.x, vx: w.dir * 300, dir: w.dir })),
      orbs: boss.orbs.filter((o) => o.batted <= 0 && o.life > 0).map((o) => ({ x: o.x, y: o.y, vx: o.vx, vy: o.vy })),
    });
    const a = {};
    const floorY = h.room.floor;
    const onFloor = p.onGround && Math.abs(p.bottom - floorY) < 4;
    const go = (dir) => {
      a.left = dir < 0;
      a.right = dir > 0;
    };
    const roomier = () => (h.room.space(1) > h.room.space(-1) ? 1 : -1);
    let feet = false;

    // A pool under him: out of it, the way there is room.
    if (v.pool && Math.abs(p.bottom - v.pool.surface) < 8) {
      const d = p.cx - v.pool.x;
      if (Math.abs(d) < 50) {
        let dir = Math.abs(d) > 6 ? Math.sign(d) : roomier();
        if (h.room.space(dir) < 46) dir = -dir;
        go(dir);
        feet = true;
      }
    }

    // The shove, drawn back over a hero at the meal: out of its reach.
    if (!feet && v.state === 'swipe' && !v.swung && Math.abs(p.bottom - v.bottom) < 40) {
      const edge = Math.abs(v.cx - p.cx) - p.w / 2;
      if (edge < 70) {
        go(Math.sign(p.cx - v.cx) || roomier());
        feet = true;
      }
    }

    // Open, and low enough for a blade from where he stands: in, and swing.
    const low = Math.abs(v.bottom - p.bottom) < 26;
    const open = v.state === 'eat' || v.state === 'blinded' || (v.solid && v.state !== 'swipe' && v.state !== 'seek');
    let fighting = false;
    if (!feet && open && low && p.onGround) {
      const gap = h.gap({ x: v.x, w: v.w });
      if (gap > 16) h.walkTo(a, v.cx, 4);
      else if (gap < -30) go(Math.sign(p.cx - v.cx));
      else h.face(a, v.cx);
      if (gap < 30) h.swing(a);
      fighting = true;
    }

    // The light: wait at a lit floor crystal, or go and light one.
    if (!feet && !fighting) {
      const floor = v.crystals.filter((c) => !c.ledge);
      const near = (list) => list.reduce((best, c) => (!best || Math.abs(c.x - p.cx) < Math.abs(best.x - p.cx) ? c : best), null);
      const coming = v.state === 'seek' || v.state === 'swipe' || v.state === 'eat';
      // The one he is at, or the one to wait at.
      const lit = near(floor.filter((c) => c.lit && (!c.eaten || coming)));
      if (lit && !(lit.fading && !coming)) {
        // Wait on the side with more room, so a pool can be walked out of.
        const side = lit.x - h.room.left > h.room.right - lit.x ? -1 : 1;
        const spot = lit.x + side * WAIT;
        if (Math.abs(spot - p.cx) > 6) h.walkTo(a, spot, 6);
        else h.face(a, lit.x);
      } else {
        const ready = near(floor.filter((c) => !c.spent && !c.eaten && (!c.lit || c.fading)));
        const c = ready ?? near(floor);
        if (c) {
          const from = p.cx < c.x ? -1 : 1;
          const spot = c.x + from * STRIKE;
          if (Math.abs(spot - p.cx) > 5) h.walkTo(a, spot, 5);
          else {
            h.face(a, c.x);
            if (ready && onFloor && Math.sign(c.x - p.cx) === p.facing) h.swing(a);
          }
        }
      }
    }

    // Orbs: bat the one coming at him, if it is at sword height in front.
    for (const o of v.orbs) {
      const x = h.lead(o.x, o.vx);
      const y = h.lead(o.y, o.vy);
      const dx = x - p.cx;
      if (Math.abs(dx) < 64 && Math.abs(y - p.cy) < 36) {
        if (Math.sign(dx) === p.facing || Math.abs(dx) < 6) {
          if (onFloor) h.swing(a);
        } else if (!feet) {
          h.face(a, x);
        }
      }
    }

    // A wave along the floor: over it, once it is close.
    for (const w of v.waves) {
      const x = h.lead(w.x, w.vx);
      const toMe = Math.sign(p.cx - x) === w.dir;
      if (toMe && Math.abs(p.cx - x) < 78 && onFloor && !jump.busy) jump.go(18);
    }
    return jump.apply(a);
  };
}
