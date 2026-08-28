import { Camera } from '../core/camera';
import { PALETTE, mixHex, zoneAt } from './palette';
import { Level } from '../world/level';
import { TILE, Tile } from '../world/tiles';
import { glow } from './sprites';

interface ZoneTileColors {
  body: string;
  bodyDark: string;
  top: string;
  topLight: string;
  edge: string;
  /** Indoor zones use carved stone ledges instead of wooden planks. */
  stoneLedges: boolean;
}

function colorsForZone(x: number): ZoneTileColors {
  switch (zoneAt(x).name) {
    case 'forest':
      return {
        body: PALETTE.dirt,
        bodyDark: PALETTE.dirtDark,
        top: PALETTE.grass,
        topLight: PALETTE.grassLight,
        edge: PALETTE.grassDark,
        stoneLedges: false,
      };
    case 'ruins':
      return {
        body: '#3a3348',
        bodyDark: '#241f2f',
        top: '#5d7a52',
        topLight: '#7d9c6c',
        edge: '#39502f',
        stoneLedges: false,
      };
    case 'caverns':
      return {
        body: '#243347',
        bodyDark: '#151f2e',
        top: '#2f6f86',
        topLight: '#49a6bd',
        edge: '#1c4a5c',
        stoneLedges: true,
      };
    case 'castle':
      return {
        body: '#38303a',
        bodyDark: '#231d26',
        top: '#5a4048',
        topLight: '#7d5a60',
        edge: '#3a262c',
        stoneLedges: true,
      };
    default:
      return {
        body: '#3a2028',
        bodyDark: '#22121a',
        top: '#6a2630',
        topLight: '#96343f',
        edge: '#471a22',
        stoneLedges: true,
      };
  }
}

