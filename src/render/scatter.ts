import { Camera } from '../core/camera';
import { Rng } from '../core/math';
import { Level } from '../world/level';
import { TILE, Tile } from '../world/tiles';
import type { Light } from './lighting';
import { zoneAt } from './palette';
import { ART, PixelSprite } from './pixel';

type PropKind =
  | 'tuft'
  | 'fern'
  | 'shroom'
  | 'flower'
  | 'rubble'
  | 'urn'
  | 'stalagmite'
  | 'shard'
  | 'riftshard'
  | 'bones'
  | 'candle'
  | 'vine'
  | 'stalactite'
  | 'chain'
  | 'ember'
  | 'obsidian';

interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** 0..1, fixed per prop: picks its variant, its facing and its timing. */
  seed: number;
  /** Hangs from a ceiling rather than standing on a floor. */
  hanging: boolean;
  /** In a calm zone nothing sways and nothing flickers. */
  calm: boolean;
}

/** Props that light their surroundings, and the colour they cast. */
const GLOWING: Partial<Record<PropKind, { rgb: string; radius: number }>> = {
  shroom: { rgb: '128,236,190', radius: 74 },
  shard: { rgb: '99,230,255', radius: 66 },
  riftshard: { rgb: '176,120,255', radius: 70 },
  candle: { rgb: '255,178,96', radius: 82 },
  ember: { rgb: '255,112,56', radius: 58 },
};

/*
 * The props, drawn for the grid: rows of characters, one per art pixel, in
 * the palette's colours. Each kind has a few variants (picked per prop, and
 * mirrored for half of them); what sways or flickers has a second frame.
 * Light falls on them from the upper left like on everything else, and none
 * is brighter than the hero - they dress the floor, they do not compete with
 * what moves on it.
 */
const K = {
  /** Leaf: deep, mid, tip. */
  g: '#134c4c',
  G: '#1e6f50',
  t: '#33984b',
  /** Stone: shadow, body, lit edge. */
  s: '#1a1932',
  S: '#2a2f4e',
  l: '#424c6e',
  /** Clay and wood. */
  c: '#391f21',
  C: '#5d2c28',
  w: '#8a4836',
  /** Bone, pale. */
  b: '#424c6e',
  B: '#657392',
  /** Crystal of the caves. */
  q: '#00396d',
  Q: '#0069aa',
  e: '#0098dc',
  /** Crystal of the rift. */
  v: '#3b1443',
  V: '#622461',
  u: '#93388f',
  /** Flame. */
  f: '#ed7614',
  F: '#ffa214',
  /** Iron. */
  i: '#1a1932',
  I: '#424c6e',
  /** Petals. */
  p: '#657392',
  o: '#8a4836',
  /** Obsidian: black glass, its body, the light along an edge. */
  x: '#0e071b',
  X: '#3b1443',
  h: '#93388f',
  /** Embers: the coal's dark glow, its heat, and where it burns brightest. */
  r: '#8e251d',
  R: '#c64524',
  y: '#ed7614',
  Y: '#ffa214',
} as const;

function sprites(...variants: string[][]): PixelSprite[] {
  return variants.map((rows) => new PixelSprite(rows, K));
}

