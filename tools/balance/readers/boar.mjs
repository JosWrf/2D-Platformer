/**
 * Grimmzahn, read like a person reads him - the same reader verify-boar.mjs
 * fights him with:
 *
 *   - a charge coming at him: he jumps it when it is close; right in front of
 *     a boar about to go, on the rhythm of the scrape. Once a charge: what he
 *     still sees coming after the jump is the boar he has jumped;
 *   - a charge going the other way: after it, to the wall;
 *   - the stomp: standing in the boar, up on the rhythm of the rear; close by,
 *     up as he comes down; further off, over the ridge as it comes;
 *   - the dig: he walks in towards the boar - the rock comes down where he
 *     stood - and steps off the spot any rock he sees is coming down on;
 *   - dazed, panting or stumbling: in to a sword's length, and swing;
 *   - otherwise: up to the edge of where the boar likes to keep him.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  let jumpedRun = -1;
  let runs = 0;
  let wasRunning = false;
  let lastState = null;
  return (boss) => {
    const running = boss.state === 'scrape' || boss.state === 'turn' || boss.state === 'charge';
    if (running && !wasRunning) runs++;
    if (boss.state === 'turn' && lastState === 'charge') runs++;
    wasRunning = running;
    lastState = boss.state;
    const v = see({
      run: runs,
      state: boss.state,
      timer: boss.timer,
      x: boss.x,
      w: boss.w,
      cx: boss.cx,
      facing: boss.facing,
      waves: boss.waves.map((w) => ({ x: w.x, dir: w.dir })),
      rocks: [
        ...boss.lobs.map((l) => ({ cx: l.x, cy: l.y, vx: l.vx, vy: l.vy })),
        ...g.projectiles.filter((q) => q.kind === 'rock' && !q.friendly && !q.dead).map((q) => ({ cx: q.cx, cy: q.cy, vx: q.vx, vy: q.vy })),
      ],
    });
    const a = {};
    const dx = v.cx - p.cx;
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const edge = dx > 0 ? v.x - (p.x + p.w) : p.x - (v.x + v.w);
    const s = v.state;
    const coming = Math.sign(v.facing) === Math.sign(p.cx - v.cx);
    const floor = p.onGround;
    const swing = () => {
      if (edge < 34) h.swing(a);
    };
    if (s === 'dazed' || s === 'recover' || s === 'stagger') {
      if (edge > 22) a[toward] = true;
      else if (edge < -30) a[away] = true;
      else if (Math.sign(dx) !== p.facing) a[toward] = true;
      swing();
    } else if (s === 'scrape' || s === 'turn' || s === 'charge') {
      if (coming && floor && !jump.busy && v.run !== jumpedRun) {
        let go = false;
        if (s === 'charge' && edge < 175) go = true;
        else if (s !== 'charge' && edge < 90 && v.timer < 0.45) go = true;
        if (go) {
          jump.go(18);
          jumpedRun = v.run;
        }
      }
      if (!coming && s !== 'turn') a[toward] = true;
    } else if (s === 'rear') {
      if (Math.abs(dx) > 200) a[toward] = true;
      if (floor && !jump.busy && Math.abs(dx) < 60 && v.timer < 0.42) jump.go(18);
      else if (floor && !jump.busy && Math.abs(dx) < 150 && v.timer < 0.3) jump.go(18);
    } else if (s === 'dig') {
      if (edge > 24) a[toward] = true;
    } else {
      if (edge > 110) a[toward] = true;
      else if (edge < 60 && edge > 0) a[away] = true;
      if (edge < 30) {
        if (Math.sign(dx) !== p.facing) a[toward] = true;
        swing();
      }
    }
    for (const w of v.waves) {
      const toMe = Math.sign(p.cx - w.x) === w.dir;
      if (toMe && Math.abs(p.cx - w.x) < 175 && floor && !jump.busy) jump.go(18);
    }
    for (const q of v.rocks) {
      // Where it comes down to his height, as the eye judges an arc.
      const drop = p.cy - q.cy;
      const t = (-q.vy + Math.sqrt(Math.max(0, q.vy * q.vy + 1800 * drop))) / 900;
      const land = q.cx + q.vx * t;
      if (Math.abs(land - p.cx) < 34) {
        a.left = false;
        a.right = false;
        a[land > p.cx ? 'left' : 'right'] = true;
      }
    }
    return jump.apply(a);
  };
}