/** Draws every tile currently inside the camera view. */
export function drawTilemap(
  ctx: CanvasRenderingContext2D,
  level: Level,
  camera: Camera,
  time: number,
): void {
  const x0 = Math.max(0, Math.floor(camera.renderX / TILE) - 1);
  const x1 = Math.min(level.width - 1, Math.floor((camera.renderX + camera.viewW) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(camera.renderY / TILE) - 1);
  const y1 = Math.min(level.height - 1, Math.floor((camera.renderY + camera.viewH) / TILE) + 1);

  let colors = colorsForZone(x0 * TILE);
  let colorZoneX = -1;

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const tile = level.tileAt(tx, ty);
      if (tile === Tile.Empty) continue;
      const px = tx * TILE;
      const py = ty * TILE;
      if (tx !== colorZoneX) {
        colors = colorsForZone(px);
        colorZoneX = tx;
      }
      const noise = level.noiseAt(tx, ty);

      switch (tile) {
        case Tile.Solid:
        case Tile.Earth:
          drawBlock(ctx, level, tx, ty, px, py, tile, colors, noise, time);
          break;
        case Tile.Gate:
          if (level.gateClosed) drawGate(ctx, px, py, time, ty);
          break;
        case Tile.Platform:
          drawPlatform(ctx, px, py, colors, noise);
          break;
        case Tile.Spike:
          drawSpikes(ctx, px, py, noise);
          break;
        case Tile.LavaTop:
          drawLavaTop(ctx, px, py, time, tx);
          break;
        case Tile.Lava:
          ctx.fillStyle = '#8f2a12';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(255,120,40,0.25)';
          ctx.fillRect(px, py, TILE, 6);
          break;
        default:
          break;
      }
    }
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  level: Level,
  tx: number,
  ty: number,
  px: number,
  py: number,
  tile: Tile,
  colors: ZoneTileColors,
  noise: number,
  time: number,
): void {
  const above = level.tileAt(tx, ty - 1);
  // Spikes and lava sit on the surface, so the tile under them stays bare.
  const openAbove = !level.solidAt(tx, ty - 1) && above !== Tile.Spike && above !== Tile.LavaTop && above !== Tile.Lava;
  const isStone = tile === Tile.Solid;

  const base = isStone ? PALETTE.stone : colors.body;
  const dark = isStone ? PALETTE.stoneDark : colors.bodyDark;

  const grad = ctx.createLinearGradient(0, py, 0, py + TILE);
  grad.addColorStop(0, mixHex(base, '#ffffff', 0.06 + noise * 0.05));
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, TILE, TILE);

  // Blocky masonry / soil speckles.
  ctx.fillStyle = `rgba(0,0,0,${(0.06 + noise * 0.1).toFixed(2)})`;
  ctx.fillRect(px + 2 + noise * 6, py + 8 + noise * 12, 6 + noise * 8, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(px + 18 - noise * 8, py + 18 + noise * 6, 5, 3);

  // Buried tiles fade towards black so deep ground recedes.
  let depth = 0;
  while (depth < 5 && level.solidAt(tx, ty - depth - 1)) depth++;
  if (depth > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.42, depth * 0.11).toFixed(2)})`;
    ctx.fillRect(px, py, TILE, TILE);
  }

  if (isStone) {
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    if (ty % 2 === 0) {
      ctx.beginPath();
      ctx.moveTo(px + TILE / 2, py);
      ctx.lineTo(px + TILE / 2, py + TILE);
      ctx.stroke();
    }
  }

  if (openAbove) {
    if (isStone) {
      ctx.fillStyle = PALETTE.stoneEdge;
      ctx.fillRect(px, py, TILE, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px, py, TILE, 1);
    } else {
      ctx.fillStyle = colors.top;
      ctx.fillRect(px, py, TILE, 8);
      ctx.fillStyle = colors.topLight;
      ctx.fillRect(px, py, TILE, 3);
      ctx.fillStyle = colors.edge;
      // Little tufts hanging into the block below.
      const tuft = Math.floor(noise * 4);
      for (let i = 0; i < 3; i++) {
        const bx = px + 3 + i * 10 + ((tuft + i) % 3);
        ctx.fillRect(bx, py + 8, 3, 3 + ((tuft + i) % 3));
      }
      // Waving grass blades.
      ctx.fillStyle = colors.topLight;
      for (let i = 0; i < 3; i++) {
        const bx = px + 5 + i * 10;
        const sway = Math.sin(time * 1.6 + tx * 0.7 + i) * 1.6;
        ctx.fillRect(bx + sway, py - 4, 2, 4);
      }
    }
  }

  const openLeft = !level.solidAt(tx - 1, ty);
  const openRight = !level.solidAt(tx + 1, ty);
  if (openLeft) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(px, py, 2, TILE);
  }
  if (openRight) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + TILE - 2, py, 2, TILE);
  }
}

/** The portcullis that seals the boss arena once the fight begins. */
function drawGate(ctx: CanvasRenderingContext2D, px: number, py: number, time: number, ty: number): void {
  ctx.fillStyle = '#0d0a10';
  ctx.fillRect(px, py, TILE, TILE);
  // Vertical bars.
  ctx.fillStyle = '#3a3040';
  for (let i = 0; i < 3; i++) ctx.fillRect(px + 3 + i * 11, py, 6, TILE);
  ctx.fillStyle = '#584a60';
  for (let i = 0; i < 3; i++) ctx.fillRect(px + 3 + i * 11, py, 2, TILE);
  // Horizontal band every other tile.
  if (ty % 2 === 0) {
    ctx.fillStyle = '#4a3d52';
    ctx.fillRect(px, py + 12, TILE, 7);
    ctx.fillStyle = '#6d5b76';
    ctx.fillRect(px, py + 12, TILE, 2);
    ctx.fillStyle = '#241c28';
    ctx.fillRect(px + 5, py + 14, 3, 3);
    ctx.fillRect(px + TILE - 8, py + 14, 3, 3);
  }
  // Cursed glow seeping between the bars.
  const pulse = 0.35 + Math.sin(time * 2.2 + ty) * 0.15;
  glow(ctx, px + TILE / 2, py + TILE / 2, 26, `rgba(200,40,40,${pulse.toFixed(2)})`);
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  colors: ZoneTileColors,
  noise: number,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(px, py + 10, TILE, 4);
  if (colors.stoneLedges) {
    ctx.fillStyle = PALETTE.stone;
    ctx.fillRect(px, py, TILE, 12);
    ctx.fillStyle = PALETTE.stoneEdge;
    ctx.fillRect(px, py, TILE, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 4 + noise * 16, py + 5, 3, 6);
    ctx.fillStyle = colors.topLight;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(px, py, TILE, 1);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(px, py, TILE, 11);
  ctx.fillStyle = PALETTE.woodLight;
  ctx.fillRect(px, py, TILE, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(px + 6 + noise * 14, py + 4, 2, 7);
  ctx.fillStyle = colors.topLight;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(px, py, TILE, 1);
  ctx.globalAlpha = 1;
  // Bolts.
  ctx.fillStyle = '#c8b48a';
  ctx.fillRect(px + 3, py + 5, 2, 2);
  ctx.fillRect(px + TILE - 5, py + 5, 2, 2);
}

function drawSpikes(ctx: CanvasRenderingContext2D, px: number, py: number, noise: number): void {
  ctx.fillStyle = '#191d2b';
  ctx.fillRect(px, py + TILE - 6, TILE, 6);
  const count = 4;
  const w = TILE / count;
  for (let i = 0; i < count; i++) {
    const x = px + i * w;
    const h = TILE - 4 - ((i + Math.floor(noise * 3)) % 2) * 3;
    const g = ctx.createLinearGradient(0, py + TILE - h, 0, py + TILE);
    g.addColorStop(0, '#f2f5ff');
    g.addColorStop(1, PALETTE.spikeDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, py + TILE - h);
    ctx.lineTo(x + w - 0.5, py + TILE - 1);
    ctx.lineTo(x + 0.5, py + TILE - 1);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLavaTop(ctx: CanvasRenderingContext2D, px: number, py: number, time: number, tx: number): void {
  const wobble = Math.sin(time * 2.4 + tx * 0.8) * 2.5;
  ctx.fillStyle = '#c9411a';
  ctx.fillRect(px, py + 4, TILE, TILE - 4);
  const g = ctx.createLinearGradient(0, py, 0, py + TILE);
  g.addColorStop(0, '#ffd166');
  g.addColorStop(0.35, PALETTE.lava);
  g.addColorStop(1, '#a12d10');
  ctx.fillStyle = g;
  ctx.fillRect(px, py + 4 + wobble, TILE, TILE - 4 - wobble);
  ctx.fillStyle = 'rgba(255,220,150,0.65)';
  ctx.fillRect(px, py + 4 + wobble, TILE, 2);
  glow(ctx, px + TILE / 2, py + 6, 34, 'rgba(255,120,40,0.20)');
}
