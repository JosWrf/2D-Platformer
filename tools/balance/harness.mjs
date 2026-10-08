/**
 * The bench every boss is measured on, the same way for all of them.
 *
 * Each boss used to be measured by its own tool, with its own bot, and most of
 * those bots were not people: they saw every change of state in the frame it
 * happened, knew where a head was to the pixel, and jumped in the right frame
 * to catch it. Two bosses that were "measured fair" that way turned out to be
 * two-minute walls once they were measured like a person plays them. So here
 * every boss meets the same kind of hero:
 *
 *   - he carries exactly the relics the road has handed him by then, and the
 *     boss sizes itself up against them when it wakes, as it does in the game;
 *   - he is kept alive, and every heart he loses is counted - the same measure
 *     the per-boss tools use, so the numbers line up with theirs;
 *   - the reader sees the fight 0.3 s late (it acts on what was there 18
 *     frames ago; anything moving it leads by those 18 frames, the way anyone
 *     leads a thing flying at him), swings only with his feet on something,
 *     and jumps to get out of the way or up onto a ledge, not to attack;
 *   - the masher does not read at all: he walks up and swings.
 *
 * The readers live next to this file, one per boss, in readers/. Each exports
 * one function, (g, h) => (boss) => actions, that is sent into the page as
 * source: it may use nothing but its arguments.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

/**
 * The road, in the order it is walked, and what each boss leaves. A boss is met
 * with every relic of the bosses before it - the Prismarch, behind every gem in
 * the world, with all of them but its own.
 */
export const ROAD = [
  { kind: 'gallert', name: 'Gallert', relic: 'herzkern', band: 'early' },
  { kind: 'boar', name: 'Grimmzahn', relic: 'keilerhaut', band: 'early' },
  { kind: 'mimic', name: 'Gierschlund', relic: 'goldzahn', band: 'early' },
  { kind: 'jester', name: 'Maskarill', relic: 'gauklerschritt', band: 'early' },
  { kind: 'colossus', name: 'Ankhor', relic: 'bebenfaust', band: 'middle' },
  { kind: 'gloom', name: 'Nyktos', relic: 'lichtkern', band: 'middle' },
  { kind: 'spider', name: 'Arachna', relic: 'seidenmantel', band: 'middle' },
  { kind: 'wyrm', name: 'Ignivor', relic: 'glutklinge', band: 'middle' },
  { kind: 'twins', name: 'Sol und Luna', relic: 'zwillingsstern', band: 'middle' },
  { kind: 'thalassa', name: 'Thalassa', relic: 'flutklinge', band: 'middle' },
  { kind: 'gargoyle', name: 'Grauwacht', relic: 'steinblick', band: 'late' },
  { kind: 'clock', name: 'Tickmar', relic: 'taktgeber', band: 'late' },
  { kind: 'vesper', name: 'Vesperon', relic: 'blutdurst', band: 'late' },
  { kind: 'knight', name: 'Morvain', relic: 'schattenschritt', band: 'late' },
  { kind: 'shadow', name: 'Umbra', relic: 'zweiteratem', band: 'late' },
  // A mini-boss: a lighter fight than the ones around it, measured as one.
  { kind: 'warden', name: 'Splitterwächter', relic: 'splitterparade', band: 'middle' },
  { kind: 'hydra', name: 'Die Fünfkronige', relic: 'hydrablut', band: 'late' },
  { kind: 'prismarch', name: 'Prismarch', relic: 'klingenwelle', band: 'late' },
];

/** The relics a hero holds when he reaches a boss: everything before it on the road. */
export function relicsBefore(kind) {
  const at = ROAD.findIndex((b) => b.kind === kind);
  if (at < 0) throw new Error(`no boss ${kind} on the road`);
  return ROAD.slice(0, at).map((b) => b.relic);
}

