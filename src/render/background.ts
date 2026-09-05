import { Camera } from '../core/camera';
import { Zone, mixHex, zoneBlend } from './palette';

/** Procedural parallax backdrop: near-black sky, two hill layers and motes. */
export class Background {

  constructor(
    private readonly viewW: number,
    private readonly viewH: number,
  ) {
  }

  private static hills(
    ctx: CanvasRenderingContext2D,
    color: string,
    scrollX: number,
    baseY: number,
    amplitude: number,
    frequency: number,
    seed: number,
    viewW: number,
    viewH: number,
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, viewH);
    const step = 8;
    for (let sx = 0; sx <= viewW + step; sx += step) {
      const wx = (sx + scrollX) * frequency;
      const h =
        Math.sin(wx * 0.008 + seed) * amplitude +
        Math.sin(wx * 0.021 + seed * 2.3) * amplitude * 0.45 +
        Math.sin(wx * 0.005 + seed * 0.7) * amplitude * 0.8;
      ctx.lineTo(sx, baseY - h);
    }
    ctx.lineTo(viewW, viewH);
    ctx.closePath();
    ctx.fill();
  }

  /** Dark stone hall / cavern backdrop used instead of the sky indoors. */
  private drawInterior(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    time: number,
    throne: boolean,
  ): void {
    const { viewW, viewH } = this;
    const base = ctx.createLinearGradient(0, 0, 0, viewH);
    if (throne) {
      base.addColorStop(0, '#120610');
      base.addColorStop(0.55, '#2a0a14');
      base.addColorStop(1, '#160610');
    } else {
      base.addColorStop(0, '#06101a');
      base.addColorStop(0.55, '#0d2233');
      base.addColorStop(1, '#050d16');
    }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, viewW, viewH);

    // Far masonry wall.
    const brickW = 96;
    const brickH = 48;
    const scroll = camera.x * 0.18;
    const scrollY = camera.y * 0.1;
    ctx.strokeStyle = throne ? 'rgba(255,150,150,0.05)' : 'rgba(150,210,255,0.05)';
    ctx.lineWidth = 2;
    for (let row = -1; row * brickH - scrollY < viewH + brickH; row++) {
      const y = row * brickH - (scrollY % brickH);
      const offset = row % 2 === 0 ? 0 : brickW / 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
      ctx.stroke();
      for (let col = -1; col * brickW < viewW + brickW; col++) {
        const x = col * brickW + offset - (scroll % brickW);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + brickH);
        ctx.stroke();
      }
    }

    // Colonnade: pillars / stalagmite columns at a nearer parallax.
    const pillarScroll = camera.x * 0.4;
    const spacing = 220;
    ctx.fillStyle = throne ? 'rgba(28,8,14,0.85)' : 'rgba(6,20,30,0.85)';
    for (let i = -1; i * spacing < viewW + spacing; i++) {
      const x = i * spacing - (pillarScroll % spacing);
      const w = 46;
      ctx.fillRect(x, -20 - camera.y * 0.12, w, viewH + 80);
      ctx.fillStyle = throne ? 'rgba(60,16,26,0.7)' : 'rgba(16,44,60,0.7)';
      ctx.fillRect(x, -20 - camera.y * 0.12, 8, viewH + 80);
      // Capital + base.
      ctx.fillRect(x - 8, 40 - camera.y * 0.12, w + 16, 16);
      ctx.fillStyle = throne ? 'rgba(28,8,14,0.85)' : 'rgba(6,20,30,0.85)';
    }

    if (throne) {
      // Hanging banners between the pillars.
      for (let i = -1; i * spacing < viewW + spacing; i++) {
        const x = i * spacing - (pillarScroll % spacing) + spacing / 2;
        const y = 30 - camera.y * 0.12;
        const wob = Math.sin(time * 0.9 + i) * 3;
        ctx.fillStyle = 'rgba(96,18,26,0.55)';
        ctx.beginPath();
        ctx.moveTo(x - 26, y);
        ctx.lineTo(x + 26, y);
        ctx.lineTo(x + 22 + wob, y + 180);
        ctx.lineTo(x, y + 200);
        ctx.lineTo(x - 22 + wob, y + 180);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(210,60,50,0.25)';
        ctx.fillRect(x - 4, y + 40, 8, 8);
        ctx.fillRect(x - 12, y + 56, 24, 6);
      }
      // Embers rising from the floor of the hall.
      for (let i = 0; i < 18; i++) {
        const px = ((i * 137 + time * 22) % (viewW + 60)) - 30;
        const py = viewH - ((i * 91 + time * 46) % (viewH + 100));
        ctx.globalAlpha *= 1;
        ctx.fillStyle = `rgba(255,${110 + (i % 5) * 12},60,0.35)`;
        ctx.fillRect(px, py, 2.5, 2.5);
      }
    } else {
      // Cave glow pockets.
      for (let i = -1; i * 340 < viewW + 340; i++) {
        const x = i * 340 - ((camera.x * 0.35) % 340);
        const y = viewH * 0.62 - camera.y * 0.1 + Math.sin(i * 2.1) * 60;
        const g = ctx.createRadialGradient(x, y, 4, x, y, 130);
        g.addColorStop(0, 'rgba(70,190,225,0.13)');
        g.addColorStop(1, 'rgba(70,190,225,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 130, y - 130, 260, 260);
      }
    }

    // Depth haze towards the bottom.
    const haze = ctx.createLinearGradient(0, viewH * 0.5, 0, viewH);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(1, throne ? 'rgba(40,4,10,0.55)' : 'rgba(2,10,18,0.6)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    const { viewW, viewH } = this;
    const focusX = camera.x + viewW / 2;
    const { from, to, t } = zoneBlend(focusX);
    const zone: Zone = t > 0 ? { ...from, ...to } : from;
    const skyTop = mixHex(from.skyTop, to.skyTop, t);
    const skyBottom = mixHex(from.skyBottom, to.skyBottom, t);
    const hillFar = mixHex(from.hillFar, to.hillFar, t);
    const hillNear = mixHex(from.hillNear, to.hillNear, t);

    const sky = ctx.createLinearGradient(0, 0, 0, viewH);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);

    Background.hills(ctx, hillFar, camera.x * 0.12, viewH * 0.74 - camera.y * 0.06, 46, 1, 1.7, viewW, viewH);
    Background.hills(ctx, hillNear, camera.x * 0.28, viewH * 0.88 - camera.y * 0.12, 62, 1.4, 4.1, viewW, viewH);

    // Interior zones (caves, throne hall) replace the sky with walls.
    const interiorAmount = (from.interior ? 1 - t : 0) + (to.interior ? t : 0);
    if (interiorAmount > 0.002) {
      ctx.globalAlpha = Math.min(1, interiorAmount);
      this.drawInterior(ctx, camera, time, to.name === 'throne' || (from.name === 'throne' && t < 0.5));
      ctx.globalAlpha = 1;
    }

    // Ambient colour wash for the current zone.
    ctx.fillStyle = t > 0 ? to.ambient : zone.ambient;
    ctx.fillRect(0, 0, viewW, viewH);

  }
}
