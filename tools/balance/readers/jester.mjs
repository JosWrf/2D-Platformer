/**
 * Maskarill, read like a person reads him - 0.3 s late, from the floor:
 *
 *   - the knives: while he juggles he walks in on him - they come down where
 *     he stood when they left - steps off any spot one is coming down on, and
 *     swings at one about to pass in front of him: it goes back into the
 *     jester for two;
 *   - the crouch and the wheel: he stands and lets it come, and jumps it once,
 *     on the rhythm of the crouch or off how far away the wheel is - each with
 *     a person's error on it. Once it is past, after it to the splits;
 *   - the salto: once he is up, his shadow on the boards says where he comes
 *     down; out of its ring the short way, then back in;
 *   - the trick: he keeps near the one with the big shadow on the wall while
 *     they shuffle, and in the bow he walks to that one and strikes;
 *   - open - bowing, in the splits, dizzy, unmasked, stumbling - or merely
 *     prancing about: in to a sword's length, and swing.
 *
 * Which figure is real he only ever knows from the wall: each figure as the
 * eye has it, and whether a shadow goes up behind it (boss.figures).
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const room = h.room;
  const FLOOR = room.floor;
  const LAG = h.LAG;
  const L = LAG / 60;
  /** A person's error on a press timed off something seen, seconds either way. */
  const JITTER = 0.07;
  const KNIFE_G = 760;
  const WHEEL_SPEED = 360;
  /** The wheel's half width and his own: centre to centre, where it touches him. */
  const WHEEL_REACH = 22 + 9;
  /** The salto's ring, and a step more. */
  const CLEAR = 70 + 16;
  /** When the wheel should reach him after the press: his feet are over it from 0.09 s to 0.56 s. */
  const JUMP_LEAD = 0.21;
  let wheels = 0;
  let inWheel = false;
  let jumped = -1;
  let jit = 0;
  let jitFor = -1;
  return (boss) => {
    const live = boss.state;
    const wheeling = live === 'crouch' || live === 'wheel';
    if (wheeling && !inWheel) wheels++;
    inWheel = wheeling;
    const v = see({
      state: live,
      timer: boss.timer,
      wheel: wheels,
      figs: boss.figures,
      // The mark on the boards where the salto comes down.
      landX: live === 'salto' ? boss.landX : null,
      knives: g.projectiles
        .filter((q) => q.kind === 'knife' && !q.dead && !q.friendly)
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy })),
    });
    const a = {};
    const s = v.state;
    const floor = p.onGround;
    const real = v.figs.find((f) => f.casts) ?? v.figs[0];
    if (!real) return a;
    // Where he is now, as the eye has him: on the move, led by what was seen.
    const moving = s === 'strut' || s === 'wheel' || s === 'hop' || s === 'shuffle' || s === 'stagger';
    const bx = moving ? h.lead(real.x, real.vx) : real.x;
    const dx = bx - p.cx;
    const toward = dx > 0 ? 'right' : 'left';
    /** To a sword's length of something this wide, and swing. */
    const engage = (x, half) => {
      const gap = Math.abs(x - p.cx) - 9 - half;
      const dir = x > p.cx ? 'right' : 'left';
      if (gap > 22) a[dir] = true;
      else if (Math.sign(x - p.cx) !== p.facing && Math.abs(x - p.cx) > 2) a[dir] = true;
      if (gap < 30) h.swing(a);
    };
    const half = (act) => (act === 'split' ? 26 : act === 'bow' || act === 'conjure' ? 18 : 15);

    /* ----------------------------------------------------- the boss's move */
    if (s === 'crouch' || s === 'wheel') {
      const dir = s === 'wheel' ? Math.sign(real.vx) || 1 : Math.sign(p.cx - bx) || 1;
      const dist = Math.abs(p.cx - bx);
      const coming = s === 'crouch' || dist < WHEEL_REACH || Math.sign(p.cx - bx) === dir;
      if (coming) {
        if (v.wheel !== jumped) {
          if (jitFor !== v.wheel) {
            jitFor = v.wheel;
            jit = (Math.random() * 2 - 1) * JITTER;
          }
          // Seconds until it reaches him: the rest of the crouch as he saw it
          // (less, once that has run out behind the lag), then the roll.
          const gap = Math.max(0, dist - WHEEL_REACH);
          const speed = s === 'wheel' ? Math.abs(real.vx) || WHEEL_SPEED : WHEEL_SPEED;
          const until = (s === 'crouch' ? v.timer - L : 0) + gap / speed;
          if (until <= JUMP_LEAD + jit && floor && !jump.busy) {
            jump.go(18);
            jumped = v.wheel;
          }
        }
        h.face(a, bx);
      } else {
        // Past him: after it, to where it stops.
        a[toward] = true;
      }
    } else if (s === 'salto' && v.landX !== null) {
      const off = p.cx - v.landX;
      if (Math.abs(off) < CLEAR) {
        let dir = Math.abs(off) > 2 ? Math.sign(off) : room.space(1) > room.space(-1) ? 1 : -1;
        if (room.space(dir) < 24) dir = -dir;
        a[dir > 0 ? 'right' : 'left'] = true;
      } else {
        h.face(a, v.landX);
      }
    } else if (s === 'shuffle' || s === 'conjure') {
      // Keep near the one whose shadow is on the wall.
      if (Math.abs(dx) > 60) a[toward] = true;
      else h.face(a, bx);
      if (s === 'conjure') engage(bx, 18);
    } else if (s === 'guess') {
      engage(real.x, 18);
    } else if (s === 'volley' || s === 'merge') {
      h.face(a, bx);
    } else if (s === 'kneel') {
      // He will come down where I stand when he goes: keep walking in.
      if (Math.abs(dx) > 40) a[toward] = true;
      else engage(bx, 16);
    } else if (s === 'hop' || s === 'dormant' || s === 'intro' || s === 'dying') {
      if (Math.abs(dx) > 60 && s === 'hop') a[toward] = true;
    } else {
      // Juggling, throwing, prancing, or open: in, and swing.
      engage(bx, half(real.act));
    }

    /* ------------------------------------------------------------ knives */
    // Each knife's arc from where it was seen, run on: where it comes down
    // into him, and whether it passes in front of him first.
    let threat = null;
    let bat = false;
    for (const q of v.knives) {
      let { x, y, vx, vy } = q;
      for (let f = 1; f <= LAG + 80; f++) {
        vy += KNIFE_G / 60;
        x += vx / 60;
        y += vy / 60;
        if (f <= LAG) continue;
        const ahead = f - LAG;
        const bladeX = p.facing > 0 ? p.x + p.w - 4 : p.x - 36;
        if (floor && ahead >= 3 && ahead <= 11 && x + 8 > bladeX && x - 8 < bladeX + 40 && y + 6 > p.cy - 18 && y - 6 < p.cy + 14) bat = true;
        if (Math.abs(x - p.cx) < 18 && y + 6 > p.y && y - 6 < p.y + p.h) {
          if (!threat || ahead < threat.ahead) threat = { x, ahead };
          break;
        }
        if (y > FLOOR) break;
      }
    }
    if (threat && threat.ahead < 45) {
      // Off the spot it is coming down on, the short way - and no swing, which
      // would plant his feet.
      const dir = Math.sign(p.cx - threat.x) || (room.space(1) > room.space(-1) ? 1 : -1);
      a.left = false;
      a.right = false;
      a.attack = false;
      a[room.space(dir) > 20 ? (dir > 0 ? 'right' : 'left') : dir > 0 ? 'left' : 'right'] = true;
    } else if (bat) {
      h.swing(a);
    }
    return jump.apply(a);
  };
}
