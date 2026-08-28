import { clamp } from '../core/math';
import { PALETTE } from '../render/palette';
import { fillRoundRect, glow } from '../render/sprites';

export const FONT_STACK = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';

export function font(size: number, weight = 700): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

export function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  filled: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(-11, -2, -6, -10, 0, -4);
  ctx.bezierCurveTo(6, -10, 11, -2, 0, 7);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = PALETTE.hearts;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-3.2, -3, 1.8, 1.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(20,16,26,0.65)';
    ctx.fill();
    ctx.strokeStyle = PALETTE.heartsDark;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.72,
): void {
  ctx.globalAlpha = alpha;
  fillRoundRect(ctx, x, y, w, h, 10, '#0a0c16');
  ctx.globalAlpha = Math.min(1, alpha + 0.2);
  ctx.strokeStyle = 'rgba(150,170,225,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = 1;
}

export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 700,
  shadowColor = 'rgba(0,0,0,0.75)',
): void {
  ctx.font = font(size, weight);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = shadowColor;
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

export interface BossBarInfo {
  name: string;
  hp: number;
  maxHp: number;
  ghost: number;
  phase: number;
}

export function drawBossBar(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  info: BossBarInfo,
  intro: number,
): void {
  const w = Math.min(620, viewW - 120);
  const x = (viewW - w) / 2;
  const y = viewH - 54;
  const ratio = clamp(info.hp / info.maxHp, 0, 1);
  const ghostRatio = clamp(info.ghost / info.maxHp, 0, 1);

  drawPanel(ctx, x - 8, y - 22, w + 16, 44, 0.66);
  drawTextCentered(ctx, info.name, viewW / 2, y - 6, 13, '#ffd9d0');

  ctx.fillStyle = '#1d1420';
  ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = 'rgba(255,120,90,0.45)';
  ctx.fillRect(x, y, w * ghostRatio, 12);
  const g = ctx.createLinearGradient(x, y, x, y + 12);
  g.addColorStop(0, '#ff7a5c');
  g.addColorStop(1, '#b3211f');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * ratio, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, w * ratio, 3);
  ctx.strokeStyle = 'rgba(255,190,170,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 11);

  // Phase notches.
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (const p of [0.3, 0.62]) ctx.fillRect(x + w * p, y, 2, 12);

  if (intro > 0) {
    ctx.globalAlpha = clamp(intro, 0, 1);
    glow(ctx, viewW / 2, y + 6, 220, 'rgba(255,60,50,0.25)');
    ctx.globalAlpha = 1;
  }
}