/** Every kind: its variants, each [rest, moved] - the second frame equal to the first where nothing moves. */
const ART_OF: Record<PropKind, PixelSprite[][]> = {
  tuft: [
    sprites(['..t..', 't.G.t', '.GGG.', 'gGgGg'], ['.t...', '.tG.t', '.GGG.', 'gGgGg']),
    sprites(['.t...t.', '.G.t.G.', '.GGGGG.', 'gGgGgGg'], ['t...t..', '.G.t.G.', '.GGGGG.', 'gGgGgGg']),
    sprites(['t..', 'G.t', 'GG.', 'gGg'], ['.t.', 'G.t', 'GG.', 'gGg']),
  ],
  fern: [
    sprites(
      ['...t.....', 't..G..t..', '.G.G.G...', '..GGG..t.', 'G..G..G..', '.GGgGG...', '..ggg....'],
      ['....t....', '.t.G..t..', '.G.G.G...', '..GGG.t..', '.G.G..G..', '.GGgGG...', '..ggg....'],
    ),
  ],
  flower: [
    sprites(['.p.', 'pop', '.p.', '.G.', 'gG.', '.g.'], ['.p.', 'pop', '.p.', '.G.', '.Gg', '.g.']),
    sprites(['o.o', '.o.', '.G.', 'GG.', '.g.'], ['o.o', '.o.', '.G.', '.GG', '.g.']),
  ],
  shroom: [
    sprites(['.tGG.', 'tGGGG', '..g..', '..g..']),
    sprites(['..tG..', '.tGGG.', 'GGGGGG', '...g..', '...g..', '...g..']),
  ],
  rubble: [sprites(['..ll...', '.lSSl..', 'sSSSs.l', 'ssSssSs']), sprites(['.l..', 'lSS.', 'sSs.']), sprites(['...ll.', 'l.lSSl', 'SsSSss'])],
  urn: [sprites(['.cCc.', '..C..', '.wCC.', 'wCCCc', 'wCCCc', '.CCc.', '..c..']), sprites(['CcC', '.w.', 'wCc', 'wCc', '.c.'])],
  stalagmite: [
    sprites(['..l..', '..lS.', '.lSS.', '.lSSs', 'lSSSs', 'lSSSs']),
    sprites(['...l...', '...lS..', '..lSS..', '..lSSs.', '.lSSSs.', '.lSSSSs', 'lSSSSSs', 'lSSSSSs']),
  ],
  shard: [sprites(['..e..', '.Qe..', '.Qeq.', 'QQeq.', 'QQeqq', 'QQeqq']), sprites(['.e.', 'Qe.', 'Qeq', 'Qeq', 'Qeq'])],
  riftshard: [
    sprites(['..u....', '.Vu....', '.Vuv...', 'VVuv.u.', 'VVuvVuv', 'VVuvVuv']),
    sprites(['.u.', 'Vu.', 'Vuv', 'Vuv', 'Vuv']),
  ],
  bones: [sprites(['B.....B', 'BBBBBBB', 'b.....b']), sprites(['.BB..', 'BbbBB', '..b..'])],
  candle: [sprites(['.F.', '.f.', 'BB.', 'Bb.', 'Bb.', 'bb.'], ['.f.', '.F.', 'BB.', 'Bb.', 'Bb.', 'bb.'])],
  vine: [
    sprites(['.g.', '.G.', 'tG.', '.G.', '.Gt', '.g.', 'tg.', '.g.', '.G.'], ['.g.', '.G.', '.Gt', '.G.', 'tG.', '.g.', '.gt', '.g.', '.G.']),
    sprites(['g.', 'G.', 'Gt', 'G.', 'g.', 'tG', '.g'], ['g.', 'G.', 'tG', 'G.', '.g', 'Gt', 'g.']),
  ],
  stalactite: [sprites(['lSSSs', 'lSSs.', '.lSs.', '.lS..', '..S..']), sprites(['lSSSSs', 'lSSSs.', '.lSSs.', '.lSs..', '..lS..', '..S...', '..S...'])],
  chain: [sprites(['.I.', 'I.I', '.I.', '.i.', '.I.', 'I.I', '.I.', '.i.', '.I.', 'I.I', '.I.'])],
  ember: [
    sprites(['..y...', '.rRr..', 'xRyRxr', 'xxRxxx'], ['..Y...', '.rRr..', 'xRYRxr', 'xxRxxx']),
    sprites(['.r..', 'xRr.', 'xyRx', 'xxxx'], ['.R..', 'xRr.', 'xYRx', 'xxxx']),
  ],
  obsidian: [
    sprites(['..h..', '.Xh..', '.Xhx.', 'XXhx.', 'XXhxx', 'XXhxx']),
    sprites(['.h..', 'Xh..', 'Xhx.', 'XXhx', 'xXxx']),
  ],
};

