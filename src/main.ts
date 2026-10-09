import { audio } from './core/audio';
import { Input } from './core/input';
import { Loop } from './core/loop';
import { Game, VIEW_H, VIEW_W } from './game';
import { ZONES } from './render/palette';
import { ART_H, ART_W } from './render/pixel';

const canvas = document.getElementById('game') as HTMLCanvasElement;
// The screen canvas is the art buffer's size and lives in main memory with
// the game's other canvases (see makeCanvas); the browser scales it up.
canvas.width = ART_W;
canvas.height = ART_H;
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled = false;

const game = new Game();
const input = new Input();
input.attach(window);

/**
 * Fit the picture into the window, pixel for pixel.
 *
 * The canvas holds the 480×270 art buffer (render/pixel.ts) itself, and the
 * browser shows it at a whole number of device pixels per art pixel - the
 * most that fits - with the rest of the window left around it. It used to be
 * stretched by whatever fraction fitted, which made some pixels one screen
 * pixel wide and their neighbours two, and it was drawn at the device's own
 * resolution, so a HiDPI screen saw a finer drawing of every sprite than any
 * other screen did.
 *
 * The floor of the old fit was 0.4, which hung the picture over both edges on
 * a phone held upright; a picture too small for one whole pixel per art pixel
 * still shrinks, by the fraction it needs, rather than be cut off.
 */
function resize(): void {
  const frame = document.getElementById('frame') as HTMLElement;
  const legendHeight = window.innerHeight > 620 ? 70 : 24;
  const pad = window.innerWidth < 520 ? 8 : 32;
  const maxW = window.innerWidth - pad;
  const maxH = window.innerHeight - legendHeight;
  const dpr = window.devicePixelRatio || 1;
  // Device pixels per art pixel.
  const fit = Math.min((maxW * dpr) / ART_W, (maxH * dpr) / ART_H);
  const cssScale = (fit >= 1 ? Math.floor(fit) : fit) / dpr;
  canvas.style.width = `${ART_W * cssScale}px`;
  canvas.style.height = `${ART_H * cssScale}px`;
  frame.style.width = `${ART_W * cssScale + 4}px`;
  // The game draws in its 960×540 logical view.
  ctx.setTransform(ART_W / VIEW_W, 0, 0, ART_H / VIEW_H, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
resize();
window.addEventListener('resize', resize);

for (const evt of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(evt, () => audio.unlock(), { once: true });
}

const loop = new Loop(
  (dt) => game.update(dt, input),
  () => game.render(ctx),
);
loop.start();

/* Debug hooks: `?x=<tile>` jumps into the level, `?state=playing` skips the title. */
const params = new URLSearchParams(location.search);
if (params.get('state') === 'playing') game.state = 'playing';
const warp = params.get('x');
if (warp !== null) {
  game.state = 'playing';
  game.warpTo(Number(warp));
}

declare global {
  interface Window {
    game: Game;
    input: Input;
    loop: Loop;
    audio: typeof audio;
    zones: typeof ZONES;
  }
}
window.game = game;
window.input = input;
window.loop = loop;
window.audio = audio;
window.zones = ZONES;
