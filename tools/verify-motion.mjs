/**
 * How violently the screen can move, and whether it can be switched off.
 *
 * Screen shake used to be a fresh random offset every frame. That is not an
 * impact, it is a strobe: the picture jumped up to ten pixels in a new
 * direction sixty times a second, and it was reported twice as painful to look
 * at. Two things have to hold now, and keep holding:
 *
 *  - a shake is a swing, not noise: consecutive frames move the same way, so
 *    the number of direction reversals stays low and the jump per frame small;
 *  - B turns it off completely, for anyone who still cannot take it.
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

  return {
    ok:
      shaking.maxJump > 0 &&
      shaking.maxJump <= 5 &&
      shaking.reversalsPerSecond <= 22 &&
      offSetting === 0 &&
      quiet.maxJump === 0 &&
      onAgain === 1,
    shaking,
    quiet,
    toggledOff: offSetting === 0,
    toggledBackOn: onAgain === 1,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

if (!result.ok) {
  console.error(
    `FAIL: shake must throw the picture at most ${MAX_JUMP} px per frame and reverse at most ` +
      `${MAX_REVERSALS} times a second, and B must switch it off.`,
  );
  process.exit(1);
}
console.log('OK: the screen swings and settles instead of strobing, and B turns it off.');
