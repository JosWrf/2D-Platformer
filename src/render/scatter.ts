import { Camera } from '../core/camera';
import { Rng } from '../core/math';
import { Level } from '../world/level';
import { TILE, Tile } from '../world/tiles';
import type { Light } from './lighting';
import { zoneAt } from './palette';

type PropKind =
  | 'tuft'
  | 'fern'
  | 'shroom'
  | 'flower'
  | 'rubble'
  | 'urn'
  | 'stalagmite'
  | 'shard'
  | 'bones'
  | 'candle'
  | 'vine'
  | 'stalactite'
  | 'chain';

interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** 0..1, fixed per prop: drives size, tilt and animation offset. */
  seed: number;
}

/** Props that light their surroundings, and the colour they cast. */
const GLOWING: Partial<Record<PropKind, { rgb: string; radius: number }>> = {
  shroom: { rgb: '128,236,190', radius: 74 },
  shard: { rgb: '99,230,255', radius: 66 },
  candle: { rgb: '255,178,96', radius: 82 },
};

/**
 * Scatters the level with the small things that make a place look inhabited:
 * grass and ferns in the forest, rubble in the ruins, glowing mushrooms and
 * stalagmites in the caves, bones and candles in the castle.
 *
 * Everything is derived from the tile map with a per-tile seed, so no level
 * data has to be maintained by hand and the result is identical on every run.
 * The throne room is left bare on purpose - the arena should read as swept.
 */
export class Scatter {
  /** Sorted by x, which lets the draw pass cut to the visible slice. */
  private readonly props: Prop[] = [];
  private readonly glowing: Prop[] = [];

  constructor(level: Level) {
    for (let tx = 0; tx < level.width; tx++) {
      for (let ty = 0; ty < level.height; ty++) {
        const tile = level.tileAt(tx, ty);
        const solid = tile === Tile.Solid || tile === Tile.Earth;
        if (!solid) continue;

        const zone = zoneAt(tx * TILE).name;
        if (zone === 'throne') continue;
        const rng = new Rng(tx * 7919 + ty * 104729 + 17);

        // Standing on a surface.
        if (level.tileAt(tx, ty - 1) === Tile.Empty) {
          const roll = rng.next();
          const kind = Scatter.surfaceProp(zone, roll, rng);
          if (kind) {
            this.push({
              kind,
              x: tx * TILE + rng.range(4, TILE - 4),
              y: ty * TILE,
              seed: rng.next(),
            });
          }
        }

        // Hanging from a ceiling.
        if (level.tileAt(tx, ty + 1) === Tile.Empty && rng.next() < 0.2) {
          const kind: PropKind =
            zone === 'caverns' || zone === 'rift'
              ? 'stalactite'
              : zone === 'castle'
                ? 'chain'
                : 'vine';
          this.push({
            kind,
            x: tx * TILE + rng.range(6, TILE - 6),
            y: (ty + 1) * TILE,
            seed: rng.next(),
          });
        }
      }
    }
  }

  private push(prop: Prop): void {
    this.props.push(prop);
    if (GLOWING[prop.kind]) this.glowing.push(prop);
  }

  private static surfaceProp(zone: string, roll: number, rng: Rng): PropKind | null {
    switch (zone) {
      case 'forest':
        if (roll < 0.34) return 'tuft';
        if (roll < 0.46) return 'fern';
        if (roll < 0.52) return 'flower';
        if (roll < 0.56) return 'shroom';
        return null;
      case 'ruins':
        if (roll < 0.2) return 'tuft';
        if (roll < 0.32) return 'rubble';
        if (roll < 0.38) return 'urn';
        if (roll < 0.42) return 'shroom';
        return null;
      case 'caverns':
        if (roll < 0.22) return 'stalagmite';
        if (roll < 0.34) return 'shroom';
        if (roll < 0.4) return rng.next() < 0.5 ? 'shard' : 'rubble';
        return null;
      case 'castle':
        if (roll < 0.14) return 'rubble';
        if (roll < 0.22) return 'bones';
        if (roll < 0.27) return 'candle';
        return null;
      case 'rift':
        if (roll < 0.2) return 'shard';
        if (roll < 0.3) return 'rubble';
        if (roll < 0.34) return 'bones';
        return null;
      default:
        return null;
    }
  }

