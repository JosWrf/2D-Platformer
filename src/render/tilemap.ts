import { Camera } from '../core/camera';
import { Level } from '../world/level';
import { TILE, Tile } from '../world/tiles';
import { zoneAt } from './palette';
import { ART, PixelSprite, makeCanvas } from './pixel';
import { LAVA_STATIC, TPX, TerrainArt } from './tileArt';

/**
 * The tile map on screen.
 *
 * The ground itself is pixel art kept in canvases (render/tileArt.ts) and only
 * copied here. What is drawn every frame is what moves: the surface of the
 * lava, and the doors of the boss rooms, which open and shut. All of it on
 * whole art pixels, in the palette's colours, with no gradient, arc or soft
 * glow anywhere - a light here is a flat shape the palette's dither turns
 * translucent, or a colour that steps.
 */

const terrains = new WeakMap<Level, TerrainArt>();

/** The finished terrain of a level, made on first use. */
export function terrainOf(level: Level): TerrainArt {
  let art = terrains.get(level);
  if (!art) {
    art = new TerrainArt(level);
    terrains.set(level, art);
  }
  return art;
}

/** Draws every tile currently inside the camera view. */
export function drawTilemap(ctx: CanvasRenderingContext2D, level: Level, camera: Camera, time: number): void {
  const art = terrainOf(level);
  const vx = camera.renderX;
  const vy = camera.renderY;
  art.draw(ctx, vx, vy, camera.viewW, camera.viewH);
  drawLava(ctx, art, vx, camera.viewW, time);
  drawDoors(ctx, level, art, vx, vy, camera.viewW, camera.viewH, time);
}

/** A rectangle in art pixels, at a world position given in art pixels. */
function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(x * ART, y * ART, w * ART, h * ART);
}

/* ------------------------------------------------------------- lava */

const LAVA_CREST = '#ffc825';
const LAVA_TOP = '#ffa214';
const LAVA_HOT = '#ed7614';
const LAVA_BODY = '#c64524';

/**
 * The surface of every pool of lava as one sheet: two trains of waves, one
 * long and slow running one way and one short running back, added together
 * and cut to whole pixels. Their crests travel along the pool and through
 * each other instead of every tile bobbing on a sine of its own, and a crest
 * that stands higher burns brighter. Columns of the same height are drawn as
 * one rectangle.
 */
function drawLava(ctx: CanvasRenderingContext2D, art: TerrainArt, viewX: number, viewW: number, time: number): void {
  const runs = art.lavaRuns;
  const left = viewX / TILE - 1;
  const right = (viewX + viewW) / TILE + 1;
  for (const run of runs) {
    if (run.tx1 < left) continue;
    if (run.tx0 > right) break;
    const x0 = run.tx0 * TPX;
    const x1 = (run.tx1 + 1) * TPX;
    const y0 = run.ty * TPX;
    let start = x0;
    let level = surfaceAt(x0, time);
    for (let x = x0 + 1; x <= x1; x++) {
      const s = x < x1 ? surfaceAt(x, time) : -1;
      if (s === level) continue;
      lavaColumns(ctx, start, x - start, y0, level);
      start = x;
      level = s;
    }
  }
}

/** Height of the surface above the still lava, in rows from the top of the tile (1..6). */
function surfaceAt(x: number, time: number): number {
  const a = Math.sin(((x - time * 9) / 41) * Math.PI * 2);
  const b = Math.sin(((x + time * 6) / 17) * Math.PI * 2);
  return Math.max(1, Math.min(6, Math.round(3.5 - a * 1.6 - b * 0.8)));
}

function lavaColumns(ctx: CanvasRenderingContext2D, x: number, w: number, y0: number, s: number): void {
  ctx.fillStyle = s <= 2 ? LAVA_CREST : LAVA_TOP;
  px(ctx, x, y0 + s, w, 1);
  ctx.fillStyle = LAVA_HOT;
  px(ctx, x, y0 + s + 1, w, s <= 3 ? 2 : 1);
  const body = s + (s <= 3 ? 3 : 2);
  if (body < LAVA_STATIC) {
    ctx.fillStyle = LAVA_BODY;
    px(ctx, x, y0 + body, w, LAVA_STATIC - body);
  }
}

