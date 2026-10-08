/**
 * Sol und Luna, read like a person reads them - the same reader
 * verify-twins.mjs fights them with (h.duel(seconds, 'read')), moved onto the
 * bench. It acts on what the altar looked like 0.3 s ago; only moving things
 * are carried forward by those 0.3 s:
 *
 *   - Sol crouches (the bound): keep moving, away from the ring that follows
 *     the hero, until he is down;
 *   - Sol lowers the glaive (the run): out of the line of embers. Already on
 *     the way to him, or with no room ahead: on at him, through him while he
 *     still stands, over him as he comes - the fire starts where he started.
 *     Otherwise: run for the end of the line;
 *   - crescents: over them when they are about to arrive, led by how far they
 *     have come since - slowing on the way out, quickening home;
 *   - frost on the floor: out of the rings, and not back into one;
 *   - Finsternis: away from the middle while it gathers, over the ring when it
 *     comes;
 *   - the rest of the time: the one calling the other back, or the nearer one -
 *     unless that would leave the other too whole to finish inside the call -
 *     and swing, from the floor;
 *   - fire on the floor: not into it, and out of it by the shorter way.
 *
 * Differences from the tool's own reader, all from the bench: swings come on
 * h.swing's cadence (every 8 frames rather than 6 - a combo chains either
 * way), and a jump lets the key come up for a frame before it is pressed
 * again (h.jumper), which the tool's reader did not always do.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const L = h.room.left;
  const R = h.room.right;
  const LAGS = h.LAG / 60;
  let leapSide = 0;
  return (boss) => {
    const v = see({
      sol: { who: 'sol', state: boss.sol.state, timer: boss.sol.timer, x: boss.sol.x, hp: boss.sol.hp, dir: boss.sol.dir, toX: boss.sol.toX },
      luna: { who: 'luna', state: boss.luna.state, timer: boss.luna.timer, x: boss.luna.x, hp: boss.luna.hp },
      mark: boss.mark ? { x: boss.mark.x, locked: boss.mark.locked } : null,
      crescents: boss.crescents
        .filter((c) => !c.dead && !c.batted && c.fade <= 0 && c.delay <= 0)
        .map((c) => ({ x: c.x, vx: c.vx, back: c.returning })),
      icicles: boss.icicles.filter((i) => !i.fell && !i.cancelled).map((i) => ({ x: i.x, surface: i.surface })),
      flames: boss.flames.filter((fl) => !fl.out).map((fl) => ({ x: fl.x })),
      rings: boss.rings.map((r) => ({ x: r.x, dir: r.dir })),
      revive: boss.revive ? { channeler: boss.revive.channeler.who } : null,
      eclipseT: boss.sol.state === 'eclipse' ? boss.sol.timer : null,
    });
    const a = {};
    const s = v.sol;
    const l = v.luna;
    const onFloor = p.onGround;
    const room = (d) => (d > 0 ? R - p.cx : p.cx - L);
    let busy = false;
    let move = 0;
    // Sol crouches: keep moving, away from the ring that follows, until he is down.
    if (s.state === 'leapWind' || s.state === 'leap') {
      const land = v.mark ? v.mark.x : p.cx;
      if (leapSide === 0) leapSide = room(1) >= room(-1) ? 1 : -1;
      if (Math.abs(p.cx - land) < 70 + 45 || !v.mark?.locked) {
        busy = true;
        move = leapSide;
        if (room(move) < 24) {
          leapSide = -leapSide;
          move = leapSide;
        }
      }
    } else leapSide = 0;
    // Sol lowers the glaive: out of the line of embers. Already on the way to
    // him, or with no room ahead: on at him, through him while he still
    // stands, over him as he comes - the fire starts where he started, so over
    // him early is behind it. Otherwise: run for the end of the line.
    if (s.state === 'dashWind' || s.state === 'dash') {
      const d = s.dir;
      // How much of the glaive's tell is left by now, and where he is by now.
      const left = s.state === 'dashWind' ? s.timer - LAGS : -LAGS;
      const solNow = left < 0 ? s.x + d * 400 * -left : s.x;
      const ahead = (p.cx - solNow) * d;
      const beyond = (p.cx - (s.toX + d * 15)) * d;
      if (ahead > -26 && beyond < 12) {
        busy = true;
        const atHim = p.vx * -d > 60;
        if (!atHim && room(d) > -beyond + 22 && ahead > 60) move = d;
        else {
          move = -d;
          if ((left < 0.08 || s.state === 'dash') && ahead < 95 && onFloor && !jump.busy) jump.go(22);
        }
      }
    }
    // Crescents: over them, when they are about to arrive - led by how far they
    // have come since, slowing on the way out and quickening home.
    for (const c of v.crescents) {
      if (Math.abs(c.vx) < 30) continue;
      const gap = p.cx - (c.x + c.vx * LAGS * (c.back ? 1.2 : 0.6));
      if (Math.sign(gap) !== Math.sign(c.vx)) continue;
      if (Math.abs(gap) / Math.abs(c.vx) < 0.3 && onFloor && !jump.busy) jump.go(18);
    }
    // Frost on the floor: out of the rings, and not back into one.
    const marks = v.icicles.filter((ic) => Math.abs(ic.surface - p.bottom) < 8);
    const frosty = (x) => marks.some((ic) => Math.abs(x - ic.x) < 18 + 9 + 5);
    if (marks.length > 0 && frosty(p.cx)) {
      busy = true;
      let best = null;
      for (let x = p.cx - 160; x <= p.cx + 160; x += 3) {
        if (x < L + 12 || x > R - 12 || frosty(x)) continue;
        if (best === null || Math.abs(x - p.cx) < Math.abs(best - p.cx)) best = x;
      }
      if (best !== null) move = best > p.cx ? 1 : -1;
    }
    // Finsternis: away from the middle while it gathers, over the ring when it comes.
    if (s.state === 'toMiddle' || s.state === 'eclipse') {
      const c = (s.x + l.x) / 2;
      if (Math.abs(p.cx - c) < 160) {
        busy = true;
        move = p.cx >= c ? 1 : -1;
        if (room(move) < 40) move = -move;
      }
    }
    if (v.eclipseT !== null) {
      const eta = v.eclipseT - LAGS + Math.abs(p.cx - (s.x + l.x) / 2) / 300;
      if (eta < 0.16 && eta > -0.1 && onFloor && !jump.busy) jump.go(18);
    }
    for (const r of v.rings) {
      const ahead = (p.cx - (r.x + r.dir * 300 * LAGS)) * r.dir;
      if (ahead > -12 && ahead / 300 < 0.16 && onFloor && !jump.busy) jump.go(18);
    }
    // The rest of the time: the one calling the other back, or the nearer one -
    // unless that would leave the other too whole to finish inside the call.
    if (!busy) {
      let target = null;
      const up = [s, l].filter((t) => t.state !== 'fallen');
      if (v.revive) target = v.revive.channeler === 'sol' ? s : l;
      else if (up.length > 0) {
        target = up.reduce((x, y) => (Math.abs(x.x - p.cx) <= Math.abs(y.x - p.cx) ? x : y));
        if (up.length === 2) {
          const [lo, hi] = s.hp <= l.hp ? [s, l] : [l, s];
          if (lo.hp <= 8 && hi.hp > 14) target = hi;
        }
      }
      if (target) {
        const dx = target.x - p.cx;
        if (Math.abs(dx) > 30) move = Math.sign(dx);
        else {
          if (Math.sign(dx) !== 0 && Math.sign(dx) !== p.facing) move = Math.sign(dx);
          h.swing(a);
        }
      }
    }
    // Fire on the floor: not into it, and out of it by the shorter way.
    const burning = (x) => v.flames.some((fl) => Math.abs(x - fl.x) < 8 + 9 + 4);
    if (move !== 0 && onFloor && !busy && burning(p.cx + move * 12)) move = 0;
    if (onFloor && !busy && burning(p.cx)) {
      const xs = v.flames.map((fl) => fl.x);
      move = p.cx - Math.min(...xs) < Math.max(...xs) - p.cx ? -1 : 1;
    }
    if (move !== 0 && marks.length > 0 && !frosty(p.cx) && frosty(p.cx + move * 10)) move = 0;
    if (move > 0) a.right = true;
    if (move < 0) a.left = true;
    return jump.apply(a);
  };
}
