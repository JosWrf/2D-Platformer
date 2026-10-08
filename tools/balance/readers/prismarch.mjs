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
 *     keeps out from under every one of them, and hits the Prismarch, which
 *     stands still meanwhile, when none is coming down on him;
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
  const LAG = h.LAG;
  const LAG_S = LAG / 60;
  /** The charge: its speed, its run, and the slide after it (it touches while it slides). */
  const CHARGE_V = 390;
  const CHARGE_RUN = 195;
  const SLIDE = (390 * 390) / 1600;
  /** How close to where a shard comes down is too close: its half, his, and a step. */
  const CLEAR_ROCK = 26;
  let charges = 0;
  let lastSeen = null;
  let firstLeft = 0;
  let jumpedCharge = -1;
  let parriedCharge = -1;
  /** A parry being got ready: the frame to press it on, and how long to hold it. */
  let parryAt = -1;
  let parryHold = 0;
  let parrySide = 0;
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
  /** A seen body braking to a stop: how far it goes on in the time it has been behind. */
  const brake = (vx, decel) => {
    const t = Math.min(LAG_S, Math.abs(vx) / decel);
    return vx * t - (Math.sign(vx) * decel * t * t) / 2;
  };

  /** Plans a parry for something arriving `frames` from now: meant for the middle of the window, off by up to 0.07 s. */
  const planParry = (frames, side) => {
    const jitter = (Math.random() * 2 - 1) * 0.07 * 60;
    parryAt = h.frame + Math.max(1, Math.round(frames - p.parryWindow * 30 + jitter));
    parrySide = side;
  };

  return (boss) => {
    const cam = g.camera.renderY;
    const v = see({
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
    const s = v.state;
    if (s === 'chargeWind' && lastSeen !== 'chargeWind') {
      charges++;
      firstLeft = v.timer - LAG_S;
    }
    lastSeen = s;
    const a = {};
    const floor = p.onGround;
    const bx = s === 'recover' ? v.x + brake(v.vx, 800) : h.lead(v.x, v.vx);
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
      for (let k = -LAG + 1; k < 90; k++) {
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
     * Where he is t seconds from now, heading for x: from the speed he has,
     * at his feet's acceleration, up to a run, and no further than x. Staying
     * put, he slides to a stop.
     */
    const posAt = (x, t) => {
      const d = x - p.cx;
      if (Math.abs(d) < 2) {
        const tt = Math.min(t, Math.abs(p.vx) / 2000);
        return p.cx + Math.sign(p.vx) * (Math.abs(p.vx) * tt - 1000 * tt * tt);
      }
      const sg = Math.sign(d);
      const v0 = p.vx * sg;
      const t1 = Math.max(0, (235 - v0) / 1500);
      const tt = Math.max(0, t - 1 / 60);
      const go = tt <= t1 ? v0 * tt + 750 * tt * tt : v0 * t1 + 750 * t1 * t1 + 235 * (tt - t1);
      return p.cx + sg * Math.min(Math.abs(d), go);
    };
    /** How clear of every shard he stays on his way to x. */
    const clearance = (x) => {
      let worst = 999;
      for (const r of rocks) worst = Math.min(worst, Math.abs(posAt(x, r.k / 60) - r.x));
      return worst;
    };
    let rockTarget = null;
    if (rocks.length && clearance(p.cx) < CLEAR_ROCK) {
      let best = null;
      for (let off = -120; off <= 120; off += 6) {
        const x = p.cx + off;
        if (!inRoom(x)) continue;
        // Not into the Prismarch either.
        const e = dx > 0 ? bxc - (x + p.w / 2) : x - p.w / 2 - (bxc + v.w);
        if (e < 4) continue;
        const c = clearance(x);
        const score = (c >= CLEAR_ROCK ? 1000 : c * 10) - Math.abs(off);
        if (!best || score > best.score) best = { x, score };
      }
      if (best) rockTarget = best.x;
    }

    /* --------------------------------------------------------- splinters */
    let orbEntry = -1;
    let orbSide = 0;
    for (const q of v.orbs) {
      const pts = flight(q, 90).slice(LAG);
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
    const parryReady = (p.parryCooldown ?? 0) <= 0;
    if (orbEntry >= 9 && parryAt < 0 && parryReady && parryHold === 0) planParry(orbEntry, orbSide);

    /* ------------------------------------------------------------ moves */
    let committed = false;
    if (s === 'chargeWind' || s === 'charge') {
      // When its front gets to the hero if he stays put: the rest of the
      // lean (less than nothing once it is off), then the gap at its speed.
      let tContact = 99;
      let hits = false;
      let slides = false;
      if (s === 'chargeWind') {
        tContact = v.timer - LAG_S + Math.max(0, seenEdge) / CHARGE_V;
        hits = seenEdge < CHARGE_RUN;
        slides = !hits && seenEdge < CHARGE_RUN + SLIDE + 8;
      } else if (Math.sign(v.vx) === -dir) {
        const runLeft = Math.max(0, v.timer - LAG_S) * CHARGE_V;
        tContact = Math.max(0, edge) / CHARGE_V;
        hits = edge < runLeft;
        slides = !hits && edge < runLeft + SLIDE + 8;
      }
      if (hits && jumpedCharge !== charges && parriedCharge !== charges) {
        if (floor && !jump.busy && tContact <= 0.24 && (tContact >= 0.15 || firstLeft < 0.15 || p.parryCooldown > 0)) {
          // Straight up as it comes: it runs in under him.
          jump.go(18);
          jumpedCharge = charges;
        } else if (tContact < 0.15 && firstLeft >= 0.15 && parryAt < 0 && parryReady && floor) {
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
    if (!floor && jumpedCharge === charges) {
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
        const spent = s === 'recover' && v.timer - LAG_S > 0.3;
        const rain = s === 'rain' || s === 'rainWind';
        const far = v.half && !spent && !rain;
        const keep = far ? 54 : 14;
        tol = far ? 10 : 8;
        // Sliding in from a charge or a stagger it is not there yet - where it stops is where it is.
        const closing = s === 'recover' && Math.sign(v.vx) === -dir ? (v.vx * v.vx) / 1600 : 0;
        const near = closing > 10 ? Math.min(edge, seenEdge - closing) : edge;
        // The spot `keep` short of it, on the side he is on - if the room has it.
        let spot = dx > 0 ? p.cx + (near - keep) : p.cx - (near - keep);
        if (!inRoom(spot)) spot = p.cx;
        want = spot;
        // The blade's water carries well past its edge.
        if (edge < (far ? 110 : 32) && edge > 2) h.swing(a);
      }
      // Never walk in under a shard that is coming down: as far towards
      // where he wants to be as is clear when they land, or stay.
      if (rocks.length && rockTarget === null && clearance(want) < CLEAR_ROCK) {
        let best = clearance(p.cx) >= CLEAR_ROCK ? p.cx : null;
        const n = Math.ceil(Math.abs(want - p.cx) / 4);
        for (let i = 1; i <= n; i++) {
          const x = p.cx + ((want - p.cx) * i) / n;
          if (clearance(x) >= CLEAR_ROCK) best = x;
        }
        want = best ?? p.cx;
      }
      if (want - p.cx > tol) a.right = true;
      else if (p.cx - want > tol) a.left = true;
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
    return jump.apply(a);
  };
}