/* ------------------------------------------------------------- doors */

/** Hard-edged discs of light, one canvas per radius: what a glow is in this game. */
const discs = new Map<number, HTMLCanvasElement>();

function disc(r: number): HTMLCanvasElement {
  let c = discs.get(r);
  if (!c) {
    const size = r * 2 + 1;
    const { canvas, ctx } = makeCanvas(size, size);
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < size; y++) {
      const dy = y - r;
      const half = Math.floor(Math.sqrt(r * r + r - dy * dy));
      ctx.fillRect(r - half, y, half * 2 + 1, 1);
    }
    c = canvas;
    discs.set(r, c);
  }
  return c;
}

/** Discs tinted once per colour. */
const tinted = new Map<string, HTMLCanvasElement>();

function tintedDisc(r: number, color: string): HTMLCanvasElement {
  const key = `${r}${color}`;
  let c = tinted.get(key);
  if (!c) {
    const size = r * 2 + 1;
    const { canvas, ctx } = makeCanvas(size, size);
    ctx.drawImage(disc(r), 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    c = canvas;
    tinted.set(key, c);
  }
  return c;
}

/**
 * A disc of light in a colour, centred on an art pixel: two hard rings
 * instead of a radial gradient - the inner one twice as strong - laid on
 * additively and left to the palette's dither to make translucent.
 */
function glowDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const rr of [r, Math.max(1, Math.round(r * 0.55))]) {
    ctx.globalAlpha = alpha * 0.5;
    const size = (rr * 2 + 1) * ART;
    ctx.drawImage(tintedDisc(rr, color), (cx - rr) * ART, (cy - rr) * ART, size, size);
  }
  ctx.restore();
}

/** Steps a slow breath into three levels, so a light changes a few times a second at most. */
function step3(t: number): number {
  return Math.min(2, Math.floor((Math.sin(t) + 1) * 1.5));
}

const GATE_KEY = {
  B: '#0e071b',
  L: '#657392',
  M: '#424c6e',
  D: '#2a2f4e',
  R: '#92a1b9',
  g: '#391f21',
};

/** The knight's portcullis: four iron bars, a cross band on every other tile. */
const GATE_BARS = new PixelSprite(new Array<string>(16).fill('BLMDgLMDgLMDgLMD'), GATE_KEY);

const GATE_BAND = new PixelSprite(['LLLLLLLLLLLLLLLL', 'MRMMMRMMMRMMMRMM', 'DDDDDDDDDDDDDDDD'], GATE_KEY);

/** Where the bars meet the floor they end in points. */
const GATE_TEETH = new PixelSprite(['BLMDgLMDgLMDgLMD', '.LM..LM..LM..LM.', '.L...L...L...L..'], GATE_KEY);

function drawGate(ctx: CanvasRenderingContext2D, level: Level, tx: number, ty: number, time: number): void {
  const x = tx * TPX;
  const y = ty * TPX;
  // The gaps between the bars smoulder: one of two reds, stepping slowly.
  const ember = step3(time * 2.2 + ty) > 0;
  GATE_BARS.draw(ctx, x * ART, y * ART);
  ctx.fillStyle = ember ? '#571c27' : '#391f21';
  for (const gx of [4, 8, 12]) px(ctx, x + gx, y, 1, TPX);
  if (ty % 2 === 0) GATE_BAND.draw(ctx, x * ART, (y + 6) * ART);
  if (level.tileAt(tx, ty + 1) !== Tile.Gate) GATE_TEETH.draw(ctx, x * ART, (y + TPX - 3) * ART);
  if (ty % 2 === 1) glowDisc(ctx, x + 8, y + 8, 12, '#891e2b', ember ? 0.18 : 0.12);
}

const SEAL_KEY = { B: '#0e071b', S: '#1a1932', s: '#2a2f4e', R: '#ffffff' };

