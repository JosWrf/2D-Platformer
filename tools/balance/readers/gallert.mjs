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
 *     length, never into him, and swing. While he waddles about, too.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const room = h.room;
  const FLOOR = room.floor;
  const LAG = h.LAG;
  const LAG_S = LAG / 60;
  /** His gravity, and his blobs': the eye knows how fast things come down. */
  const G_BOSS = 1400;
  const G_BLOB = 1150;
  /** How far from where he lands the ring reaches, and a step more. */
  const CLEAR = 74 + 12;
  /** How close to where a blob comes down is too close (its half and his, and a bit). */
  const SPLASH = 24;

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
      blobs: g.projectiles
        .filter((q) => !q.dead && !q.friendly && q.kind === 'blob')
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy, w: q.w, h: q.h })),
      slimes: g.enemies
        .filter((e) => e.kind === 'slime' && !e.dead && e.cx > room.left && e.cx < room.right)
        .map((e) => ({ x: e.x, w: e.w, vx: e.vx })),
    });
    const a = {};
    const s = v.state;
    const floor = p.onGround;
    // Where he is now, as the eye has him: on the ground he walks, so lead him.
    const bx = s === 'hop' ? v.x : h.lead(v.x, v.vx);
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
      const pts = arc(q).slice(LAG);
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
      const ex = h.lead(e.x, e.vx);
      const d = Math.abs(ex + e.w / 2 - p.cx);
      if (!slime || d < slime.d) slime = { x: ex, w: e.w, cx: ex + e.w / 2, d };
    }

    /* ----------------------------------------------------------- moves */
    if (s === 'hop') {
      // Where he comes down: the arc, as the eye follows it.
      const bottom = v.y + v.h;
      const disc = v.vy * v.vy + 2 * G_BOSS * (FLOOR - bottom);
      const tLand = disc > 0 ? (-v.vy + Math.sqrt(disc)) / G_BOSS : 0;
      const tRem = tLand - LAG_S;
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
      // He is about to go up. Stay where the way back under him is short.
      if (edge < 6) a[away] = true;
      else if (edge < 30) {
        if (Math.sign(dx) !== p.facing) a[toward] = true;
        if (v.timer > 0.45) h.swing(a);
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
    return jump.apply(a);
  };
}
