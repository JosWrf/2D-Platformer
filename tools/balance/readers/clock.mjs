/**
 * Tickmar, read like a person reads him - the same bot verify-clock.mjs fights
 * him with (h.makeBot()), moved onto the bench. It acts on what the tower
 * looked like 0.3 s ago:
 *
 *   hands     - off the marks, to the nearest spot clear of all of them;
 *   pendulum  - out of its reach while it is told and swinging, or, with a wall
 *               at its back, over it: one jump timed on the count, and a second
 *               in the air if the passes are far apart;
 *   gears     - a step back while they are told, then a swing at each one that
 *               comes, or a jump if it comes from behind;
 *   bell      - a jump timed on the count, for when the ring reaches it;
 *   otherwise - to his legs, and swinging, from the floor.
 *
 * Counting is what a person does with four ticks: the moment of the blow is
 * worked out from the bar as it was seen 0.3 s ago, and hit give or take 40
 * ms. The count runs on his own clock (boss.clock), which is the beat the
 * hero hears - it stands still only in the hit stop, when everything does.
 *
 * Differences from the tool's bot, all from the bench: swings come on
 * h.swing's cadence (the same every-8-frames rhythm the bot used), and jumps
 * go through h.jumper (held 16 frames, the key up for a frame first - which
 * the bot did by hand).
 */
export default function reader(g, h) {
  const p = g.player;
  const see = h.lag();
  const jump = h.jumper();
  const jumps = [];
  let planned = null;
  const err = () => (Math.random() * 2 - 1) * 0.04;
  const plan = (at) => {
    if (!jumps.some((t) => Math.abs(t - at) < 0.25)) jumps.push(at);
  };
  return (boss) => {
    const S = see({
      clock: boss.clock,
      state: boss.state,
      move: boss.move,
      inState: boss.inState,
      beatLen: boss.beatLen,
      beatTimer: boss.beatTimer,
      phaseTwo: boss.phaseTwo,
      cx: boss.cx,
      pendMode: boss.pendMode,
      pendSide: boss.pendSide,
      bobX: boss.bobX,
      parts: boss.parts
        .filter((q) => !q.dead)
        .map((q) => ({ part: q.part, cx: q.cx, vx: q.vx, mode: q.mode, stage: q.stage, markX: q.markX })),
    });
    const a = {};
    const me = p.cx;
    const side = Math.sign(me - S.cx) || -1;
    const L = h.room.left + 14;
    const R = h.room.right - 14;
    const now = boss.clock;
    const strikeAt = S.state === 'tell' ? S.clock + S.beatTimer + (3 - S.inState) * S.beatLen : null;
    const key = S.state === 'tell' ? `${S.move}@${strikeAt.toFixed(2)}` : null;
    let goal = null;
    let swing = false;

    // The hands: off every mark, to the nearest clear floor.
    const marks = S.parts.filter((q) => q.part === 'hand' && ['mark', 'rise', 'hover'].includes(q.stage)).map((q) => q.markX);
    const onMark = (x) => marks.some((m) => Math.abs(m - x) < 33);
    if (marks.length > 0 && onMark(me)) {
      const spots = [];
      for (const m of marks) for (const d of [-38, 38]) if (!onMark(m + d) && m + d > L && m + d < R) spots.push(m + d);
      spots.sort((u, v) => Math.abs(u - me) - Math.abs(v - me));
      if (spots.length > 0) goal = spots[0];
    }

    // The pendulum: out of reach - or, cornered, over it.
    const pendTold = (S.state === 'tell' && S.move === 'pendel') || S.pendMode === 'cock' || S.pendMode === 'sweep';
    if (pendTold && Math.abs(me - S.cx) < 250) {
      const mine = S.cx + side * 255;
      const other = S.cx - side * 255;
      const left = strikeAt !== null ? strikeAt - now : 0;
      if (mine > L && mine < R) goal = mine;
      else if (other > L && other < R && left > Math.abs(other - me) / 235 + 0.15) goal = other;
      else if (strikeAt !== null && planned !== key) {
        // Over it: the passes come where the swing says they will.
        planned = key;
        const B = S.beatLen;
        const c = (S.cx - me) / (S.pendSide * 200);
        if (Math.abs(c) <= 1) {
          const t1 = (B * Math.acos(Math.max(-1, Math.min(1, c)))) / Math.PI;
          const t2 = 2 * B - t1;
          plan(strikeAt + t1 - 0.14 + err());
          if (t2 - t1 > 0.42) plan(strikeAt + t1 + 0.2 + err());
        }
      }
    }

    // The gears: a few steps back while they are told, to have room to meet
    // them; then, through the bar they come on, facing him and swinging in
    // time with the drops - and a jump for one from behind.
    const gearsTold = S.state === 'tell' && S.move === 'gears';
    const gearsBar = S.state === 'strike' && S.move === 'gears';
    if (gearsTold && Math.abs(me - S.cx) < 170 && goal === null) {
      const back = S.cx + side * 185;
      goal = back > L && back < R ? back : S.cx - side * 185;
    }
    for (const q of S.parts) {
      if (q.part !== 'gear' || q.mode === 'back' || Math.sign(q.vx) !== Math.sign(me - q.cx)) continue;
      const d = Math.abs(q.cx - me);
      if (d > 170) continue;
      if (p.facing === Math.sign(q.cx - me)) swing = true;
      else if (d < 105 && p.onGround) plan(now);
    }
    if (gearsBar && Math.abs(me - S.cx) < 240 && p.facing === (Math.sign(S.cx - me) || 1)) swing = true;

    // The bell: a jump counted from the bar, and one more on sight.
    const ringSpeed = S.phaseTwo ? 360 : 320;
    if (S.state === 'tell' && S.move === 'bell' && planned !== key) {
      planned = key;
      const rings = [strikeAt];
      if (S.phaseTwo) rings.push(strikeAt + 2 * S.beatLen);
      for (const r of rings) {
        const arrive = r + Math.max(0, Math.abs(me - S.cx) - 38) / ringSpeed;
        plan(Math.max(r - 0.05, arrive - 0.1) + err());
      }
    }
    for (const q of S.parts) {
      if (q.part !== 'chime' || Math.sign(q.vx) !== Math.sign(me - q.cx)) continue;
      if (Math.abs(q.cx - me) < 150 && p.onGround) plan(now);
    }

    // Otherwise: to his legs - except while gears are coming, when it holds
    // its ground and meets them.
    const busy = pendTold && Math.abs(me - S.cx) < 260;
    if (goal === null && !busy && !gearsBar) {
      const want = S.cx + side * 56;
      goal = onMark(want) ? null : want;
    }
    if (goal !== null) goal = Math.max(L, Math.min(R, goal));

    // Jumps that are due.
    for (let i = jumps.length - 1; i >= 0; i--) {
      if (now >= jumps[i]) {
        jumps.splice(i, 1);
        jump.go(16);
      }
    }

    if (goal !== null && Math.abs(me - goal) > 5) {
      a[goal > me ? 'right' : 'left'] = true;
    } else if (!busy) {
      // Facing him, to swing.
      const toward = Math.sign(S.cx - me) || 1;
      if (p.facing !== toward && Math.abs(S.cx - me) > 20) a[toward > 0 ? 'right' : 'left'] = true;
    }
    const inReach = Math.abs(S.cx - me) < 78 && p.facing === (Math.sign(S.cx - me) || 1);
    if (swing || (inReach && !busy)) h.swing(a);
    return jump.apply(a);
  };
}