/** The warded stone behind the throne: a ring of runes and a cross, glowing in steps. */
const SEAL_ROWS = [
  'BBBBBBBBBBBBBBBB',
  'BsSSSSSSSSSSSSSB',
  'BSSSSSSRRRSSSSSB',
  'BSSSSRRSRSRRSSSB',
  'BSSSRSSSRSSSRSSB',
  'BSSRSSSSRSSSSRSB',
  'BSSRSSSSRSSSSRSB',
  'BSRSRRRRRRRRRSRB',
  'BSSRSSSSRSSSSRSB',
  'BSSRSSSSRSSSSRSB',
  'BSSSRSSSRSSSRSSB',
  'BSSSSRRSRSRRSSSB',
  'BSSSSSSRRRSSSSSB',
  'BSSSSSSSSSSSSSSB',
  'BsSSSSSSSSSSSSsB',
  'BBBBBBBBBBBBBBBB',
];
const SEAL_COLORS = ['#3003d9', '#7a09fa', '#db3ffd'];
const SEALS = SEAL_COLORS.map((c) => new PixelSprite(SEAL_ROWS, { ...SEAL_KEY, R: c }));

function drawSeal(ctx: CanvasRenderingContext2D, tx: number, ty: number, time: number): void {
  const s = step3(time * 2 + ty * 0.9);
  SEALS[s].draw(ctx, tx * TPX * ART, ty * TPX * ART);
  if (s === 2) glowDisc(ctx, tx * TPX + 8, ty * TPX + 8, 9, '#7a09fa', 0.16);
}

const LAIR_KEY = { B: '#0e071b', L: '#33984b', M: '#1e6f50', D: '#134c4c', K: '#0c2e44' };

/** The hydra's door: ribs of grown bone, knuckled where they are lashed together. */
const LAIR_RIBS = new PixelSprite(
  [
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'KLMDKKLMDKKLMDKB',
    'LLMDDLLMDDLLMDDB',
    'LLMDDLLMDDLLMDDB',
    'LLMDDLLMDDLLMDDB',
    'KLMDKKLMDKKLMDKB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
    'BLMDBBLMDBBLMDBB',
  ],
  LAIR_KEY,
);

const LAIR_BAND = new PixelSprite(['MMMMMMMMMMMMMMMM', 'DLDDDDLDDDDLDDDD', 'KKKKKKKKKKKKKKKK'], LAIR_KEY);

function drawLairGate(ctx: CanvasRenderingContext2D, tx: number, ty: number, time: number): void {
  const x = tx * TPX;
  const y = ty * TPX;
  LAIR_RIBS.draw(ctx, x * ART, y * ART);
  if (ty % 2 === 0) LAIR_BAND.draw(ctx, x * ART, (y + 12) * ART);
  const s = step3(time * 1.8 + ty * 0.7);
  glowDisc(ctx, x + 8, y + 8, 11, '#33984b', 0.08 + s * 0.04);
}

/**
 * The colours a ward burns in, per zone, all from one ramp of the palette:
 * the deep and dark of the curtain, its bright middle, its edges and strands,
 * and its runes. As "r,g,b" too, for the light it throws on the floor.
 */
interface WardInk {
  deep: string;
  dark: string;
  mid: string;
  edge: string;
  rune: string;
  rgb: string;
}

const WARD_INK: Record<string, WardInk> = {
  forest: { deep: '#134c4c', dark: '#1e6f50', mid: '#33984b', edge: '#99e65f', rune: '#d3fc7e', rgb: '153,230,95' },
  ruins: { deep: '#391f21', dark: '#5d2c28', mid: '#8a4836', edge: '#edab50', rune: '#ffeb57', rgb: '237,171,80' },
  caverns: { deep: '#391f21', dark: '#8e251d', mid: '#c64524', edge: '#e07438', rune: '#ffc825', rgb: '224,116,56' },
  drowned: { deep: '#03193f', dark: '#00396d', mid: '#0069aa', edge: '#00cdf9', rune: '#94fdff', rgb: '0,205,249' },
  castle: { deep: '#571c27', dark: '#891e2b', mid: '#c42430', edge: '#f5555d', rune: '#f68187', rgb: '245,85,93' },
  rift: { deep: '#3b1443', dark: '#622461', mid: '#93388f', edge: '#db3ffd', rune: '#f389f5', rgb: '219,63,253' },
};

function wardInk(x: number): WardInk {
  return WARD_INK[zoneAt(x).name] ?? WARD_INK.rift;
}

