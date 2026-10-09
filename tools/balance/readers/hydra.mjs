/**
 * Die Fünfkronige, read like a person reads her. Her loop is the whole fight:
 *
 *   cut a head -> to the ledge its stump hangs at -> bait her fire -> parry
 *   it into the stump
 *
 * in the order a person learns it: venom (stump on the floor), stone (stump
 * at the first step), crown (third step), storm (top step) - and with those
 * four burned shut, the flame head itself, which ends her.
 *
 *   - the heads: stone, crown and storm are cut standing on the step that
 *     reaches them (stone from the second step, right above where its stump
 *     is burned). Venom and flame hang where no standing swing reaches from
 *     any surface in the room (52-96 and 86-130 px up; a standing swing covers
 *     1-33) - the design cuts them "from the floor, with a jump" - so for those
 *     two, and only those, he jumps under the head and swings in the air;
 *   - her fire: an ember is lobbed onto where he stood. Standing at the spot
 *     for a stump, facing it, with the fire coming from in front, he watches
 *     the coal (0.3 s late, judging its arc), steps back about a stride so it
 *     comes down just in front of him rather than on his head, and parries it
 *     - on his own guess of the moment, give or take 0.07 s, and only if at
 *     least 0.15 s were left when he first saw it. A turned ember flies flat
 *     at his height into the stump. On a ledge right above her fire, when the
 *     flame head winds up he steps to the side first: a coal lobbed at him
 *     there passes his height on its way up sooner than anyone sees it;
 *   - her breath (the stone head, and the crowned one that may borrow it):
 *     on the floor in its reach when one of them winds up, he stands, faces
 *     her and parries on the beat of the wind-up - from more than 60 px away
 *     when there is time to get there, so she does not reel mid-breath (a
 *     reel then leaves the breath lying on the floor - see the report); and
 *     while one of those heads is up he does not wait about under her middle;
 *   - her venom: on the floor near her when the venom head winds up, he keeps
 *     running - away from the side the head leans to, where the globs come
 *     down - until the spit is over, and keeps out of the puddles, which come
 *     where he stood when she spat (not where the globs land - see the report);
 *   - rocks: out of any column the ceiling is marked to drop in; anything
 *     thrown that will come down where he stands: out from under it, and not
 *     into it - a puddle in the way he hops over;
 *   - jumps: to climb (the steps are the design), to cut the two heads above,
 *     and over a puddle - never into something already in the air, and he
 *     swings at no head while her breath may be under way.
 *
 * Everything about her and what she throws comes through the 0.3 s lag; the
 * room (floor, steps, where the stumps hang) is read once, as anyone sees it.
 */
