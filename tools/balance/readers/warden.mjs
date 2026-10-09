/**
 * The Splitterwächter, read like a person reads him. His core lights before
 * every move, and which move it is depends on how far off the hero stands -
 * close, middling or far - so the tell says which one is coming:
 *
 *   - the slam (close): he crouches and goes up, and comes down a little
 *     further on with a ring. Away from him as soon as the core lights, and
 *     out of the ring the eye sees him coming down on; with his back to the
 *     wall and no way out in time, a parry timed off the fall;
 *   - the lunge (middling): he leans back, then throws himself forward the
 *     length of a few bodies. Over him as he comes, timed off the lean. One
 *     that falls short still slides on into him: give it the ground;
 *   - the volley (far): three splinters that bend after the hero. Facing
 *     them, a parry as they arrive - timed off their flight, with a person's
 *     error in it - turns them back;
 *   - after each move he stands open: in to a sword's length, never into
 *     him, and swing - but not while he walks about, where the next tell
 *     can light under the blade (a blow into his wind-up provokes him);
 *   - landed on the board by a jump: off it again, not onto him.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const room = h.room;
  const FLOOR = room.floor;
  const G_BOSS = 1400;
  /** The ring of the slam, from where he comes down, and a step more. */
  const CLEAR = 78 + 14;
  /** The lunge: its speed, how far it carries, and how fast he leans back before it. */
  const LUNGE_V = 360;
  const LUNGE_REACH = 130;
  const LEAN_V = 40;
  /** After a lunge he brakes at this, and slides about 90 px while he does. */
  const BRAKE = 700;
  let jumpedLunge = -1;
  let lunges = 0;
  let lastSeen = null;
  const LAG_S = h.LAG / 60;
  /** A parry being got ready: the frame to press it on, how long to hold it, which way to face. */
  let parryAt = -1;
  let parryHold = 0;
  let parrySide = 0;
  let parriedSlam = false;
  /*
   * The world stands still for a moment whenever a blow lands, and the eye
   * knows it: what is seen is LAG frames old, but only the frames in which
   * the world moved count for how far things have gone on since. The hero's
   * own stride says which frames those were.
   */
  let world = 0;
  let lastStride = null;
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

  /**
   * Standing on one of the boards above the floor (a jump came down on it):
   * the way off it - the end towards x, or the nearer end if x is under it -
   * but not an end that drops him onto the boss, whose body runs from
   * bodyL to bodyR. Null on the floor; his own spot if both ends are bad.
   */
  const offBoard = (x, bodyL, bodyR) => {
    if (!p.onGround || p.bottom > FLOOR - 8) return null;
    const ty = Math.floor((p.bottom + 2) / 32);
    let l = Math.floor(p.cx / 32);
    let r = l;
    while (g.level.platformAt(l - 1, ty)) l--;
    while (g.level.platformAt(r + 1, ty)) r++;
    const left = l * 32 - p.w;
    const right = (r + 1) * 32 + p.w;
    // Where he comes down off each end, walking off it.
    const drop = (end) => end + Math.sign(end - p.cx) * 40;
    const clear = (end) => Math.abs(drop(end) - (bodyL + bodyR) / 2) > (bodyR - bodyL) / 2 + p.w / 2 + 12;
    let pick = x < left + p.w ? left : x > right - p.w ? right : p.cx - left < right - p.cx ? left : right;
    if (!clear(pick)) pick = pick === left ? right : left;
    return clear(pick) ? pick : p.cx;
  };
  /**
   * In the air for no reason of his own choosing (off a board, thrown by a
   * blow): where his feet come down, and whether that is on the boss.
   */
  const landsOn = (bodyL, bodyR) => {
    if (p.onGround) return false;
    const drop = FLOOR - p.bottom;
    const t = (-p.vy + Math.sqrt(Math.max(0, p.vy * p.vy + 4000 * drop))) / 2000;
    const land = p.cx + p.vx * t;
    return land + p.w / 2 > bodyL - 6 && land - p.w / 2 < bodyR + 6;
  };

  return (boss) => {
    if (lastStride !== null && p.runCycle !== lastStride) world++;
    lastStride = p.runCycle;
    const v = see({
      clock: world,
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
    const lagF = world - v.clock;
    const lagS = lagF / 60;
    if (v.state === 'lungeWind' && lastSeen !== 'lungeWind') lunges++;
    const volleySeen = v.state === 'volleyWind' && lastSeen !== 'volleyWind';
    lastSeen = v.state;
    const a = {};
    const s = v.state;
    const floor = p.onGround;
    // Where he is now, as the eye has him: led along, and braking where he
    // brakes - after a knock or a lunge he slides to a stop, he does not fly on.
    const brake = (vx, decel) => {
      const t = Math.min(lagS, Math.abs(vx) / decel);
      return vx * t - (Math.sign(vx) * decel * t * t) / 2;
    };
    const bx = s === 'slam' ? v.x : s === 'recover' ? v.x + brake(v.vx, BRAKE) : h.lead(v.x, v.vx, lagF);
    const bcx = bx + v.w / 2;
    const dx = bcx - p.cx;
    const dir = Math.sign(dx) || 1;
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const edge = dx > 0 ? bx - (p.x + p.w) : p.x - (bx + v.w);
    const seenEdge = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
    const behind = dx > 0 ? p.x - room.left : room.right - (p.x + p.w);
    const inRoom = (x) => x > room.left + 14 && x < room.right - 14;

    /* -------------------------------------------------------- splinters */
    // When the first one that would reach him gets to where a parry catches it.
    let orbSide = 0;
    let entry = -1;
    let batSide = 0;
    for (const q of v.orbs) {
      const pts = flight(q, 90).slice(lagF);
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
      // Too close for a parry, it can still be batted: does it cross the
      // blade's sweep before it gets to him?
      const sx = side > 0 ? p.x + p.w - 4 : p.x - 36;
      for (let k = 0; k < Math.min(pts.length, 14); k++) {
        if (overlap(pts[k].x - q.w / 2, pts[k].y - q.h / 2, q.w, q.h, p.x, p.y, p.w, p.h)) break;
        if (overlap(pts[k].x - q.w / 2, pts[k].y - q.h / 2, q.w, q.h, sx, p.cy - 18, 40, 32)) {
          if (k >= 2) batSide = side;
          break;
        }
      }
    }
    /** A parry for something `frames` from now: meant for the middle of the window, off by up to 0.07 s. */
    const planParry = (frames, side) => {
      const jitter = (Math.random() * 2 - 1) * 0.07 * 60;
      parryAt = world + Math.max(1, Math.round(frames - p.parryWindow * 30 + jitter));
      parrySide = side;
    };
    const parryFree = (frames) => (p.parryCooldown ?? 0) * 60 < frames - p.parryWindow * 30 - 5;
    // Seen in time (at least 0.15 s before they arrive), and the guard free by then.
    if (entry >= 9 && parryAt < 0 && parryHold === 0 && parryFree(entry)) planParry(entry, orbSide);
    // Or off the tell itself, seen in time: the splinters leave when the core
    // has burnt down, and the middle one flies straight at him, bending in.
    if (volleySeen && v.timer - LAG_S >= 0.15 && parryAt < 0 && parryHold === 0) {
      const d = Math.max(0, Math.abs(dx) - (p.w / 2 + 30) - 7);
      const fly = (-200 + Math.sqrt(200 * 200 + 380 * d)) / 190;
      const frames = (v.timer - lagS + fly) * 60;
      if (parryFree(frames)) planParry(frames, dir);
    }
    if (entry < 0 && parryAt >= 0 && s !== 'slam' && world > parryAt + 20) parryAt = -1;

    /* ------------------------------------------------------------ moves */
    if (s !== 'slam') parriedSlam = false;
    const board = offBoard(bcx, bx, bx + v.w);
    if (board !== null && s !== 'slam') {
      // Up on a board, where his blade does not reach: off it, towards him -
      // once a lunge under way has gone by.
      if (s !== 'lungeWind' && s !== 'lunge' && board !== p.cx) a[board > p.cx ? 'right' : 'left'] = true;
    } else if (s === 'slamWind') {
      // He is going up and will come down nearer: out of the ring now.
      if (behind > 40) a[away] = true;
    } else if (s === 'slam') {
      const bottom = v.y + v.h;
      const disc = v.vy * v.vy + 2 * G_BOSS * (FLOOR - bottom);
      const tLand = disc > 0 ? (-v.vy + Math.sqrt(disc)) / G_BOSS : 0;
      const tRem = tLand - lagS;
      let L = v.x + v.w / 2 + v.vx * tLand;
      L = Math.max(room.left + v.w / 2, Math.min(room.right - v.w / 2, L));
      if (Math.abs(p.cx - L) < CLEAR && tRem > -0.05) {
        const cands = [L - CLEAR, L + CLEAR].filter(inRoom);
        cands.sort((u, w) => Math.abs(u - p.cx) - Math.abs(w - p.cx));
        const target = cands[0] ?? (p.cx < L ? room.left + 20 : room.right - 20);
        // Out of the ring - unless there is no getting out in time (his back
        // to the wall): then the parry, timed off the fall he is watching.
        const need = Math.abs(target - p.cx) / 225 + 0.1;
        // Coming down on top of him, his body touches the hero's head a few
        // frames before his feet touch the floor: the parry is for that touch.
        const on = Math.abs(L - p.cx) < v.w / 2 + p.w / 2;
        const discT = v.vy * v.vy + 2 * G_BOSS * (p.y - bottom);
        // (The later root: his feet passing the hero's head on the way down.)
        const tTouch = on && discT > 0 ? (-v.vy + Math.sqrt(discT)) / G_BOSS - lagS : tRem;
        // (A parry that takes the first touch leaves him untouchable through the landing.)
        const tParry = Math.min(tTouch, tRem);
        if (parriedSlam) {
          // Decided: stand, and face where he comes down.
          parrySide = Math.sign(L - p.cx) || p.facing;
        } else if (need < tRem) a[target > p.cx ? 'right' : 'left'] = true;
        else if (parryAt < 0 && parryFree(tParry * 60) && Math.min(tTouch, tRem) > 0.15) {
          planParry(tParry * 60, Math.sign(L - p.cx) || p.facing);
          parriedSlam = true;
        }
      }
    } else if (s === 'lungeWind' || s === 'lunge') {
      // When his front gets to the hero, if the hero stays put: the rest of
      // the lean (less than nothing once he is off), then the gap - which the
      // lean itself widens - at his speed.
      let tContact = 99;
      let reaches = false;
      let gap0 = seenEdge;
      if (s === 'lungeWind') {
        gap0 = seenEdge + LEAN_V * Math.max(0, v.timer);
        tContact = v.timer - lagS + Math.max(0, gap0) / LUNGE_V;
        reaches = gap0 < LUNGE_REACH + 6;
      } else if (Math.sign(v.vx) === -dir) {
        tContact = Math.max(0, edge) / LUNGE_V;
        reaches = edge < (v.timer - lagS) * LUNGE_V + 6;
      }
      if (reaches && jumpedLunge !== lunges && floor && !jump.busy && tContact <= 0.24) {
        jump.go(18);
        jumpedLunge = lunges;
      }
      // Short of him, the lunge still slides on a good way once it is spent
      // (and that slide touches): give it the ground.
      const slideOnly = s === 'lungeWind' && !reaches && gap0 < LUNGE_REACH + (LUNGE_V * LUNGE_V) / (2 * BRAKE) + 10;
      if (slideOnly && floor && behind > 30) a[away] = true;
      else if (!floor && jumpedLunge === lunges) {
        // Over him: come down on the side he has gone past, clear of him.
        if (s === 'lunge' && Math.sign(v.vx) === dir) a[away] = true;
      } else if (Math.sign(dx) !== p.facing) a[toward] = true;
    } else if (s === 'volleyWind' || parryAt >= 0) {
      // Standing for it, facing what comes: a parry is timed to where he
      // stands, and walking into the splinters brings them on sooner.
      const side = parryAt >= 0 ? parrySide : Math.sign(dx);
      if (side !== p.facing) a[side > 0 ? 'right' : 'left'] = true;
    } else {
      // Open, or walking about: to a sword's length. Sliding in from a lunge
      // he is not there yet - where he stops is where he is. The blade only
      // while he stands open, and only a swing that lands before he is free:
      // a blow into his wind-up provokes him (GEREIZT), and the blow that
      // follows comes faster than an eye 0.3 s behind can answer.
      // (Never nearer than where the eye last saw him: while he walks about
      // he can stop dead for a wind-up, and walking on to where he would have
      // been puts the hero against him.)
      const closing = s === 'recover' && Math.sign(v.vx) === -dir ? (v.vx * v.vx) / (2 * BRAKE) : 0;
      const at = closing > 10 ? Math.min(edge, seenEdge - closing) : Math.min(edge, seenEdge);
      if (at > 24) a[toward] = true;
      else if (at < 8) a[away] = true;
      else if (Math.sign(dx) !== p.facing) a[toward] = true;
      // He walks for at least 0.4 s once he is free, before any tell: a swing
      // begun while the eye still has him standing lands before his next
      // wind-up, even one begun just after he is free again.
      const open = (s === 'recover' || s === 'wait') && v.timer - lagS > -0.25;
      if (open && edge < 32 && edge > 2) h.swing(a);
    }

    // A splinter too close to parry, about to cross the blade's sweep: the
    // blade, facing it.
    if (batSide && parryAt < 0 && parryHold === 0 && floor) {
      if (batSide !== p.facing) {
        a.left = batSide < 0;
        a.right = batSide > 0;
      }
      h.swing(a);
    }
    // A parried blow that left him standing in the hero (a slam onto a hero
    // with his back to the wall): out, while the parry's breath of safety
    // lasts, by the side with room - whatever the eye still shows of him.
    if (p.parryFlash > 0.4 && Math.abs(dx) < v.w / 2 + p.w / 2 + 2 && floor) {
      a.left = false;
      a.right = false;
      a[room.right - p.cx > p.cx - room.left ? 'right' : 'left'] = true;
    }

    // The parry, when its moment comes: facing what is coming, standing.
    if (parryAt >= 0 && world >= parryAt - 8 && floor) {
      a.left = false;
      a.right = false;
      a.attack = false;
      if (parrySide !== p.facing) a[parrySide > 0 ? 'right' : 'left'] = true;
    }
    if (parryAt >= 0 && world >= parryAt) {
      parryHold = 2;
      parryAt = -1;
    }
    if (parryHold > 0) {
      a.parry = true;
      parryHold--;
    }
    // Coming down off a board, or thrown: not onto him. (Over a lunge he has
    // his own way down, above.)
    const overLunge = jumpedLunge === lunges && (s === 'lungeWind' || s === 'lunge');
    if (s !== 'slam' && !overLunge && !jump.busy && landsOn(bx, bx + v.w)) {
      a.left = p.cx < bcx;
      a.right = !a.left;
    }
    return jump.apply(a);
  };
}