/** The rune on a standing ward: a diamond with a stroke through it. */
const RUNE_ROWS = ['...W...', '..W.W..', '.W...W.', 'W..W..W', '.W.W.W.', 'W..W..W', '.W...W.', '..W.W..', '...W...'];
const RUNE_CELLS: readonly (readonly [number, number])[] = RUNE_ROWS.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (ch === 'W' ? [[x, y] as const] : [])),
);

/**
 * The curtain's columns, left to right across its ten pixels: the bright
 * edges, the deep beside them, the dark, and the bright middle - which widens
 * by a pixel each way when the ward breathes in.
 */
const CURTAIN: readonly (keyof WardInk)[] = ['edge', 'deep', 'dark', 'dark', 'mid', 'mid', 'dark', 'dark', 'deep', 'edge'];

/**
 * A boss arena's ward, standing: a curtain of light hung between the floor and
 * the sky, with a rune every third tile. Standing, it is unmistakably a wall.
 * It is drawn after the darkness, in the palette's own colours and nothing
 * else - every pixel of it solid, so there is no translucent sheet for the
 * pass to turn into a sprinkle of dots round it - and the light it throws on
 * the floor is a light of the frame's (wardLights), stepping the floor up its
 * ramps. It moves slowly on purpose: a column of flicker is the last thing a
 * fight needs next to it. Strands climb it a whole pixel at a time, and its
 * middle and its runes brighten in three steps.
 */
function drawWard(ctx: CanvasRenderingContext2D, level: Level, tx: number, ty: number, time: number): void {
  const ink = wardInk(tx * TILE);
  const floorBelow = level.solidAt(tx, ty + 1) && level.tileAt(tx, ty + 1) !== Tile.Ward;
  const topCap = !level.solidAt(tx, ty - 1) || ty === 0;
  const breath = step3(time * 1.6 + ty * 0.35);
  const x = tx * TPX;
  const y = ty * TPX;
  for (let i = 0; i < CURTAIN.length; i++) {
    let key = CURTAIN[i];
    if (breath === 2 && (i === 3 || i === 6)) key = 'mid';
    ctx.fillStyle = ink[key];
    px(ctx, x + 3 + i, y, 1, TPX);
  }
  // Strands of light running up the curtain, a pixel at a time.
  ctx.fillStyle = ink.edge;
  for (let i = 0; i < 3; i++) {
    const sx = x + 5 + i * 2 + (i === 2 ? 1 : 0);
    const run = Math.floor(time * (9 + i * 2.5) + i * 7 + ty * 5) % TPX;
    const sy = y + TPX - run - 5;
    const top = Math.max(y, sy);
    const bottom = Math.min(y + TPX, sy + 5);
    if (bottom > top) px(ctx, sx, top, 1, bottom - top);
  }
  // A rune every third tile, and one where it meets the floor.
  if (ty % 3 === 1 || floorBelow) {
    ctx.fillStyle = breath === 0 ? ink.edge : ink.rune;
    for (const [rx, ry] of RUNE_CELLS) px(ctx, x + 5 + rx, y + 4 + ry, 1, 1);
  }
  // Where it ends in the air, a bar of light across it; where it meets the
  // floor, a foot that spreads a pixel each way.
  ctx.fillStyle = ink.edge;
  if (topCap) px(ctx, x + 3, y, 10, 1);
  if (floorBelow) {
    px(ctx, x + 1, y + TPX - 1, 14, 1);
    px(ctx, x + 2, y + TPX - 2, 1, 1);
    px(ctx, x + 13, y + TPX - 2, 1, 1);
  }
}

/**
 * Where a ward will come down, while it is open: a seam of runes in the floor.
 * The way in still shows where it will stand, so the moment it rises behind
 * the hero is not a surprise but a promise kept.
 */
function drawSleepingWard(ctx: CanvasRenderingContext2D, level: Level, tx: number, ty: number, time: number): void {
  const wx = tx * TILE;
  const arena = level.arenaAt(wx);
  const floorBelow = level.solidAt(tx, ty + 1) && level.tileAt(tx, ty + 1) !== Tile.Ward;
  if (!arena || arena.cleared || !floorBelow) return;
  const x = tx * TPX;
  const y = ty * TPX;
  const ink = wardInk(wx);
  ctx.fillStyle = step3(time * 1.4 + tx) === 2 ? ink.mid : ink.dark;
  px(ctx, x + 6, y + TPX - 2, 4, 2);
  px(ctx, x + 7, y + TPX - 6, 2, 3);
}