export default function reader(g, h) {
  const p = g.player;
  const lv = g.level;
  const T = 32;
  const LAG = h.LAG;
  const DT = 1 / 60;
  const see = h.lag();
  const jump = h.jumper();
  /**
   * The two heads no standing swing reaches are cut on a jump. Set false to
   * measure the bench's rule to the letter: then those two are never cut, the
   * venom stump is never opened, and she cannot be finished.
   */
  const JUMP_CUTS = true;

  /* ------------------------------------------------------------ memory */
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (o) => {
    let id = ids.get(o);
    if (!id) {
      id = nextId++;
      ids.set(o, id);
    }
    return id;
  };
  /** How hard each of her thrown things falls - what the eye learns of an arc. */
  const GRAV = { ember: 1000, blob: 1150, rock: 900 };
  const plans = new Map(); // ember -> { S, jitter, ok, pressed, at }
  let guard = null; // her breath: { key, contact, jitter, ok, pressed }
  let run = null; // her venom: { key, until, dir }
  let windKey = null;
  let prevState = null;
  let prevActing = -1;
  let dropHold = 0;
  let descend = null;
  let dodge = null;
  /** Where he has been, frame by frame: where he stood when she spat. */
  const trail = [];
  const seenBlobs = new Set();
  let spits = []; // { seen, from, until, xs }: the puddles coming, as he has learned them
  let lastSurface = null;
  let G = null;

  /* ---------------------------------------------------------- the room */
  const build = (b) => {
    const floor = Math.round(b.bottom);
    const fty = Math.round(floor / T);
    const c = Math.floor(b.cx / T);
    let l = c;
    let r = c;
    while (l > 0 && !lv.solidAt(l - 1, fty - 1)) l--;
    while (r < lv.width - 1 && !lv.solidAt(r + 1, fty - 1)) r++;
    // The floor, then the steps from the lowest up.
    const surfaces = [{ y: floor, x0: l * T, x1: (r + 1) * T, floor: true }];
    for (let ty = fty - 1; ty > 0; ty--) {
      let seg = null;
      for (let tx = l; tx <= r; tx++) {
        if (lv.platformAt(tx, ty)) {
          if (!seg) seg = { y: ty * T, x0: tx * T, x1: (tx + 1) * T };
          else seg.x1 = (tx + 1) * T;
        } else if (seg) {
          surfaces.push(seg);
          seg = null;
        }
      }
      if (seg) surfaces.push(seg);
    }
    surfaces.forEach((s, i) => (s.i = i));
    const flameHead = b.headCentre(b.necks.find((n) => n.kind === 'flame'));
    /*
     * An ember lobbed at a hero standing above the flame head passes his
     * height once on the way up, before it comes down on him. It used to
     * burn there, sooner than he could see it go, and he had to stand clear
     * to the side of her fire on each ledge. It burns only falling now
     * (Projectile.harmless): no ledge asks for that any more.
     */
    for (const s of surfaces) s.clearOfFire = 0;
    const offFire = (x, s) => !s.clearOfFire || Math.abs(x - flameHead.x) >= s.clearOfFire;
    // Where an ordinary standing swing meets a head: surface, facing, range.
    const cutSpots = (n) => {
      const c0 = b.headCentre(n);
      const hb = { x: c0.x - 18, y: c0.y - 17, w: 36, h: 34 };
      const out = [];
      for (const s of surfaces) {
        for (const f of [1, -1]) {
          let lo = null;
          let hi = null;
          for (let px = s.x0 - 15; px < s.x1 - 3; px += 1) {
            const cy = s.y - 15;
            const r0 = { x: f > 0 ? px + 14 : px - 36, y: cy - 18, w: 40, h: 32 };
            if (r0.x < hb.x + hb.w && r0.x + r0.w > hb.x && r0.y < hb.y + hb.h && r0.y + r0.h > hb.y) {
              if (lo === null) lo = px + 9;
              hi = px + 9;
            }
          }
          if (lo !== null) out.push({ s: s.i, f, lo, hi });
        }
      }
      return out;
    };
    const necks = b.necks.map((n, i) => {
      const st = b.stumpCentre(n);
      const info = { i, kind: n.kind, head: b.headCentre(n), cut: cutSpots(n), fire: null, cutAt: null };
      if (n.kind !== 'flame') {
        // The ledge he stands on to burn it: his height is the ember's height.
        let best = null;
        for (const s of surfaces) {
          const d = Math.abs(s.y - 15 - st.y);
          if (d <= 30 && (!best || d < Math.abs(best.y - 15 - st.y))) best = s;
        }
        if (best) {
          let side = Math.sign(st.x - flameHead.x) || 1;
          const fits = (sd) => (sd < 0 ? best.x0 - 6 < st.x - 10 : best.x1 + 6 > st.x + 10);
          if (!fits(side)) side = -side;
          const face = -side;
          let W;
          // On the floor: out of reach of her breath (340 px from her middle).
          if (best.floor) W = b.cx + side * 382;
          // On a ledge: near the stump, with her fire coming from in front -
          // the flame head on the same side of him as the stump.
          else if (side < 0) W = Math.min(best.x1 - 10, st.x + 2, flameHead.x - Math.max(40, best.clearOfFire));
          else W = Math.max(best.x0 + 8, st.x - 2, flameHead.x + Math.max(40, best.clearOfFire));
          info.fire = { s: best.i, face, W };
        }
      }
      if (info.cut.length) {
        const ref = info.fire ?? { W: info.head.x, s: 0 };
        let pick = null;
        for (const c of info.cut) {
          // Nearest the stand for its stump, and clear of her fire's way up.
          for (let x = c.lo + 4; x <= c.hi - 4; x += 2) {
            if (!offFire(x, surfaces[c.s])) continue;
            const cost = Math.abs(x - ref.W) + Math.abs(surfaces[c.s].y - surfaces[ref.s].y) * 2;
            if (!pick || cost < pick.cost) pick = { s: c.s, f: c.f, x, cost };
          }
        }
        info.cutAt = pick;
      }
      return info;
    });
    return { floor, left: l * T, right: (r + 1) * T, surfaces, necks, cx: b.cx, flame: flameHead, offFire };
  };

  /* --------------------------------------------------------- helpers */
  const surfaceOf = () => {
    if (!p.onGround) return null;
    for (const s of G.surfaces) if (Math.abs(p.bottom - s.y) < 3 && p.cx > s.x0 - 10 && p.cx < s.x1 + 10) return s;
    return null;
  };
  const overlap = (a, c) => a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;
  /** Its flight from what was seen LAG frames ago, judged as an arc: out[m] is where it is m frames from now. */
  /*
   * The Steinblick, which the road has given him by the time he is here:
   * what he looks at, coming at him, flies a third slower (game.ts,
   * underGaze) - he knows how it feels, and his eye leads it so.
   */
  const stoneGaze = p.relics?.has?.('steinblick') ?? false;
  const gazed = (x, y, vx, vy) => {
    if (!stoneGaze) return false;
    const dx = x - p.cx;
    if (Math.abs(dx) > 420 || Math.abs(y - p.cy) > 260) return false;
    if (Math.sign(dx) !== p.facing && Math.abs(dx) > 10) return false;
    return dx * vx < 0 || (Math.abs(dx) < 120 && vy > 0 && y < p.cy);
  };
  const path = (q, frames) => {
    const g0 = GRAV[q.kind] ?? 0;
    let x = q.x;
    let y = q.y;
    let vy = q.vy;
    const out = [];
    for (let n = 1; n <= LAG + frames; n++) {
      const dt = gazed(x, y, q.vx, vy) ? DT * (2 / 3) : DT;
      vy += g0 * dt;
      x += q.vx * dt;
      y += vy * dt;
      // (Her fire burns only on the way down.)
      if (n >= LAG) out.push({ x, y, harmless: q.kind === 'ember' && vy < 0 });
      if (y + q.h / 2 > G.floor) break;
    }
    return out;
  };
  const heroBox = (cx, sy) => ({ x: cx - 9, y: sy - 30, w: 18, h: 30 });
  const parryBox = (cx, sy, f) => ({ x: f > 0 ? cx - 13 : cx - 39, y: sy - 36, w: 52, h: 42 });
  const firstHit = (pts, w, hh, box) => {
    for (let m = 0; m < pts.length; m++) {
      const c = pts[m];
      if (c.harmless) continue;
      if (overlap({ x: c.x - w / 2, y: c.y - hh / 2, w, h: hh }, box)) return m;
    }
    return -1;
  };
  /** A person's error on a moment he has judged: uniform, 0.07 s either way, in frames. */
  const jitter = () => (Math.random() * 2 - 1) * 0.07 * 60;
  /** Feet height over a held jump, frame by frame, until he is down again. */
  const ARC = (() => {
    const out = [];
    let y = 0;
    let vy = -600;
    for (let n = 0; n < 60; n++) {
      if (n === 18 && vy < -280) vy = -280;
      vy += (n < 18 && vy < 0 ? 1750 : 2250) * DT;
      y += vy * DT;
      if (y >= 0) break;
      out.push(-y);
    }
    return out;
  })();

  /* ------------------------------------------------------------ the bot */
  return (b) => {
    if (!G) G = build(b);
    const v = see({
      state: b.state,
      acting: b.acting,
      timer: b.timer,
      breath: b.breath,
      breathDir: b.breathDir,
      gust: b.gust,
      necks: b.necks.map((n) => ({ kind: n.kind, state: n.state, head: n.state === 'head' ? b.headCentre(n) : null })),
      drops: b.drops.filter((d) => !d.fired).map((d) => ({ x: d.x })),
      pools: b.pools.filter((q) => q.wait <= 0 && q.life > 0).map((q) => ({ x: q.x, life: q.life })),
      proj: g.projectiles
        .filter((q) => !q.dead && !q.friendly && (q.kind === 'ember' || q.kind === 'blob' || q.kind === 'rock'))
        .map((q) => ({ id: idOf(q), kind: q.kind, x: q.cx, y: q.cy, vx: q.vx, vy: q.vy, w: q.w, h: q.h })),
    });
    const a = {};
    const now = h.frame;
    const sNow = surfaceOf();
    if (sNow) lastSurface = sNow;
    const surf = sNow ?? lastSurface ?? G.surfaces[0];
    const sy = surf.y;
    // A wind-up, as he sees it: which head, and in how many frames it lets go.
    const wind = v.state === 'wind' ? v.necks[v.acting]?.kind ?? null : null;
    if (v.state === 'wind' && (prevState !== 'wind' || prevActing !== v.acting)) windKey = `${v.acting}@${now}`;
    if (v.state !== 'wind') windKey = null;
    prevState = v.state;
    prevActing = v.acting;
    const toBegin = wind ? Math.ceil(v.timer * 60) - LAG : null;

    /* ---------------------------------------------- what is flying */
    const threats = v.proj.map((q) => ({ ...q, pts: path(q, 80) }));
    for (const [id, pl] of plans) if (now - pl.at > 240) plans.delete(id);
    trail.push(p.cx);
    if (trail.length > LAG + 2) trail.shift();
    /*
     * Her spit. The puddles lie where the globs come down, and that is where
     * he stood when she spat - three a stride apart, or two either side of
     * him from the crowned head - which is what a person who has met her
     * learns. A new glob in sight was spat LAG frames ago, from where he
     * stood then.
     */
    const fresh = v.proj.filter((q) => q.kind === 'blob' && !seenBlobs.has(q.id));
    for (const q of fresh) seenBlobs.add(q.id);
    if (fresh.length && !spits.some((s) => now - s.seen < 20)) {
      const stood = trail[0];
      const aim = Math.max(-300, Math.min(300, stood - G.cx));
      const kind = v.necks[v.acting]?.kind;
      const spread = kind === 'crown' ? [-60, 60] : [-72, 0, 72];
      spits.push({ seen: now, from: now - LAG + 44, until: now - LAG + 48 + 270, xs: spread.map((s) => G.cx + aim + s) });
    }
    spits = spits.filter((s) => now < s.until);

    /* ---------------------------------------------- the goal */
    const order = ['venom', 'stone', 'crown', 'storm'];
    const four = order.map((k) => G.necks.find((n) => n.kind === k));
    const goal = four.find((n) => v.necks[n.i].state !== 'sealed') ?? G.necks.find((n) => n.kind === 'flame');
    const gs = v.necks[goal.i];
    let task;
    if (gs.state === 'stump' && goal.fire) {
      task = { s: goal.fire.s, x: goal.fire.W, face: goal.fire.face, mode: 'catch' };
    } else if (goal.cutAt) {
      task = { s: goal.cutAt.s, x: goal.cutAt.x, face: goal.cutAt.f, mode: gs.state === 'head' ? 'cut' : 'wait' };
    } else {
      const hd = gs.head ?? goal.head;
      task = { s: 0, x: hd.x - 25, face: 1, mode: gs.state !== 'head' ? 'wait' : JUMP_CUTS ? 'jumpcut' : 'cut', hd };
    }

    /* ---------------------------------------------- where it is not safe */
    const catching = new Set();
    const breathOn = v.breath > 0;
    const danger = (x, s = surf) => {
      const box = { x: x - 15, y: s.y - 36, w: 30, h: 36 };
      for (const t of threats) {
        if (catching.has(t.id)) continue;
        for (let m = 0; m < t.pts.length; m += 2) {
          const c = t.pts[m];
          if (overlap({ x: c.x - t.w / 2, y: c.y - t.h / 2, w: t.w, h: t.h }, box)) return 'proj';
        }
      }
      for (const d of v.drops) if (Math.abs(d.x - x) < 10 + 9 + 8) return 'drop';
      if (s.floor) {
        for (const q of v.pools) if (q.life > 0.15 && Math.abs(q.x - x) < 26 + 9 + 6) return 'pool';
        for (const s of spits) if (now >= s.from - 12 && s.xs.some((px) => Math.abs(px - x) < 26 + 9 + 6)) return 'pool';
        if (breathOn) {
          const d = (x - G.cx) * v.breathDir;
          if (d > -15 && d < 340 + 15) return 'breath';
        }
      }
      return null;
    };
    /** Nothing will meet him on the way up and down if he jumps from x now. */
    const jumpSafe = (x) => {
      for (const t of threats) {
        if (catching.has(t.id)) continue;
        for (let m = 1; m < Math.min(t.pts.length, ARC.length + 2); m++) {
          const c = t.pts[m];
          const H = ARC[Math.min(ARC.length - 1, Math.max(0, m - 2))];
          if (overlap({ x: c.x - t.w / 2, y: c.y - t.h / 2, w: t.w, h: t.h }, { x: x - 14, y: sy - 35 - H, w: 28, h: 40 })) return false;
        }
      }
      for (const d of v.drops) if (Math.abs(d.x - x) < 10 + 9 + 8) return false;
      return true;
    };

    let goalX = null;
    let wantFace = null;
    let hold = false;
    let parryNow = false;
    let parryFace = 0;
    let noJump = false;

    /* ---------------------------------------------- her venom: keep running */
    if (wind === 'venom' && sNow && sNow.floor && Math.abs(p.cx - G.cx) < 440) {
      if (!run || run.key !== windKey) {
        // The way with the most clear floor: no wall, pool or breath in it.
        const clear = (dir) => {
          let d = 0;
          for (; d < 230; d += 6) {
            const x = p.cx + dir * (d + 6);
            if (x < G.left + 14 || x > G.right - 14) break;
            const k = danger(x);
            if (k === 'pool' || k === 'breath') break;
          }
          return d;
        };
        const l = clear(-1);
        const r = clear(1);
        // Away from the side her venom head leans out to: that is where the
        // globs come down; the puddles come where he stood.
        const head = v.necks.find((n) => n.kind === 'venom')?.head;
        const pref = head ? (Math.sign(G.cx - head.x) || 1) : 1;
        const room = pref > 0 ? r : l;
        run = { key: windKey, until: now + toBegin + 52, dir: room >= 150 || room >= (pref > 0 ? l : r) ? pref : -pref };
      }
    }
    const breathers = v.necks.some((n) => (n.kind === 'stone' || n.kind === 'crown') && n.state === 'head');
    if (run && now > run.until && !(breathers && Math.abs(p.cx - G.cx) < 74)) run = null;
    if (run && now > run.until + 40) run = null;
    if (run && sNow) {
      // Out of the way already, or about to run into something: stop running.
      const k = danger(p.cx + run.dir * 20);
      if (k === 'pool' || k === 'breath' || p.cx + run.dir * 20 < G.left + 14 || p.cx + run.dir * 20 > G.right - 14) run = null;
    }

    /* ---------------------------------------------- her fire on its way up */
    // With a stump open she throws a second coal 78 px to his right, and on
    // its way up that one crosses anyone standing just right of her fire.
    let aside = null;
    const twoCoals = v.necks.some((n) => n.state === 'stump');
    const wideClear = (x) => !twoCoals || x < G.flame.x || x - G.flame.x > 115;
    if (wind === 'flame' && sNow && (!G.offFire(p.cx, sNow) || (sNow.clearOfFire && !wideClear(p.cx)))) {
      const need = sNow.clearOfFire + 4;
      const xs = [G.flame.x - need, twoCoals ? G.flame.x + 120 : G.flame.x + need].filter((x) => x > sNow.x0 - 6 && x < sNow.x1 + 6);
      if (xs.length) aside = xs.sort((u, w) => Math.abs(u - p.cx) - Math.abs(w - p.cx))[0];
    }

    /* ---------------------------------------------- her breath: guard */
    if ((wind === 'stone' || wind === 'crown') && surf.floor) {
      const edge = Math.abs(p.cx - G.cx) - 9;
      if (edge < 340 + 30) {
        // It leaves her middle when the wind-up ends, 884 px a second.
        const contact = toBegin + Math.max(1, Math.ceil((Math.max(0, edge) - 0.34) / 14.73)) + 1;
        if (!guard || guard.key !== windKey) guard = { key: windKey, jitter: jitter(), ok: contact >= 9, pressed: false };
        guard.contact = now + contact;
      }
    }
    if (guard) {
      if (now > guard.contact + 24 || (!surf.floor && sNow)) guard = null;
      else {
        noJump = true;
        hold = true;
        wantFace = Math.sign(G.cx - p.cx) || 1;
        // Within 60 px of her middle a parry makes her reel - mid-breath, and
        // the breath is left lying. Out of there first, if there is time to
        // stop and turn before the guard goes up; never on the move with it up.
        const toPress = guard.contact - 7 + guard.jitter - now;
        if (!guard.pressed && Math.abs(p.cx - G.cx) < 70 && toPress > 6) {
          const outs = [G.cx - 80, G.cx + 80].filter((x) => x > G.left + 14 && x < G.right - 14 && !danger(x));
          const out = (outs.length ? outs : [G.cx + (p.cx < G.cx ? -80 : 80)]).sort((u, w) => Math.abs(u - p.cx) - Math.abs(w - p.cx))[0];
          hold = false;
          goalX = out;
        }
        if (guard.ok && !guard.pressed && now >= guard.contact - 7 + guard.jitter && p.parryCooldown <= 0) {
          guard.pressed = true;
          parryNow = true;
          parryFace = wantFace;
        }
      }
    }

    /* ---------------------------------------------- her fire: catch it */
    let stance = null;
    if (task.mode === 'catch' && sNow && sNow.i === task.s && !guard) {
      const f = task.face;
      let active = null;
      for (const t of threats) {
        if (t.kind !== 'ember') continue;
        let pl = plans.get(t.id);
        if (!pl) {
          // Where to stand so it comes down just in front of him - about a
          // stride back from where it was aimed, as near as a person judges it.
          const back = 30 + (Math.random() * 2 - 1) * 8;
          let best = null;
          for (let dx = -66; dx <= 66; dx += 3) {
            const S = task.x - f * back + dx;
            if (S < sNow.x0 - 7 || S > sNow.x1 + 7) continue;
            const mp = firstHit(t.pts, t.w, t.h, parryBox(S, sy, f));
            if (mp < 0) continue;
            const mh = firstHit(t.pts, t.w, t.h, heroBox(S, sy));
            if (mh >= 0 && mh < mp + 3) continue;
            if (Math.abs(S - p.cx) / 3.4 + 10 > mp) continue;
            const score = Math.abs(dx) + (mh >= 0 ? 25 : 0);
            if (!best || score < best.score) best = { S, mp, score };
          }
          // Too late to judge it if less than 0.15 s were left when he first saw it.
          pl = best ? { S: best.S, jitter: jitter(), ok: best.mp >= 9, pressed: false, at: now } : { none: true, at: now };
          plans.set(t.id, pl);
        }
        if (pl.none || !pl.ok) continue;
        const x = Math.abs(p.cx - pl.S) < 7 ? p.cx : pl.S;
        const mp = firstHit(t.pts, t.w, t.h, parryBox(x, sy, f));
        if (mp < 0 && !pl.pressed) continue;
        if (!active || (mp >= 0 && mp < active.mp)) active = { t, pl, mp };
      }
      if (active) {
        const { t, pl, mp } = active;
        catching.add(t.id);
        stance = { x: pl.S, face: f };
        if (!pl.pressed && mp >= 0 && mp - 7 + pl.jitter <= 0 && p.parryCooldown <= 0) {
          pl.pressed = true;
          parryNow = true;
          parryFace = f;
        }
      }
    }

    /* ---------------------------------------------- moving */
    let doJump = false;
    let swing = false;
    const cur = sNow ?? lastSurface ?? G.surfaces[0];
    if (cur.i !== task.s) {
      const tgt = G.surfaces[task.s];
      if (tgt.y < cur.y) {
        // Up: a step at a time, jumping where this one and the next overlap.
        const next = G.surfaces[cur.i + 1];
        const lo = Math.max(cur.x0, next.x0) + 12;
        const hi = Math.min(cur.x1, next.x1) - 12;
        goalX = (lo + hi) / 2;
        if (sNow && Math.abs(p.cx - goalX) < 10 && !(v.gust > 0) && !danger(p.cx) && jumpSafe(p.cx)) doJump = true;
        if (!sNow) goalX = Math.max(lo, Math.min(hi, p.cx));
      } else if (sNow) {
        // Down: off an end, or through the boards (which he falls 66 px
        // through before they hold him again) - whichever comes down nearest
        // the ledge he wants without passing it.
        const below = (x, from) => {
          let best = null;
          for (const s of G.surfaces) {
            if (s.y <= from || x + 9 <= s.x0 || x - 9 >= s.x1) continue;
            if (!best || s.y < best.y) best = s;
          }
          return best;
        };
        const opts = [];
        for (const x of [cur.x0 - 14, cur.x1 + 14]) {
          const land = below(x, cur.y);
          if (land && x > G.left + 12 && x < G.right - 12) opts.push({ x, mode: 'walk', land });
        }
        if (!cur.floor) {
          for (let x = cur.x0 + 2; x <= cur.x1 - 2; x += 8) {
            const land = below(x, cur.y + 66);
            if (land) opts.push({ x, mode: 'drop', land });
          }
        }
        let pick = null;
        for (const o of opts) {
          if (o.land.y > tgt.y) continue;
          const c = (tgt.y - o.land.y) * 4 + Math.abs(o.x - p.cx);
          if (!pick || c < pick.c) pick = { ...o, c };
        }
        if (pick) {
          goalX = pick.x;
          descend = pick;
          if (pick.mode === 'drop' && Math.abs(p.cx - pick.x) < 8 && !danger(p.cx) && dropHold === 0) {
            dropHold = 6;
            jump.go(3);
          }
        }
      } else if (descend) {
        goalX = descend.x;
      }
    } else {
      goalX = task.x;
      wantFace = wantFace ?? task.face;
      const breathing = (wind === 'stone' || wind === 'crown') || (v.state === 'act' && breathOn);
      if (task.mode === 'cut' && sNow && Math.abs(p.cx - task.x) < 16 && p.facing === task.face && !guard && !breathing) swing = true;
      if (task.mode === 'jumpcut') {
        // Under the head, either side of it: the nearer side with nothing on
        // it - and, while a head that breathes is up, not within 70 px of her
        // middle, where a parry makes her reel.
        const hd = task.hd;
        let spots = [
          { x: hd.x - 25, face: 1 },
          { x: hd.x + 25, face: -1 },
        ];
        if (breathers && spots.some((sp) => Math.abs(sp.x - G.cx) >= 70)) spots = spots.filter((sp) => Math.abs(sp.x - G.cx) >= 70);
        const ok = spots.filter((sp) => !danger(sp.x, G.surfaces[0]));
        const pick = (ok.length ? ok : spots).sort((u, w) => Math.abs(u.x - p.cx) - Math.abs(w.x - p.cx))[0];
        goalX = pick.x;
        wantFace = pick.face;
        // Up only between her moves, and never into something in the air.
        const calm = v.state === 'recover' || v.state === 'idle';
        if (sNow && sNow.floor && Math.abs(p.cx - pick.x) < 8 && p.facing === pick.face && calm && !danger(p.cx) && jumpSafe(p.cx) && !run && !guard) doJump = true;
        if (!p.onGround) {
          // In the air: swing while the blade's height crosses the head's.
          const feet = G.floor - p.bottom;
          const low = G.floor - (hd.y + 22);
          const high = G.floor - (hd.y - 22);
          const breathing = (wind === 'stone' || wind === 'crown') || (v.state === 'act' && breathOn);
          if (feet + 33 > low + 2 && feet + 1 < high - 2 && !breathing) swing = true;
        }
      }
    }
    if (stance) {
      goalX = stance.x;
      wantFace = stance.face;
    }
    if (aside !== null) {
      goalX = aside;
      swing = false;
    }
    if (run) {
      goalX = p.cx + run.dir * 80;
      noJump = true;
      hold = false;
    }

    // Never stand where something is about to land, nor walk into it.
    let hop = false;
    const here = sNow ? danger(p.cx) : null;
    const onIt = (x) => x >= sNow.x0 - 6 && x <= sNow.x1 + 6 && x >= G.left + 12 && x <= G.right - 12;
    if (sNow && here && !run && !(hold && here === 'breath')) {
      // Out from under it - to the side he chose a moment ago, while it is still good.
      if (!(dodge && onIt(dodge.x) && !danger(dodge.x) && Math.abs(dodge.x - p.cx) < 200)) {
        let best = null;
        for (let dx = 4; dx <= 260; dx += 4) {
          for (const sgn of [1, -1]) {
            const x = p.cx + sgn * dx;
            if (!onIt(x) || danger(x)) continue;
            // Room to spare on a ledge, rather than its very edge.
            const edge = sNow.floor ? 0 : Math.max(0, 14 - Math.min(x - sNow.x0 + 9, sNow.x1 + 9 - x));
            const c = dx + (goalX !== null ? Math.abs(x - goalX) * 0.25 : 0) + edge;
            if (!best || c < best.c) best = { x, c };
          }
          if (best && dx > best.c + 8) break;
        }
        dodge = best ? { x: best.x } : null;
      }
      if (dodge) goalX = dodge.x;
      hold = false;
    } else if (sNow && goalX !== null && Math.abs(goalX - p.cx) > 6 && !run) {
      const dir = Math.sign(goalX - p.cx);
      for (let x = p.cx + dir * 4; Math.abs(x - p.cx) < Math.abs(goalX - p.cx); x += dir * 4) {
        const d = danger(x);
        if (d) {
          // A pool in the way, with clear floor beyond it: over it.
          const land = p.cx + dir * 130;
          if (d === 'pool' && Math.abs(x - p.cx) < 40 && Math.abs(p.vx) > 150 && !danger(land) && jumpSafe(p.cx) && !noJump) hop = true;
          else goalX = x - dir * 8;
          break;
        }
      }
    }
    if (!here) dodge = null;
    // And not waiting about right under her middle while a head that breathes
    // is up: there the breath reaches him on its first frame.
    if (sNow && sNow.floor && breathers && !run && !(hold && guard) && goalX !== null && Math.abs(goalX - G.cx) < 70) {
      const outs = [G.cx - 76, G.cx + 76].filter((x) => !danger(x));
      if (outs.length) goalX = outs.sort((u, w) => Math.abs(u - p.cx) - Math.abs(w - p.cx))[0];
    }

    // Towards the goal - letting go in time to stop on it, not past it.
    const dist = goalX !== null ? goalX - p.cx : 0;
    const braking = p.onGround && Math.sign(p.vx) === Math.sign(dist) && Math.abs(dist) < (p.vx * p.vx) / 4000 + 2;
    if (goalX !== null && Math.abs(dist) > 5 && !(hold && guard) && !braking) {
      a[dist > 0 ? 'right' : 'left'] = true;
    } else if (wantFace !== null && p.facing !== wantFace) {
      a[wantFace > 0 ? 'right' : 'left'] = true;
    }
    if ((doJump || hop) && !noJump && !jump.busy) jump.go(18);
    if (dropHold > 0) {
      dropHold--;
      a.down = true;
      a.left = false;
      a.right = false;
    }
    if (swing && !parryNow) {
      if (p.onGround) h.swing(a);
      // The jump cuts: in the air, on the same rhythm as h.swing.
      else if (h.frame % 8 < 2) a.attack = true;
    }
    if (parryNow) {
      a.parry = true;
      a.attack = false;
      // Facing the way it has to go, on the very frame.
      a.left = parryFace < 0;
      a.right = parryFace > 0;
    }
    return jump.apply(a);
  };
}
