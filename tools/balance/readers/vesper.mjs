/**
 * Vesperon, the blood lord, read like a person who has learned his fight -
 * 0.3 s late, from the roof, swinging only with his feet on it:
 *
 *   - the dive (he climbs to one side, wings wide, and draws the red line):
 *     he stands still facing the side it will come from and parries it on the
 *     rhythm of the wind-up - planned only off a wind-up seen with at least
 *     0.15 s of it left, and pressed up to 0.07 s early or late. A parried
 *     dive puts the lord on the roof. Where no parry can be planned, he runs
 *     off the line as it locks;
 *   - on the roof (after a dive, or knocked down): in to a sword's length of
 *     him, never into him - he takes off out of a crowd - and swing;
 *   - what flies at him (the blood sickles, a bat coming down, the drops of
 *     the blood moon), seen and led as the eye leads it: where standing still
 *     would be hit, a step whichever way is clear - under the sickles, as
 *     often as not - and a swing at whatever comes into the blade's reach;
 *   - his bats, while they hang over him out of a sword's reach: on the move,
 *     to and fro across the open middle, so that a bat comes down where he
 *     was (measured against standing and swinging at them, and against going
 *     after the low ones: this costs the fewest hearts);
 *   - otherwise: on the roof, in the open middle under open sky, facing him.
 *     Not up on the planks: a dive aims at the roof and passes under a hero
 *     on the high planks, so waiting up there is a hiding place, not a
 *     reading of the fight. And not under the planks either - see `home`.
 *
 * The world stands still for a moment whenever a blow lands (hit stop); the
 * eye sees that, so the rhythm he keeps counts only the moments that moved.
 */