/** A static server for dist/ and a browser page pointed at it. */
export async function open(dist = path.join(ROOT, 'dist')) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.join(dist, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(dist)) throw new Error('bad path');
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('PAGE ERROR:', e.message);
  });
  const base = `http://127.0.0.1:${server.address().port}/`;
  return {
    page,
    base,
    errors,
    close: async () => {
      await browser.close();
      server.close();
    },
  };
}

/**
 * A fresh game with the hero at the door of one boss, carrying what the road
 * gave him, and the bench installed as window.__bal. Nothing one fight does
 * leaks into the next.
 */
export async function stage(bench, kind, relics = relicsBefore(kind)) {
  const { page, base } = bench;
  await page.goto(`${base}?state=playing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => window.loop.stop());
  await page.evaluate(
    ({ kind, relics }) => {
      const g = window.game;
      const input = window.input;
      const ctx = document.querySelector('canvas').getContext('2d');
      const p = g.player;
      // A build that does not know a relic yet simply goes without it.
      for (const id of relics) {
        try {
          g.takeRelic(id);
        } catch {
          // An older build, measured for comparison.
        }
      }
      g.dialogue = null;
      p.hp = p.maxHp;
      const TILE = 32;
      const h = { kind, frame: 0, LAG: 18, live: true };

      /**
       * One frame of the game, drawn now and then: the draw is not what is
       * measured. `live` says whether the world moved in it - during a hit-stop
       * the clock runs and nothing else does.
       */
      h.tick = (actions = {}) => {
        for (const [a, v] of Object.entries({
          left: false,
          right: false,
          down: false,
          jump: false,
          attack: false,
          parry: false,
          dash: false,
          skill: false,
          confirm: false,
          ...actions,
        })) {
          input.forceDown(a, !!v);
        }
        const frozen = g.hitStopTimer > 0;
        g.update(1 / 60, input);
        h.live = !frozen;
        if (h.frame % 6 === 0) g.render(ctx);
        h.frame++;
      };

      h.find = () => {
        if (kind === 'knight') return g.boss && !g.boss.dead ? g.boss : null;
        return g.enemies.find((e) => e.kind === kind && !e.dead) ?? null;
      };

      /** Down, or on the way down: a boss in its death throes is a boss that has been felled. */
      h.felled = (b) => !b || b.dead || b.hp <= 0 || b.state === 'dying';

      /*
       * The room. Arena bosses stand between two wards; the knight has his
       * throne room, the hydra her shaft and the Prismarch its hall - for those
       * the room is read off the walls around the spawn.
       */
      const spawn = g.level.spawns.find((s) => s.kind === (kind === 'knight' ? 'boss' : kind));
      const sx = spawn ? spawn.tx * TILE : p.x;
      h.arena = g.level.arenas.find((a) => sx >= a.left && sx < a.right) ?? null;
      const wallsAround = (tx, ty) => {
        let l = tx;
        let r = tx;
        while (l > 0 && !g.level.solidAt(l - 1, ty)) l--;
        while (r < g.level.width - 1 && !g.level.solidAt(r + 1, ty)) r++;
        return { left: l * TILE, right: (r + 1) * TILE };
      };
      if (h.arena) {
        h.room = { left: h.arena.left, right: h.arena.right };
      } else if (kind === 'knight') {
        h.room = { left: g.level.arenaLeft, right: g.level.arenaLeft + 50 * TILE };
      } else if (spawn) {
        h.room = wallsAround(spawn.tx, spawn.ty);
      } else {
        h.room = { left: p.x - 600, right: p.x + 600 };
      }
      // The floor the boss stands on: the first solid row under its spawn.
      let fy = spawn ? spawn.ty : 17;
      while (fy < g.level.height && !g.level.solidAt(spawn ? spawn.tx : 0, fy)) fy++;
      h.room.floor = fy * TILE;
      h.room.mid = (h.room.left + h.room.right) / 2;

      /** States in which a boss is still arriving rather than fighting. */
      const ENTERING = new Set(['dormant', 'intro', 'descend', 'rise', 'wait', 'sleep', 'asleep', 'emerge']);

      /**
       * In through the door and on until the boss is up, the room is shut and
       * its entrance is over. Whatever it takes to get there costs nothing.
       */
      h.wake = () => {
        if (kind === 'prismarch') {
          g.inCrystalWorld = true;
          p.respawn((spawn.tx - 30) * TILE, 17 * TILE);
          g.camera.snapTo(p.cx, p.cy);
        } else if (kind === 'knight') {
          g.warpTo(Math.floor(g.level.arenaLeft / TILE) - 3);
        } else if (h.arena) {
          g.warpTo(h.arena.entryTx + 3);
        } else {
          g.warpTo(spawn.tx - 12);
        }
        for (let f = 0; f < 60 * 12; f++) {
          const b = h.find();
          const shut = h.arena ? h.arena.fighting : true;
          if (b && b.engaged && shut && !ENTERING.has(b.state)) break;
          p.hp = p.maxHp;
          p.dead = false;
          h.tick({ right: f < 40 || !b?.engaged });
        }
        g.dialogue = null;
        return h.find();
      };

      /*
       * Kept alive, and every heart counted. A hero who would have died goes on
       * fighting; what is wanted is how many hearts the fight costs, not whether
       * one bad moment ended the measurement early.
       */
      h.hits = 0;
      h.why = {};
      /** Blows the silk caught: not hearts, but blows all the same. */
      h.saves = 0;
      let silk = p.shieldUp;
      h.watchHp = (b, before) => {
        if (silk && !p.shieldUp) h.saves++;
        silk = p.shieldUp;
        if (p.hp < p.maxHp) {
          const lost = p.maxHp - p.hp;
          h.hits += lost;
          // What the boss was doing when the blow came, not what the blow made of it.
          const st = before ?? b?.state ?? 'none';
          h.why[st] = (h.why[st] ?? 0) + lost;
          p.hp = p.maxHp;
        }
        p.dead = false;
        if (g.state === 'dead') g.state = 'playing';
        g.dialogue = null;
      };

      /* ------------------------------------------------ for the readers */

      /**
       * What the hero has seen: push this frame's snapshot, get back the one
       * from LAG frames ago (or the oldest there is, at the start). Only frames
       * in which the world moved count: a hit-stop holds the boss and the eye
       * alike, and counting its frozen frames made the reader quicker than
       * 0.3 s exactly when blows were landing.
       */
      h.lag = (lag = h.LAG) => {
        const seen = [];
        return (snap) => {
          if (h.live || seen.length === 0) seen.push(snap);
          else seen[seen.length - 1] = snap;
          if (seen.length > lag + 1) seen.shift();
          return seen[0];
        };
      };

      /**
       * Where something seen LAG frames ago is now, led the way an eye leads a
       * moving thing: by its speed, over the time it has been behind.
       */
      h.lead = (x, vx, frames = h.LAG) => x + (vx * frames) / 60;

      /**
       * Jumping, as a key: it has to come up before a new press counts, and a
       * jump is held for a number of frames to get its height.
       */
      h.jumper = () => {
        let hold = 0;
        let wasDown = false;
        let pending = 0;
        return {
          /** Start a jump held for this many frames, if one is not already going. */
          go(frames = 18) {
            if (hold === 0 && pending === 0) pending = frames;
          },
          get busy() {
            return hold > 0 || pending > 0;
          },
          apply(a) {
            if (pending > 0 && hold === 0) {
              if (wasDown) {
                // Up for a frame first, so the press is a press.
                a.jump = false;
                wasDown = false;
                return a;
              }
              hold = pending;
              pending = 0;
            }
            if (hold > 0) {
              a.jump = true;
              hold--;
            }
            wasDown = !!a.jump;
            return a;
          },
        };
      };

      /** Walk towards x; true once there. */
      h.walkTo = (a, x, tol = 6) => {
        const d = x - p.cx;
        if (Math.abs(d) <= tol) return true;
        a[d > 0 ? 'right' : 'left'] = true;
        return false;
      };

      /** Turn to face x without walking off: a single frame of the key does it. */
      h.face = (a, x) => {
        const want = Math.sign(x - p.cx) || p.facing;
        if (p.facing !== want) a[want > 0 ? 'right' : 'left'] = true;
      };

      /** A swing, from the floor only, on a rhythm a person can keep up. */
      h.swing = (a) => {
        if (p.onGround && h.frame % 8 < 2) a.attack = true;
      };

      /** From the front of the hero to the near side of a box, along the floor. */
      h.gap = (box) => {
        const dx = box.x + box.w / 2 - p.cx;
        return dx > 0 ? box.x - (p.x + p.w) : p.x - (box.x + box.w);
      };

      /** Room left behind the hero in a direction before the wall. */
      h.room.space = (dir) => (dir > 0 ? h.room.right - (p.x + p.w) : p.x - h.room.left);

      /**
       * Hostile projectiles as the eye has them: position led by the lag, and
       * how long until each one reaches the hero along its flight, if it will.
       */
      h.threats = (list) => {
        const out = [];
        for (const q of list) {
          const x = h.lead(q.x, q.vx);
          const y = h.lead(q.y, q.vy);
          out.push({ ...q, x, y });
        }
        return out;
      };

      /** A plain snapshot of the projectiles that can hurt the hero. */
      h.hostile = () =>
        g.projectiles
          .filter((q) => !q.dead && !q.friendly)
          .map((q) => ({ x: q.cx, y: q.cy, vx: q.vx, vy: q.vy, w: q.w, h: q.h, kind: q.kind, deflectable: q.deflectable }));

      /** The masher: up to the boss, and swing. No reading at all. */
      h.masher = () => (b) => {
        const a = {};
        const gap = h.gap(b);
        if (gap > 20) h.walkTo(a, b.cx, 4);
        else h.face(a, b.cx);
        if (gap < 40) h.swing(a);
        return a;
      };

      /**
       * One fight from the shut door to the fall, or to the cap: seconds, and
       * hearts it cost. `make` is the reader factory, or null for the masher.
       */
      h.fight = (style, cap) => {
        const act = style === 'masher' ? h.masher() : window.__makeReader(g, h);
        h.hits = 0;
        h.why = {};
        h.saves = 0;
        const t0 = g.time;
        let felledAt = -1;
        let b = h.find();
        const maxHp = b?.maxHp ?? 0;
        for (let f = 0; f < 60 * cap; f++) {
          b = h.find();
          if (h.felled(b)) {
            felledAt = g.time - t0;
            break;
          }
          const before = b?.state;
          h.tick(act(b) ?? {});
          h.watchHp(b, before);
        }
        b = h.find();
        return {
          felled: felledAt >= 0,
          seconds: felledAt >= 0 ? +felledAt.toFixed(1) : null,
          hearts: h.hits,
          saves: h.saves,
          why: { ...h.why },
          maxHp,
          left: b && !h.felled(b) ? +(b.hp / Math.max(1, b.maxHp)).toFixed(2) : 0,
          heroHearts: p.maxHp,
        };
      };

      window.__bal = h;
    },
    { kind, relics },
  );
}

/** Sends a reader into the page, as source - it may use nothing but its arguments. */
export async function useReader(page, reader) {
  await page.evaluate(`window.__makeReader = (${reader.toString()});`);
}

/** Wakes the staged boss and fights it out; null if it never woke. */
export async function fight(page, style, cap) {
  return page.evaluate(
    ({ style, cap }) => {
      const h = window.__bal;
      if (!h.wake()) return null;
      return h.fight(style, cap);
    },
    { style, cap },
  );
}

/** Loads the reader for a boss kind, if there is one. */
export async function readerFor(kind) {
  try {
    const mod = await import(`./readers/${kind}.mjs`);
    return mod.default;
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw e;
  }
}
