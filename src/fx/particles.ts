import { rand } from '../core/math';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: 'square' | 'circle' | 'spark';
  drag: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}

export class Particles {
  readonly items: Particle[] = [];
  readonly texts: FloatingText[] = [];
  private readonly max = 900;

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.items.length >= this.max) this.items.shift();
    const life = p.life ?? rand(0.3, 0.7);
    this.items.push({
      vx: 0,
      vy: 0,
      size: 3,
      color: '#ffffff',
      gravity: 480,
      shape: 'square',
      drag: 0.9,
      ...p,
      life,
      maxLife: life,
    });
  }

  burst(
    x: number,
    y: number,
    count: number,
    color: string,
    opts: { speed?: number; gravity?: number; size?: number; shape?: Particle['shape']; spread?: number; angle?: number } = {},
  ): void {
    const speed = opts.speed ?? 140;
    const spread = opts.spread ?? Math.PI * 2;
    const base = opts.angle ?? 0;
    for (let i = 0; i < count; i++) {
      const a = base + rand(-spread / 2, spread / 2);
      const s = speed * rand(0.35, 1);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color,
        gravity: opts.gravity ?? 460,
        size: opts.size ?? rand(2, 4),
        shape: opts.shape ?? 'square',
        life: rand(0.25, 0.65),
      });
    }
  }

  text(x: number, y: number, text: string, color = '#f2c14e'): void {
    this.texts.push({ x, y, vy: -34, life: 0.9, text, color });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.94;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const a = Math.min(1, p.life / (p.maxLife * 0.6));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'spark') {
        const len = Math.max(2, Math.hypot(p.vx, p.vy) * 0.03);
        const ang = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.fillRect(-len, -p.size * 0.35, len * 2, p.size * 0.7);
        ctx.restore();
      } else {
        const s = p.size * a;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.font = '700 14px ui-monospace, monospace';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  clear(): void {
    this.items.length = 0;
    this.texts.length = 0;
  }
}