  /** Lights from the glowing props currently on screen. */
  collectLights(camera: Camera, viewW: number, viewH: number, out: Light[]): void {
    const left = camera.x - 140;
    const right = camera.x + viewW + 140;
    for (const prop of this.glowing) {
      if (prop.x < left || prop.x > right) continue;
      if (prop.y < camera.y - 200 || prop.y > camera.y + viewH + 200) continue;
      const glow = GLOWING[prop.kind];
      if (!glow) continue;
      out.push({
        x: prop.x,
        y: prop.y - 6,
        radius: glow.radius * (0.8 + prop.seed * 0.4),
        rgb: glow.rgb,
        strength: 0.5,
        tint: 0.26,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, viewW: number, time: number): void {
    const left = camera.x - 60;
    const right = camera.x + viewW + 60;
    // The array is sorted by x, so a binary search finds the visible slice.
    let lo = 0;
    let hi = this.props.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.props[mid].x < left) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.props.length && this.props[i].x <= right; i++) {
      const prop = this.props[i];
      ctx.save();
      ctx.translate(Math.round(prop.x), Math.round(prop.y));
      Scatter.drawProp(ctx, prop, time);
      ctx.restore();
    }
  }

  private static drawProp(ctx: CanvasRenderingContext2D, prop: Prop, time: number): void {
    const s = prop.seed;
    const sway = Math.sin(time * 1.3 + s * 9) * (1 + s);

    switch (prop.kind) {
      case 'tuft': {
        ctx.fillStyle = s < 0.5 ? '#2f7a3c' : '#3c9147';
        for (let i = 0; i < 3; i++) {
          const lean = sway * (0.4 + i * 0.3);
          ctx.fillRect(-3 + i * 3 + lean * 0.4, -3 - i, 2, 3 + i * 2);
          ctx.fillRect(-3 + i * 3 + lean, -6 - i * 2, 2, 3);
        }
        break;
      }
      case 'fern': {
        ctx.fillStyle = '#256b39';
        for (let i = 0; i < 4; i++) {
          const a = -1.9 + i * 0.42 + sway * 0.05;
          const len = 9 + s * 6;
          ctx.save();
          ctx.rotate(a);
          ctx.fillRect(0, -1, len, 2);
          ctx.fillRect(len * 0.5, -3, 3, 2);
          ctx.restore();
        }
        break;
      }
      case 'flower': {
        ctx.fillStyle = '#2f7a3c';
        ctx.fillRect(sway * 0.3, -7, 1.5, 7);
        ctx.fillStyle = s < 0.5 ? '#e8e0f6' : '#f2c14e';
        ctx.beginPath();
        ctx.arc(sway * 0.3 + 0.7, -8, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'shroom': {
        // The one prop that carries light: cap glows, stem stays dark.
        const h = 5 + s * 5;
        const r = 3 + s * 3;
        const pulse = 0.75 + Math.sin(time * 1.7 + s * 8) * 0.25;
        ctx.fillStyle = '#1d3a33';
        ctx.fillRect(-1, -h, 2, h);
        const g = ctx.createRadialGradient(0, -h, 0, 0, -h, r * 3.4);
        g.addColorStop(0, `rgba(128,236,190,${(0.17 * pulse).toFixed(3)})`);
        g.addColorStop(1, 'rgba(128,236,190,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-r * 3.4, -h - r * 3.4, r * 6.8, r * 6.8);
        ctx.fillStyle = '#3f9a74';
        ctx.beginPath();
        ctx.ellipse(0, -h, r * 1.25, r * 0.5, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#6bbd99';
        ctx.fillRect(-r * 0.4, -h - r * 0.5, r * 0.5, 1.5);
        break;
      }
      case 'rubble': {
        ctx.fillStyle = '#3a3446';
        ctx.fillRect(-5, -3, 5, 3);
        ctx.fillRect(1, -4, 4, 4);
        ctx.fillStyle = '#4e4759';
        ctx.fillRect(-5, -3, 5, 1);
        ctx.fillRect(1, -4, 4, 1);
        break;
      }
      case 'urn': {
        ctx.fillStyle = '#6a4b39';
        ctx.beginPath();
        ctx.ellipse(0, -5, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a6448';
        ctx.fillRect(-2, -11, 4, 3);
        ctx.fillStyle = 'rgba(255,220,180,0.18)';
        ctx.fillRect(-3, -8, 2, 5);
        break;
      }
      case 'stalagmite': {
        const h = 9 + s * 16;
        ctx.fillStyle = '#2a2f42';
        ctx.beginPath();
        ctx.moveTo(-3 - s * 2, 0);
        ctx.lineTo(0, -h);
        ctx.lineTo(3 + s * 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(120,180,220,0.16)';
        ctx.fillRect(-1, -h + 2, 1.5, h - 3);
        break;
      }
      case 'shard': {
        const h = 7 + s * 9;
        ctx.fillStyle = 'rgba(72,168,196,0.7)';
        ctx.beginPath();
        ctx.moveTo(-2.5, 0);
        ctx.lineTo(0, -h);
        ctx.lineTo(2.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(150,196,214,0.7)';
        ctx.fillRect(-0.6, -h + 2, 1.2, h - 3);
        break;
      }
      case 'bones': {
        ctx.fillStyle = '#b9bcc9';
        ctx.save();
        ctx.rotate((s - 0.5) * 0.6);
        ctx.fillRect(-6, -2, 12, 2);
        ctx.beginPath();
        ctx.arc(-6, -1, 1.8, 0, Math.PI * 2);
        ctx.arc(6, -1, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'candle': {
        const flicker = 0.8 + Math.sin(time * 8 + s * 11) * 0.2;
        ctx.fillStyle = '#9c948a';
        ctx.fillRect(-1.5, -8, 3, 8);
        const g = ctx.createRadialGradient(0, -10, 0, 0, -10, 12);
        g.addColorStop(0, `rgba(255,190,110,${(0.22 * flicker).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-12, -22, 24, 24);
        ctx.fillStyle = '#c08f58';
        ctx.beginPath();
        ctx.ellipse(0, -10, 1.6, 2.6 * flicker, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'vine': {
        const len = 14 + s * 30;
        ctx.strokeStyle = '#1f5a33';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let y = 0; y < len; y += 6) {
          ctx.lineTo(Math.sin(time * 0.9 + s * 7 + y * 0.12) * (y / len) * 3, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#2f7a3c';
        for (let y = 8; y < len; y += 11) {
          const wob = Math.sin(time * 0.9 + s * 7 + y * 0.12) * (y / len) * 3;
          ctx.fillRect(wob - 3, y, 3, 2);
          ctx.fillRect(wob + 1, y + 4, 3, 2);
        }
        break;
      }
      case 'stalactite': {
        const h = 10 + s * 18;
        ctx.fillStyle = '#242a3c';
        ctx.beginPath();
        ctx.moveTo(-3 - s * 2, 0);
        ctx.lineTo(0, h);
        ctx.lineTo(3 + s * 2, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'chain': {
        const len = 12 + s * 26;
        ctx.fillStyle = '#4a4652';
        for (let y = 0; y < len; y += 6) {
          ctx.fillRect(-2, y, 4, 4);
        }
        break;
      }
    }
  }
}
