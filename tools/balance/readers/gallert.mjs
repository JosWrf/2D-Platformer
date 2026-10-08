/**
 * Gallert, read like a person reads him:
 *
 *   - the leap: when he flattens he is coming; once he is up, the eye follows
 *     the arc to where he comes down (he overshoots whoever he jumps at) and
 *     the hero steps out of the ring - back under him, usually, since that is
 *     the short way. If there is no time to walk clear, up as he comes down;
 *   - the spit: the eye follows the three blobs to where they come down; the
 *     hero steps off any spot one is coming down on, does not walk into one on
 *     his way back to the slime, and swings at a blob about to come down in
 *     front of him - a blob is the first thing in the game a blade bats back;
 *   - the split: the two small slimes first, then back to him;
 *   - after a landing, a spit or a wobble he stands open: in to a sword's
 *     length, never into him, and swing. While he waddles about, too, and in
 *     the first part of a wind-up: nothing he does lands before it is seen.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const room = h.room;
  const FLOOR = room.floor;
  /** His gravity, and his blobs': the eye knows how fast things come down. */
  const G_BOSS = 1400;
  const G_BLOB = 1150;
  /** How far from where he lands the ring reaches, and a step more. */
  const CLEAR = 74 + 12;
  /** How close to where a blob comes down is too close (its half and his, and a bit). */
  const SPLASH = 24;
  /*
   * The world stands still for a moment whenever a blow lands, and the eye
   * knows it: what is seen is LAG frames old, but only the frames in which
   * the world moved count for how far things have gone on since. The hero's
   * own stride says which frames those were.
   */
  let world = 0;
  let lastStride = null;

  /** The arc of a blob from what was seen, frame by frame, until the floor. */
  const arc = (q) => {
    const pts = [];
    let { x, y, vx, vy } = q;
    for (let i = 0; i < 90; i++) {
      vy += G_BLOB / 60;
      x += vx / 60;
      y += vy / 60;
      pts.push({ x, y });
      if (y + q.h / 2 >= FLOOR) break;
    }
    return pts;
  };
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

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
      blobs: g.projectiles
        .filter((q) => !q.dead && !q.friendly && q.kind === 'blob')
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy, w: q.w, h: q.h })),
      slimes: g.enemies
        .filter((e) => e.kind === 'slime' && !e.dead && e.cx > room.left && e.cx < room.right)
        .map((e) => ({ x: e.x, w: e.w, vx: e.vx })),
    });
    const lagF = world - v.clock;
    const lagS = lagF / 60;
    const a = {};
    const s = v.state;
    const floor = p.onGround;
    // Where he is now, as the eye has him: on the ground he walks, so lead
    // him - and after a wobble he slides to a stop, he does not fly on.
    const brake = (vx, decel) => {
      const t = Math.min(lagS, Math.abs(vx) / decel);
      return vx * t - (Math.sign(vx) * decel * t * t) / 2;
    };
    const bx = s === 'hop' ? v.x : s === 'recover' ? v.x + brake(v.vx, 500) : h.lead(v.x, v.vx, lagF);
    const bcx = bx + v.w / 2;
    const dx = bcx - p.cx;
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const edge = dx > 0 ? bx - (p.x + p.w) : p.x - (bx + v.w);
    const inRoom = (x) => x > room.left + 14 && x < room.right - 14;

    /* ---------------------------------------------------------- blobs */
    // Where each blob still in the air comes down to his height, and in how
    // many frames from now - the arc from where it was seen, less the part
    // that is already past.
    const lands = [];
    let batSoon = false;
    for (const q of v.blobs) {
      const pts = arc(q).slice(lagF);
      if (!pts.length) continue;
      let k = pts.findIndex((pt) => pt.y >= p.cy - 8);
      if (k < 0) k = pts.length - 1;
      lands.push({ x: pts[k].x, k });
      // About to come down in front of him, through where the blade sweeps?
      const sx = p.facing > 0 ? p.x + p.w - 4 : p.x - 36;
      for (let i = 0; i < Math.min(pts.length, 12); i++) {
        if (overlap(pts[i].x - q.w / 2, pts[i].y - q.h / 2, q.w, q.h, p.x, p.y, p.w, p.h)) break;
        if (overlap(pts[i].x - q.w / 2, pts[i].y - q.h / 2, q.w, q.h, sx, p.cy - 18, 40, 32)) {
          if (i >= 3) batSoon = true;
          break;
        }
      }
    }
    /** True if standing at x when the blobs come down would be standing under one. */
    const splashed = (x) => lands.some((l) => Math.abs(l.x - x) < SPLASH);
    let dodge = null;
    if (splashed(p.cx)) {
      const soonest = Math.min(...lands.filter((l) => Math.abs(l.x - p.cx) < SPLASH).map((l) => l.k));
      let best = null;
      for (let off = -80; off <= 80; off += 4) {
        const x = p.cx + off;
        if (!inRoom(x) || splashed(x)) continue;
        const e = dx > 0 ? bx - (x + p.w / 2) : x - p.w / 2 - (bx + v.w);
        if (e < 4) continue;
        // The short way, and rather back from him than in to him.
        const cost = Math.abs(off) + (Math.sign(off) === Math.sign(dx) ? 8 : 0);
        if (!best || cost < best.cost) best = { x, cost };
      }
      if (best && soonest < 50) dodge = best.x;
    }

    /* --------------------------------------------------------- slimes */
    let slime = null;
    for (const e of v.slimes) {
      const ex = h.lead(e.x, e.vx, lagF);
      const d = Math.abs(ex + e.w / 2 - p.cx);
      if (!slime || d < slime.d) slime = { x: ex, w: e.w, cx: ex + e.w / 2, d };
    }

    /* ----------------------------------------------------------- moves */
    const board = offBoard(bcx, bx, bx + v.w);
    if (board !== null && s !== 'hop' && dodge === null) {
      // Up on a board, where the blade does not reach him: off it, towards him.
      a[board > p.cx ? 'right' : 'left'] = true;
    } else if (s === 'hop') {
      // Where he comes down: the arc, as the eye follows it.
      const bottom = v.y + v.h;
      const disc = v.vy * v.vy + 2 * G_BOSS * (FLOOR - bottom);
      const tLand = disc > 0 ? (-v.vy + Math.sqrt(disc)) / G_BOSS : 0;
      const tRem = tLand - lagS;
      let L = v.x + v.w / 2 + v.vx * tLand;
      L = Math.max(room.left + v.w / 2, Math.min(room.right - v.w / 2, L));
      const sep = Math.abs(p.cx - L);
      if (sep < CLEAR && tRem > -0.05) {
        const cands = [L - CLEAR, L + CLEAR].filter(inRoom);
        cands.sort((u, w) => Math.abs(u - p.cx) - Math.abs(w - p.cx));
        const target = cands[0] ?? (p.cx < L ? room.left + 20 : room.right - 20);
        const need = Math.abs(target - p.cx) / 225 + 0.08;
        a[target > p.cx ? 'right' : 'left'] = true;
        if (need > tRem && floor && !jump.busy && tRem < 0.42 && tRem > 0.12) jump.go(18);
      } else if (sep > CLEAR + 40) {
        // Clear of it: towards where he will stand, to be there when he does.
        a[L > p.cx ? 'right' : 'left'] = true;
      }
    } else if (dodge !== null) {
      if (Math.abs(dodge - p.cx) > 3) a[dodge > p.cx ? 'right' : 'left'] = true;
    } else if (slime && slime.d < 260) {
      // The small ones first: to a sword's length of the nearest, and swing.
      const sdx = slime.cx - p.cx;
      const sedge = sdx > 0 ? slime.x - (p.x + p.w) : p.x - (slime.x + slime.w);
      if (sedge > 18) a[sdx > 0 ? 'right' : 'left'] = true;
      else if (Math.sign(sdx) !== p.facing) a[sdx > 0 ? 'right' : 'left'] = true;
      if (sedge < 30) h.swing(a);
    } else if (s === 'hopWind') {
      // He is about to go up. Stay where the way back under him is short, and
      // swing while the blade is done before he leaves the ground.
      if (edge < 6) a[away] = true;
      else if (edge < 30) {
        if (Math.sign(dx) !== p.facing) a[toward] = true;
        if (v.timer - lagS > 0.15) h.swing(a);
      }
    } else {
      // Open, or waddling: to a sword's length and swing.
      if (edge > 22) a[toward] = true;
      else if (edge < 6) a[away] = true;
      else if (Math.sign(dx) !== p.facing) a[toward] = true;
      if (edge < 30 && edge > 2) h.swing(a);
    }
    // Never walk under a blob that is coming down.
    if (lands.length && s !== 'hop') {
      if (a.right && splashed(p.cx + 10) && !splashed(p.cx)) a.right = false;
      if (a.left && splashed(p.cx - 10) && !splashed(p.cx)) a.left = false;
    }
    if (batSoon) h.swing(a);
    // Coming down off a board, or thrown: not onto him.
    if (s !== 'hop' && !jump.busy && landsOn(bx, bx + v.w)) {
      a.left = p.cx < bcx;
      a.right = !a.left;
    }
    return jump.apply(a);
  };
}
