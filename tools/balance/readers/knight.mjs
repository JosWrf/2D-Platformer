/**
 * Morvain, read like a person reads him: everything he does is seen 0.3 s
 * late, and what moves is led by those 0.3 s.
 *
 *   - his slam, his dash and his cast are wound up long enough to be
 *     answered, so he parries them, on the rhythm of the wind-up and with a
 *     person's error in the press (up to 0.07 s either way): the slam
 *     standing inside its reach, the dash when it gets to him, the orbs as
 *     they reach him. Once he has decided how to answer a move he stands
 *     still for it. A parry puts the knight down, so stepping in after one is
 *     part of the plan: in, and swing;
 *   - where a wind-up is too short to parry after 0.3 s (the dash in the
 *     third phase) he jumps it, with a second jump at the top - and in the
 *     third phase he waits a little further out, so there is time to;
 *   - the shockwaves of a slam he stands too far from to parry, and the ones
 *     from a leap's landing, he jumps on the rhythm of the move that sends
 *     them - they are on him before the eye could follow them; the wave from
 *     a landing close by he parries;
 *   - his leap: off the spot he will come down on (on the floor or a board);
 *   - up on a board, his blade does not reach the floor: he waits further
 *     off and jumps the waves that come off the end of it;
 *   - shadow orbs: batted back with the blade as they arrive;
 *   - debris from the ceiling: off the spots it is coming down on;
 *   - staggered, and in the rest after each of his moves: in to a sword's
 *     length and swing, the last swing started early enough to be over
 *     before the next wind-up - a blow into the wind-up only makes the blow
 *     come sooner - and no swing his way at a skeleton either, then;
 *   - skeletons: kept off with the blade's crescent and cut down, when he is
 *     not about to move;
 *   - landed on a board after a jump: back down through it;
 *   - otherwise: just outside a sword's length, facing him, waiting.
 */
