/**
 * Headless playtest: a simple bot runs the hero from the spawn to the boss
 * using the real physics, then fights the boss. Reports where it gets stuck.
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
    if (!file.startsWith(DIST)) throw new Error('bad');
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
await page.goto(`${base}/?state=playing`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const result = await page.evaluate(({ seconds }) => {
  const g = window.game;
  const input = window.input;
  const TILE = 32;
  const DT = 1 / 60;
  const steps = Math.round(seconds / DT);

  let maxX = g.player.cx;
  let stuckFrames = 0;
  let jumpHold = 0;
  let jumpCooldown = 0;
  let attackHold = 0;
  const stuckSpots = [];
  let reachedBossAt = -1;

  const solidAhead = (p) => {
    const tx = Math.floor((p.x + p.w + 6) / TILE);
    for (let ty = Math.floor(p.y / TILE); ty <= Math.floor((p.y + p.h - 2) / TILE); ty++) {
      if (g.level.solidAt(tx, ty)) return true;
    }
    return false;
  };
  const gapAhead = (p) => g.level.groundBelow(p.x + p.w + 12, p.bottom - 2, 4) > 40;
  const hazardAhead = (p) => {
    const tx = Math.floor((p.x + p.w + 20) / TILE);
    const ty = Math.floor((p.bottom + 4) / TILE);
    return g.level.hazardAt(tx, ty) || g.level.hazardAt(tx + 1, ty);
  };

  for (let i = 0; i < steps; i++) {
    const p = g.player;
    if (g.state === 'dead') {
      input.forceDown('confirm', true);
      g.update(DT, input);
      input.forceDown('confirm', false);
      continue;
    }
    if (g.state === 'victory') break;

    const nearestEnemy = g.enemies
      .filter((e) => !e.dead && Math.abs(e.cy - p.cy) < 60 && Math.abs(e.cx - p.cx) < 90)
      .sort((a, b) => Math.abs(a.cx - p.cx) - Math.abs(b.cx - p.cx))[0];

    const bossActive = g.boss && g.boss.engaged && !g.boss.dead;
    if (bossActive && reachedBossAt < 0) reachedBossAt = i;

    let wantRight = true;
    let wantLeft = false;
    let wantJump = false;
    let wantAttack = false;

    if (bossActive) {
      const dx = g.boss.cx - p.cx;
      wantRight = dx > 46;
      wantLeft = dx < -46;
      wantAttack = Math.abs(dx) < 74 && i % 22 < 4;
      wantJump = g.boss.state === 'slam' || g.boss.state === 'dash';
    } else {
      if (nearestEnemy) {
        const dx = nearestEnemy.cx - p.cx;
        if (Math.abs(dx) < 60) {
          wantAttack = i % 20 < 4;
          wantRight = dx > 0;
          wantLeft = dx < 0;
        }
      }
      if (solidAhead(p) || gapAhead(p) || hazardAhead(p)) wantJump = true;
      // Mid-air over a gap: burn the double jump rather than fall in.
      if (!p.onGround && p.vy > 40 && g.level.groundBelow(p.cx, p.bottom, 5) > 120) wantJump = true;
    }

    // Hold jump long enough for a full-height jump, then release so the next
    // press registers as a double jump.
    if (wantJump && jumpHold <= 0 && jumpCooldown <= 0) {
      jumpHold = 17;
      jumpCooldown = 20;
    }
    input.forceDown('jump', jumpHold > 0);
    jumpHold--;
    jumpCooldown--;
    if (wantAttack && attackHold <= 0) attackHold = 3;
    input.forceDown('attack', attackHold-- > 0);
    input.forceDown('right', wantRight);
    input.forceDown('left', wantLeft);

    g.update(DT, input);

    if (p.cx > maxX + 2) {
      maxX = p.cx;
      stuckFrames = 0;
    } else if (!bossActive) {
      stuckFrames++;
      if (stuckFrames === 360) stuckSpots.push({ tile: Math.round(maxX / TILE), atSecond: Math.round(i / 60) });
    }
  }

  return {
    state: g.state,
    furthestTile: Math.round(maxX / TILE),
    levelTiles: g.level.width,
    bossHp: g.boss ? g.boss.hp : null,
    bossEngaged: !!(g.boss && g.boss.engaged),
    bossReachedAtSecond: reachedBossAt >= 0 ? Math.round(reachedBossAt / 60) : null,
    deaths: g.deaths,
    gems: `${g.gems}/${g.totalGems}`,
    stuckSpots: stuckSpots.slice(0, 8),
  };
}, { seconds: Number(process.argv[2] ?? 300) });

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
