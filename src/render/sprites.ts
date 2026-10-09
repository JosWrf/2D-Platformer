import { makeCanvas } from './pixel';

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 1,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Soft elliptical shadow under a character. */
export function shadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  width: number,
  strength = 0.35,
): void {
  ctx.globalAlpha = strength;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(cx, groundY, width * 0.5, width * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The crescent trail of a sword swing. */
export function slashArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  thickness: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();
  ctx.lineWidth = thickness * 0.4;
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();
}

/**
 * The swept trail of a blade: a crescent that starts as a thin wisp where the
 * swing began, swells in the middle and runs out into a sharp point at the
 * blade's current position. Drawn as a filled ribbon plus a white core, so it
 * reads as one shape instead of a stroked line of constant width.
 */
export function slashCrescent(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  thickness: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.01 || Math.abs(endAngle - startAngle) < 0.02) return;
  const steps = 22;

  const ribbon = (widthScale: number, radiusScale: number): void => {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startAngle + (endAngle - startAngle) * t;
      // Thin at the tail, widest just behind the head, a point at the tip.
      const w = thickness * widthScale * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.68)) ** 0.8;
      const r = radius * radiusScale * (0.84 + 0.16 * t);
      const px = cx + Math.cos(a) * (r + w);
      const py = cy + Math.sin(a) * (r + w);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const a = startAngle + (endAngle - startAngle) * t;
      const w = thickness * widthScale * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.68)) ** 0.8;
      const r = radius * radiusScale * (0.84 + 0.16 * t);
      ctx.lineTo(cx + Math.cos(a) * (r - w), cy + Math.sin(a) * (r - w));
    }
    ctx.closePath();
    ctx.fill();
  };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Soft outer glow.
  ctx.globalAlpha = alpha * 0.4;
  ctx.fillStyle = color;
  ribbon(1.5, 1);
  // The body of the slash.
  ctx.globalAlpha = alpha * 0.85;
  ribbon(1, 1);
  // Hot white core, slightly ahead of the body so the leading edge burns.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ribbon(0.34, 1.01);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Above this a struck sprite is drawn all white; below it the white fades. */
const FLASH_SOLID = 0.8;
const flashLayers = new Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();

/**
 * A sprite taking a hit: all white for its first two or three frames, then a
 * fading white laid over it, which the palette turns into a dither.
 *
 * The sprite is drawn into a layer of its own - the size of the canvas it is
 * meant for, under the same transform - whitened there with source-atop, so
 * only the sprite and never what is under it, and laid on in one go. The draw
 * is handed the layer's context to draw with. This used to be a canvas filter
 * (brightness and saturate), which the browser runs over a layer the size of
 * the whole canvas for every draw - tens of milliseconds on a canvas kept in
 * main memory - and which turned the struck hero lilac rather than white.
 */
export function withHitFlash(
  ctx: CanvasRenderingContext2D,
  flash: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (flash <= 0) {
    draw(ctx);
    return;
  }
  const { width, height } = ctx.canvas;
  const key = `${width}x${height}`;
  let layer = flashLayers.get(key);
  if (!layer) {
    layer = makeCanvas(width, height);
    flashLayers.set(key, layer);
  }
  const f = layer.ctx;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalAlpha = 1;
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, width, height);
  f.setTransform(ctx.getTransform());
  draw(f);
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalAlpha = flash >= FLASH_SOLID ? 1 : (flash / FLASH_SOLID) * 0.35;
  f.globalCompositeOperation = 'source-atop';
  f.fillStyle = '#ffffff';
  f.fillRect(0, 0, width, height);
  f.globalCompositeOperation = 'source-over';
  f.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}
