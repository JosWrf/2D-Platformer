/**
 * Static traversability check for the level.
 *
 * Builds a graph of every standable tile (plus moving-platform surfaces) and
 * walks it from the player spawn, using a conservative model of the hero's
 * jump. Reports the first place where the path to the boss breaks.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST)) throw new Error('bad path');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);

const report = await page.evaluate(() => {
  const g = window.game;
  const L = g.level;
  const TILE = 32;
  // The seal behind the throne opens when the knight falls; for a static
  // reachability check it has to be treated as open, like the arena gate.
  L.exitSealed = false;
  const W = L.width;
  const H = L.height;

  // Conservative movement envelope (the hero can actually do a bit more).
  const MAX_DX = 5;      // tiles cleared horizontally in one jump
  const MAX_UP = 4;      // tiles gained with a double jump
  const MAX_DOWN = 14;   // free fall

  const standable = (tx, ty) => {
    if (tx < 0 || tx >= W || ty < 1 || ty >= H) return false;
    const below = L.tileAt(tx, ty + 1);
    const belowSolid = L.solidAt(tx, ty + 1) || L.platformAt(tx, ty + 1);
    if (!belowSolid) return false;
    if (below === 4 /* spike */) return false;
    if (L.solidAt(tx, ty) || L.hazardAt(tx, ty)) return false;
    if (L.solidAt(tx, ty - 1)) return false; // no headroom
    return true;
  };

  const nodes = [];
  const index = new Map();
  const add = (tx, ty, kind) => {
    const key = `${tx},${ty}`;
    if (index.has(key)) return;
    index.set(key, nodes.length);
    nodes.push({ tx, ty, kind });
  };

  for (let tx = 0; tx < W; tx++) {
    for (let ty = 1; ty < H; ty++) {
      if (standable(tx, ty)) add(tx, ty, 'tile');
    }
  }
  // Moving platforms sweep a range of columns at a fixed height.
  for (const p of g.platforms) {
    const y = Math.round((p.axis === 'h' ? p.y : p.y - p.range) / TILE) - 1;
    const x0 = Math.floor((p.x - (p.axis === 'h' ? p.range : 0)) / TILE);
    const x1 = Math.ceil((p.x + p.w + (p.axis === 'h' ? p.range : 0)) / TILE);
    const rows = p.axis === 'v' ? Math.ceil((p.range * 2) / TILE) + 1 : 1;
    for (let r = 0; r < rows; r++) {
      for (let tx = x0; tx <= x1; tx++) add(tx, y + r, 'mover');
    }
  }

  const key = (tx, ty) => index.get(`${tx},${ty}`);
  const edges = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let dx = -MAX_DX; dx <= MAX_DX; dx++) {
      for (let dy = -MAX_UP; dy <= MAX_DOWN; dy++) {
        if (dx === 0 && dy === 0) continue;
        const j = key(a.tx + dx, a.ty + dy);
        if (j === undefined) continue;
        const adx = Math.abs(dx);
        if (dy < 0 && adx > MAX_DX - Math.abs(dy) * 0.6) continue; // steep jumps cover less ground
        edges[i].push(j);
      }
    }
  }

  const spawn = L.spawns.find((s) => s.kind === 'player');
  let startIdx = key(spawn.tx, spawn.ty);
  if (startIdx === undefined) {
    for (let ty = spawn.ty; ty < H; ty++) {
      const k = key(spawn.tx, ty);
      if (k !== undefined) { startIdx = k; break; }
    }
  }

  const seen = new Uint8Array(nodes.length);
  const queue = [startIdx];
  seen[startIdx] = 1;
  let maxX = nodes[startIdx].tx;
  while (queue.length) {
    const cur = queue.pop();
    if (nodes[cur].tx > maxX) maxX = nodes[cur].tx;
    for (const nxt of edges[cur]) {
      if (!seen[nxt]) { seen[nxt] = 1; queue.push(nxt); }
    }
  }

  /*
   * The crystal hall is the one place that must NOT be walkable to: it is the
   * reward for every gem in the world, and a player who can simply stroll in
   * has been robbed of the errand. So everything from it onwards is left out of
   * the reachability report, and the opposite is asserted instead.
   */
  const bonus = L.spawns.find((s) => s.kind === 'prismarch');
  let bonusFrom = W;
  if (bonus) {
    let tx = bonus.tx;
    while (tx > 0 && [18, 19, 20, 21].some((ty) => L.solidAt(tx - 1, ty))) tx--;
    bonusFrom = tx;
  }
  const bonusHallSealed = !nodes.some((n, i) => seen[i] && n.tx >= bonusFrom);

  /*
   * Ground-bound spawns standing on nothing, or on something deadly.
   *
   * Found by driving every enemy in the level for nine seconds: three
   * skeletons were placed over open shafts and fell out of the world before
   * the player could ever meet them, and one stood on its own spikes. Eyeing
   * ASCII art does not catch that; this does.
   */
  const GROUNDED = ['slime', 'skeleton', 'bomber', 'shieldman', 'charger', 'warden', 'thalassa', 'prismarch'];
  const badSpawns = [];
  for (const sp of L.spawns) {
    if (!GROUNDED.includes(sp.kind)) continue;
    // Looks down a few tiles rather than only at the one below: a spawn placed
    // a row or two over the floor is fine, it simply drops onto it.
    let landsOn = null;
    for (let ty = sp.ty + 1; ty <= sp.ty + 4 && landsOn === null; ty++) {
      if (L.hazardAt(sp.tx, ty)) landsOn = 'hazard';
      else if (L.solidAt(sp.tx, ty) || L.platformAt(sp.tx, ty)) landsOn = 'ground';
    }
    // The neighbours count too: an enemy body is wider than nothing, and one
    // placed flush against a spike column dies on its first frame of drift.
    const touching = [-1, 1].some((d) => L.hazardAt(sp.tx + d, sp.ty + 1) || L.hazardAt(sp.tx + d, sp.ty));
    if (landsOn !== 'ground' || touching) {
      badSpawns.push({ kind: sp.kind, tile: sp.tx, standsOn: landsOn !== 'ground' ? (landsOn ?? 'nothing') : 'spikes next door' });
    }
  }

  // Platform tiles nobody can stand on. The column check below hides these:
  // a platform floating out of reach sits over solid floor, and the floor
  // node makes the whole column count as reached.
  const strandedPlatforms = [];
  nodes.forEach((n, i) => {
    if (seen[i]) return;
    if (n.tx >= bonusFrom) return;
    if (!L.platformAt(n.tx, n.ty + 1)) return;
    const last = strandedPlatforms[strandedPlatforms.length - 1];
    if (last && n.tx <= last[1] + 1 && n.ty === last[2]) last[1] = Math.max(last[1], n.tx);
    else strandedPlatforms.push([n.tx, n.tx, n.ty]);
  });

  // Columns that hold a standable tile but were never reached.
  const reachableCols = new Set();
  const allCols = new Set();
  nodes.forEach((n, i) => {
    if (n.tx >= bonusFrom) return;
    allCols.add(n.tx);
    if (seen[i]) reachableCols.add(n.tx);
  });
  const blocked = [...allCols].filter((c) => !reachableCols.has(c)).sort((a, b) => a - b);

  // Collapse the unreachable columns into ranges for a readable report.
  const ranges = [];
  for (const c of blocked) {
    const last = ranges[ranges.length - 1];
    if (last && c === last[1] + 1) last[1] = c;
    else ranges.push([c, c]);
  }

  const boss = L.spawns.find((s) => s.kind === 'boss');
  const bossReachable = maxX >= boss.tx - 2;
  const portal = L.spawns.find((s) => s.kind === 'portal');
  const portalReachable = portal ? maxX >= portal.tx - 2 : false;

  return {
    width: W,
    nodes: nodes.length,
    badSpawns,
    bonusHallFromTile: bonusFrom,
    bonusHallSealed,
    strandedPlatforms,
    furthestReachableTile: maxX,
    bossTile: boss.tx,
    bossReachable,
    portalTile: portal ? portal.tx : null,
    portalReachable,
    unreachableRanges: ranges.slice(0, 20),
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
if (!report.bossReachable) console.error('FAIL: the boss cannot be reached from the spawn.');
if (!report.portalReachable) console.error('FAIL: the gate home cannot be reached.');
if (report.badSpawns.length) {
  console.error(`FAIL: ${report.badSpawns.length} enemy spawn(s) stand on nothing or on a hazard.`);
}
if (!report.bonusHallSealed) {
  console.error('FAIL: the crystal hall can be walked into. It is meant to be reached only by teleport.');
}
if (report.strandedPlatforms.length) {
  console.error(`FAIL: ${report.strandedPlatforms.length} platform(s) hang out of reach - [fromTile, toTile, row].`);
}
process.exit(
  report.bossReachable &&
  report.portalReachable &&
  report.bonusHallSealed &&
  !report.badSpawns.length &&
  !report.strandedPlatforms.length
    ? 0
    : 1,
);