export default function reader(g, h) {
  const p = g.player;
  const lvl = g.level;
  const TILE = 32;
  const see = h.lag();
  const jump = h.jumper();
  const dbg = (o) => {
    if (h.dbg) h.dbg.push({ at: +g.time.toFixed(2), ...o });
  };

  // The walls of the throne room, read off the floor row he fights on.
  const floorY = h.room.floor;
  const row = Math.floor((floorY - 1) / TILE);
  let wl = Math.floor(p.cx / TILE);
  let wr = wl;
  while (wl > 0 && !lvl.solidAt(wl - 1, row)) wl--;
  while (wr < lvl.width - 1 && !lvl.solidAt(wr + 1, row)) wr++;
  const wallL = wl * TILE;
  const wallR = (wr + 1) * TILE;

  /** A person's error on a timed press: up to 0.07 s either way. */
  const jitter = () => (Math.random() * 2 - 1) * 0.07;
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  /**
   * Where a leap comes down: his arc, as anyone who has watched it a few
   * times knows it - and the boards it can end on.
   */
  const landing = (x, y, w, hh, vx, vy, timer) => {
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      timer -= 1 / 60;
      vy = Math.min(760, vy + 30);
      x = Math.max(wallL, Math.min(wallR - w, x + vx / 60));
      const prev = y + hh;
      y += vy / 60;
      let ground = null;
      if (vy > 0) {
        if (y + hh >= floorY) ground = floorY;
        for (let ty = Math.floor(prev / TILE); ty <= Math.floor((y + hh) / TILE); ty++) {
          const surface = ty * TILE;
          if (prev > surface + 0.5 || y + hh < surface) continue;
          for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - 0.001) / TILE); tx++) {
            if (lvl.platformAt(tx, ty)) ground = ground === null ? surface : Math.min(ground, surface);
          }
        }
      }
      if (ground !== null) {
        y = ground - hh;
        vy = 0;
        if (timer < 0.55) return { t, cx: x + w / 2, bottom: ground };
      }
    }
    return { t, cx: x + w / 2, bottom: y + hh };
  };

  /**
   * When a shockwave seen `back` seconds ago reaches the hero where he
   * stands: it runs along whatever it is on and drops off the end of a board.
   */
  const waveReaches = (q, from, ahead, pad = 0, hx = p.x) => {
    let x = q.x - q.w / 2;
    let y = q.y - q.h / 2;
    const steps = Math.round((ahead - from) * 60);
    // The guard reaches a little out in front of him, towards the wave.
    const gx = q.vx > 0 ? hx - pad : hx;
    for (let i = 1; i <= steps; i++) {
      x += q.vx / 60;
      if (lvl.rectHitsSolid(x, y, q.w, q.h)) return null;
      const drop = lvl.groundBelow(x + q.w / 2, y + q.h - 4, 3);
      if (drop > 6) y += Math.min(drop, 260 / 60);
      const t = from + i / 60;
      if (t >= 0 && overlap(x, y, q.w, q.h, gx, p.y, p.w + pad, p.h)) return t;
    }
    return null;
  };

  /** His height off the floor t seconds into a jump held full, pushed again at the top. */
  const jumpH = (t, dbl) => {
    if (t <= 0) return 0;
    if (t <= 0.3) return 600 * t - 875 * t * t;
    if (!dbl || t <= 1 / 3) {
      const u = t - 0.3;
      return Math.max(0, 101.25 + 75 * u - 1125 * u * u);
    }
    const u = t - 1 / 3;
    if (u <= 0.267) return 102.5 + 500 * u - 875 * u * u;
    const w = u - 0.267;
    return Math.max(0, 173.6 + 33 * w - 1125 * w * w);
  };

  /**
   * His dash, followed the way it goes: at its speed for 0.55 s, off the end
   * of a board and down. When it reaches the hero standing at hx - or
   * jumping from there at `jumpAt` - in seconds from now, or null.
   */
  const dashPath = (x, y, w, hh, dir, speed, delay, hx, jumpAt = null) => {
    let vy = 0;
    // The frame the wind-up runs out is not yet a running one; after it, the
    // blade's reach is checked where he stood, then he moves, then his body.
    for (let i = 1; i <= 34; i++) {
      const t0 = delay + (i + 1) / 60;
      const hy0 = p.y - (jumpAt === null ? 0 : jumpH(t0 - jumpAt, true));
      if (overlap(x - 10, y + 6, w + 20, hh - 6, hx - p.w / 2, hy0, p.w, p.h)) return t0;
      x = Math.max(wallL, Math.min(wallR - w, x + (dir * speed) / 60));
      const prev = y + hh;
      vy = Math.min(760, vy + 30);
      y += vy / 60;
      if (y + hh >= floorY) {
        y = floorY - hh;
        vy = 0;
      } else if (vy > 0) {
        const ty = Math.floor((y + hh) / TILE);
        const surface = ty * TILE;
        if (prev <= surface + 0.5 && y + hh >= surface) {
          for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - 0.001) / TILE); tx++) {
            if (lvl.platformAt(tx, ty)) {
              y = surface - hh;
              vy = 0;
            }
          }
        }
      }
      const hy = p.y - (jumpAt === null ? 0 : jumpH(t0 - jumpAt, true));
      if (overlap(x, y, w, hh, hx - p.w / 2, hy, p.w, p.h)) return t0;
    }
    return null;
  };

  // World frames: the frames in which the fight actually moved. Hit-stop is a
  // freeze anyone can see; his timers do not run through it, so neither does
  // the hero's sense of their rhythm.
  let wf = 0;
  let frozen = null;

  let seenState = null;
  let action = 0;
  let planned = -1;
  /**
   * What he has decided to do about the move he saw: a parry or a jump, the
   * world frame to do it on, which way to face, and a second jump.
   */
  let plan = null;
  let parryHold = 0;
  let guardUntil = -1;
  let doubleAt = -1;
  let holdUntil = -1;
  let lastFlash = 0;
  /** When his last parry put the knight down, and until when he stays down. */
  let lastDown = -999;
  let downUntil = -1;
  /** Where he is going to come down, while he is in the air. */
  let land = null;
  let lastMode = '';
  /** Frames left of holding down to drop through a board he has ended up on. */
  let dropping = 0;

  return (boss) => {
    if (frozen === false) wf++;
    frozen = g.hitStopTimer > 0;

    const v = see({
      wf,
      state: boss.state,
      timer: boss.timer,
      x: boss.x,
      y: boss.y,
      w: boss.w,
      h: boss.h,
      vx: boss.vx,
      vy: boss.vy,
      phase: boss.phase,
      shots: h.hostile(),
      skels: g.enemies
        .filter((e) => e.kind === 'skeleton' && !e.dead)
        .map((e) => ({ cx: e.cx, vx: e.vx, state: e.state })),
    });
    const el = (wf - v.wf) / 60;
    const a = {};
    const onFloor = p.onGround;
    const s = v.state;

    // Where he is now, as the eye leads him.
    let kx = v.x;
    if (s === 'dash' || s === 'walk' || s === 'leap') {
      kx = Math.max(wallL, Math.min(wallR - v.w, v.x + v.vx * el));
    } else if (s === 'dashWindup') {
      // Stepping back into the run-up, at a walk.
      kx = v.x - Math.sign(p.cx - (v.x + v.w / 2)) * 60 * Math.min(el, Math.max(0, v.timer));
    }
    const kcx = kx + v.w / 2;
    const rem = v.timer - el;
    const dx = kcx - p.cx;
    const dist = Math.abs(dx);
    const toward = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    // Where the hero comes to a stop once he lets go of the keys.
    const stopX = p.cx + (Math.sign(p.vx) * p.vx * p.vx) / 4000;
    const stopDist = Math.abs(kcx - stopX);

    if (s !== seenState) {
      seenState = s;
      action++;
      if (s !== 'leap') land = null;
    }

    // His own parry landing is something he feels at once, and a parry puts
    // the knight down - unless the last one did so less than 1.95 s ago. So
    // the step in that follows a parry is part of the plan, not a reaction:
    // through whatever waves the slam sent while the parry still covers him.
    if (p.parryFlash > 0.9 && lastFlash <= 0.9) {
      holdUntil = wf + 24;
      if (stopDist < 120 && wf - lastDown >= Math.round(1.95 * 60)) {
        lastDown = wf;
        downUntil = wf + Math.round((1.35 + 0.45) * 60);
        guardUntil = wf;
      }
      dbg({ ev: 'parried', s, dist: Math.round(dist) });
    }
    lastFlash = p.parryFlash;

    /* ------------------------------------------------ his moves, answered */
    const decide = (kind, t, what, face, dbl = false) => {
      plan = { kind, at: wf + Math.max(0, Math.round(t * 60)), face, dbl, what };
      dbg({ ev: 'plan', kind, what, rem: +rem.toFixed(2), in: +t.toFixed(2), dist: Math.round(stopDist), ph: v.phase });
    };
    // His feet: on the floor, or up on one of the boards.
    const onLedge = v.y + v.h < floorY - 40;
    if (planned !== action) {
      planned = action;
      const face = Math.sign(dx) || p.facing;
      // The waves of a slam, followed from where he will bring the blade
      // down: along the floor or the board, and off the end of it.
      const slamWaves = () => {
        const dir = Math.sign(p.cx - kcx) || 1;
        let first = null;
        for (const sp of v.phase === 3 ? [250, 320] : [250]) {
          const wave = { x: kcx + dir * 40 + 13, y: v.y + v.h - 15, vx: dir * sp, w: 26, h: 30 };
          const t = waveReaches(wave, Math.max(0, rem), Math.max(0, rem) + 1.2, 0, stopX - p.w / 2);
          if (t !== null) first = first === null ? t : Math.min(first, t);
        }
        return first;
      };
      if (onLedge && s === 'slamWindup') {
        // Up there his blade does not reach the floor; the waves come off the
        // end of the board, on the rhythm of the slam.
        const t = slamWaves();
        if (t !== null) decide('jump', Math.max(0, t - 0.16 + jitter()), 'ledge-wave', face);
        else dbg({ ev: 'ledge', s });
      } else if (onLedge && s === 'cast') {
        // The orbs come from above: watched, not parried.
        dbg({ ev: 'ledge', s });
      } else if (s === 'slamWindup' && rem >= 0.15) {
        // Inside the blade's reach (to 105 px in front of him) the blow lands
        // with the slam. Beyond it the wave comes - its x is its left edge
        // both ways, so it sets off 66 px out going right, 40 going left.
        const lead = p.cx > kcx ? 66 : 40;
        const fast = v.phase === 3 ? 320 : 250;
        const reach = Math.max(0, stopDist - 9 - lead);
        // Inside the blade (it ends 114 px out), or a wave that is on him at
        // once: parried on the slam itself.
        if (stopDist < 116 || (p.cx > kcx && stopDist < 122)) decide('parry', rem - 0.08 + jitter(), 'slam', face);
        else if (stopDist <= 118) decide('parry', rem + Math.max(0, reach - 30) / fast - 0.03 + jitter(), 'slam-wave', face);
        else {
          const t = slamWaves();
          if (t !== null) decide('jump', Math.max(0, t - 0.16 + jitter()), 'slam-wave', face);
        }
      } else if (s === 'dashWindup') {
        const speed = v.phase === 3 ? 620 : 520;
        // He steps back at a walk until the wind-up runs out, then comes the
        // way he faces - off the end of a board, if he stands on one.
        const dir = Math.sign(p.cx - kcx) || 1;
        const x0 = kx - dir * 60 * Math.max(0, rem);
        const r0 = Math.max(0, rem);
        const t = dashPath(x0, v.y, v.w, v.h, dir, speed, r0, stopX);
        // Off the floor the run carries on further than it would standing.
        const airX = p.cx + (Math.sign(p.vx) * p.vx * p.vx) / 1900;
        const ta = dashPath(x0, v.y, v.w, v.h, dir, speed, r0, airX);
        if (t === null) dbg({ ev: 'dash-short', dist: Math.round(stopDist) });
        else if (rem >= 0.15) {
          decide('parry', t - 0.09 + jitter(), 'dash', face);
        }
        else {
          // Over him, if a jump now (or a little later) clears him where he
          // goes; the second push at the top keeps him up there.
          let best = null;
          for (const j of [Math.max(0, (ta ?? t) - 0.27), 0.017, 0.05]) {
            if (dashPath(x0, v.y, v.w, v.h, dir, speed, r0, airX, j) === null) {
              best = j;
              break;
            }
          }
          // As soon as seen, or - with time in hand - on the rhythm, a person's
          // error and all.
          if (best !== null) decide('jump', best > 0.05 ? Math.max(0, best + jitter()) : best, 'dash', face, true);
          else dbg({ ev: 'dash-too-late', rem: +rem.toFixed(2), in: +t.toFixed(2), dist: Math.round(stopDist) });
        }
      } else if (s === 'cast' && rem >= 0.15 && stopDist <= 112) {
        // The first orb reaches the guard about (0.2 d - 6) frames after the
        // cast, measured; the rest come in close behind it.
        decide('parry', rem + (0.196 * stopDist - 5.8) / 60 - 0.03 + jitter(), 'cast', face);
      } else if (s === 'leap') {
        // From where he was seen, on the clock he was seen on.
        land = landing(v.x, v.y, v.w, v.h, v.vx, v.vy, v.timer);
        land.t -= el;
        land.at = wf + Math.round(land.t * 60);
        const off = Math.abs(land.cx - stopX);
        const level = Math.abs(land.bottom - floorY) < 4;
        dbg({ ev: 'leap', in: +land.t.toFixed(2), off: Math.round(off), level });
        if (land.t >= 0.15) {
          // Where to stand for it: off the spot he comes down on, if he is
          // coming down on him - 85 px out, on whichever side has the room.
          let side = Math.sign(stopX - land.cx) || 1;
          if (land.cx + side * 95 > wallR - 12 || land.cx + side * 95 < wallL + 12) side = -side;
          const spot = off < 75 ? land.cx + side * 85 : stopX;
          const walk = Math.abs(spot - stopX) / 235 + 0.12;
          // The wave that comes his way from there.
          const dir = spot > land.cx ? 1 : -1;
          const wave = { x: land.cx + (dir > 0 ? 30 : -30) + 13, y: land.bottom - 15, vx: dir * 290, w: 26, h: 30 };
          const hx = spot - p.w / 2;
          const tBox = waveReaches(wave, land.t, land.t + 1, 30, hx);
          const tBody = waveReaches(wave, land.t, land.t + 1, 0, hx);
          const lf = Math.sign(land.cx - spot) || face;
          const offSpot = Math.abs(land.cx - spot);
          // Close enough for a parry of the wave to put him down: parried.
          if (level && offSpot <= 110 && tBox !== null && tBox > walk) decide('parry', tBox - 0.03 + jitter(), 'landing', lf);
          else if (tBody !== null) decide('jump', Math.max(walk, tBody - 0.16 + jitter()), 'landing', lf);
          if (plan && plan.what === 'landing') plan.spot = spot;
        }
      }
    }

    // The plan: still until it is carried out, facing him for a parry.
    let holding = false;
    if (plan) {
      if (wf < plan.at) {
        holding = true;
      } else if (plan.kind === 'parry') {
        a.parry = true;
        holding = true;
        parryHold++;
        if (parryHold >= 2) {
          parryHold = 0;
          guardUntil = wf + 12;
          plan = null;
        }
      } else {
        if (onFloor && !jump.busy) {
          jump.go(18);
          if (plan.dbl) doubleAt = wf + 20;
          plan = null;
        } else if (wf > plan.at + 6) {
          plan = null;
        }
        holding = true;
      }
    }
    const guarding = holding || guardUntil > wf;
    if (doubleAt >= 0 && wf >= doubleAt && !onFloor && !jump.busy) {
      jump.go(16);
      doubleAt = -1;
    } else if (doubleAt >= 0 && wf >= doubleAt + 12) {
      doubleAt = -1;
    }

    /* ------------------------------------------------------------ hazards */
    const shots = h.threats(v.shots);
    // Shockwaves he can see, followed along the floor and off the boards.
    let waveIn = 99;
    for (const q of v.shots) {
      if (q.kind !== 'shockwave') continue;
      if (Math.sign(q.vx) !== Math.sign(p.cx - h.lead(q.x, q.vx))) continue;
      const t = waveReaches(q, -el, 0.4);
      if (t !== null) waveIn = Math.min(waveIn, t);
    }
    const planIn = plan ? (plan.at - wf) / 60 : guardUntil > wf ? 0 : 99;
    if (waveIn < 0.26 && waveIn > 0.03 && onFloor && !jump.busy && Math.abs(planIn - waveIn) > 0.2) {
      jump.go(18);
      dbg({ ev: 'jump-wave', in: +waveIn.toFixed(2) });
    }

    // Debris from the ceiling: off the spots it is coming down on.
    const falling = [];
    for (const r of v.shots) {
      if (r.kind !== 'rock') continue;
      // Led the way a falling thing is: faster the longer it falls.
      const ry = r.y + r.vy * el + 450 * el * el;
      const rvy = r.vy + 900 * el;
      const rx = r.x + r.vx * el;
      if (ry > p.bottom) continue;
      const drop = Math.max(0, p.y - 12 - ry);
      const tt = (-rvy + Math.sqrt(Math.max(0, rvy * rvy + 1800 * drop))) / 900;
      if (tt < 0.9) falling.push(rx + r.vx * tt);
    }
    const unsafe = (x) => falling.some((fx) => Math.abs(fx - x) < 30);
    let dodge = 0;
    if (unsafe(p.cx)) {
      for (let k = 6; k <= 120 && !dodge; k += 6) {
        if (!unsafe(p.cx - k) && p.cx - k > wallL + 12) dodge = -1;
        else if (!unsafe(p.cx + k) && p.cx + k < wallR - 12) dodge = 1;
      }
    }

    // Orbs: batted back with the blade as they arrive.
    let orb = null;
    for (const q of shots) {
      if (q.kind !== 'orb') continue;
      const ox = q.x - p.cx;
      const oy = q.y - p.cy;
      const d = Math.hypot(ox, oy);
      const closing = -(ox * q.vx + oy * q.vy) / Math.max(1, d);
      if (closing <= 30 || Math.abs(oy) > 60) continue;
      const t = Math.max(0, d - 40) / closing;
      if (t < 0.22 && (!orb || t < orb.t)) orb = { t, x: q.x };
    }

    /* ---------------------------------------------- his windows, and waiting */
    let window = -1;
    if (s === 'stagger') window = rem + 0.45;
    else if (s === 'idle') window = rem;
    else if (s === 'cast' || s === 'summon') window = plan ? -1 : rem;
    if (downUntil > wf && !plan) window = Math.max(window, (downUntil - wf) / 60);
    // Swinging into a wind-up makes the blow come early: the last swing has to
    // be over before he starts the next move.
    const busyFor = p.attackTimer > 0 ? p.attackTimer : 0;
    const mayStrike = window > busyFor + 0.28;
    // A swing the other way can still find him: anything swung his way within
    // a blade and a crescent of him keeps to the same rule.
    const swingSafe = (dir) => mayStrike || Math.sign(dx) !== dir || dist > 150;

    // Skeletons: the nearest one, and any that is up and too close. One
    // reeling from a blow (its cooldown) is no danger for a moment.
    let skel = null;
    let near = null;
    for (const e of v.skels) {
      const ecx = h.lead(e.cx, e.vx);
      const d = Math.abs(ecx - p.cx);
      if (d < 140 && (!skel || d < Math.abs(skel.cx - p.cx))) skel = { ...e, cx: ecx };
      if (d < 66 && e.state !== 'cooldown' && (!near || d < Math.abs(near.cx - p.cx))) near = { ...e, cx: ecx };
    }
    const threatening = s === 'slamWindup' || s === 'dashWindup' || s === 'dash' || s === 'leap' || s === 'slam';
    const want = onLedge ? 150 : v.phase === 3 ? 104 : 58;

    let mode = 'wait';
    const soon = plan && plan.at - wf < 8;
    if (dodge && !soon && !a.parry) {
      mode = 'rock';
      a[dodge > 0 ? 'right' : 'left'] = true;
    } else if (guarding) {
      mode = 'guard';
      // Squared up for what he decided on: no stepping now - and in the air,
      // checking the drift. A plan with a spot to it: there first.
      const f = plan ? plan.face : 0;
      if (plan && plan.spot !== undefined && Math.abs(plan.spot - p.cx) > 8 && plan.at - wf > 6) h.walkTo(a, plan.spot, 8);
      else if (!onFloor && Math.abs(p.vx) > 40) a[p.vx > 0 ? 'left' : 'right'] = true;
      else if (f && Math.sign(p.facing) !== f && !a.parry) a[f > 0 ? 'right' : 'left'] = true;
    } else if (orb && onFloor && swingSafe(Math.sign(orb.x - p.cx) || p.facing)) {
      mode = 'orb';
      h.face(a, orb.x);
      h.swing(a);
    } else if (s === 'leap' && land) {
      mode = 'leap';
      // Off the spot he comes down on.
      if (Math.abs(land.cx - p.cx) < 75 && land.at > wf) a[land.cx > p.cx ? 'left' : 'right'] = true;
    } else if (s === 'slam' && !(downUntil > wf)) {
      mode = 'slam';
      // Committed: keep out of the blade while it is still out.
      if (dist < 118 && dist > 8 && holdUntil < wf) a[away] = true;
    } else if (skel && !threatening && (near || !mayStrike || s !== 'stagger' || Math.abs(skel.cx - p.cx) < 95)) {
      // A skeleton in reach of its own swing gets room; one further off gets
      // the crescent, every swing, so that it never closes in.
      mode = 'skel';
      const t = near || skel;
      const sd = t.cx - p.cx;
      const roomBehind = sd > 0 ? p.cx - wallL > 60 : wallR - p.cx > 60;
      if (near && roomBehind) a[sd > 0 ? 'left' : 'right'] = true;
      else if (Math.sign(sd) !== p.facing) a[sd > 0 ? 'right' : 'left'] = true;
      else if (swingSafe(p.facing)) h.swing(a);
    } else if (mayStrike) {
      mode = 'strike';
      if (dist > 56) a[toward] = true;
      else if (dist < 34) a[away] = true;
      else h.face(a, kcx);
      if (dist < 66 && Math.sign(dx) === p.facing) h.swing(a);
    } else if (holdUntil > wf) {
      mode = 'hold';
      h.face(a, kcx);
    } else if (s !== 'dash') {
      // Waiting for his next move, just outside a sword's length.
      if (dist > want + 10) a[toward] = true;
      else if (dist < want - 12 && p.cx > wallL + 40 && p.cx < wallR - 40) a[away] = true;
      else h.face(a, kcx);
    }

    // Not into a skeleton that is up and about.
    for (const e of v.skels) {
      const sd = h.lead(e.cx, e.vx) - p.cx;
      if (e.state === 'cooldown' || Math.abs(sd) > 50) continue;
      // (A tap to turn round is not a step.)
      if (((sd > 0 && a.right) || (sd < 0 && a.left)) && p.facing === Math.sign(sd)) {
        a.left = false;
        a.right = false;
      }
    }
    if (falling.length && (a.left || a.right) && mode !== 'rock') {
      const step = (a.right ? 1 : -1) * 30;
      if (unsafe(p.cx + step) && !unsafe(p.cx)) {
        a.left = false;
        a.right = false;
      }
    }

    // Up on a board after a dodge: back down through it (down and jump), the
    // fight is on the floor.
    if (dropping > 0) {
      dropping--;
      a.down = true;
      a.left = false;
      a.right = false;
    } else if (onFloor && p.bottom < floorY - 40 && !plan && !jump.busy && !a.parry) {
      dropping = 4;
      a.down = true;
      jump.go(2);
    }

    if (mode !== lastMode) {
      lastMode = mode;
      dbg({ ev: 'mode', mode, s, rem: +rem.toFixed(2), dist: Math.round(dist), ph: v.phase });
    }
    return jump.apply(a);
  };
}
