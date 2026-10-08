/**
 * The Splitterwächter, read like a person reads him. His core lights before
 * every move, and which move it is depends on how far off the hero stands -
 * close, middling or far - so the tell says which one is coming:
 *
 *   - the slam (close): he crouches and goes up, and comes down a little
 *     further on with a ring. Away from him as soon as the core lights, and
 *     out of the ring the eye sees him coming down on;
 *   - the lunge (middling): he leans back, then throws himself forward the
 *     length of a few bodies. Over him as he comes, timed off the lean;
 *   - the volley (far): three splinters that bend after the hero. Facing
 *     them, a parry as they arrive - timed off their flight, with a person's
 *     error in it - turns them back;
 *   - after each move he stands open, and while he walks about: in to a
 *     sword's length, never into him, and swing.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const room = h.room;
  const FLOOR = room.floor;
  const LAG = h.LAG;
  const LAG_S = LAG / 60;
  const G_BOSS = 1400;
  /** The ring of the slam, from where he comes down, and a step more. */
  const CLEAR = 78 + 14;
  /** The lunge: its speed and how far it carries before it slides to a stop. */
  const LUNGE_V = 360;
  const LUNGE_REACH = 130;
  let jumpedLunge = -1;
  let lunges = 0;
  let lastSeen = null;
  /** A parry being got ready: the frame to press it on, and how long to hold it. */
  let parryAt = -1;
  let parryHold = 0;
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  /** A splinter's flight as the eye has it: straight on, bending towards him while it still bends. */
  const flight = (q, frames) => {
    const pts = [];
    let { x, y, vx, vy, age } = q;
    for (let i = 0; i < frames; i++) {
      if (age < 1.1) {
        const ddx = p.cx - x;
        const ddy = p.cy - y;
        const len = Math.hypot(ddx, ddy) || 1;
        vx += ((ddx / len) * 190) / 60;
        vy += ((ddy / len) * 190) / 60;
      }
      age += 1 / 60;
      x += vx / 60;
      y += vy / 60;
      pts.push({ x, y });
      if (y + q.h / 2 >= FLOOR) break;
    }
    return pts;
  };

  return (boss) => {
    const v = see({
      state: boss.state,
      timer: boss.timer,
      x: boss.x,
      y: boss.y,
      w: boss.w,
      h: boss.h,
      vx: boss.vx,
      vy: boss.vy,
      orbs: g.projectiles
        .filter((q) => !q.dead && !q.friendly && q.kind === 'orb')
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy, w: q.w, h: q.h, age: q.age ?? 0 })),
    });
    if (v.state === 'lungeWind' && lastSeen !== 'lungeWind') lunges++;
    lastSeen = v.state;
    const a = {};
    const s = v.state;
    const floor = p.onGround;
    // Where he is now, as the eye has him: led along, and braking where he
    // brakes - after a knock or a lunge he slides to a stop, he does not fly on.
    const brake = (vx, decel) => {
      const t = Math.min(LAG_S, Math.abs(vx) / decel);
      return vx * t - (Math.sign(vx) * decel * t * t) / 2;
    };
    const bx = s === 'slam' ? v.x : s === 'recover' ? v.x + brake(v.vx, 700) : h.lead(v.x, v.vx);
    const bcx = bx + v.w / 2;
    const dx = bcx - p.cx;
    const dir = Math.sign(dx) || 1;
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const edge = dx > 0 ? bx - (p.x + p.w) : p.x - (bx + v.w);
    const behind = dx > 0 ? p.x - room.left : room.right - (p.x + p.w);
    const inRoom = (x) => x > room.left + 14 && x < room.right - 14;

    /* -------------------------------------------------------- splinters */
    // When the first one that would reach him gets to where a parry catches it.
    let orbSide = 0;
    let entry = -1;
    for (const q of v.orbs) {
      const pts = flight(q, 90).slice(LAG);
      const side = Math.sign(q.x - p.cx) || p.facing;
      const px = side > 0 ? p.x - 4 : p.x - 30;
      for (let k = 0; k < pts.length; k++) {
        const ox = pts[k].x - q.w / 2;
        const oy = pts[k].y - q.h / 2;
        if (overlap(ox, oy, q.w, q.h, px, p.y - 6, p.w + 34, p.h + 12)) {
          if (entry < 0 || k < entry) {
            entry = k;
            orbSide = side;
          }
          break;
        }
      }
    }
    if (entry >= 0 && parryAt < 0 && entry >= 9) {
      // Meant for the middle of the window, off by up to 0.07 s either way.
      const jitter = (Math.random() * 2 - 1) * 0.07 * 60;
      parryAt = h.frame + Math.max(1, Math.round(entry - p.parryWindow * 30 + jitter));
    }
    if (entry < 0 && parryAt >= 0 && h.frame > parryAt + 20) parryAt = -1;

    /* ------------------------------------------------------------ moves */
    if (s === 'slamWind') {
      // He is going up and will come down nearer: out of the ring now.
      if (behind > 40) a[away] = true;
    } else if (s === 'slam') {
      const bottom = v.y + v.h;
      const disc = v.vy * v.vy + 2 * G_BOSS * (FLOOR - bottom);
      const tLand = disc > 0 ? (-v.vy + Math.sqrt(disc)) / G_BOSS : 0;
      const tRem = tLand - LAG_S;
      let L = v.x + v.w / 2 + v.vx * tLand;
      L = Math.max(room.left + v.w / 2, Math.min(room.right - v.w / 2, L));
      if (Math.abs(p.cx - L) < CLEAR && tRem > -0.05) {
        const cands = [L - CLEAR, L + CLEAR].filter(inRoom);
        cands.sort((u, w) => Math.abs(u - p.cx) - Math.abs(w - p.cx));
        const target = cands[0] ?? (p.cx < L ? room.left + 20 : room.right - 20);
        a[target > p.cx ? 'right' : 'left'] = true;
      }
    } else if (s === 'lungeWind' || s === 'lunge') {
      // When his front gets to the hero, if the hero stays put: the rest of
      // the lean (less than nothing once he is off), then the gap at his speed.
      let tContact = 99;
      let reaches = false;
      if (s === 'lungeWind') {
        const gap0 = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
        tContact = v.timer - LAG_S + Math.max(0, gap0) / LUNGE_V;
        reaches = gap0 < LUNGE_REACH + 6;
      } else if (Math.sign(v.vx) === -dir) {
        tContact = Math.max(0, edge) / LUNGE_V;
        reaches = edge < (v.timer - LAG_S) * LUNGE_V + 6;
      }
      if (reaches && jumpedLunge !== lunges && floor && !jump.busy && tContact <= 0.24) {
        jump.go(18);
        jumpedLunge = lunges;
      }
      // Short of him, the lunge still slides on a good way once it is spent
      // (and that slide touches): give it the ground.
      const gapNow = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
      const slideOnly = s === 'lungeWind' && !reaches && gapNow < LUNGE_REACH + 100;
      if (slideOnly && floor && behind > 30) a[away] = true;
      else if (!floor && jumpedLunge === lunges) {
        // Over him: come down on the side he has gone past, clear of him.
        if (s === 'lunge' && Math.sign(v.vx) === dir) a[away] = true;
      } else if (Math.sign(dx) !== p.facing) a[toward] = true;
    } else if (s === 'volleyWind') {
      if (Math.sign(dx) !== p.facing) a[toward] = true;
    } else {
      // Open, or walking about: to a sword's length and swing. Sliding in
      // from a lunge he is not there yet - where he stops is where he is.
      const seenEdge = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
      const closing = s === 'recover' && Math.sign(v.vx) === -dir ? (v.vx * v.vx) / 1400 : 0;
      const at = closing > 10 ? Math.min(edge, seenEdge - closing) : edge;
      if (at > 24) a[toward] = true;
      else if (at < 6) a[away] = true;
      else if (Math.sign(dx) !== p.facing) a[toward] = true;
      if (edge < 32 && edge > 2) h.swing(a);
    }

    // The parry, when its moment comes: facing the splinters, standing.
    if (parryAt >= 0 && entry >= 0 && h.frame >= parryAt - 8 && s !== 'slam' && s !== 'slamWind') {
      a.left = false;
      a.right = false;
      a.attack = false;
      if (orbSide !== p.facing) a[orbSide > 0 ? 'right' : 'left'] = true;
    }
    if (parryAt >= 0 && h.frame >= parryAt) {
      parryHold = 2;
      parryAt = -1;
    }
    if (parryHold > 0) {
      a.parry = true;
      parryHold--;
    }
    return jump.apply(a);
  };
}
