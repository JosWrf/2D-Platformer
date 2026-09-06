/**
 * How much the picture moves when it should not, and whether that can be
 * switched off.
 *
 * Screen shake used to be a fresh random offset every frame. That is not an
 * impact, it is a strobe: the picture jumped up to ten pixels in a new
 * direction sixty times a second, and it was reported twice as painful to look
 * at. Two things have to hold now, and keep holding:
 *
 *  - a shake is a swing, not noise: consecutive frames move the same way, so
 *    the number of direction reversals stays low and the jump per frame small;
 *  - B turns it off completely, for anyone who still cannot take it;
 *  - a long stream of small shakes stays one swing. The knight's death threw
 *    ten of them a second for a second and a half, and each one re-aimed the
 *    screen: the strobe was back exactly where the fight ends and the rift
 *    begins, which is where it was reported;
 *  - the background of a calm zone holds still while the hero runs. The spore
 *    field used to slide across the sky at half the camera speed, drawn at
 *    fractional pixels, so fifty bright dots were re-blended every frame
 *    against a near-black sky. Measured, that was two thirds of all the
 *    movement up there, and it was reported as the background trembling.
 *
 * Usage: node tools/verify-motion.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');

/** A shake may never throw the picture further than this in one frame. */
const MAX_JUMP = 5;
/** Direction reversals per second of shaking, averaged over the burst. */
const MAX_REVERSALS = 22;
/** What may still move in the sky of a calm zone, in mean luminance steps. */
const MAX_SKY_RESIDUE = 0.15;
/** Direction reversals per second across the knight's death and the seal. */
const MAX_DEATH_REVERSALS = 4;
/** And how many of those 360 frames may be shaking at all. */
const MAX_DEATH_SHAKING = 120;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST)) throw new Error('bad path');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/?x=700`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const result = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  const p = g.player;
  const ctx = document.querySelector('canvas').getContext('2d');
  const tick = (actions = {}) => {
    for (const [a, v] of Object.entries({ left: false, right: false, calm: false, ...actions })) {
      input.forceDown(a, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };
  g.level.exitSealed = false;
  g.bossDefeated = true;
  if (g.boss) g.boss.dead = true;
  for (let i = 0; i < 40; i++) tick();

  /** Shakes the screen as hard as the game ever does, and watches it settle. */
  const burst = () => {
    const xs = [];
    const ys = [];
    for (let f = 0; f < 90; f++) {
      // The heaviest single call in the game is the knight's ceiling drop.
      if (f % 30 === 0) g.camera.addShake(14);
      tick();
      xs.push(g.camera.renderX);
      ys.push(g.camera.renderY);
    }
    let jump = 0;
    let reversals = 0;
    let lastX = 0;
    let lastY = 0;
    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i] - xs[i - 1];
      const dy = ys[i] - ys[i - 1];
      // The camera also scrolls; only the vertical is pure shake while the
      // hero stands still, so the horizontal jump is measured against it.
      jump = Math.max(jump, Math.abs(dy));
      if (dy !== 0) {
        if (lastY !== 0 && Math.sign(dy) !== Math.sign(lastY)) reversals++;
        lastY = Math.sign(dy);
      }
      if (dx !== 0) {
        if (lastX !== 0 && Math.sign(dx) !== Math.sign(lastX)) reversals++;
        lastX = Math.sign(dx);
      }
    }
    return { maxJump: jump, reversalsPerSecond: +(reversals / (xs.length / 60)).toFixed(1) };
  };

  const shaking = burst();

  // B switches it off, and it stays off.
  tick({ calm: true });
  tick();
  const offSetting = g.camera.motion;
  const quiet = burst();

  // And back on again.
  tick({ calm: true });
  tick();
  const onAgain = g.camera.motion;

  /**
   * What is left moving in the sky once the scroll itself is taken out: the
   * frames are shifted against each other by the best horizontal offset first,
   * so a background that merely travels past costs nothing.
   */
  const backgroundResidue = () => {
    const cv = document.querySelector('canvas');
    const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const y0 = 120;
    const y1 = 320;
    for (let i = 0; i < 40; i++) tick({ right: true });
    let total = 0;
    const rounds = 20;
    for (let s = 0; s < rounds; s++) {
      const a = ctx.getImageData(0, y0, cv.width, y1 - y0).data;
      tick({ right: true });
      const b = ctx.getImageData(0, y0, cv.width, y1 - y0).data;
      let best = Infinity;
      for (let shift = 0; shift <= 6; shift++) {
        let sum = 0;
        let n = 0;
        for (let y = 0; y < y1 - y0; y += 2) {
          for (let x = 8; x < cv.width - 8 - shift; x += 2) {
            sum += Math.abs(lum(a, (y * cv.width + x) * 4) - lum(b, (y * cv.width + x + shift) * 4));
            n++;
          }
        }
        best = Math.min(best, sum / n);
      }
      total += best;
    }
    return +(total / rounds).toFixed(3);
  };

  /**
   * The knight's death and the seal breaking, which is the stretch the player
   * watches without being able to look away.
   */
  const deathSequence = () => {
    g.state = 'playing';
    // Back to the door of the throne room; the tool starts past it.
    p.x = 540 * 32;
    p.y = 16 * 32;
    p.vx = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.dead = false;
    g.camera.snapTo(p.cx, p.cy);
    if (g.boss) {
      g.boss.reset();
      g.boss.dead = false;
      g.boss.hp = g.boss.maxHp;
    }
    g.bossDefeated = false;
    for (let i = 0; i < 400 && !(g.boss && g.boss.engaged); i++) tick({ right: true });
    const boss = g.boss;
    if (!boss || !boss.engaged) return null;
    p.invuln = 99999;
    boss.hp = 1;
    boss.vulnerable = true;
    boss.state = 'idle';
    boss.hurt(99, 1, g);
    const xs = [];
    const ys = [];
    let shaking = 0;
    for (let f = 0; f < 60 * 6; f++) {
      p.invuln = 99999;
      tick({ right: f > 200 });
      xs.push(g.camera.renderX);
      ys.push(g.camera.renderY);
      if (g.camera.shake > 0.05) shaking++;
    }
    let reversals = 0;
    let lastX = 0;
    let lastY = 0;
    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i] - xs[i - 1];
      const dy = ys[i] - ys[i - 1];
      if (dy !== 0) {
        if (lastY !== 0 && Math.sign(dy) !== Math.sign(lastY)) reversals++;
        lastY = Math.sign(dy);
      }
      if (dx !== 0) {
        if (lastX !== 0 && Math.sign(dx) !== Math.sign(lastX)) reversals++;
        lastX = Math.sign(dx);
      }
    }
    return { reversalsPerSecond: +(reversals / 6).toFixed(1), framesShaking: shaking };
  };

  const death = deathSequence();

  // Back on the flat ground of the warden's arena, which is a calm zone.
  g.player.x = 700 * 32;
  g.player.y = 17 * 32;
  g.player.vx = 0;
  g.player.vy = 0;
  g.camera.snapTo(g.player.cx, g.player.cy);
  for (const e of g.enemies) e.dead = true;
  const sky = backgroundResidue();

  return {
    ok:
      shaking.maxJump > 0 &&
      shaking.maxJump <= 5 &&
      shaking.reversalsPerSecond <= 22 &&
      offSetting === 0 &&
      quiet.maxJump === 0 &&
      onAgain === 1 &&
      sky <= 0.15 &&
      !!death &&
      death.reversalsPerSecond <= 4 &&
      death.framesShaking <= 120,
    shaking,
    quiet,
    toggledOff: offSetting === 0,
    toggledBackOn: onAgain === 1,
    calmZoneSkyResidue: sky,
    knightsDeath: death,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    `FAIL: shake must throw the picture at most ${MAX_JUMP} px per frame and reverse at most ` +
      `${MAX_REVERSALS} times a second, B must switch it off, the sky of a calm zone must ` +
      `stay under ${MAX_SKY_RESIDUE} once the scroll is taken out, and the knight's death must ` +
      `reverse at most ${MAX_DEATH_REVERSALS} times a second over at most ${MAX_DEATH_SHAKING} frames.`,
  );
  process.exit(1);
}
console.log(
  'OK: the screen swings and settles instead of strobing, the knight can fall without it, ' +
    'the sky of a calm zone holds still, and B turns it off.',
);