/**
 * The standing wards in view, drawn over the lit ground (see drawWard): in
 * world coordinates, on a context set up like the ground layer's.
 */
export function drawWards(ctx: CanvasRenderingContext2D, level: Level, camera: Camera, time: number): void {
  const art = terrainOf(level);
  const left = Math.floor(camera.renderX / TILE) - 1;
  const right = Math.ceil((camera.renderX + camera.viewW) / TILE) + 1;
  const top = Math.floor(camera.renderY / TILE) - 1;
  const bottom = Math.ceil((camera.renderY + camera.viewH) / TILE) + 1;
  for (const door of art.doors) {
    if (door.tx < left) continue;
    if (door.tx > right) break;
    if (door.tile !== Tile.Ward || door.ty < top || door.ty > bottom) continue;
    if (level.wardClosed(door.tx)) drawWard(ctx, level, door.tx, door.ty, time);
  }
}

/**
 * Where lava lies across the screen, as [from, to] in art columns, a little
 * wider than the pools: what is drawn in front of everything must not stand
 * in front of a pool of fire (Background.drawFront).
 */
export function lavaSpans(level: Level, camera: Camera): [number, number][] {
  const out: [number, number][] = [];
  const left = camera.renderX / TILE - 1;
  const right = (camera.renderX + camera.viewW) / TILE + 1;
  for (const run of terrainOf(level).lavaRuns) {
    if (run.tx1 < left) continue;
    if (run.tx0 > right) break;
    out.push([Math.floor((run.tx0 * TILE - camera.renderX) / ART) - 6, Math.ceil(((run.tx1 + 1) * TILE - camera.renderX) / ART) + 6]);
  }
  return out;
}

/** The light each standing ward in view throws on the floor at its foot. */
export function wardLights(level: Level, camera: Camera, add: (x: number, y: number, radius: number, rgb: string, strength: number, tint: number) => void): void {
  const art = terrainOf(level);
  const left = Math.floor(camera.renderX / TILE) - 3;
  const right = Math.ceil((camera.renderX + camera.viewW) / TILE) + 3;
  for (const door of art.doors) {
    if (door.tx < left) continue;
    if (door.tx > right) break;
    if (door.tile !== Tile.Ward || !level.wardClosed(door.tx)) continue;
    if (!level.solidAt(door.tx, door.ty + 1) || level.tileAt(door.tx, door.ty + 1) === Tile.Ward) continue;
    add(door.tx * TILE + TILE / 2, (door.ty + 1) * TILE - 6, 110, wardInk(door.tx * TILE).rgb, 0.8, 0.4);
  }
}

/** The doors of the boss rooms in view: open and shut, so drawn every frame. */
function drawDoors(
  ctx: CanvasRenderingContext2D,
  level: Level,
  art: TerrainArt,
  viewX: number,
  viewY: number,
  viewW: number,
  viewH: number,
  time: number,
): void {
  const left = Math.floor(viewX / TILE) - 1;
  const right = Math.ceil((viewX + viewW) / TILE) + 1;
  const top = Math.floor(viewY / TILE) - 1;
  const bottom = Math.ceil((viewY + viewH) / TILE) + 1;
  for (const door of art.doors) {
    if (door.tx < left) continue;
    if (door.tx > right) break;
    if (door.ty < top || door.ty > bottom) continue;
    switch (door.tile) {
      case Tile.Gate:
        if (level.gateClosed) drawGate(ctx, level, door.tx, door.ty, time);
        break;
      case Tile.Seal:
        if (level.exitSealed) drawSeal(ctx, door.tx, door.ty, time);
        break;
      case Tile.LairGate:
        if (level.lairClosed) drawLairGate(ctx, door.tx, door.ty, time);
        break;
      case Tile.Ward:
        // A standing ward is drawn over the lit ground (drawWards); here only the seam of a sleeping one.
        if (!level.wardClosed(door.tx)) drawSleepingWard(ctx, level, door.tx, door.ty, time);
        break;
      default:
        break;
    }
  }
}
