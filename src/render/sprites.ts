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

/**
 * Flash a sprite white while it is taking damage. Uses a canvas filter so only
 * the sprite drawn inside the callback is affected.
 */
export function withHitFlash(
  ctx: CanvasRenderingContext2D,
  flash: number,
  draw: () => void,
): void {
  if (flash > 0) {
    ctx.save();
    const amount = 1 + Math.min(1, flash) * 1.5;
    ctx.filter = `brightness(${amount.toFixed(2)}) saturate(0.5)`;
    draw();
    ctx.restore();
  } else {
    draw();
  }
}
