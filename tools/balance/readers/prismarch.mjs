/**
 * The Prismarch, read like a person reads it. Its heart lights before every
 * move; what follows depends on how far off the hero is, and it never does
 * the same thing twice running:
 *
 *   - the charge: it leans back, then runs the hall at the hero. Over it as
 *     it comes, timed off the lean; where a jump cannot make it any more and
 *     the lean was seen early enough, a parry instead. A charge that would
 *     only reach him on its slide afterwards: give it the ground;
 *   - the rain: shards out of the ceiling, aimed where the hero is about to
 *     be. The eye has each one from the moment it comes into view; the hero
 *     keeps out from under every one of them (waiting for one to come down
 *     before crossing under it, if need be), and hits the Prismarch, which
 *     stands still meanwhile, from a step off, when none is coming down;
 *   - the fan (from afar): splinters that bend after him. Facing them, a
 *     parry as they arrive, with a person's error in its timing;
 *   - after each move it stands open: in to a sword's length and swing, and
 *     while it walks about, too. In its second half the charge comes so soon
 *     after the lean that from a sword's length it cannot be jumped: there
 *     the hero keeps a step further off while it walks, swinging - the blade
 *     throws its water that far - and goes in when it has spent a move.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const room = h.room;
  const FLOOR = room.floor;
  const LAG_S = h.LAG / 60;
  /** The charge: its speed, its run, the slide after it (it touches while it slides), and the lean before it. */
  const CHARGE_V = 390;
  const CHARGE_RUN = 195;
  const SLIDE = (390 * 390) / 1600;
  const LEAN_V = 50;
  /** How close to where a shard comes down is too close: its half, his, and a step. */
  const CLEAR_ROCK = 26;
  let charges = 0;
  let lastSeen = null;
  let firstLeft = 0;
  let jumpedCharge = -1;
  let parriedCharge = -1;
  /** In the air over a charge, from the jump until his feet are down again. */
  let overCharge = false;
  /** A parry being got ready: the frame to press it on, how long to hold it, which way to face. */
  let parryAt = -1;
  let parryHold = 0;
  let parrySide = 0;
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

  /** Plans a parry for something arriving `frames` from now: meant for the middle of the window, off by up to 0.07 s. */
  const planParry = (frames, side) => {
    const jitter = (Math.random() * 2 - 1) * 0.07 * 60;
    parryAt = h.frame + Math.max(1, Math.round(frames - p.parryWindow * 30 + jitter));
    parrySide = side;
  };
  /** Whether the guard will be free again by the time a parry `frames` from now is pressed. */
  const parryFree = (frames) => (p.parryCooldown ?? 0) * 60 < frames - p.parryWindow * 30 - 5;

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
    const cam = g.camera.renderY;
    const v = see({
      clock: world,
      state: boss.state,
      timer: boss.timer,
      x: boss.x,
      y: boss.y,
      w: boss.w,
      h: boss.h,
      vx: boss.vx,
      half: boss.hp <= boss.maxHp / 2,
      orbs: g.projectiles
        .filter((q) => !q.dead && !q.friendly && q.kind === 'orb')
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy, w: q.w, h: q.h, age: q.age ?? 0 })),
      // Only what has come down into view.
      rocks: g.projectiles
        .filter((q) => !q.dead && !q.friendly && q.kind === 'rock' && q.y + q.h > cam)
        .map((q) => ({ x: q.cx, y: q.cy, vy: q.vy, h: q.h })),
    });
    const lagF = world - v.clock;
    const lagS = lagF / 60;
    const s = v.state;
    if (s === 'chargeWind' && lastSeen !== 'chargeWind') {
      charges++;
      // What is left of the lean when it is first seen, the 0.3 s late it is.
      firstLeft = v.timer - LAG_S;
    }
    lastSeen = s;
    const a = {};
    const floor = p.onGround;
    // Where it is now, as the eye has it: led along, and braking where it
    // brakes - after a charge or a stagger it slides to a stop.
    const brake = (vx, decel) => {
      const t = Math.min(lagS, Math.abs(vx) / decel);
      return vx * t - (Math.sign(vx) * decel * t * t) / 2;
    };
    const bx = s === 'recover' ? v.x + brake(v.vx, 800) : h.lead(v.x, v.vx, lagF);
    const bxc = Math.max(room.left, Math.min(room.right - v.w, bx));
    const bcx = bxc + v.w / 2;
    const dx = bcx - p.cx;
    const dir = Math.sign(dx) || 1;
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const edge = dx > 0 ? bxc - (p.x + p.w) : p.x - (bxc + v.w);
    const seenEdge = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
    const behind = dx > 0 ? p.x - room.left : room.right - (p.x + p.w);
    const inRoom = (x) => x > room.left + 14 && x < room.right - 14;

    /* ------------------------------------------------------------ shards */
    // Each shard in view: when it gets down to his height, and where.
    const rocks = [];
    for (const q of v.rocks) {
      let y = q.y;
      let vy = q.vy;
      for (let k = -lagF + 1; k < 90; k++) {
        vy += 900 / 60;
        y += vy / 60;
        if (y + q.h / 2 >= FLOOR) break;
        if (k >= 0 && y + q.h / 2 > p.y && y - q.h / 2 < p.y + p.h) {
          rocks.push({ x: q.x, k });
          break;
        }
      }
    }
    /**
     * Where he is t seconds from now if he first stands for `wait` frames
     * (sliding to a stop) and then heads for x: from the speed he has, at his
     * feet's acceleration, up to a run, and no further than x.
     */
    const slide = (t) => {
      const u = Math.min(t, Math.abs(p.vx) / 2000);
      return Math.sign(p.vx) * (Math.abs(p.vx) * u - 1000 * u * u);
    };
    const posAt = (x, t, wait = 0) => {
      const tw = wait / 60;
      if (t <= tw || Math.abs(x - p.cx) < 2) return p.cx + slide(t);
      const x0 = p.cx + slide(tw);
      const v0 = tw > 0 ? Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - 2000 * tw) : p.vx;
      const d = x - x0;
      const sg = Math.sign(d);
      const vv = v0 * sg;
      const t1 = Math.max(0, (235 - vv) / 1500);
      const tt = Math.max(0, t - tw - 1 / 60);
      const go = tt <= t1 ? vv * tt + 750 * tt * tt : vv * t1 + 750 * t1 * t1 + 235 * (tt - t1);
      return x0 + sg * Math.min(Math.abs(d), go);
    };
    /** How clear of every shard he stays on his way to x. */
    const clearance = (x, wait = 0) => {
      let worst = 999;
      for (const r of rocks) worst = Math.min(worst, Math.abs(posAt(x, r.k / 60, wait) - r.x));
      return worst;
    };
    // Out from under them: the nearest spot that stays clear of every shard
    // in view - going there now, or once the one in the way has come down.
    let rockTarget = null;
    if (rocks.length && clearance(p.cx) < CLEAR_ROCK) {
      let best = null;
      for (const wait of [0, 6, 12, 18, 24]) {
        for (let off = -120; off <= 120; off += 6) {
          const x = p.cx + off;
          if (!inRoom(x)) continue;
          // Not into the Prismarch either.
          const e = dx > 0 ? bxc - (x + p.w / 2) : x - p.w / 2 - (bxc + v.w);
          if (e < 4) continue;
          const c = clearance(x, wait);
          const score = (c >= CLEAR_ROCK ? 1000 : c * 10) - Math.abs(off) - wait;
          if (!best || score > best.score) best = { x, wait, score };
        }
      }
      if (best) rockTarget = best.wait > 0 ? p.cx : best.x;
    }

    /* --------------------------------------------------------- splinters */
    let orbEntry = -1;
    let orbSide = 0;
    for (const q of v.orbs) {
      const pts = flight(q, 90).slice(lagF);
      const side = Math.sign(q.x - p.cx) || p.facing;
      const px = side > 0 ? p.x - 4 : p.x - 30;
      for (let k = 0; k < pts.length; k++) {
        if (overlap(pts[k].x - q.w / 2, pts[k].y - q.h / 2, q.w, q.h, px, p.y - 6, p.w + 34, p.h + 12)) {
          if (orbEntry < 0 || k < orbEntry) {
            orbEntry = k;
            orbSide = side;
          }
          break;
        }
      }
    }
    // Seen in time (at least 0.15 s before they arrive), and the guard free by then.
    if (orbEntry >= 9 && parryAt < 0 && parryHold === 0 && parryFree(orbEntry)) planParry(orbEntry, orbSide);

    /* ------------------------------------------------------------ moves */
    let committed = false;
    const board = offBoard(bcx, bxc, bxc + v.w);
    if (board !== null && rockTarget === null) {
      // Up on a board, where neither his blade nor its charge reaches: off
      // it - once a charge under way has gone by.
      if (s !== 'chargeWind' && s !== 'charge') a[board > p.cx ? 'right' : 'left'] = true;
      committed = true;
    } else if (board === null && (s === 'chargeWind' || s === 'charge')) {
      // When its front gets to the hero if he stays put: the rest of the
      // lean (less than nothing once it is off), then the gap - which the
      // lean itself widens - at its speed.
      let tContact = 99;
      let hits = false;
      let slides = false;
      if (s === 'chargeWind') {
        const gap0 = seenEdge + LEAN_V * Math.max(0, v.timer);
        tContact = v.timer - lagS + Math.max(0, gap0) / CHARGE_V;
        hits = gap0 < CHARGE_RUN;
        slides = !hits && gap0 < CHARGE_RUN + SLIDE + 8;
      } else if (Math.sign(v.vx) === -dir) {
        const runLeft = Math.max(0, v.timer - lagS) * CHARGE_V;
        tContact = Math.max(0, edge) / CHARGE_V;
        hits = edge < runLeft;
        slides = !hits && edge < runLeft + SLIDE + 8;
      }
      if (hits && jumpedCharge !== charges && parriedCharge !== charges) {
        const parryOk = firstLeft >= 0.15 && parryAt < 0 && parryFree(Math.max(1, tContact * 60));
        if (floor && !jump.busy && tContact <= 0.24 && (tContact >= 0.15 || !parryOk)) {
          // Straight up as it comes: it runs in under him.
          jump.go(18);
          jumpedCharge = charges;
          overCharge = true;
        } else if (tContact < 0.15 && parryOk && floor) {
          // Too close to clear it: the parry, timed off the lean he saw in time.
          planParry(Math.max(1, tContact * 60), dir);
          parriedCharge = charges;
        }
        if (floor && jumpedCharge !== charges) committed = true;
      } else if (slides && floor && behind > 30) {
        a[away] = true;
        committed = true;
      }
      if (committed && floor && Math.sign(dx) !== p.facing && !a.left && !a.right) a[toward] = true;
    }
    if (floor && !jump.busy) overCharge = false;
    if (!floor && overCharge) {
      // In the air over a charge: hold still while it may still come; then
      // down clear of wherever it stands or slides.
      const coming = s === 'chargeWind' || (s === 'charge' && Math.sign(v.vx) === -dir);
      if (!coming && Math.abs(dx) < v.w / 2 + p.w / 2 + 18) a[away] = true;
      committed = true;
    }

    if (!committed) {
      let want = null;
      let tol = 8;
      if (rockTarget !== null) {
        want = rockTarget;
        tol = 3;
      } else if (s === 'fanWind' || (orbEntry >= 0 && orbEntry < 60)) {
        want = p.cx;
      } else {
        // Open, or walking about. Into a sword's length when it is spent; in
        // its second half, while it walks, a step further off.
        const spent = s === 'recover' && v.timer - lagS > 0.3;
        const rain = s === 'rain' || s === 'rainWind';
        const far = v.half && !spent && !rain;
        // Under the shards, room on both sides to step: its own bulk is a wall.
        const keep = s === 'rain' ? 60 : far ? 54 : 14;
        tol = keep > 14 ? 10 : 8;
        // Sliding in from a charge or a stagger it is not there yet - where it stops is where it is.
        const closing = s === 'recover' && Math.sign(v.vx) === -dir ? (v.vx * v.vx) / 1600 : 0;
        const near = closing > 10 ? Math.min(edge, seenEdge - closing) : edge;
        // The spot `keep` short of it, on the side he is on - if the room has it.
        let spot = dx > 0 ? p.cx + (near - keep) : p.cx - (near - keep);
        if (!inRoom(spot)) spot = p.cx;
        want = spot;
        // The blade's water carries well past its edge.
        if (edge < (keep > 14 ? 110 : 32) && edge > 2) h.swing(a);
      }
      // Never walk in under a shard that is coming down, nor across under one
      // to get somewhere: as far towards where he wants to be as stays clear
      // of all of them, and no further.
      if (rocks.length && rockTarget === null) {
        const crosses = (x) => rocks.some((r) => r.k < 40 && Math.sign(r.x - p.cx) !== Math.sign(r.x - x));
        let best = p.cx;
        const n = Math.ceil(Math.abs(want - p.cx) / 4);
        for (let i = 1; i <= n; i++) {
          const x = p.cx + ((want - p.cx) * i) / n;
          if (crosses(x) || clearance(x) < CLEAR_ROCK) break;
          best = x;
        }
        if (best !== want) tol = 3;
        want = best;
      }
      // Let go where the slide of his feet carries him the rest of the way.
      const stops = p.cx + (Math.sign(p.vx) * p.vx * p.vx) / 4000;
      if (want - stops > tol) a.right = true;
      else if (stops - want > tol) a.left = true;
      else if (Math.sign(dx) !== p.facing && rockTarget === null) a[toward] = true;
    }

    // The parry, when its moment comes: facing what is coming, standing still.
    if (parryAt >= 0 && h.frame >= parryAt - 6 && floor) {
      if (!committed && rockTarget === null) {
        a.left = false;
        a.right = false;
      }
      a.attack = false;
      if (parrySide !== p.facing && !a.left && !a.right) a[parrySide > 0 ? 'right' : 'left'] = true;
    }
    if (parryAt >= 0 && h.frame >= parryAt) {
      parryHold = 2;
      parryAt = -1;
    }
    if (parryHold > 0) {
      a.parry = true;
      a.attack = false;
      parryHold--;
    }
    if (parryAt >= 0 && orbEntry < 0 && s !== 'chargeWind' && s !== 'charge') parryAt = -1;
    // Coming down off a board, or thrown: not onto it. (Over a charge he has
    // his own way down, above.)
    if (!overCharge && !jump.busy && s !== 'charge' && landsOn(bxc, bxc + v.w)) {
      a.left = p.cx < bcx;
      a.right = !a.left;
    }
    return jump.apply(a);
  };
}
