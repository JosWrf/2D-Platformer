/**
 * Morvain, read like a person reads him: everything he does is seen 0.3 s
 * late, and what moves is led by those 0.3 s.
 *
 *   - his slam, his dash and his cast are wound up long enough to be
 *     answered, so he parries them, on the rhythm of the wind-up and with a
 *     person's error in the press (up to 0.07 s either way): the slam
 *     standing inside its reach, the dash when it gets to him, the orbs as
 *     they reach him. Once he has decided on a parry he stands still for it;
 *   - where a wind-up is too short to parry after 0.3 s (the dash in the
 *     third phase) he jumps it, with a second jump at the top - and in the
 *     third phase he waits a little further out, so there is time to;
 *   - his leap: off the spot he will come down on, and the wave from the
 *     landing parried if he lands close, jumped if not;
 *   - a shockwave coming at him: up as it comes;
 *   - shadow orbs: batted back with the blade as they arrive;
 *   - debris from the ceiling: off the spot it is coming down on;
 *   - staggered, and in the rest after each of his moves: in to a sword's
 *     length and swing, the last swing started early enough to be over
 *     before the next wind-up - a blow into the wind-up only makes the blow
 *     come sooner;
 *   - skeletons: cut down when they come close and he is not about to move;
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

  // World frames: the frames in which the fight actually moved. Hit-stop is a
  // freeze anyone can see; his timers do not run through it, so neither does
  // the hero's sense of their rhythm.
  let wf = 0;
  let frozen = null;

  let seenState = null;
  let action = 0;
  let planned = -1;
  /** A parry decided on: the world frame to press it, and which way to face. */
  let parryAt = -1;
  let parryHold = 0;
  let parryFace = 0;
  let guardUntil = -1;
  let holdUntil = -1;
  let lastFlash = 0;
  /** A jump decided on: when, and its second push at the top. */
  let jumpAt = -1;
  let doubleAt = -1;
  /** Where he is going to come down, while he is in the air. */
  let land = null;
  let lastMode = '';

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
      facing: boss.facing,
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

    // His own parry landing is something he sees at once: he holds his ground
    // for it rather than backing off into the next wait.
    if (p.parryFlash > 0.9 && lastFlash <= 0.9) {
      holdUntil = wf + 24;
      dbg({ ev: 'parried', s, dist: Math.round(dist) });
    }
    lastFlash = p.parryFlash;

    /* ------------------------------------------------ his moves, answered */
    const planParry = (t, what, face) => {
      parryAt = wf + Math.max(0, Math.round((t + jitter()) * 60));
      parryFace = face;
      dbg({ ev: 'plan-parry', what, rem: +rem.toFixed(2), in: +t.toFixed(2), dist: Math.round(stopDist), ph: v.phase });
    };
    if (planned !== action) {
      planned = action;
      const face = Math.sign(dx) || p.facing;
      if (s === 'slamWindup' && rem >= 0.15) {
        // Inside the blade's reach (to 105 px in front of him) the blow lands
        // with the slam. A little beyond, the wave comes - its x is its left
        // edge both ways, so it sets off 66 px out going right, 40 going left.
        const lead = p.cx > kcx ? 66 : 40;
        let t = rem - 0.08;
        if (stopDist > 112) t = rem + Math.max(0, stopDist - 9 - lead - 30) / (v.phase === 3 ? 320 : 250) - 0.03;
        if (stopDist <= 118) planParry(t, 'slam', face);
      } else if (s === 'dashWindup') {
        const speed = v.phase === 3 ? 620 : 520;
        // He steps back at a walk until the wind-up runs out, then comes.
        const start = stopDist + 60 * Math.max(0, rem);
        const t = Math.max(0, rem) + Math.max(0, start - 50) / speed + 2 / 60;
        if (rem >= 0.15) {
          planParry(t - 0.09, 'dash', face);
        } else if (t > 0.22) {
          // Too late to parry: over him, with the second jump at the top.
          jumpAt = wf + Math.max(0, Math.round((t - 0.27) * 60));
          doubleAt = jumpAt + 20;
          dbg({ ev: 'plan-jump', what: 'dash', rem: +rem.toFixed(2), in: +t.toFixed(2), dist: Math.round(stopDist) });
        } else {
          dbg({ ev: 'dash-too-late', rem: +rem.toFixed(2), in: +t.toFixed(2), dist: Math.round(stopDist) });
        }
      } else if (s === 'cast' && rem >= 0.15 && stopDist <= 112) {
        // The first orb reaches the guard about (0.2 d - 6) frames after the
        // cast, measured; the rest come in behind it.
        planParry(rem + (0.196 * stopDist - 5.8) / 60 - 0.03, 'cast', face);
      } else if (s === 'leap') {
        land = landing(kx, v.y, v.w, v.h, v.vx, v.vy, v.timer);
        land.t -= el;
        land.at = wf + Math.round(land.t * 60);
        const off = Math.abs(land.cx - stopX);
        const level = Math.abs(land.bottom - floorY) < 4;
        dbg({ ev: 'leap', in: +land.t.toFixed(2), off: Math.round(off), level });
        if (level && land.t >= 0.15 && off > 60 && off <= 110) {
          // Close enough for the wave to reach him at once, and for a parry of
          // it to put him down.
          const lead = p.cx > land.cx ? 56 : 30;
          planParry(land.t + Math.max(0, off - lead - 9 - 30) / 290 - 0.03, 'landing', Math.sign(land.cx - p.cx) || face);
        }
      }
    }

    // A parry decided on: still from now on, facing him, and pressed.
    const waiting = parryAt >= 0;
    if (parryAt >= 0 && wf >= parryAt) {
      a.parry = true;
      parryHold++;
      if (parryHold >= 2) {
        parryAt = -1;
        parryHold = 0;
        guardUntil = wf + 12;
      }
    }
    const guarding = waiting || guardUntil > wf;

    /* ------------------------------------------------------------ hazards */
    const shots = h.threats(v.shots);
    // Shockwaves along the floor: up as they come, unless a parry meets them.
    let waveIn = 99;
    for (const q of shots) {
      if (q.kind !== 'shockwave') continue;
      if (Math.sign(q.vx) !== Math.sign(p.cx - q.x)) continue;
      // Still up on a board, it passes over him unless it comes down first.
      if (q.y + 15 < p.y - 20 && Math.abs(p.cx - q.x) > 50) continue;
      const gap = Math.abs(p.cx - q.x) - 9 - 13;
      waveIn = Math.min(waveIn, Math.max(0, gap) / Math.abs(q.vx));
    }
    // The wave from a landing he could not see yet, timed off the landing.
    if (land && land.at > wf - 30 && Math.abs(land.bottom - floorY) < 4) {
      const off = Math.abs(land.cx - p.cx);
      const lead = p.cx > land.cx ? 56 : 30;
      const t = (land.at - wf) / 60 + Math.max(0, off - lead - 9) / 290;
      if (t > -0.05) waveIn = Math.min(waveIn, Math.max(0.05, t));
    }
    const parryIn = parryAt >= 0 ? (parryAt - wf) / 60 : guardUntil > wf ? 0 : 99;
    if (waveIn < 0.28 && waveIn > 0.04 && onFloor && !jump.busy && Math.abs(parryIn - waveIn) > 0.2) {
      jump.go(18);
      dbg({ ev: 'jump-wave', in: +waveIn.toFixed(2) });
    }

    // A jump decided on for his dash, and its second push at the top.
    if (jumpAt >= 0 && wf >= jumpAt && onFloor && !jump.busy) {
      jump.go(18);
      jumpAt = -1;
    }
    if (doubleAt >= 0 && wf >= doubleAt && !onFloor && !jump.busy) {
      jump.go(16);
      doubleAt = -1;
    } else if (doubleAt >= 0 && wf >= doubleAt + 12) {
      doubleAt = -1;
    }

    // Debris from the ceiling: off the spot it is coming down on.
    let dodge = 0;
    for (const q of shots) {
      if (q.kind !== 'rock' || q.y > p.bottom) continue;
      const drop = Math.max(0, p.y - 12 - q.y);
      const tt = (-q.vy + Math.sqrt(Math.max(0, q.vy * q.vy + 1800 * drop))) / 900;
      const landX = q.x + q.vx * tt;
      if (Math.abs(landX - p.cx) < 30 && tt < 0.9) dodge = landX > p.cx ? -1 : 1;
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
    else if (s === 'cast' || s === 'summon') window = waiting ? -1 : rem;
    // Swinging into a wind-up makes the blow come early: the last swing has to
    // be over before he starts the next move.
    const busyFor = p.attackTimer > 0 ? p.attackTimer : 0;
    const mayStrike = window > busyFor + 0.28;

    // The nearest skeleton, if one has come close.
    let skel = null;
    for (const e of v.skels) {
      const ecx = h.lead(e.cx, e.vx);
      const d = Math.abs(ecx - p.cx);
      if (d < 130 && (!skel || d < Math.abs(skel.cx - p.cx))) skel = { ...e, cx: ecx };
    }
    const threatening = s === 'slamWindup' || s === 'dashWindup' || s === 'dash' || s === 'leap' || s === 'slam';
    const want = v.phase === 3 ? 100 : 58;

    let mode = 'wait';
    if (dodge && !guarding) {
      mode = 'rock';
      a[dodge > 0 ? 'right' : 'left'] = true;
    } else if (guarding) {
      mode = 'guard';
      // Squared up for the parry: no stepping now.
      if (parryFace && Math.sign(p.facing) !== parryFace) a[parryFace > 0 ? 'right' : 'left'] = true;
    } else if (orb && onFloor) {
      mode = 'orb';
      h.face(a, orb.x);
      h.swing(a);
    } else if (s === 'leap' && land) {
      mode = 'leap';
      // Off the spot he comes down on.
      if (Math.abs(land.cx - p.cx) < 75 && land.at > wf) a[land.cx > p.cx ? 'left' : 'right'] = true;
    } else if (s === 'slam') {
      mode = 'slam';
      // Committed: keep out of the blade while it is still out.
      if (dist < 118 && dist > 8 && holdUntil < wf) a[away] = true;
    } else if (skel && !threatening && (Math.abs(skel.cx - p.cx) < 70 || !mayStrike)) {
      mode = 'skel';
      const sd = skel.cx - p.cx;
      if (Math.abs(sd) < 40 && skel.state !== 'cooldown') a[sd > 0 ? 'left' : 'right'] = true;
      else if (Math.sign(sd) !== p.facing) a[sd > 0 ? 'right' : 'left'] = true;
      else h.swing(a);
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

    if (mode !== lastMode) {
      lastMode = mode;
      dbg({ ev: 'mode', mode, s, rem: +rem.toFixed(2), dist: Math.round(dist), ph: v.phase });
    }
    return jump.apply(a);
  };
}
