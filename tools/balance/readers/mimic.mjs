/**
 * Gierschlund, read like a person reads it - 0.3 s late, from the floor:
 *
 *   - hopping, lid shut: nothing to hit. He stands his ground facing it (its
 *     hops come down short of a hero who stands) and steps out from under one
 *     that would come down on him;
 *   - the bite (lid cracks, eye in the gap, it settles back): he stands and
 *     parries it on the rhythm of the wind-up he saw - the jaws jam open. A
 *     bite he cannot time any more he runs from;
 *   - the tongue: a low hop over it, on the rhythm of the coil;
 *   - the gold rain: still while it spits (the coins are aimed at him), half a
 *     step into the gap between two coins while they fall, then the coins that
 *     lie between him and the mouth go back into it, one swing each;
 *   - the gulp: away from it, running;
 *   - the rattle of the lid: off it;
 *   - open (after a move, or jammed): in to a sword's length of what lies in
 *     front of him - the tongue on the floor, else the mouth - and swing; out
 *     of hugging distance before the window shuts.
 *
 * He judges where and when the jaws or the tongue will reach him from what he
 * saw of the wind-up: its rhythm, and how the chest was moving.
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const LAG = h.LAG;
  const L = LAG / 60;
  const FLOOR = h.room.floor;
  /** Parries the bite (the move's own answer); false: runs from every bite. */
  const PARRY = true;
  /** A human's error on a press timed off a rhythm, in seconds either way. */
  const JITTER = 0.07;
  const WINDS = { biteWind: 1, tongueWind: 1, spitWind: 1, gulpWind: 1, snapWind: 1 };
  const step = (x, to, by) => (x < to ? Math.min(x + by, to) : Math.max(x - by, to));
  let prevState = null;
  let episode = 0;
  /** The parry he means to make against the bite he is watching. */
  let plan = null;
  let pressing = 0;
  /** The hop he means to make over the tongue he is watching. */
  let hop = null;
  /** Where he stands while the coins come down. */
  let coinSpot = null;
  return (boss) => {
    const v = see({
      state: boss.state,
      timer: boss.timer,
      x: boss.x,
      w: boss.w,
      cx: boss.cx,
      bottom: boss.bottom,
      vx: boss.vx,
      vy: boss.vy,
      ground: boss.onGround,
      facing: boss.facing,
      lid: boss.lid,
      tongue: boss.tongue,
      coins: g.projectiles
        .filter((q) => q.kind === 'coin' && !q.dead)
        .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy, resting: q.resting, friendly: q.friendly })),
    });
    if (v.state !== prevState) {
      if (WINDS[v.state]) episode++;
      prevState = v.state;
    }
    const now = h.frame;
    const a = {};
    const s = v.state;
    const bx = h.lead(v.cx, v.vx);
    const dx = bx - p.cx;
    const d = Math.abs(dx);
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    const behind = h.room.space(dx > 0 ? -1 : 1);
    const floor = p.onGround;
    const onPlank = floor && p.bottom < FLOOR - 8;
    /** The chest faces him: its bite and its tongue come his way. */
    const facingMe = Math.sign(p.cx - bx) === v.facing;
    const stand = () => h.face(a, bx);
    const backOff = () => {
      if (behind > 12) a[away] = true;
      else stand();
    };
    /** Frames from now until a wind-up seen with this timer turns into its move. */
    const untilMove = (timer) => Math.ceil((timer - L) * 60 - 1e-6) - 1;

    /* What lies in front of him, within a sword's length (40 px from 5 px out). */
    const tongueLen = v.tongue >= 8 ? v.tongue : 0;
    const open = v.lid > 0.32;
    const inReach = () => {
      if (Math.sign(dx) !== p.facing) return false;
      if (open && d < 72) return true;
      return facingMe && tongueLen > 0 && d - 45 < 27 + tongueLen && d - 5 > 27;
    };

    /* ------------------------------------------------------------ coins */
    const flying = v.coins.filter((c) => !c.friendly && !c.resting);
    const lying = v.coins.filter((c) => !c.friendly && c.resting);
    let coinsBusy = false;
    if (flying.length) {
      // Each coin's arc as the eye judges it, run on from where he saw it;
      // his own run to a spot, step by step; and of the spots none of the
      // arcs crosses on the way or on arrival, the one nearest the mouth's
      // window. Re-judged every few frames while they fall.
      if (coinSpot === null || now % 6 === 0) {
        const paths = flying.map((c) => {
          const pts = [];
          let x = c.x;
          let y = c.y;
          let vy = c.vy;
          for (let f = 1; f <= LAG + 60; f++) {
            vy += 950 / 60;
            x += c.vx / 60;
            y += vy / 60;
            if (f > LAG) pts.push([x, Math.min(y, FLOOR - 6)]);
            if (y + 6 >= FLOOR) break;
          }
          return pts;
        });
        const hits = (target) => {
          let x = p.cx;
          let vx = p.vx;
          let n = 0;
          for (let f = 0; f < 60; f++) {
            if (Math.abs(target - x) > 2) vx = step(vx, Math.sign(target - x) * 235, 25);
            else vx = step(vx, 0, 33.4);
            x += vx / 60;
            for (const pts of paths) {
              const q = pts[f];
              if (q && Math.abs(q[0] - x) < 15 && q[1] + 6 > FLOOR - 30) n++;
            }
          }
          return n;
        };
        const want = bx - Math.sign(dx) * 95;
        let best = null;
        for (let k = -50; k <= 50; k++) {
          const x = p.cx + k * 3;
          if (x < h.room.left + 12 || x > h.room.right - 12) continue;
          const cost = hits(x) * 1000 + Math.abs(x - want) * 0.2 + Math.abs(x - p.cx) * 0.05;
          if (best === null || cost < best.cost) best = { x, cost };
        }
        coinSpot = best ? best.x : p.cx;
      }
      coinsBusy = true;
      if (h.walkTo(a, coinSpot, 2)) stand();
    } else {
      coinSpot = null;
    }

    /* ---------------------------------------------------- the boss's move */
    if (!coinsBusy) {
      if (s === 'biteWind' || s === 'bite') {
        if (s === 'biteWind') {
          if (!plan || plan.ep !== episode) {
            // He sees the lid crack: can he still time a parry off it?
            plan = { ep: episode, ok: PARRY && v.timer - L >= 0.15, jit: Math.round((Math.random() * 2 - 1) * JITTER * 60), at: -1, done: false, reach: false };
          }
          if (!plan.done) {
            // The chest as he saw it, run on: settling back (or still sliding
            // from its hop) through the rest of the wind-up, then the lunge at
            // 480 px/s, braking - and the first frame its jaws are on him.
            const m = untilMove(v.timer);
            let x = v.cx;
            let vx = v.vx;
            for (let i = 0; i < LAG + m; i++) {
              vx = step(vx, -v.facing * 40, 400 / 60);
              x += vx / 60;
            }
            const heroCx = p.cx + (Math.sign(p.vx) * p.vx * p.vx) / 4000;
            let lunge = 0;
            let vb = 480;
            let k = 0;
            let hit = -1;
            lunge += vb / 60;
            for (k = 1; k <= 21; k++) {
              vb = step(vb, 0, 15);
              const jx = x + v.facing * lunge;
              const lo = v.facing > 0 ? jx + 15 : jx - 55;
              if (lo < heroCx + 9 && lo + 40 > heroCx - 9) {
                hit = k;
                break;
              }
              lunge += vb / 60;
            }
            plan.reach = facingMe && hit > 0;
            if (plan.reach) plan.at = now + m + hit - 5 + plan.jit;
          }
        }
        if (plan && plan.ok && plan.reach) {
          stand();
        } else if (plan && plan.reach) {
          backOff();
        } else if (d < 150 && facingMe) {
          backOff();
        } else {
          stand();
        }
      } else if (s === 'gape' || s === 'jammed') {
        const remaining = v.timer - L;
        const goldHome = v.coins.some((c) => c.friendly);
        let lo;
        let hi;
        if (facingMe && tongueLen >= 20) {
          hi = 72 + tongueLen - 14;
          lo = Math.max(78, hi - 20);
        } else {
          hi = 68;
          lo = 56;
        }
        // Lying coins between him and the mouth are worth more than the mouth.
        const ahead = lying
          .map((c) => (c.x - p.cx) * Math.sign(dx))
          .filter((c) => c > -2 && c < d - 40)
          .sort((m, n) => m - n);
        if (ahead.length) {
          const c = ahead[0];
          if (c > 34) a[toward] = true;
          else if (c < 6) a[away] = true;
          else {
            stand();
            h.swing(a);
          }
        } else if (remaining < 0.22 && !goldHome && d < 76) {
          backOff();
        } else {
          if (d > hi) a[toward] = true;
          else if (d < lo) backOff();
          else stand();
          if (inReach()) h.swing(a);
        }
      } else if (s === 'tongueWind' || s === 'tongue') {
        if (s === 'tongueWind' && (!hop || hop.ep !== episode)) hop = { ep: episode, at: -1, done: false };
        if (s === 'tongueWind' && !hop.done) {
          // The tip runs out 18 px a frame from 41 px in front of its middle;
          // a low hop is clear of it from one frame after the press for thirty.
          const kc = Math.max(1, Math.ceil((d - 50) / 18.3));
          hop.reach = facingMe && d < 275;
          hop.at = now + untilMove(v.timer) + Math.round((kc - 8) / 2);
        }
        if (hop && hop.reach && !hop.done && now >= hop.at && floor && !jump.busy) {
          jump.go(9);
          hop.done = true;
        }
        stand();
      } else if (s === 'spitWind') {
        // The coins are aimed at where he is when it spits, and come down
        // there: on the move, in towards the mouth, under their arcs.
        if (d > 100) a[toward] = true;
        else stand();
      } else if (s === 'gulpWind' || s === 'gulp') {
        // Away from it, running - or, with a wall at his back, through it to
        // its back, where its jaws are not.
        const atBack = Math.sign(p.cx - bx) === -v.facing;
        if (atBack) {
          if (d < 40) a[away] = true;
        } else if (d + behind > 120) {
          backOff();
        } else {
          a[toward] = true;
        }
      } else if (s === 'snapWind' || s === 'snap') {
        if (d < 80) backOff();
        else stand();
      } else {
        // Hopping, lid shut: keep clear and wait for it to want something.
        if (!v.ground) {
          const fall = Math.max(0, FLOOR - v.bottom);
          const t = (-v.vy + Math.sqrt(v.vy * v.vy + 2800 * fall)) / 1400;
          const land = v.cx + v.vx * t;
          if (Math.abs(land - p.cx) < 62) a[land > p.cx ? 'left' : 'right'] = true;
          else stand();
        } else if (d < 80) {
          backOff();
        } else if (lying.length) {
          // Coins left on the floor still go home: in front of him, a swing.
          const ahead = lying
            .map((c) => (c.x - p.cx) * Math.sign(dx))
            .filter((c) => c > -2 && c < d - 60)
            .sort((m, n) => m - n);
          if (ahead.length && ahead[0] <= 34 && ahead[0] >= 6) {
            stand();
            h.swing(a);
          } else if (ahead.length && ahead[0] > 34 && d > 150) {
            a[toward] = true;
          } else stand();
        } else {
          stand();
        }
      }
    }

    /* A plank is no place to fight a chest from: down off it. */
    if (onPlank && !jump.busy && !(plan && plan.ok && plan.reach && !plan.done)) {
      a.down = true;
      jump.go(2);
    }

    /* ------------------------------------------------------------ the parry */
    if (plan && plan.ok && plan.reach && !plan.done && plan.at >= 0 && now >= plan.at) {
      plan.done = true;
      pressing = 2;
    }
    if (pressing > 0) {
      a.parry = true;
      pressing--;
    }
    return jump.apply(a);
  };
}