/**
 * Scatters the level with the small things that make a place look inhabited:
 * grass and ferns in the forest, rubble in the ruins, glowing mushrooms and
 * stalagmites in the caves, obsidian and embers in the Glutkammer, bones and
 * candles in the castle.
 *
 * Everything is derived from the tile map with a per-tile seed, so no level
 * data has to be maintained by hand and the result is identical on every run.
 * The throne room is left bare on purpose - the arena should read as swept -
 * and nothing green grows in the castle.
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

        const zone = zoneAt(tx * TILE);
        if (zone.name === 'throne') continue;
        const rng = new Rng(tx * 7919 + ty * 104729 + 17);

        // Standing on a surface.
        if (level.tileAt(tx, ty - 1) === Tile.Empty) {
          const roll = rng.next();
          const kind = Scatter.surfaceProp(zone.backdrop === 'forge' ? 'forge' : zone.name, roll, rng);
          if (kind) {
            this.push({
              kind,
              x: tx * TILE + rng.range(4, TILE - 4),
              y: ty * TILE,
              seed: rng.next(),
              hanging: false,
              calm: zone.calm,
            });
          }
        }

        // Hanging from a ceiling.
        if (level.tileAt(tx, ty + 1) === Tile.Empty && rng.next() < 0.2) {
          const z = zone.name;
          const kind: PropKind =
            z === 'caverns' || z === 'rift' || z === 'riftend' || z === 'crystalworld' ? 'stalactite' : z === 'castle' ? 'chain' : 'vine';
          this.push({
            kind,
            x: tx * TILE + rng.range(6, TILE - 6),
            y: (ty + 1) * TILE,
            seed: rng.next(),
            hanging: true,
            calm: zone.calm,
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
      case 'forge':
        // Ignivor's chamber: obsidian and embers, nothing that grows or
        // glints cold.
        if (roll < 0.14) return 'obsidian';
        if (roll < 0.24) return 'ember';
        if (roll < 0.34) return 'rubble';
        return null;
      case 'castle':
        if (roll < 0.14) return 'rubble';
        if (roll < 0.22) return 'bones';
        if (roll < 0.27) return 'candle';
        return null;
      case 'drowned':
        // What settles in still water: weed on every ledge, silt and shells.
        if (roll < 0.3) return 'tuft';
        if (roll < 0.42) return 'shroom';
        if (roll < 0.5) return 'rubble';
        if (roll < 0.56) return 'bones';
        return null;
      case 'crystalworld':
        if (roll < 0.34) return 'shard';
        if (roll < 0.46) return 'stalagmite';
        if (roll < 0.54) return 'rubble';
        return null;
      case 'lair':
        // Her floor: what is left of everything that came in before the hero.
        if (roll < 0.3) return 'bones';
        if (roll < 0.44) return 'shroom';
        if (roll < 0.54) return 'rubble';
        if (roll < 0.6) return 'tuft';
        return null;
      case 'rift':
      case 'riftend':
        // As densely dressed as the forest floor: the rift used to be bare
        // stone with the odd crystal, which read as unfinished next to it.
        if (roll < 0.26) return 'riftshard';
        if (roll < 0.4) return 'stalagmite';
        if (roll < 0.5) return 'rubble';
        if (roll < 0.56) return 'bones';
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
      const variants = ART_OF[prop.kind];
      const frames = variants[Math.floor(prop.seed * variants.length)];
      // Grass leans now and then and a flame flickers - each on its own
      // clock, a whole frame at a time; in a calm zone they hold still.
      const moving = frames.length > 1 && !prop.calm;
      const rate = prop.kind === 'candle' ? 7 : prop.kind === 'ember' ? 3 : 0.9;
      const frame = moving ? frames[Math.floor(time * rate + prop.seed * 17) % 2] : frames[0];
      const facing = prop.seed * 100 - Math.floor(prop.seed * 100) < 0.5 ? 1 : -1;
      const x = prop.x - (frame.w * ART) / 2;
      const y = prop.hanging ? prop.y : prop.y - frame.h * ART;
      frame.draw(ctx, x, y, facing);
    }
  }
}