export default function reader(g, h) {
  const p = g.player;
  const lvl = g.level;
  const DT = 1 / 60;
  const room = h.room;
  const floorY = room.floor;
  const see = h.lag();
  const jump = h.jumper();
  /** World frames: the frames in which the fight actually moved. */
  let wf = 0;
  let frozen = null;
  /** Dives seen begin, counted as the wind-up shows. */
  let shown = 0;
  let lastState = null;
  /** A parry planned off the dive's wind-up, and the key held for it. */
  let plan = null;
  let hold = 0;
  let pressedAt = -999;
  const spent = new Set();
  /** Running off the line of a dive that cannot be parried. */
  let dodge = null;
  /** A step away from what flies at him, kept for a few frames once chosen. */
  let step = null;
  /** The designed answer to the dive. False measures the fight without it: off the line, and in after the landing. */
  const PARRY = true;
  /** How far either side of the middle he paces while bats hang over him, and which way he is going. */
  const PACE = 110;
  let jink = 1;
  /**
   * Where to wait while he is in the air: the open middle of the roof, under
   * open sky - the stretch between the planks nearest the middle. His bats
   * hang 70 px either side of the hero, and a bat whose place is over a plank
   * settles on the plank and stays there (see the report): waiting under the
   * planks would keep his swarm out of the fight, which is a flaw of the bats
   * rather than a reading of him.
   */
  const home = (() => {
    const T = 32;
    const top = Math.floor(floorY / T) - 8;
    const free = (tx) => {
      for (let ty = top; ty < floorY / T; ty++) if (lvl.platformAt(tx, ty) || lvl.solidAt(tx, ty)) return false;
      return true;
    };
    let best = null;
    let run = null;
    for (let tx = Math.ceil(room.left / T); tx < Math.floor(room.right / T); tx++) {
      if (free(tx)) run = run ? [run[0], tx] : [tx, tx];
      if (run && (!free(tx) || tx === Math.floor(room.right / T) - 1)) {
        const mid = ((run[0] + run[1] + 1) / 2) * T;
        const score = Math.abs(mid - room.mid) - (run[1] - run[0]) * 4;
        if (!best || score < best.score) best = { mid, score };
        run = null;
      }
    }
    return best ? best.mid : room.mid;
  })();
  const clampX = (x) => Math.max(room.left + 4, Math.min(room.right - 4 - p.w, x));
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const H = 40;

  /** First world frame (counted from the dive's start) on which his body meets the hero standing where he is. */
  const impact = (sx, sy, tx, ty, w, hgt) => {
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * 940;
    const vy = (dy / len) * 940;
    for (let k = 1; k < 60; k++) {
      const x = sx + vx * k * DT - w / 2;
      const y = sy + vy * k * DT - hgt / 2;
      // Down on the roof: a landing, not a blow.
      if (y + hgt >= floorY - 1) return null;
      // Into a merlon: down on his back before he gets there.
      if (lvl.rectHitsSolid(x, y, w, hgt)) return null;
      if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + hgt > p.y) return k;
    }
    return null;
  };

  /** Where the hero's feet take him in the next frames: held still, or run one way. */
  const course = (way) => {
    const xs = [];
    let x = p.x;
    let vx = p.vx;
    for (let k = 0; k <= H; k++) {
      xs.push(x);
      vx = way ? approach(vx, way * 235, 25) : approach(vx, 0, 33.3);
      x = clampX(x + vx * DT);
    }
    return xs;
  };

  return (boss) => {
    if (frozen === false) wf++;
    frozen = g.hitStopTimer > 0;
    const s0 = boss.state;
    if (s0 === 'diveWind' && lastState !== 'diveWind') shown++;
    lastState = s0;
    const v = see({
      wf,
      id: shown,
      state: s0,
      timer: boss.timer,
      cx: boss.cx,
      cy: boss.cy,
      w: boss.w,
      h: boss.h,
      vx: boss.vx,
      vy: boss.vy,
      // The red line, while he draws it, and where it ends on the roof.
      tx: s0 === 'diveWind' || s0 === 'dive' ? boss.target.x : null,
      marks: boss.marks.filter((m) => m.t >= 0).map((m) => ({ x: m.x, t: m.t })),
      bats: g.enemies
        .filter((e) => e.kind === 'bat' && !e.dead && e.cx > room.left && e.cx < room.right)
        .map((e) => ({ x: e.cx, y: e.cy, vx: e.vx, vy: e.vy, w: e.w, h: e.h })),
      shots: h.hostile(),
    });
    // How much of the world has moved since what he sees now.
    const ran = wf - v.wf;
    const lead = (x, vx) => x + (vx * ran) / 60;
    const a = {};
    const s = v.state;
    const floor = p.onGround;
    const bcx = lead(v.cx, v.vx);
    const dx = bcx - p.cx;
    const dir = dx > 0 ? 1 : -1;
    const toward = dir > 0 ? 'right' : 'left';
    /** Face a side, or keep facing it. */
    const face = (side) => {
      if (side && p.facing !== side) a[side > 0 ? 'right' : 'left'] = true;
    };

    /* ------------------------------------------------ the dive */

    let diveIn = null;
    if (s === 'diveWind') {
      // He slows into the spot he dives from; the line ends where the hero
      // stands, until it locks.
      const T = v.timer;
      const kx = v.cx + v.vx / 3.87;
      const ky = v.cy + v.vy / 3.87;
      const fall = Math.exp(-4 * T);
      const sx = kx + (v.cx - kx) * fall;
      const sy = ky + (v.cy - ky) * fall;
      const locked = T <= 0.22 + 1e-6;
      const tx = locked ? v.tx : Math.max(room.left + 30, Math.min(room.right - 30, p.cx));
      diveIn = Math.ceil(T / DT - 1e-6) - ran;
      const k = impact(sx, sy, tx, floorY - v.h / 2, v.w, v.h);
      const hitIn = k === null ? null : diveIn + k;
      const side = Math.sign(sx - p.cx) || dir;
      if (!plan && !dodge && hitIn !== null && !spent.has(v.id)) {
        spent.add(v.id);
        const jitter = Math.round((Math.random() * 2 - 1) * 0.07 * 60);
        // Only off a wind-up seen with enough of it left, and with the guard ready.
        if (PARRY && diveIn * DT >= 0.15 && wf + hitIn - 5 + jitter - pressedAt > 35 && floor) {
          plan = { id: v.id, at: wf + hitIn, jitter, side, pressed: false };
        } else {
          dodge = { id: v.id, side };
        }
      }
      if (plan && plan.id === v.id && !plan.pressed) {
        if (hitIn !== null) plan.at = wf + hitIn;
        plan.side = side;
      }
    }
    if (plan && !plan.pressed) {
      if (s !== 'diveWind' && s !== 'dive') plan = null;
      else if (wf + 1 >= plan.at - 5 + plan.jitter) {
        plan.pressed = true;
        hold = 2;
        pressedAt = wf + 1;
      }
    }
    if (plan && plan.pressed && wf > plan.at + 14) plan = null;
    if (dodge && s !== 'diveWind' && s !== 'dive') dodge = null;

    /* ------------------------------------------------ what flies at him */

    // Everything that can hit him in the next frames, as the eye leads it.
    const threats = [];
    for (const q of v.shots) {
      if (q.kind !== 'blood') continue;
      threats.push({ x: lead(q.x, q.vx), y: lead(q.y, q.vy), vx: q.vx, vy: q.vy, w: q.w, h: q.h, home: q.deflectable, bat: false });
    }
    for (const b of v.bats) {
      // Only a bat already coming down at him has a course to read.
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 200) continue;
      threats.push({ x: lead(b.x, b.vx), y: lead(b.y, b.vy), vx: b.vx, vy: b.vy, w: b.w, h: b.h, home: false, bat: true });
    }
    for (const m of v.marks) {
      // A drop of the blood moon: let go at 0.85 s from the top of the sky.
      const t = m.t + ran * DT;
      const y = t < 0.85 ? floorY - 460 - (0.85 - t) * 620 : floorY - 460 + (t - 0.85) * 620;
      threats.push({ x: m.x, y: y + 8, vx: 0, vy: 620, w: 26, h: 16, home: false, bat: false });
    }
    /** Frames until the first thing hits him on a course, or Infinity. */
    const firstHit = (xs) => {
      let first = Infinity;
      for (const q of threats) {
        let x = q.x;
        let y = q.y;
        let vy = q.vy;
        for (let k = 1; k <= H && k < first; k++) {
          if (q.home) vy += Math.sign(p.cy - y) * Math.min(Math.abs(p.cy - y) * 3, 260) * DT;
          x += q.vx * DT;
          y += vy * DT;
          if (y - q.h / 2 > floorY) break;
          const hx = xs[k];
          if (x - q.w / 2 < hx + p.w && x + q.w / 2 > hx && y - q.h / 2 < p.y + p.h && y + q.h / 2 > p.y) {
            first = k;
            break;
          }
        }
      }
      return first;
    };
    const still = firstHit(course(0));
    if (step && (wf > step.until || still === Infinity)) step = null;
    if (!step && still < H && floor) {
      const l = firstHit(course(-1));
      const r = firstHit(course(1));
      if (l > still || r > still) {
        // The clearer way; between two clear ones, towards him - under the fan.
        const way = l === r ? dir : l > r ? -1 : 1;
        step = { way, until: wf + 14 };
      }
    }

    /* ------------------------------------------------ where to be */

    // His bats as the eye has them: any about him, at his height or over him.
    const batsAbout = v.bats.some((b) => {
      const by = lead(b.y, b.vy);
      return Math.abs(lead(b.x, b.vx) - p.cx) < 170 && by < p.cy + 26;
    });

    const down = s === 'grounded' || s === 'stunned';
    if (plan) {
      // Still, facing the side it comes from.
      face(plan.side);
    } else if (dodge) {
      // Off the line as it locks: away from the side he comes from, and on.
      if (s === 'dive' || (diveIn !== null && diveIn * DT < 0.34)) {
        let away = -dodge.side;
        if ((away > 0 ? room.right - 30 - p.cx : p.cx - room.left - 30) < 20) away = -away;
        a[away > 0 ? 'right' : 'left'] = true;
      }
    } else if (step) {
      a[step.way > 0 ? 'right' : 'left'] = true;
    } else if (down || s === 'fall') {
      // On the roof: in to a sword's length of him, never into him.
      const bw = v.w;
      const near = dir > 0 ? Math.min(v.cx, bcx) - bw / 2 : Math.max(v.cx, bcx) + bw / 2;
      const gap = dir > 0 ? bcx - bw / 2 - (p.x + p.w) : p.x - (bcx + bw / 2);
      const safeGap = dir > 0 ? near - (p.x + p.w) : p.x - near;
      const brake = (p.vx * dir > 0 ? p.vx * p.vx : 0) / 4000;
      const ending = down ? (Math.ceil(v.timer / DT) - ran) * DT : 9;
      if (s === 'fall') {
        // Not under him while he comes down.
        if (Math.abs(dx) < bw / 2 + p.w / 2 + 6) a[dir > 0 ? 'left' : 'right'] = true;
        else if (gap > 14 && safeGap > brake + 10) a[toward] = true;
      } else if (gap > 10 && safeGap > brake + 8 && ending > 0.2) a[toward] = true;
      else if (safeGap < 3) a[dir > 0 ? 'left' : 'right'] = true;
      if (!a.left && !a.right) face(dir);
      if (floor && gap < 30 && gap > -6 && p.facing === dir && ending > 0.05) h.swing(a);
    } else {
      // Waiting for him in the open middle of the roof, facing him - or on
      // the move while his bats are about: a bat comes down where he was.
      const d = home - p.cx;
      if (Math.abs(d) > 50 + PACE) a[d > 0 ? 'right' : 'left'] = true;
      else if (batsAbout) {
        if ((home + jink * PACE - p.cx) * jink <= 4) jink = -jink;
        a[jink > 0 ? 'right' : 'left'] = true;
      } else if (Math.abs(d) > 50) a[d > 0 ? 'right' : 'left'] = true;
      else face(dir);
    }

    /* ------------------------------------------------ the blade */

    // Whatever comes into the blade's reach: a swing to meet it, if he is
    // facing it or free to turn.
    if (floor) {
      for (const q of threats) {
        if (!q.home && !q.bat) continue;
        const side = Math.sign(q.x - p.cx) || p.facing;
        if (plan && side !== plan.side) continue;
        const front = side > 0 ? p.x + p.w - 4 : p.x - 36;
        let k = 0;
        let x = q.x;
        let y = q.y;
        let vy = q.vy;
        for (; k < 12; k++) {
          if (x - q.w / 2 < front + 40 && x + q.w / 2 > front && y - q.h / 2 < p.cy + 14 && y + q.h / 2 > p.cy - 18) break;
          if (q.home) vy += Math.sign(p.cy - y) * Math.min(Math.abs(p.cy - y) * 3, 260) * DT;
          x += q.vx * DT;
          y += vy * DT;
        }
        if (k >= 12) continue;
        if (p.facing !== side && !a.left && !a.right && !plan) face(side);
        if (p.facing === side && k <= 9) h.swing(a);
      }
      // A bat low enough to reach, hanging about him.
      for (const b of v.bats) {
        const bx = lead(b.x, b.vx);
        const by = lead(b.y, b.vy);
        if (Math.abs(bx - p.cx) < 60 && by > p.cy - 32 && by < p.cy + 26) {
          const side = Math.sign(bx - p.cx) || p.facing;
          if (plan && side !== plan.side) continue;
          if (p.facing !== side && !a.left && !a.right && !plan) face(side);
          if (p.facing === side) h.swing(a);
        }
      }
    }

    if (hold > 0) {
      a.parry = true;
      hold--;
    }
    return jump.apply(a);
  };
}
