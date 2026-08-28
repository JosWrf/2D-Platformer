import { audio } from './core/audio';
import { Input } from './core/input';
import { Loop } from './core/loop';
import { Game, VIEW_H, VIEW_W } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled = false;

const game = new Game();
const input = new Input();
input.attach(window);

/** Fit the canvas into the window while keeping the 16:9 logical resolution. */
function resize(): void {
  const frame = document.getElementById('frame') as HTMLElement;
  const legendHeight = window.innerHeight > 620 ? 70 : 24;
  const maxW = window.innerWidth - 32;
  const maxH = window.innerHeight - legendHeight;
  const scale = Math.max(0.4, Math.min(maxW / VIEW_W, maxH / VIEW_H));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(VIEW_W * dpr);
  canvas.height = Math.round(VIEW_H * dpr);
  canvas.style.width = `${Math.round(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.round(VIEW_H * scale)}px`;
  frame.style.width = `${Math.round(VIEW_W * scale) + 4}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  }
}
window.game = game;
window.input = input;
window.loop = loop;
