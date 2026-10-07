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

/**
 * One relic, as a small round badge: a dark disc, its sign in its colour, and
 * - for the ones that fill up or wear off - a ring round it showing how far.
 * `lit` dims the sign while the relic is spent (a torn shield, a used second
 * breath), so what is ready and what is not reads at a glance.
 */
export function drawRelicBadge(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  color: string,
  lit: boolean,
  fill: number | null,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(8,10,20,0.78)';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,175,220,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (fill !== null) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(fill, 0, 1));
    ctx.stroke();
  }
  ctx.globalAlpha = lit ? 1 : 0.32;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  switch (id) {
    case 'herzkern':
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.bezierCurveTo(-7, -1, -4, -6, 0, -2.5);
      ctx.bezierCurveTo(4, -6, 7, -1, 0, 5);
      ctx.fill();
      ctx.fillStyle = '#fff2f4';
      ctx.fillRect(-1, -1, 2, 2);
      break;
    case 'goldzahn':
      ctx.beginPath();
      ctx.moveTo(-4.5, -5);
      ctx.lineTo(4.5, -5);
      ctx.quadraticCurveTo(5, 0, 2, 2);
      ctx.lineTo(0.8, 6);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-0.8, 6);
      ctx.lineTo(-2, 2);
      ctx.quadraticCurveTo(-5, 0, -4.5, -5);
      ctx.fill();
      break;
    case 'bebenfaust':
      ctx.beginPath();
      ctx.moveTo(-6, 5);
      ctx.lineTo(-2, -1);
      ctx.lineTo(1, 2);
      ctx.lineTo(3, -5);
      ctx.lineTo(6, 5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'seidenmantel':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * -6, Math.sin(a) * -6);
        ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'glutklinge':
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.quadraticCurveTo(5.5, -1, 3.5, 4);
      ctx.quadraticCurveTo(0, 7, -3.5, 4);
      ctx.quadraticCurveTo(-5.5, -1, 0, -6.5);
      ctx.fill();
      ctx.fillStyle = '#ffe9b8';
      ctx.beginPath();
      ctx.ellipse(0, 2.5, 1.6, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'flutklinge':
    case 'klingenwelle':
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.quadraticCurveTo(1, -6, -6, -4);
      ctx.quadraticCurveTo(0, 0, -6, 4);
      ctx.quadraticCurveTo(1, 6, 6, 0);
      ctx.fill();
      break;
    case 'blutdurst':
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.quadraticCurveTo(5, 0, 4, 3);
      ctx.arc(0, 2.5, 4, 0.1, Math.PI - 0.1);
      ctx.quadraticCurveTo(-5, 0, 0, -6.5);
      ctx.fill();
      break;
    case 'schattenschritt':
      for (const dx of [-3, 2]) {
        ctx.beginPath();
        ctx.moveTo(dx - 2, -5);
        ctx.lineTo(dx + 2.5, 0);
        ctx.lineTo(dx - 2, 5);
        ctx.stroke();
      }
      break;
    case 'zweiteratem':
      ctx.beginPath();
      ctx.arc(0, 1, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -4.5, 5, 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'splitterparade':
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(3.5, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-3.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(-0.6, -4, 1.2, 6);
      break;
    case 'hydrablut':
      // A leaf growing from a stem: what is cut, grows back.
      ctx.beginPath();
      ctx.moveTo(-4, 6);
      ctx.quadraticCurveTo(-5, -2, 4, -6);
      ctx.quadraticCurveTo(4, 3, -4, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,40,16,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, 5);
      ctx.lineTo(3, -4.5);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

export interface BossBarInfo {
  name: string;
  hp: number;
  maxHp: number;
  ghost: number;
  phase: number;
  /**
   * One mark per part, for a boss whose fight is not one bar coming down.
   * 'head' still has to be cut, 'stump' is cut but counting back, 'sealed' is
   * finished - the hydra's whole state in five symbols.
   */
  pips?: ('head' | 'stump' | 'sealed')[];
  /** Seconds left on the shortest open stump, 0..1 of its full time. */
  pipUrgency?: number[];
}

/**
 * The hydra's five necks under her bar: a head still to cut, an open stump with
 * the seconds it has left drawn round it, or a burned-out ring. A player has to
 * be able to see at a glance which of his cuts are about to come undone.
 */
function drawPips(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  pips: ('head' | 'stump' | 'sealed')[],
  urgency: number[],
): void {
  const gap = 34;
  const first = cx - ((pips.length - 1) * gap) / 2;
  for (const [i, pip] of pips.entries()) {
    const px = first + i * gap;
    ctx.save();
    ctx.translate(px, y);
    if (pip === 'head') {
      ctx.fillStyle = '#8fd45c';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(24,44,20,0.9)';
      ctx.beginPath();
      ctx.arc(1.5, -1.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (pip === 'stump') {
      const left = clamp(urgency[i] ?? 1, 0, 1);
      ctx.fillStyle = 'rgba(190,255,150,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = left < 0.34 ? '#ff9a78' : '#c8ffa0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(150,150,150,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,150,70,0.5)';
      ctx.beginPath();
      ctx.moveTo(-4.5, -4.5);
      ctx.lineTo(4.5, 4.5);
      ctx.moveTo(4.5, -4.5);
      ctx.lineTo(-4.5, 4.5);
      ctx.stroke();
    }
    ctx.restore();
  }
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

  if (info.pips && info.pips.length) {
    drawPips(ctx, viewW / 2, y + 24, info.pips, info.pipUrgency ?? []);
  } else {
    // Phase notches.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (const p of [0.3, 0.62]) ctx.fillRect(x + w * p, y, 2, 12);
  }

  if (intro > 0) {
    ctx.globalAlpha = clamp(intro, 0, 1);
    glow(ctx, viewW / 2, y + 6, 220, 'rgba(255,60,50,0.25)');
    ctx.globalAlpha = 1;
  }
}
