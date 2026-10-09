import type { Level } from '../world/level';
import { ZONE_START } from '../world/levelData';
import { TILE, Tile } from '../world/tiles';
import { ART, abgrOf, makeCanvas } from './pixel';

/**
 * The terrain as pixel art: what each place is made of, how a tile knows its
 * neighbours, and the canvases the finished ground is kept in.
 *
 * The ground used to be drawn tile by tile every frame, each tile with its own
 * top-to-bottom gradient, so the luminance of a floor four tiles deep ran
 * light-dark, light-dark, light-dark down the screen - venetian blinds - and
 * every ledge was a straight cut with a picket fence of grass on it. Now:
 *
 *   - Every tile is 16×16 art pixels and knows its eight neighbours (the
 *     "blob" mask): an outer corner is chipped, a floor meeting a wall gets a
 *     filled inner corner, grass hangs over a ledge, a coping stone sticks out
 *     past the wall under it.
 *   - The body darkens with its distance from the nearest open face, measured
 *     over the map rather than per tile, in three bands with an ordered dither
 *     where one meets the next. A floor reads as one mass lit from above.
 *   - Each place has its own material - forest earth, ruin blocks, cave rock
 *     with crystal veins, wet stone with a tide mark, castle brick under a
 *     coping and no grass at all, rift obsidian with glowing seams - laid out
 *     in world space, so a brick, a facet or a vein runs straight across the
 *     seam between two tiles. On top of that every tile rolls one of four
 *     variants: plain, or a stone, a root, a crack, a crystal... that may
 *     reach into its neighbours.
 *   - Colours are the palette's own, picked from ramps that cool towards their
 *     shadows: the frame's palette mapping lets them through untouched.
 *
 * None of that changes from frame to frame, so it is drawn once, sixteen
 * tiles at a time, into a canvas of its own (a chunk) and from then on simply
 * copied to the screen. Only what moves - the lava's surface, the doors of the
 * boss rooms - is drawn per frame (render/tilemap.ts).
 */

/** Art pixels per tile. */
export const TPX = TILE / ART;

/**
 * Tiles per cached chunk, across; a chunk runs the full height of the level.
 * Small enough that drawing one costs a couple of milliseconds, so the one
 * frame that draws the next chunk ahead does not stand out.
 */
const CHUNK = 8;
/**
 * Tiles of neighbourhood read round a chunk: as deep as the bands reach (the
 * deepest band begins 27 pixels under a floor) and as far as a variant draws.
 */
const MARGIN = 2;
/** Chunks kept at once - about five screens' worth; the rest are rebuilt on the way back. */
const KEEP = 20;

/* ------------------------------------------------------------- hashing */

/** A well-mixed 32-bit hash of two integers and a seed: the same answer on every run. */
function ihash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 4×4 Bayer matrix, 0..15: the threshold an ordered dither compares against. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/* ------------------------------------------------------------- places */

/**
 * Where in the level a column is, finer than the zone: the zones repeat their
 * name for every room of the same place (the theatre is 'ruins'), and several
 * rooms dress their ground differently.
 */
export type Area =
  | 'forest'
  | 'den'
  | 'ruins'
  | 'vault'
  | 'theater'
  | 'temple'
  | 'caverns'
  | 'grotto'
  | 'web'
  | 'forge'
  | 'drowned'
  | 'altar'
  | 'castle'
  | 'battlement'
  | 'clock'
  | 'keep'
  | 'throne'
  | 'rift'
  | 'mirror'
  | 'lair'
  | 'crystal';

const AREA_STARTS: ReadonlyArray<readonly [number, Area]> = [
  [0, 'forest'],
  [ZONE_START.den, 'den'],
  [ZONE_START.ruins, 'ruins'],
  [ZONE_START.vault, 'vault'],
  [ZONE_START.ruinsAgain, 'ruins'],
  [ZONE_START.theater, 'theater'],
  [ZONE_START.ruinsBeyondStage, 'ruins'],
  [ZONE_START.temple, 'temple'],
  [ZONE_START.caverns, 'caverns'],
  [ZONE_START.grotto, 'grotto'],
  [ZONE_START.cavernsDeep, 'caverns'],
  [ZONE_START.web, 'web'],
  [ZONE_START.cavernsAgain, 'caverns'],
  [ZONE_START.forge, 'forge'],
  [ZONE_START.drowned, 'drowned'],
  [ZONE_START.altar, 'altar'],
  [ZONE_START.drownedAgain, 'drowned'],
  [ZONE_START.castle, 'castle'],
  [ZONE_START.battlement, 'battlement'],
  [ZONE_START.towers, 'castle'],
  [ZONE_START.clock, 'clock'],
  [ZONE_START.keep, 'keep'],
  [ZONE_START.castleEnd, 'castle'],
  [ZONE_START.throne, 'throne'],
  [ZONE_START.rift, 'rift'],
  [ZONE_START.mirror, 'mirror'],
  [ZONE_START.riftAgain, 'rift'],
  [ZONE_START.lair, 'lair'],
  [ZONE_START.riftend, 'rift'],
  [ZONE_START.crystalworld, 'crystal'],
];

/** The area a world x (logical pixels) lies in. */
export function areaAt(x: number): Area {
  let area: Area = 'forest';
  for (const [start, a] of AREA_STARTS) {
    if (x >= start) area = a;
    else break;
  }
  return area;
}

/* ------------------------------------------------------------- materials */

/**
 * How the body of a material is laid: loose soil, cut blocks of three sizes,
 * bricks, rock plates, glassy facets or crystal prisms. Each is a pattern of
 * light and shade worked out once, in world space, and repeated every 256 art
 * pixels - sixteen tiles, far enough apart that the eye does not find it
 * under the depth bands and the variants laid over it.
 */
type Pattern = 'soil' | 'blocks' | 'wet' | 'ashlar' | 'bricks' | 'slabs' | 'rock' | 'facets' | 'prisms';

/** What the open top of a material looks like. */
type Top = 'grass' | 'moss' | 'lip' | 'coping' | 'boards' | 'gloss';

/** The tile variants: one of these may sit in a tile, reaching across its edges. */
type Feature =
  | 'pebble'
  | 'stone'
  | 'root'
  | 'crack'
  | 'bone'
  | 'gold'
  | 'glyph'
  | 'vein'
  | 'crystal'
  | 'ember'
  | 'silk'
  | 'drip'
  | 'star'
  | 'rivet'
  | 'stain'
  | 'moss';

interface MaterialDef {
  /** Dark to light, palette colours. The body is drawn from these. */
  ramp: string[];
  /** Where on the ramp the three depth bands sit, surface band first. */
  bands: [number, number, number];
  /** How far the grain moves a pixel along the ramp. */
  grain: number;
  pattern: Pattern;
  top: Top;
  /** The top's own colours; what each one is depends on the kind of top. */
  topColors: string[];
  /** Variants 1-3 of a tile (variant 0 is the plain body). */
  features: [Feature, Feature, Feature];
  /** Colours drawn as they are, not from the ramp: veins, seams, metal, gold. */
  accent: string[];
  /** Share of a top covered by its growth (grass, moss), 0..1. */
  cover: number;
  /** The planks this place builds: wood hung on rope, or a stone slab on chains. */
  plank: 'wood' | 'stone' | 'iron' | 'glass';
  /** A tide mark across every face, where the water stood for a long time. */
  tide?: boolean;
  /**
   * The colour light catches the top edge in (render/rims.ts): the material's
   * own highlight, so a lit edge of grass stays green instead of going grey
   * under a light of another colour.
   */
  rim: string;
}

/*
 * The values are measured, not guessed: drawn, the body of every material sits
 * at L* 25-28 in its surface band, 20-23 below it and 16-20 deep down, and a
 * lit top at 30-42 - the value budget itself, because a colour of the palette
 * now reaches the screen as it is drawn wherever the night is not darker than
 * it. Under the hero's own lantern, which adds its tint to the floor, a top
 * still comes out under the hero standing on it.
 */
const DEFS: Record<string, MaterialDef> = {
  // Nebelwald: warm earth under a lip of grass, cooling to violet with depth.
  earth: {
    ramp: ['#1a1932', '#391f21', '#5d2c28', '#8a4836', '#bf6f4a'],
    bands: [2.75, 2.45, 2.15],
    grain: 0.5,
    pattern: 'soil',
    top: 'grass',
    topColors: ['#1e6f50', '#134c4c', '#0c2e44'],
    features: ['pebble', 'root', 'stone'],
    accent: ['#3d3d3d', '#5d5d5d'],
    cover: 1,
    plank: 'wood',
    rim: '#1e6f50',
  },
  // Grimmzahn's den: the same earth, trampled bare in patches, bones in it.
  den: {
    ramp: ['#1a1932', '#391f21', '#5d2c28', '#8a4836', '#bf6f4a'],
    bands: [2.75, 2.45, 2.15],
    grain: 0.5,
    pattern: 'soil',
    top: 'grass',
    topColors: ['#1e6f50', '#134c4c', '#0c2e44'],
    features: ['pebble', 'root', 'bone'],
    accent: ['#5d5d5d', '#858585'],
    cover: 0.55,
    plank: 'wood',
    rim: '#1e6f50',
  },
  // The ruins: weathered limestone blocks, moss in the joints at the top.
  ruins: {
    ramp: ['#0e071b', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d', '#858585'],
    bands: [3.35, 3.05, 2.75],
    grain: 0.45,
    pattern: 'blocks',
    top: 'moss',
    topColors: ['#424c6e', '#272727', '#1e6f50', '#134c4c'],
    features: ['crack', 'moss', 'pebble'],
    accent: ['#134c4c', '#1e6f50'],
    cover: 0.45,
    plank: 'wood',
    rim: '#657392',
  },
  // The ruins' standing stones: the same limestone, cut square.
  ashlar: {
    ramp: ['#0e071b', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d', '#858585'],
    bands: [3.4, 3.1, 2.8],
    grain: 0.35,
    pattern: 'ashlar',
    top: 'moss',
    topColors: ['#424c6e', '#272727', '#1e6f50', '#134c4c'],
    features: ['crack', 'moss', 'crack'],
    accent: ['#134c4c', '#1e6f50'],
    cover: 0.3,
    plank: 'wood',
    rim: '#657392',
  },
  // The treasury: the ruins with what the chest has not eaten caught in the cracks.
  vault: {
    ramp: ['#0e071b', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d', '#858585'],
    bands: [3.35, 3.05, 2.75],
    grain: 0.45,
    pattern: 'blocks',
    top: 'moss',
    topColors: ['#424c6e', '#272727', '#1e6f50', '#134c4c'],
    features: ['crack', 'gold', 'gold'],
    accent: ['#8a4836', '#edab50', '#e07438'],
    cover: 0.2,
    plank: 'wood',
    rim: '#657392',
  },
  // The theatre: the ruins' stone under a stage of boards.
  theater: {
    ramp: ['#0e071b', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d', '#858585'],
    bands: [3.3, 3.0, 2.7],
    grain: 0.4,
    pattern: 'ashlar',
    top: 'boards',
    topColors: ['#8a4836', '#5d2c28', '#391f21', '#1c121c', '#858585'],
    features: ['crack', 'pebble', 'crack'],
    accent: [],
    cover: 1,
    plank: 'wood',
    rim: '#5d2c28',
  },
  // Ankhor's court: the ruins with his sun cut into the blocks.
  temple: {
    ramp: ['#0e071b', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d', '#858585'],
    bands: [3.35, 3.05, 2.75],
    grain: 0.4,
    pattern: 'ashlar',
    top: 'moss',
    topColors: ['#424c6e', '#272727', '#1e6f50', '#134c4c'],
    features: ['crack', 'glyph', 'moss'],
    accent: ['#5d2c28', '#8a4836'],
    cover: 0.3,
    plank: 'wood',
    rim: '#657392',
  },
  // The caves: rough plates of slate, split by veins of crystal.
  cave: {
    ramp: ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e', '#657392'],
    bands: [2.95, 2.7, 2.45],
    grain: 0.5,
    pattern: 'rock',
    top: 'lip',
    topColors: ['#424c6e', '#2a2f4e'],
    features: ['vein', 'crack', 'crystal'],
    accent: ['#0069aa', '#0098dc', '#00cdf9'],
    cover: 0,
    plank: 'wood',
    rim: '#657392',
  },
  // The grotto: the same rock with every light eaten out of its veins.
  grotto: {
    ramp: ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e', '#657392'],
    bands: [2.8, 2.55, 2.3],
    grain: 0.45,
    pattern: 'rock',
    top: 'lip',
    topColors: ['#2a2f4e', '#1a1932'],
    features: ['vein', 'crack', 'pebble'],
    accent: ['#1a1932', '#2a2f4e', '#424c6e'],
    cover: 0,
    plank: 'wood',
    rim: '#424c6e',
  },
  // Arachna's chamber: cold rock with silk across it.
  web: {
    ramp: ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e', '#657392'],
    bands: [2.95, 2.7, 2.45],
    grain: 0.45,
    pattern: 'rock',
    top: 'lip',
    topColors: ['#424c6e', '#2a2f4e'],
    features: ['silk', 'vein', 'crack'],
    accent: ['#424c6e', '#657392', '#92a1b9'],
    cover: 0,
    plank: 'wood',
    rim: '#657392',
  },
  // Ignivor's chamber: the rock with embers where the crystal was.
  forge: {
    ramp: ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e', '#657392'],
    bands: [2.9, 2.65, 2.4],
    grain: 0.45,
    pattern: 'rock',
    top: 'lip',
    topColors: ['#424c6e', '#2a2f4e'],
    features: ['ember', 'crack', 'ember'],
    accent: ['#8e251d', '#c64524', '#e07438'],
    cover: 0,
    plank: 'wood',
    rim: '#657392',
  },
  // The drowned hall: wet blocks, algae on top, a tide mark down every face.
  drowned: {
    ramp: ['#0e071b', '#03193f', '#0c2e44', '#134c4c', '#0069aa'],
    bands: [3.15, 2.85, 2.55],
    grain: 0.45,
    pattern: 'wet',
    top: 'moss',
    topColors: ['#134c4c', '#0c2e44', '#1e6f50', '#134c4c'],
    features: ['drip', 'moss', 'crack'],
    accent: ['#0069aa', '#0098dc'],
    cover: 0.6,
    plank: 'iron',
    tide: true,
    rim: '#0069aa',
  },
  // The star altar: the hall's stone with stars set into it.
  altar: {
    ramp: ['#0e071b', '#03193f', '#0c2e44', '#134c4c', '#0069aa'],
    bands: [3.15, 2.85, 2.55],
    grain: 0.4,
    pattern: 'ashlar',
    top: 'moss',
    topColors: ['#134c4c', '#0c2e44', '#1e6f50', '#134c4c'],
    features: ['star', 'drip', 'crack'],
    accent: ['#657392', '#92a1b9'],
    cover: 0.35,
    plank: 'iron',
    tide: true,
    rim: '#0069aa',
  },
  // Burg Nachtfall: brick under a grey coping. Nothing grows here.
  castle: {
    ramp: ['#1c121c', '#391f21', '#5d2c28', '#8a4836', '#bf6f4a'],
    bands: [2.8, 2.5, 2.2],
    grain: 0.35,
    pattern: 'bricks',
    top: 'coping',
    topColors: ['#424c6e', '#2a2f4e', '#1a1932', '#0e071b'],
    features: ['crack', 'stain', 'crack'],
    accent: ['#391f21', '#1c121c'],
    cover: 0,
    plank: 'iron',
    rim: '#657392',
  },
  // The battlements: grey ashlar, cold under the moon.
  battlement: {
    ramp: ['#0e071b', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d', '#858585'],
    bands: [3.35, 3.05, 2.75],
    grain: 0.35,
    pattern: 'ashlar',
    top: 'coping',
    topColors: ['#424c6e', '#2a2f4e', '#1a1932', '#0e071b'],
    features: ['crack', 'crack', 'crack'],
    accent: [],
    cover: 0,
    plank: 'iron',
    rim: '#657392',
  },
  // The clock tower: brick, with brass plates riveted on.
  clock: {
    ramp: ['#1c121c', '#391f21', '#5d2c28', '#8a4836', '#bf6f4a'],
    bands: [2.8, 2.5, 2.2],
    grain: 0.35,
    pattern: 'bricks',
    top: 'coping',
    topColors: ['#424c6e', '#2a2f4e', '#1a1932', '#0e071b'],
    features: ['rivet', 'crack', 'rivet'],
    accent: ['#8a4836', '#bf6f4a', '#391f21'],
    cover: 0,
    plank: 'iron',
    rim: '#657392',
  },
  // The blood tower: the brick gone dark red, and stained.
  keep: {
    ramp: ['#1c121c', '#391f21', '#571c27', '#891e2b', '#c42430'],
    bands: [2.85, 2.55, 2.25],
    grain: 0.35,
    pattern: 'bricks',
    top: 'coping',
    topColors: ['#424c6e', '#2a2f4e', '#1a1932', '#0e071b'],
    features: ['stain', 'crack', 'pebble'],
    accent: ['#571c27', '#891e2b'],
    cover: 0,
    plank: 'iron',
    rim: '#657392',
  },
  // The throne room: great slabs of black marble veined with red, edged in bronze.
  throne: {
    ramp: ['#0e071b', '#131313', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d'],
    bands: [4.2, 3.9, 3.6],
    grain: 0.2,
    pattern: 'slabs',
    top: 'lip',
    topColors: ['#8a4836', '#5d2c28'],
    features: ['vein', 'crack', 'vein'],
    accent: ['#391f21', '#571c27', '#891e2b'],
    cover: 0,
    plank: 'iron',
    rim: '#8a4836',
  },
  // The rift: violet obsidian in facets, a few of the seams still glowing.
  rift: {
    ramp: ['#0e071b', '#1a1932', '#3b1443', '#622461', '#93388f'],
    bands: [3.25, 2.95, 2.65],
    grain: 0.25,
    pattern: 'facets',
    top: 'gloss',
    topColors: ['#622461', '#3b1443', '#93388f'],
    features: ['crack', 'crack', 'crack'],
    accent: ['#7a09fa', '#db3ffd', '#f389f5'],
    cover: 0,
    plank: 'glass',
    rim: '#93388f',
  },
  // The mirror ground: the rift so still the stone is polished.
  mirror: {
    ramp: ['#0e071b', '#1a1932', '#3b1443', '#622461', '#93388f'],
    bands: [3.2, 2.9, 2.6],
    grain: 0.1,
    pattern: 'facets',
    top: 'gloss',
    topColors: ['#622461', '#3b1443', '#93388f'],
    features: ['crack', 'crack', 'crack'],
    accent: ['#7a09fa', '#db3ffd', '#f389f5'],
    cover: 0,
    plank: 'glass',
    rim: '#93388f',
  },
  // Her lair: rift stone grown over, and bones.
  lair: {
    ramp: ['#0e071b', '#0c2e44', '#134c4c', '#1e6f50', '#33984b'],
    bands: [2.75, 2.45, 2.15],
    grain: 0.35,
    pattern: 'facets',
    top: 'moss',
    topColors: ['#134c4c', '#0c2e44', '#1e6f50', '#134c4c'],
    features: ['bone', 'crack', 'moss'],
    accent: ['#134c4c', '#1e6f50', '#33984b'],
    cover: 0.7,
    plank: 'stone',
    rim: '#1e6f50',
  },
  // The crystal hoard: blue rock grown through with prisms.
  crystal: {
    ramp: ['#0e071b', '#03193f', '#00396d', '#0069aa', '#0098dc'],
    bands: [2.65, 2.35, 2.05],
    grain: 0.3,
    pattern: 'prisms',
    top: 'gloss',
    topColors: ['#00396d', '#03193f', '#0069aa'],
    features: ['crystal', 'crack', 'crack'],
    accent: ['#0069aa', '#0098dc', '#00cdf9'],
    cover: 0,
    plank: 'glass',
    rim: '#0069aa',
  },
};

/** A material ready to draw with: colours as the words an ImageData holds, levels in sixteenths. */
interface Material {
  readonly def: MaterialDef;
  readonly ramp: Uint32Array;
  readonly last: number;
  readonly bands: Int32Array;
  readonly grain: number;
  readonly level: Int8Array;
  readonly special: Uint8Array;
  readonly top: Uint32Array;
  readonly accent: Uint32Array;
  /** Whether the top casts a shadow under itself: grass, moss, coping and boards do. */
  readonly shade: boolean;
  /** A seed of its own, so two materials side by side do not share their grain. */
  readonly seed: number;
}

const materials = new Map<string, Material>();

/** A seed from a material's name: the same ground looks the same whichever way it is reached. */
function nameSeed(name: string): number {
  let h = 17;
  for (let i = 0; i < name.length; i++) h = ihash(h, name.charCodeAt(i), 3) & 0xffff;
  return h;
}

function material(name: string): Material {
  let m = materials.get(name);
  if (!m) {
    const def = DEFS[name];
    const pattern = patternMap(def.pattern);
    m = {
      def,
      ramp: Uint32Array.from(def.ramp, abgrOf),
      last: def.ramp.length - 1,
      bands: Int32Array.from(def.bands, (b) => Math.round(b * 16)),
      grain: Math.round(def.grain * 16),
      level: pattern.level,
      special: pattern.special,
      top: Uint32Array.from(def.topColors, abgrOf),
      accent: Uint32Array.from(def.accent, abgrOf),
      shade: def.top !== 'lip' && def.top !== 'gloss',
      seed: nameSeed(name),
    };
    materials.set(name, m);
  }
  return m;
}

/** The material of ground ('=') and of cut stone ('#') in each area. */
const AREA_MATERIALS: Record<Area, readonly [string, string]> = {
  forest: ['earth', 'ashlar'],
  den: ['den', 'ashlar'],
  ruins: ['ruins', 'ashlar'],
  vault: ['vault', 'ashlar'],
  theater: ['theater', 'ashlar'],
  temple: ['temple', 'temple'],
  caverns: ['cave', 'cave'],
  grotto: ['grotto', 'grotto'],
  web: ['web', 'web'],
  forge: ['forge', 'forge'],
  drowned: ['drowned', 'drowned'],
  altar: ['altar', 'altar'],
  castle: ['castle', 'castle'],
  battlement: ['battlement', 'battlement'],
  clock: ['clock', 'clock'],
  keep: ['keep', 'keep'],
  throne: ['throne', 'throne'],
  rift: ['rift', 'rift'],
  mirror: ['mirror', 'mirror'],
  lair: ['lair', 'lair'],
  crystal: ['crystal', 'crystal'],
};

const AREAS = Object.keys(AREA_MATERIALS) as Area[];

/** Whether an area's ground grows a lip of grass or moss that hangs over its ledges. */
function overgrown(area: Area): boolean {
  const top = DEFS[AREA_MATERIALS[area][0]].top;
  return top === 'grass';
}

/* ------------------------------------------------------------- patterns */

/** Side of every repeating pattern, in art pixels. A power of two, so wrapping is a mask. */
const P = 256;
const PM = P - 1;

/**
 * A pattern: per pixel, how far up or down the ramp it moves (in sixteenths
 * of a step), and a code for pixels that are drawn in an accent colour - the
 * glowing seam in a facet, the light in a crystal.
 */
interface PatternMap {
  readonly level: Int8Array;
  readonly special: Uint8Array;
}

/** Special codes: a seam's halo, a seam's core, the body and the light of a crystal. */
const SP_HALO = 1;
const SP_CORE = 2;
const SP_PRISM = 3;
const SP_PRISM_LIT = 4;

const patterns = new Map<Pattern, PatternMap>();

function patternMap(kind: Pattern): PatternMap {
  let map = patterns.get(kind);
  if (!map) {
    map = buildPattern(kind);
    patterns.set(kind, map);
  }
  return map;
}

function buildPattern(kind: Pattern): PatternMap {
  const level = new Int8Array(P * P);
  const special = new Uint8Array(P * P);
  switch (kind) {
    case 'soil':
      break;
    case 'blocks':
      // Big weathered blocks, a tile high, many of them split across: worn
      // corners, the odd pit.
      masonry(level, 16, 18, 34, 101, 0.75, 9, 0.45);
      break;
    case 'wet':
      masonry(level, 8, 12, 30, 808, 0.6, 9, 0);
      break;
    case 'ashlar':
      masonry(level, 8, 14, 24, 202, 0.25, 8, 0);
      break;
    case 'bricks':
      masonry(level, 8, 10, 15, 303, 0.1, 7, 0);
      break;
    case 'slabs':
      masonry(level, 16, 22, 36, 404, 0.15, 10, 0.2);
      break;
    case 'rock':
      cells(level, special, 21, 1, 505, 'rock');
      break;
    case 'facets':
      cells(level, special, 12, 1, 606, 'facets');
      break;
    case 'prisms':
      cells(level, special, 16, 0.3, 707, 'prisms');
      break;
  }
  return { level, special };
}

/**
 * Masonry in a running bond: courses `course` pixels tall with a joint along
 * their foot, blocks between `minW` and `maxW` long, each course started at
 * its own offset so no joint lines up with the one above it - or with the
 * edge of a tile. Every block is bevelled for a light from the upper left: a
 * lighter top row and left column, a darker foot and right end. `wear`
 * rounds their corners and pits their faces; `bevel` is the strength of the
 * bevel in sixteenths of a ramp step; `split` is the share of blocks broken
 * across by a joint of their own, so a course of big blocks is not a row of
 * the same block.
 */
function masonry(
  level: Int8Array,
  course: number,
  minW: number,
  maxW: number,
  seed: number,
  wear: number,
  bevel: number,
  split: number,
): void {
  const courses = P / course;
  const starts = new Int32Array(P + 1);
  for (let c = 0; c < courses; c++) {
    // Lay the course: block starts from a random offset, wrapped round P.
    let n = 0;
    let x = ihash(c, 0, seed) % maxW;
    const first = x;
    while (x < first + P) {
      starts[n++] = x;
      x += minW + (ihash(c, n, seed + 1) % (maxW - minW + 1));
    }
    // The last block takes up the slack, or joins the one before it.
    if (first + P - starts[n - 1] < minW && n > 1) n--;
    for (let b = 0; b < n; b++) {
      const x0 = starts[b];
      const x1 = b + 1 < n ? starts[b + 1] : first + P;
      const tone = ((ihash(c, b, seed + 2) % 9) - 4) * 1.2;
      const cut = (ihash(c, b, seed + 5) % 1000) / 1000 < split ? 5 + (ihash(c, b, seed + 6) % (course - 9)) : -1;
      for (let yy = 0; yy < course; yy++) {
        const y = c * course + yy;
        for (let xx = x0; xx < x1; xx++) {
          const i = y * P + (xx & PM);
          const lx = xx - x0;
          const w = x1 - x0;
          let v: number;
          if (yy === course - 1 || lx === 0 || yy === cut) {
            v = -26; // the joint
          } else {
            v = tone;
            if (yy === 0 || yy === cut + 1) v += bevel;
            else if (yy === course - 2 || yy === cut - 1) v -= bevel * 0.8;
            if (lx === 1) v += bevel * 0.5;
            else if (lx === w - 1) v -= bevel * 0.5;
            // Worn corners: the joint eats into them.
            const corner = (lx === 1 || lx === w - 1) && (yy === 0 || yy === course - 2);
            if (corner && (ihash(xx, y, seed + 3) & 255) < wear * 255) v = -20;
            // Pits in the face.
            else if ((ihash(xx, y, seed + 4) & 1023) < wear * 22) v -= 14;
          }
          level[i] = Math.max(-127, Math.min(127, Math.round(v)));
        }
      }
    }
  }
}

/**
 * Plates of stone: the cells of a jittered grid (Voronoi), each the colour of
 * its own facing, split from its neighbours by a dark crack along its lower
 * right and lit along its upper left - raised plates under a light from the
 * upper left. `stretch` squashes the cells' height for tall prisms. The rift's
 * facets carry seams of light along a few of their cracks; the crystal hoard
 * grows a crystal in a few of its cells.
 */
function cells(
  level: Int8Array,
  special: Uint8Array,
  count: number,
  stretch: number,
  seed: number,
  kind: 'rock' | 'facets' | 'prisms',
): void {
  const size = P / count;
  const px = new Float32Array(count * count);
  const py = new Float32Array(count * count);
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      const k = j * count + i;
      px[k] = (i + 0.15 + (ihash(i, j, seed) % 1000) / 1430) * size;
      py[k] = (j + 0.15 + (ihash(i, j, seed + 1) % 1000) / 1430) * size;
    }
  }
  const id = new Int32Array(P * P);
  for (let y = 0; y < P; y++) {
    const cj = Math.floor(y / size);
    for (let x = 0; x < P; x++) {
      const ci = Math.floor(x / size);
      let best = Infinity;
      let bestK = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const j = (cj + dj + count) % count;
        const oy = cj + dj < 0 ? -P : cj + dj >= count ? P : 0;
        for (let di = -1; di <= 1; di++) {
          const i = (ci + di + count) % count;
          const ox = ci + di < 0 ? -P : ci + di >= count ? P : 0;
          const k = j * count + i;
          const dx = px[k] + ox - x;
          const dy = (py[k] + oy - y) * stretch;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bestK = k;
          }
        }
      }
      id[y * P + x] = bestK;
    }
  }
  const at = (x: number, y: number) => id[(y & PM) * P + (x & PM)];
  for (let y = 0; y < P; y++) {
    for (let x = 0; x < P; x++) {
      const k = at(x, y);
      const right = at(x + 1, y);
      const down = at(x, y + 1);
      const left = at(x - 1, y);
      const up = at(x, y - 1);
      const h = ihash(k, 0, seed + 2);
      if (kind !== 'rock') {
        // Glass and crystal: every facet a flat tone of its own by the way it
        // faces, the edges between them thin - a gloss along the upper left,
        // a shadow along the lower right - and no mortar.
        let v = ((h % 3) - 1) * 13;
        if (left !== k || up !== k) v += kind === 'prisms' && left !== k ? 22 : 16;
        else if (right !== k || down !== k) v -= kind === 'prisms' && right !== k ? 16 : 8;
        if (left !== k && up !== k) v += 10;
        if (kind === 'facets' && (right !== k || down !== k)) {
          // A few of the rift's edges still carry the light that split it.
          const n2 = right !== k ? right : down;
          if (ihash(Math.min(k, n2), Math.max(k, n2), seed + 3) % 100 < 16) special[y * P + x] = SP_CORE;
        }
        if (kind === 'prisms' && h % 100 < 7) special[y * P + x] = left !== k || up !== k ? SP_PRISM_LIT : SP_PRISM;
        level[y * P + x] = v;
        continue;
      }
      let v = ((h % 7) - 3) * 3;
      if (right !== k || down !== k) {
        v = -22;
      } else if (left !== k || up !== k) {
        v += 9;
      }
      level[y * P + x] = v;
    }
  }
  if (kind === 'facets') {
    // A seam's halo: the stone either side of it, warmed by its light.
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < P; x++) {
        const i = y * P + x;
        if (special[i] !== 0) continue;
        if (
          special[(y & PM) * P + ((x + 1) & PM)] === SP_CORE ||
          special[(y & PM) * P + ((x - 1) & PM)] === SP_CORE ||
          special[((y + 1) & PM) * P + x] === SP_CORE ||
          special[((y - 1) & PM) * P + x] === SP_CORE
        ) {
          special[i] = SP_HALO;
        }
      }
    }
  }
}

/** Grain: two octaves of value noise, -8..7 (half a ramp step either way at full strength). */
const GRAIN_SIZE = 64;
let grainMap: Int8Array | null = null;

function grain(): Int8Array {
  if (grainMap) return grainMap;
  const g = new Int8Array(GRAIN_SIZE * GRAIN_SIZE);
  const octave = (cell: number, seed: number, x: number, y: number): number => {
    const n = GRAIN_SIZE / cell;
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const v = (i: number, j: number) => (ihash(((i % n) + n) % n, ((j % n) + n) % n, seed) % 1000) / 1000;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const v = octave(8, 11, x, y) * 0.25 + octave(4, 12, x, y) * 0.45 + octave(2, 13, x, y) * 0.3;
      // Stretched so the clusters reach the ends of the range, then cut to -8..7.
      g[y * GRAIN_SIZE + x] = Math.max(-8, Math.min(7, Math.round((v - 0.5) * 30)));
    }
  }
  grainMap = g;
  return g;
}

/* ------------------------------------------------------------- tiles */

/** Tile kinds as the art sees them. */
const K_EMPTY = 0;
const K_EARTH = 1;
const K_STONE = 2;
const K_PLANK = 3;
const K_SPIKE = 4;
const K_LAVA_TOP = 5;
const K_LAVA = 6;
const K_DOOR = 7;

/**
 * What a tile is, for drawing. Above the level the rock of a ceiling carries
 * on, below it the ground (and a lava pit) does, and beyond either end there
 * is wall: an edge of the map is never a face with light on it.
 */
function artKind(level: Level, tx: number, ty: number): number {
  if (ty < 0) {
    const k = artKind(level, tx, 0);
    return k === K_EARTH || k === K_STONE ? k : K_EMPTY;
  }
  if (ty >= level.height) {
    const k = artKind(level, tx, level.height - 1);
    return k === K_EARTH || k === K_STONE || k === K_LAVA ? k : K_EMPTY;
  }
  if (tx < 0 || tx >= level.width) return K_STONE;
  switch (level.tileAt(tx, ty)) {
    case Tile.Earth:
      return K_EARTH;
    case Tile.Solid:
      return K_STONE;
    case Tile.Platform:
      return K_PLANK;
    case Tile.Spike:
      return K_SPIKE;
    case Tile.LavaTop:
      return K_LAVA_TOP;
    case Tile.Lava:
      return K_LAVA;
    case Tile.Gate:
    case Tile.Seal:
    case Tile.LairGate:
    case Tile.Ward:
      return K_DOOR;
    default:
      return K_EMPTY;
  }
}

const isMass = (k: number): boolean => k === K_EARTH || k === K_STONE;

/**
 * The shape of a terrain tile from its neighbours: the blob mask, reduced to
 * what the art draws. An outer corner - open on two sides that meet - is
 * chipped by one to three pixels along a diagonal; under a lip of grass the
 * top corners stay square, because the grass hangs out over them instead.
 * Shared with the rim light (render/rims.ts), so the light runs along the
 * pixels that are there rather than round the square the tile used to be.
 */
export interface TileShape {
  /** Chip at each corner, in art pixels: top-left, top-right, bottom-left, bottom-right. */
  tl: number;
  tr: number;
  bl: number;
  br: number;
  /** Open faces. */
  top: boolean;
  left: boolean;
  right: boolean;
  bottom: boolean;
  /** Grass or a coping stone sticking out past a side, at the top. */
  hangL: number;
  hangR: number;
}

/**
 * The colour light catches the top edge of a tile in - its material's own
 * highlight, or a plank's - as "#rrggbb", or null for anything else.
 */
export function rimColorAt(level: Level, tx: number, ty: number): string | null {
  const k = artKind(level, tx, ty);
  const names = AREA_MATERIALS[areaAt(tx * TILE)];
  if (k === K_PLANK) return PLANK_RIM[DEFS[names[0]].plank];
  if (!isMass(k)) return null;
  return DEFS[names[k === K_STONE ? 1 : 0]].rim;
}

const PLANK_RIM: Record<MaterialDef['plank'], string> = {
  wood: '#bf6f4a',
  iron: '#bf6f4a',
  stone: '#33984b',
  glass: '#ca52c9',
};

/** Reads a tile's shape into `out`; false if the tile is not terrain. */
export function tileShape(level: Level, tx: number, ty: number, out: TileShape): boolean {
  if (!isMass(artKind(level, tx, ty))) return false;
  shapeFrom(
    artKind(level, tx, ty - 1),
    artKind(level, tx, ty + 1),
    artKind(level, tx - 1, ty),
    artKind(level, tx + 1, ty),
    tx,
    ty,
    areaAt(tx * TILE),
    out,
  );
  return true;
}

function shapeFrom(n: number, s: number, w: number, e: number, tx: number, ty: number, area: Area, out: TileShape): void {
  const h = ihash(tx, ty, 41);
  out.top = !isMass(n);
  out.bottom = !isMass(s);
  out.left = !isMass(w);
  out.right = !isMass(e);
  const soft = overgrown(area) && n === K_EMPTY;
  const coping = DEFS[AREA_MATERIALS[area][0]].top === 'coping' && n === K_EMPTY;
  const capped = soft || coping;
  out.tl = out.top && out.left && !capped ? 1 + (h & 1) : 0;
  out.tr = out.top && out.right && !capped ? 1 + ((h >> 1) & 1) : 0;
  out.bl = out.bottom && out.left ? 2 + ((h >> 2) & 1) : 0;
  out.br = out.bottom && out.right ? 2 + ((h >> 3) & 1) : 0;
  // Grass and coping hang out over a drop - not over spikes or lava beside them.
  out.hangL = capped && out.left && w === K_EMPTY ? 1 : 0;
  out.hangR = capped && out.right && e === K_EMPTY ? 1 : 0;
}

/* ------------------------------------------------------------- chunks */

/** Region round a chunk, in tiles and pixels. */
const RT_W = CHUNK + MARGIN * 2;
const RW = RT_W * TPX;

interface Chunk {
  canvas: HTMLCanvasElement;
  used: number;
}

/** A run of lava surface, for the per-frame surface. Tile coordinates. */
export interface LavaRun {
  tx0: number;
  tx1: number;
  ty: number;
}

/** A door tile of a boss room, drawn per frame because it opens and shuts. */
export interface DoorTile {
  tx: number;
  ty: number;
  tile: Tile;
}

/**
 * The finished ground of one level, cut into chunks that are drawn on first
 * sight and kept while they are near.
 */
export class TerrainArt {
  private readonly chunks = new Map<number, Chunk>();
  private readonly count: number;
  private frame = 0;
  /** Lava surfaces and boss-room doors, left to right: what is drawn per frame. */
  readonly lavaRuns: LavaRun[] = [];
  readonly doors: DoorTile[] = [];

  // Scratch for building a chunk, shared by all of them.
  private readonly rh: number;
  private readonly kinds: Uint8Array;
  /** Region tiles that are terrain or touch it: only there can an open pixel hold grass. */
  private readonly near: Uint8Array;
  private readonly mask: Uint8Array;
  private readonly dist: Uint16Array;
  private readonly up: Uint8Array;
  private readonly over: Uint32Array;
  private readonly feat: Int8Array;
  private readonly featColor: Uint32Array;
  private readonly colArea: Uint8Array;
  /** The ground's and the cut stone's material of every pixel column of the region. */
  private readonly colEarth: Material[] = [];
  private readonly colStone: Material[] = [];
  /** And how deep their top layers run there, and whether their growth covers it. */
  private readonly depthE = new Uint8Array(RW);
  private readonly depthS = new Uint8Array(RW);
  private readonly coverE = new Uint8Array(RW);
  private readonly coverS = new Uint8Array(RW);
  private readonly image: ImageData;
  /** Canvases of chunks that were let go, for the next chunk to draw into. */
  private readonly spare: HTMLCanvasElement[] = [];
  private readonly shape: TileShape = {
    tl: 0,
    tr: 0,
    bl: 0,
    br: 0,
    top: false,
    left: false,
    right: false,
    bottom: false,
    hangL: 0,
    hangR: 0,
  };

  constructor(private readonly level: Level) {
    this.count = Math.ceil(level.width / CHUNK);
    const rtH = level.height + MARGIN * 2;
    this.rh = rtH * TPX;
    const n = RW * this.rh;
    this.kinds = new Uint8Array(RT_W * rtH);
    this.near = new Uint8Array(RT_W * rtH);
    this.mask = new Uint8Array(n);
    this.dist = new Uint16Array(n);
    this.up = new Uint8Array(n);
    this.over = new Uint32Array(n);
    this.feat = new Int8Array(n);
    this.featColor = new Uint32Array(n);
    this.colArea = new Uint8Array(RW);
    this.image = new ImageData(CHUNK * TPX, level.height * TPX);

    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const t = level.tileAt(tx, ty);
        if (t === Tile.LavaTop && level.tileAt(tx - 1, ty) !== Tile.LavaTop) {
          let tx1 = tx;
          while (level.tileAt(tx1 + 1, ty) === Tile.LavaTop) tx1++;
          this.lavaRuns.push({ tx0: tx, tx1, ty });
        }
        if (t === Tile.Gate || t === Tile.Seal || t === Tile.LairGate || t === Tile.Ward) {
          this.doors.push({ tx, ty, tile: t });
        }
      }
    }
    this.lavaRuns.sort((a, b) => a.tx0 - b.tx0);
    this.doors.sort((a, b) => a.tx - b.tx);
    // Every material's pattern and the grain, made now rather than in the
    // middle of the first frame that needs them.
    for (const name of Object.keys(DEFS)) material(name);
    grain();
  }

  /**
   * Copies the chunks under the view onto the frame (whose transform maps
   * logical pixels to art pixels), building what is missing. At most one
   * chunk that is not yet on screen is built ahead per frame, the next one in
   * whichever direction the view goes, so walking on never waits for one.
   */
  draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number, viewW: number, viewH: number): void {
    this.frame++;
    const span = CHUNK * TILE;
    const c0 = Math.max(0, Math.floor(viewX / span));
    const c1 = Math.min(this.count - 1, Math.floor((viewX + viewW - 1) / span));
    const height = this.level.height * TILE;
    const y0 = Math.max(0, viewY);
    const y1 = Math.min(height, viewY + viewH);
    if (y1 <= y0) return;
    let built = false;
    for (let c = c0; c <= c1; c++) {
      let chunk = this.chunks.get(c);
      if (!chunk) {
        chunk = this.build(c);
        built = true;
      }
      chunk.used = this.frame;
      const x0 = Math.max(c * span, viewX);
      const x1 = Math.min((c + 1) * span, viewX + viewW);
      // Source in art pixels, destination in logical: one to one on the art grid.
      const sx = Math.floor((x0 - c * span) / ART);
      const sy = Math.floor(y0 / ART);
      const sw = Math.ceil((x1 - x0) / ART);
      const sh = Math.ceil((y1 - y0) / ART);
      ctx.drawImage(chunk.canvas, sx, sy, sw, sh, c * span + sx * ART, sy * ART, sw * ART, sh * ART);
    }
    if (!built) {
      for (const c of [c1 + 1, c0 - 1, c1 + 2, c0 - 2]) {
        if (c >= 0 && c < this.count && !this.chunks.has(c)) {
          this.build(c).used = this.frame;
          break;
        }
      }
    }
    if (this.chunks.size > KEEP) {
      let oldest = -1;
      let age = Infinity;
      for (const [c, chunk] of this.chunks) {
        if (chunk.used < age) {
          age = chunk.used;
          oldest = c;
        }
      }
      const chunk = this.chunks.get(oldest);
      if (chunk) {
        this.spare.push(chunk.canvas);
        this.chunks.delete(oldest);
      }
    }
  }

  /** Draws chunk `c` from scratch. */
  private build(c: number): Chunk {
    const level = this.level;
    const H = level.height;
    const RH = this.rh;
    const rtH = H + MARGIN * 2;
    const tx0 = c * CHUNK - MARGIN;
    const { kinds, mask, dist, up, over, feat, featColor, colArea, colEarth, colStone } = this;
    const { depthE, depthS, coverE, coverS } = this;

    // Tiles of the region, and the materials of every pixel column.
    for (let j = 0; j < rtH; j++) {
      for (let i = 0; i < RT_W; i++) kinds[j * RT_W + i] = artKind(level, tx0 + i, j - MARGIN);
    }
    for (let i = 0; i < RT_W; i++) {
      const area = areaAt((tx0 + i) * TILE);
      const index = AREAS.indexOf(area);
      const earth = material(AREA_MATERIALS[area][0]);
      const stone = material(AREA_MATERIALS[area][1]);
      for (let x = i * TPX; x < (i + 1) * TPX; x++) {
        const wx = tx0 * TPX + x;
        colArea[x] = index;
        colEarth[x] = earth;
        colStone[x] = stone;
        depthE[x] = topDepth(earth, wx);
        depthS[x] = topDepth(stone, wx);
        coverE[x] = covered(earth, wx) ? 1 : 0;
        coverS[x] = covered(stone, wx) ? 1 : 0;
      }
    }
    const kindAt = (i: number, j: number): number =>
      i < 0 || j < 0 || i >= RT_W || j >= rtH ? artKind(level, tx0 + i, j - MARGIN) : kinds[j * RT_W + i];
    // Which tiles are terrain or next to it, and the rows terrain is found in:
    // the air of a chunk is most of it, and none of the work below is needed there.
    const near = this.near;
    near.fill(0);
    let jMin = rtH;
    let jMax = -1;
    for (let j = 0; j < rtH; j++) {
      for (let i = 0; i < RT_W; i++) {
        if (!isMass(kinds[j * RT_W + i])) continue;
        if (j < jMin) jMin = j;
        if (j > jMax) jMax = j;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii >= 0 && jj >= 0 && ii < RT_W && jj < rtH) near[jj * RT_W + ii] = 1;
          }
        }
      }
    }
    const yA = Math.max(1, (jMin - 1) * TPX);
    const yB = Math.min(RH - 1, (jMax + 2) * TPX);

    // The solid mask: whole tiles, then the corners chipped and filled.
    mask.fill(0);
    over.fill(0);
    feat.fill(0);
    featColor.fill(0);
    const shape = this.shape;
    for (let j = 0; j < rtH; j++) {
      for (let i = 0; i < RT_W; i++) {
        const k = kinds[j * RT_W + i];
        if (!near[j * RT_W + i]) continue;
        const x0 = i * TPX;
        const y0 = j * TPX;
        if (isMass(k)) {
          for (let y = 0; y < TPX; y++) mask.fill(1, (y0 + y) * RW + x0, (y0 + y) * RW + x0 + TPX);
          shapeFrom(kindAt(i, j - 1), kindAt(i, j + 1), kindAt(i - 1, j), kindAt(i + 1, j), tx0 + i, j - MARGIN, AREAS[colArea[x0 + 8]], shape);
          chip(mask, x0, y0, shape.tl, 1, 1);
          chip(mask, x0 + TPX - 1, y0, shape.tr, -1, 1);
          chip(mask, x0, y0 + TPX - 1, shape.bl, 1, -1);
          chip(mask, x0 + TPX - 1, y0 + TPX - 1, shape.br, -1, -1);
        } else if (k === K_EMPTY || k === K_DOOR) {
          // Inner corners: where a floor meets a wall, the corner is filled.
          const h = ihash(tx0 + i, j - MARGIN, 43);
          const s = isMass(kindAt(i, j + 1));
          const w = isMass(kindAt(i - 1, j));
          const e = isMass(kindAt(i + 1, j));
          const n = isMass(kindAt(i, j - 1));
          const fill = 1 + (h & 1);
          if (s && w && isMass(kindAt(i - 1, j + 1))) fillet(mask, x0, y0 + TPX - 1, fill, 1, -1);
          if (s && e && isMass(kindAt(i + 1, j + 1))) fillet(mask, x0 + TPX - 1, y0 + TPX - 1, fill, -1, -1);
          if (n && w && isMass(kindAt(i - 1, j - 1))) fillet(mask, x0, y0, 1, 1, 1);
          if (n && e && isMass(kindAt(i + 1, j - 1))) fillet(mask, x0 + TPX - 1, y0, 1, -1, 1);
        }
      }
    }

    // Distance from the nearest open pixel, weighted so that it grows
    // fastest upwards: the lit band is deep under a floor, thinner along a
    // wall and thinnest under a ceiling, which no light reaches. The forward
    // pass also counts the rows of solid down from the open pixel above
    // (1 = the surface row), which is what the top layers are measured in.
    dist.fill(0);
    up.fill(0);
    for (let i = yA * RW; i < yB * RW; i++) if (mask[i]) dist[i] = 4000;
    for (let y = yA; y < yB; y++) {
      let i = y * RW + 1;
      for (let x = 1; x < RW - 1; x++, i++) {
        if (!mask[i]) continue;
        const u = up[i - RW];
        up[i] = u < 255 ? u + 1 : 255;
        let d = dist[i];
        const a = dist[i - 1] + 3;
        if (a < d) d = a;
        const b = dist[i - RW] + 2;
        if (b < d) d = b;
        const e = dist[i - RW - 1] + 4;
        if (e < d) d = e;
        const f = dist[i - RW + 1] + 4;
        if (f < d) d = f;
        dist[i] = d;
      }
    }
    for (let y = yB - 1; y >= yA; y--) {
      let i = y * RW + RW - 2;
      for (let x = RW - 2; x >= 1; x--, i--) {
        if (!mask[i]) continue;
        let d = dist[i];
        const a = dist[i + 1] + 3;
        if (a < d) d = a;
        const b = dist[i + RW] + 4;
        if (b < d) d = b;
        const e = dist[i + RW + 1] + 5;
        if (e < d) d = e;
        const f = dist[i + RW - 1] + 5;
        if (f < d) d = f;
        dist[i] = d;
      }
    }

    // What stands in the open: planks and what holds them, spikes, lava.
    this.dressOpen(tx0, rtH);
    // The variants of every tile, stamped into the body.
    this.stampFeatures(tx0, rtH);

    // And the pixels themselves.
    const out = new Uint32Array(this.image.data.buffer);
    const OW = CHUNK * TPX;
    const OH = H * TPX;
    const g = grain();
    const wx0 = tx0 * TPX;
    for (let oy = 0; oy < OH; oy++) {
      const y = oy + MARGIN * TPX;
      const wy = oy;
      // Areas meet along a ragged line rather than a ruled one.
      const jitter = (ihash(wy, 0, 77) % 9) - 4;
      const brow = (wy & 3) * 4;
      const trow = (y >> 4) * RT_W;
      for (let ox = 0; ox < OW; ox++) {
        const x = ox + MARGIN * TPX;
        const i = y * RW + x;
        const o = oy * OW + ox;
        if (!mask[i]) {
          out[o] = over[i] !== 0 ? over[i] : near[trow + (x >> 4)] ? this.openPixel(i, x, y, wx0 + x, wy) : 0;
          continue;
        }
        const wx = wx0 + x;
        const ax = x + jitter < 0 ? 0 : x + jitter >= RW ? RW - 1 : x + jitter;
        const stone = kinds[trow + (x >> 4)] === K_STONE;
        const cols = stone ? colStone : colEarth;
        const m = cols[ax];
        // The column's own top layer, unless a neighbouring area reaches in here.
        const own = m === cols[x];
        const depth = own ? (stone ? depthS[x] : depthE[x]) : topDepth(m, wx);
        const du = up[i];
        // The open top first: grass, moss, a lip of stone, boards.
        if (du <= 7) {
          const aboveKind = kinds[((y - du) >> 4) * RT_W + (x >> 4)];
          const cover = own ? (stone ? coverS[x] : coverE[x]) === 1 : covered(m, wx);
          const top = topPixel(m, wx, wy, du, aboveKind === K_EMPTY || aboveKind === K_DOOR, depth, cover);
          if (top !== 0) {
            out[o] = top;
            continue;
          }
        }
        // The depth band, dithered where one meets the next.
        const d = dist[i] + (BAYER[brow + (wx & 3)] - 7.5) * 0.7;
        const band = d < 22 ? 0 : d < 54 ? 1 : 2;
        const fc = featColor[i];
        if (fc !== 0) {
          out[o] = fc < 8 ? STONE_RAMP[band === 0 ? fc : fc - 1] : fc;
          continue;
        }
        const pi = ((wy & PM) << 8) | (wx & PM);
        const sp = m.special[pi];
        if (sp !== 0 && band < 2) {
          const sc = specialPixel(m, sp, band);
          if (sc !== 0) {
            out[o] = sc;
            continue;
          }
        }
        let lv = m.bands[band] + m.level[pi] + ((g[((wy + m.seed) & 63) * 64 + ((wx + m.seed * 7) & 63)] * m.grain) >> 4) + feat[i];
        // Faces: lit on the left, in shade on the right and underneath.
        if (!mask[i - 1]) lv += 9;
        else if (!mask[i + 1]) lv -= 8;
        if (!mask[i + RW]) lv -= 12;
        else if (!mask[i + RW * 2]) lv -= 5;
        // A shadow under a lip of grass or coping.
        if (m.shade && du === depth + 1) lv -= 10;
        // The tide mark of the drowned hall, on every face it crosses.
        if (m.def.tide && wy % 48 === 27 && (!mask[i - 1] || !mask[i + 1] || !mask[i - 2] || !mask[i + 2])) {
          out[o] = TIDE;
          continue;
        }
        const ri = lv >> 4;
        out[o] = m.ramp[ri < 0 ? 0 : ri > m.last ? m.last : ri];
      }
    }
    const canvas = this.spare.pop() ?? makeCanvas(OW, OH).canvas;
    (canvas.getContext('2d') as CanvasRenderingContext2D).putImageData(this.image, 0, 0);
    const chunk = { canvas, used: this.frame };
    this.chunks.set(c, chunk);
    return chunk;
  }

  /**
   * A pixel in the open, next to terrain, that nothing was stamped on: the
   * grass standing on a surface below it, or hanging out past the edge beside
   * it; else nothing.
   */
  private openPixel(i: number, x: number, y: number, wx: number, wy: number): number {
    const { mask, up, kinds, colEarth, colStone, coverE, coverS } = this;
    const tile = kinds[(y >> 4) * RT_W + (x >> 4)];
    if (tile !== K_EMPTY && tile !== K_DOOR) return 0;
    // Blades: on a grass surface one to three pixels below.
    let below = 0;
    if (mask[i + RW]) below = 1;
    else if (mask[i + RW * 2]) below = 2;
    else if (mask[i + RW * 3]) below = 3;
    if (below > 0 && up[i + RW * below] === 1) {
      const stone = kinds[((y + below) >> 4) * RT_W + (x >> 4)] === K_STONE;
      const m = stone ? colStone[x] : colEarth[x];
      if (m.def.top === 'grass' && (stone ? coverS[x] : coverE[x]) === 1) {
        const h = bladeHeight(wx, m.seed);
        if (h >= below) return below === h ? m.top[0] : m.top[1];
      }
    }
    // Overhang: the top of the ground beside, carried one pixel out.
    for (let side = 1; side >= -1; side -= 2) {
      const si = i + side;
      if (!mask[si]) continue;
      const du = up[si];
      if (du < 1 || du > 3) continue;
      const stone = kinds[(y >> 4) * RT_W + ((x + side) >> 4)] === K_STONE;
      const m = stone ? colStone[x + side] : colEarth[x + side];
      const top = m.def.top;
      if (top === 'grass') {
        if ((stone ? coverS[x + side] : coverE[x + side]) !== 1) continue;
        if (du === 1) return m.top[0];
        if (du === 2) return m.top[1];
        // A strand of it hangs down a pixel further now and then.
        if ((ihash(wx, wy, 5) & 3) === 0) return m.top[2];
      } else if (top === 'coping') {
        if (du === 1) return m.top[0];
        if (du <= 3) return m.top[du === 3 ? 2 : 1];
      }
    }
    return 0;
  }

  /** Planks and what holds them up, spikes, and the lava under its surface. */
  private dressOpen(tx0: number, rtH: number): void {
    const { kinds, over, mask } = this;
    const level = this.level;
    for (let j = 0; j < rtH; j++) {
      for (let i = 0; i < RT_W; i++) {
        const k = kinds[j * RT_W + i];
        const tx = tx0 + i;
        const ty = j - MARGIN;
        const x0 = i * TPX;
        const y0 = j * TPX;
        if (k === K_SPIKE) {
          drawSpikes(over, x0, y0, tx, ty);
        } else if (k === K_LAVA || k === K_LAVA_TOP) {
          for (let y = k === K_LAVA_TOP ? LAVA_STATIC : 0; y < TPX; y++) {
            for (let x = 0; x < TPX; x++) {
              over[(y0 + y) * RW + x0 + x] = lavaBody((tx0 + i) * TPX + x, ty * TPX + y);
            }
          }
        } else if (k === K_PLANK) {
          const area = areaAt(tx * TILE);
          const style = DEFS[AREA_MATERIALS[area][0]].plank;
          const leftEnd = level.tileAt(tx - 1, ty) !== Tile.Platform;
          const rightEnd = level.tileAt(tx + 1, ty) !== Tile.Platform;
          // Where along its run this tile sits, for the boards and the supports.
          let runStart = tx;
          while (level.tileAt(runStart - 1, ty) === Tile.Platform) runStart--;
          let runEnd = tx;
          while (level.tileAt(runEnd + 1, ty) === Tile.Platform) runEnd++;
          drawPlank(over, x0, y0, tx, ty, style, leftEnd, rightEnd, runStart, runEnd);
          // The supports: hung from whatever is above, or from above the sky.
          const runW = (runEnd - runStart + 1) * TPX;
          const supports = runW >= 7 * TPX ? [4, runW >> 1, runW - 5] : [4, runW - 5];
          for (const s of supports) {
            const wx = runStart * TPX + s;
            const lx = wx - tx * TPX;
            if (lx < 0 || lx >= TPX) continue;
            drawHanger(over, mask, kinds, x0 + lx, y0, style, wx);
          }
        }
      }
    }
  }

  /** Stamps every tile's variant into the body: a stone, a root, a vein... */
  private stampFeatures(tx0: number, rtH: number): void {
    const { kinds, mask, up, feat, featColor } = this;
    for (let j = 0; j < rtH; j++) {
      for (let i = 0; i < RT_W; i++) {
        const k = kinds[j * RT_W + i];
        if (!isMass(k)) continue;
        const tx = tx0 + i;
        const area = areaAt(tx * TILE);
        const m = material(AREA_MATERIALS[area][k === K_STONE ? 1 : 0]);
        const h = ihash(tx, j - MARGIN, m.seed + 3);
        const variant = h & 3;
        if (variant === 0) continue;
        const kind = m.def.features[variant - 1];
        // Roots, drips and moss start from a surface, so they need one above.
        if ((kind === 'root' || kind === 'drip' || kind === 'moss') && (j === 0 || isMass(kinds[(j - 1) * RT_W + i]))) continue;
        // Anywhere in the tile; what it draws may reach into the next one.
        const x = i * TPX + ((h >>> 4) & 15);
        const y = j * TPX + ((h >>> 8) & 15);
        stampFeature(kind, m, x, y, h >>> 12, tx0 * TPX, -MARGIN * TPX, mask, up, feat, featColor);
      }
    }
  }
}

/** Removes a corner of `size` pixels along a diagonal, stepping (dx, dy) inwards. */
function chip(mask: Uint8Array, x: number, y: number, size: number, dx: number, dy: number): void {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size - j; i++) mask[(y + j * dy) * RW + x + i * dx] = 0;
  }
}

/** Fills an inner corner by `size` pixels along a diagonal. */
function fillet(mask: Uint8Array, x: number, y: number, size: number, dx: number, dy: number): void {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size - j; i++) mask[(y + j * dy) * RW + x + i * dx] = 1;
  }
}

/* ------------------------------------------------------------- the top */

/** Whether the growth on a top covers this column (dens and ruins are bare in places). */
function covered(m: Material, wx: number): boolean {
  if (m.def.cover >= 1) return true;
  const a = ihash(wx >> 3, 0, m.seed + 9) % 1000;
  const b = ihash((wx >> 3) + 1, 0, m.seed + 9) % 1000;
  const t = (wx & 7) / 8;
  return (a + (b - a) * t) / 1000 < m.def.cover;
}

/** How deep the top layer of a material runs in this column. */
function topDepth(m: Material, wx: number): number {
  switch (m.def.top) {
    case 'grass': {
      if (!covered(m, wx)) return 1;
      const a = ihash(wx >> 2, 1, m.seed) % 2;
      const b = ihash((wx >> 2) + 1, 1, m.seed) % 2;
      return 3 + ((wx & 3) < 2 ? a : b) + (ihash(wx, 2, m.seed) % 100 < 20 ? 1 + (ihash(wx, 3, m.seed) % 3) : 0);
    }
    case 'moss':
      return 2;
    case 'coping':
      return 6;
    case 'boards':
      return 6;
    default:
      return 2;
  }
}

/** Height of the blade of grass standing in this column, 0..3: tufts, not a fence. */
function bladeHeight(wx: number, seed: number): number {
  // Tufts: one in most stretches of eight pixels, at a place of its own.
  const cell = wx >> 3;
  const t = ihash(cell, 4, seed);
  const centre = (cell << 3) + (t & 7);
  const d = Math.abs(wx - centre);
  if (t % 100 < 70 && d <= 2) {
    const tall = 1 + ((t >>> 8) % 3);
    const h = tall - d;
    if (h > 0) return h;
  }
  // And single blades between them.
  const s = ihash(wx, 5, seed) % 100;
  return s < 12 ? 1 : 0;
}

/**
 * The top layer of a material, `du` rows down from the open pixel above
 * (1 = the surface row). 0 means "body": the layer has ended here. `open` is
 * false under spikes and lava, where nothing grows and only a bare lip shows.
 * `depth` and `cover` are the column's topDepth() and covered(), worked out
 * once per column rather than once per pixel.
 */
function topPixel(m: Material, wx: number, wy: number, du: number, open: boolean, depth: number, cover: boolean): number {
  const t = m.top;
  const h = ihash(wx, wy, m.seed + 21);
  switch (open ? m.def.top : 'bare') {
    case 'grass': {
      if (!cover) return du === 1 ? m.ramp[3] : 0;
      if (du > depth) return 0;
      if (du === 1) return (h & 1) === 0 ? t[1] : t[0];
      if (du === 2) return (h & 7) === 0 ? t[0] : t[1];
      // The bottom pixel of a long strand is in shade.
      return du === depth && depth > 4 ? t[2] : t[1];
    }
    case 'moss': {
      if (du > 2) return 0;
      if (cover) {
        // Moss over the edge, a strand of it hanging now and then.
        return du === 1 ? t[2] : t[3];
      }
      if (du === 1) return t[0];
      return (h & 3) === 0 ? 0 : t[1];
    }
    case 'coping': {
      if (du > 6) return 0;
      // A course of grey coping stones on top of the brick, jointed every so often.
      const joint = coping(wx);
      if (du === 6) return t[3];
      if (joint === 0) return t[3];
      if (du === 1) return t[0];
      if (du === 5) return t[2];
      if (joint === 1) return t[0];
      return (h & 15) === 0 ? t[2] : t[1];
    }
    case 'boards': {
      if (du > 6) return 0;
      // Stage boards: grain along them, a seam and two nails where they butt.
      const seam = (wx + 5) % 19;
      if (du === 6) return t[3];
      if (seam === 0) return t[3];
      if (du === 1) return t[0];
      if (du === 5) return t[2];
      if (du === 3 && (seam === 1 || seam === 18)) return t[4];
      return (ihash(wx >> 2, wy, m.seed) & 7) === 0 ? t[2] : t[1];
    }
    case 'gloss': {
      if (du === 1) return (h % 100) < 7 ? t[2] : t[0];
      if (du === 2) return (h & 1) === 0 ? t[1] : 0;
      return 0;
    }
    case 'lip': {
      if (du === 1) return t[0];
      if (du === 2) return (h % 10) < 7 ? t[1] : 0;
      return 0;
    }
    default: {
      // Bare: under spikes and lava, the surface is only a little lighter.
      if (du === 1) return m.ramp[Math.min(m.ramp.length - 1, (m.bands[0] >> 4) + 1)];
      return 0;
    }
  }
}

/** Where a coping stone ends: 0 on the joint, 1 just after it (lit), else 2. */
function coping(wx: number): number {
  const block = Math.floor(wx / 23);
  const start = block * 23 + (ihash(block, 6, 3) % 6);
  if (wx === start) return 0;
  if (wx === start + 1) return 1;
  return 2;
}

/** A pixel of a pattern drawn in its own colour: a seam of light, a crystal. */
function specialPixel(m: Material, sp: number, band: number): number {
  const a = m.accent;
  if (a.length < 2) return 0;
  switch (sp) {
    case SP_CORE:
      return band === 0 ? a[1] : a[0];
    case SP_HALO:
      return band === 0 ? a[0] : 0;
    case SP_PRISM:
      return a[0];
    case SP_PRISM_LIT:
      return band === 0 && a.length > 2 ? a[2] : a[1];
    default:
      return 0;
  }
}

/* ------------------------------------------------------------- features */

/** A small shape: rows of characters, each a step along the ramp ('.' leaves the body be). */
interface Stamp {
  rows: string[];
}

/** Steps along the ramp, in sixteenths, for the characters of a stamp. */
const STEP: Record<string, number> = {
  c: -24, // a crack
  l: 10, // the lit lip of a crack
};

/**
 * Stones lying in the ground are grey whatever the ground is, and darker the
 * deeper they lie: a stamp marks them with a tone (outline, shade, body,
 * light) that is looked up here, a step lower below the surface band.
 */
const STONE_RAMP = Uint32Array.from(['#1a1932', '#272727', '#3d3d3d', '#5d5d5d', '#858585'], abgrOf);
const STONE_TONE: Record<string, number> = { o: 1, d: 2, b: 3, h: 4 };

const PEBBLES: Stamp[] = [
  { rows: ['.oo.', 'ohbo', '.oo.'] },
  { rows: ['.ooo.', 'ohbbo', 'obbdo', '.ooo.'] },
  { rows: ['.oo', 'ohb', '.oo'] },
];

const STONES: Stamp[] = [
  { rows: ['..ooo..', '.ohhbo.', 'ohbbbdo', 'obbbddo', '.ooooo.'] },
  { rows: ['.oooo..', 'ohhbbo.', 'ohbbbdo', '.obbddo', '..oooo.'] },
];

const GLYPH: Stamp = { rows: ['..c..', '.c.c.', 'c.c.c', '.c.c.', '..c..'] };

function stampFeature(
  kind: Feature,
  m: Material,
  x: number,
  y: number,
  h: number,
  wx: number,
  wy: number,
  mask: Uint8Array,
  up: Uint8Array,
  feat: Int8Array,
  featColor: Uint32Array,
): void {
  // Random turns are taken from world coordinates (region + (wx, wy)), never
  // the region's own: a feature that reaches over a chunk's edge is stamped by
  // both chunks, and must take the same path in each.
  const at = (px: number, py: number, seed: number): number => ihash(px + wx, py + wy, seed);
  const RH = mask.length / RW;
  const put = (px: number, py: number, step: number): void => {
    if (px < 0 || py < 0 || px >= RW || py >= RH) return;
    const i = py * RW + px;
    if (!mask[i] || up[i] <= 3) return;
    feat[i] = Math.max(-100, Math.min(100, step));
  };
  const paint = (px: number, py: number, color: number, deep = 3): void => {
    if (px < 0 || py < 0 || px >= RW || py >= RH) return;
    const i = py * RW + px;
    if (!mask[i] || up[i] <= deep) return;
    featColor[i] = color;
  };
  const stamp = (s: Stamp, ox: number, oy: number): void => {
    for (let r = 0; r < s.rows.length; r++) {
      const row = s.rows[r];
      for (let q = 0; q < row.length; q++) {
        const ch = row[q];
        if (ch === '.') continue;
        if (STONE_TONE[ch]) paint(ox + q, oy + r, STONE_TONE[ch]);
        else put(ox + q, oy + r, STEP[ch] ?? 0);
      }
    }
  };
  switch (kind) {
    case 'pebble':
      stamp(PEBBLES[h % PEBBLES.length], x - 2, y - 1);
      break;
    case 'stone':
      stamp(STONES[h % STONES.length], x - 3, y - 2);
      break;
    case 'root': {
      // Only under a surface: down from the grass, wandering, a fork or two.
      let rx = x;
      let ry = y - (y % TPX) + 3;
      const len = 6 + (h % 9);
      for (let s = 0; s < len; s++) {
        put(rx, ry, -22);
        const t = at(rx, ry, 9) % 100;
        if (t < 22) rx--;
        else if (t > 78) rx++;
        if (t > 92) put(rx + 1, ry, -16);
        ry++;
      }
      break;
    }
    case 'crack': {
      let cx = x;
      let cy = y;
      const len = 4 + (h % 7);
      const dir = h & 32 ? 1 : -1;
      for (let s = 0; s < len; s++) {
        put(cx, cy, STEP.c);
        put(cx, cy + 1, STEP.l);
        const t = at(cx, cy, 10) % 3;
        cx += dir;
        if (t === 0) cy++;
        else if (t === 1 && s > 1) cy--;
      }
      break;
    }
    case 'bone': {
      const a = m.accent;
      if (a.length < 2) break;
      // A long bone, knuckled at both ends, lying in the ground.
      const w = 5 + (h % 3);
      paint(x - 1, y - 1, a[1]);
      paint(x - 1, y + 1, a[0]);
      for (let q = 0; q < w; q++) paint(x + q, y, q === 0 ? a[1] : a[0]);
      paint(x + w, y - 1, a[1]);
      paint(x + w, y + 1, a[0]);
      break;
    }
    case 'gold': {
      const a = m.accent;
      if (a.length < 3) break;
      for (let s = 0; s < 3 + (h % 3); s++) {
        const gx = x + ((ihash(h, s, 11) % 7) - 3);
        const gy = y + ((ihash(h, s, 12) % 5) - 2);
        paint(gx, gy, s === 0 ? a[1] : a[2]);
        if (s === 0) paint(gx + 1, gy, a[0]);
      }
      break;
    }
    case 'glyph':
      stamp(GLYPH, x - 2, y - 2);
      break;
    case 'vein':
    case 'ember': {
      // A long vein running diagonally through the rock, across tiles.
      const a = m.accent;
      if (a.length < 3) break;
      const dir = h & 1 ? 1 : -1;
      const len = 10 + (h % 14);
      let vx = x;
      let vy = y;
      for (let s = 0; s < len; s++) {
        const core = s > 1 && s < len - 2 && (at(vx, vy, 13) & 3) === 0;
        paint(vx, vy, core ? a[1] : a[0]);
        if (core && (at(vx, vy, 14) & 3) === 0) paint(vx, vy - 1, a[2]);
        const t = at(vx, vy, 15) % 3;
        vx += t === 0 ? 0 : dir;
        vy += t === 2 ? 0 : 1;
      }
      break;
    }
    case 'crystal': {
      // A crystal node in the rock: a small diamond with a glint at its top.
      const a = m.accent;
      if (a.length < 3) break;
      paint(x, y - 1, a[2]);
      paint(x - 1, y, a[1]);
      paint(x, y, a[0]);
      paint(x + 1, y, a[0]);
      paint(x, y + 1, a[0]);
      if (h & 1) paint(x + 1, y - 1, a[1]);
      break;
    }
    case 'silk': {
      // A strand of silk across the rock, sagging between two points.
      const a = m.accent;
      if (a.length < 2) break;
      const len = 8 + (h % 8);
      for (let q = 0; q < len; q++) {
        const sag = Math.round(Math.sin((q / len) * Math.PI) * 2);
        paint(x + q - (len >> 1), y + sag, (q & 3) === 0 ? a[1] : a[0], 1);
      }
      break;
    }
    case 'drip': {
      // A dark streak down a wet face, from the surface.
      const top = y - (y % TPX) + 3;
      const len = 6 + (h % 14);
      for (let r = 0; r < len; r++) put(x, top + r, r < 2 ? -18 : -10);
      break;
    }
    case 'star': {
      const a = m.accent;
      if (a.length < 2) break;
      paint(x, y, a[1]);
      paint(x - 1, y, a[0]);
      paint(x + 1, y, a[0]);
      paint(x, y - 1, a[0]);
      paint(x, y + 1, a[0]);
      break;
    }
    case 'rivet': {
      // A brass plate with a rivet at each end.
      const a = m.accent;
      if (a.length < 3) break;
      const w = 5 + (h % 3);
      for (let q = 0; q < w; q++) {
        paint(x + q, y, a[0]);
        paint(x + q, y + 1, a[0]);
        paint(x + q, y + 2, a[2]);
      }
      paint(x + 1, y, a[1]);
      paint(x + w - 2, y, a[1]);
      break;
    }
    case 'stain': {
      const a = m.accent;
      if (a.length < 2) break;
      const len = 3 + (h % 6);
      for (let r = 0; r < len; r++) {
        paint(x, y + r, r === 0 ? a[1] : a[0]);
        if (r < len - 2 && (at(x, y + r, 16) & 1) === 0) paint(x + 1, y + r, a[0]);
      }
      break;
    }
    case 'moss': {
      // A patch of moss on the face, up near the top where the damp is.
      const a = m.accent;
      if (a.length < 2) break;
      const top = y - (y % TPX) + 2;
      const w = 3 + (h % 5);
      for (let q = 0; q < w; q++) {
        const len = 1 + (at(x + q, top, 17) % 3);
        for (let r = 0; r < len; r++) paint(x + q - (w >> 1), top + r, r === 0 ? a[1] : a[0], 1);
      }
      break;
    }
  }
}

/** The tide mark's colour: a line of wet light. */
const TIDE = abgrOf('#0069aa');

/* ------------------------------------------------------------- spikes */

const SPIKE = {
  dark: abgrOf('#1a1932'),
  shade: abgrOf('#2a2f4e'),
  mid: abgrOf('#424c6e'),
  lit: abgrOf('#657392'),
  bright: abgrOf('#92a1b9'),
  glint: abgrOf('#c7cfdd'),
};

/**
 * Two iron spikes to a tile on a riveted plate, lit from the left: stepped
 * cones, seven pixels across at the foot and one at the point, drawn pixel by
 * pixel rather than as smoothed triangles. Their heights vary a little, so a
 * long row reads as spikes driven in one by one rather than a stamped strip.
 */
function drawSpikes(over: Uint32Array, x0: number, y0: number, tx: number, ty: number): void {
  // The plate they stand on.
  for (let x = 0; x < TPX; x++) {
    over[(y0 + TPX - 2) * RW + x0 + x] = (x & 7) === 3 ? SPIKE.lit : SPIKE.shade;
    over[(y0 + TPX - 1) * RW + x0 + x] = SPIKE.dark;
  }
  for (let s = 0; s < 2; s++) {
    const h = 10 + (ihash(tx * 2 + s, ty, 19) % 4);
    const cx = x0 + s * 8 + 3;
    const base = y0 + TPX - 3;
    for (let r = 0; r < h; r++) {
      // Half-width 3, 2, 1, 0 in four steps from the foot to the point.
      const half = 3 - Math.floor((r * 4) / h);
      const row = (base - r) * RW;
      for (let dx = -half; dx <= half; dx++) {
        let c: number;
        if (dx < 0) c = dx === -half ? SPIKE.lit : SPIKE.bright;
        else if (dx === 0) c = r === h - 1 && ((tx + s) & 1) === 0 ? SPIKE.glint : SPIKE.bright;
        else c = dx === half ? SPIKE.shade : SPIKE.mid;
        over[row + cx + dx] = c;
      }
    }
  }
}

/* ------------------------------------------------------------- lava */

/** Rows of a lava surface tile that the moving surface covers; below them it is still. */
export const LAVA_STATIC = 8;

const LAVA = [abgrOf('#8e251d'), abgrOf('#c64524'), abgrOf('#e07438'), abgrOf('#5d2c28')];

/** The molten body under the surface: slow streaks of heat, darker crust in between. */
function lavaBody(wx: number, wy: number): number {
  const g = grain();
  const v = g[((wy >> 1) & 63) * 64 + ((wx >> 2) & 63)] + g[((wy + 17) & 63) * 64 + ((wx + 29) & 63)] * 0.5;
  if (v > 6) return LAVA[2];
  if (v > -3) return LAVA[1];
  if (v > -8) return LAVA[0];
  return LAVA[3];
}

/* ------------------------------------------------------------- planks */

const WOOD = {
  lit: abgrOf('#8a4836'),
  body: abgrOf('#5d2c28'),
  grain: abgrOf('#391f21'),
  dark: abgrOf('#1c121c'),
  nail: abgrOf('#858585'),
};

const IRON = {
  lit: abgrOf('#657392'),
  mid: abgrOf('#424c6e'),
  dark: abgrOf('#2a2f4e'),
  black: abgrOf('#1a1932'),
};

const ROPE = [abgrOf('#5d2c28'), abgrOf('#391f21')];

const SLAB: Record<'stone' | 'glass', { lit: number; body: number; dark: number; seam: number }> = {
  stone: { lit: abgrOf('#1e6f50'), body: abgrOf('#134c4c'), dark: abgrOf('#0c2e44'), seam: abgrOf('#0e071b') },
  glass: { lit: abgrOf('#93388f'), body: abgrOf('#622461'), dark: abgrOf('#3b1443'), seam: abgrOf('#0e071b') },
};

/**
 * One tile of a plank: boards six pixels deep, lit along the top, grain along
 * their length, butted together every so often with a nail either side, and
 * bevelled at the ends of the run. In the castle and the drowned hall the
 * boards are bound with iron; in the rift and the lair they are slabs.
 */
function drawPlank(
  over: Uint32Array,
  x0: number,
  y0: number,
  tx: number,
  ty: number,
  style: MaterialDef['plank'],
  leftEnd: boolean,
  rightEnd: boolean,
  runStart: number,
  runEnd: number,
): void {
  const runX0 = runStart * TPX;
  const runX1 = (runEnd + 1) * TPX;
  for (let lx = 0; lx < TPX; lx++) {
    const wx = tx * TPX + lx;
    const fromStart = wx - runX0;
    const toEnd = runX1 - 1 - wx;
    for (let r = 0; r < 6; r++) {
      // Bevelled ends.
      if ((leftEnd && fromStart === 0 && (r === 0 || r === 5)) || (rightEnd && toEnd === 0 && (r === 0 || r === 5))) continue;
      let c: number;
      if (style === 'stone' || style === 'glass') {
        const s = SLAB[style];
        const seam = (fromStart % 21) === 20;
        c = r === 0 ? s.lit : r >= 4 ? s.dark : s.body;
        if (seam && r > 0) c = s.seam;
      } else {
        const seam = (fromStart + 7) % 17 === 0;
        c = r === 0 ? WOOD.lit : r === 5 ? WOOD.dark : r === 4 ? WOOD.grain : WOOD.body;
        if (r === 2 && (ihash(wx >> 2, ty, 23) & 3) === 0) c = WOOD.grain;
        if (seam && r > 0 && r < 5) c = WOOD.dark;
        if (r === 2 && ((fromStart + 6) % 17 === 0 || (fromStart + 8) % 17 === 0)) c = WOOD.nail;
        if (style === 'iron' && r > 0 && r < 5 && ((fromStart + 3) % 24 < 2)) c = r === 1 ? IRON.lit : IRON.mid;
      }
      over[(y0 + r) * RW + x0 + lx] = c;
    }
  }
}

/**
 * What a plank hangs from: a rope in the open country, a chain anywhere built,
 * running up from an iron strap on the plank to the rock above it, the plank
 * above it, or out of the top of the level into the dark.
 */
function drawHanger(
  over: Uint32Array,
  mask: Uint8Array,
  kinds: Uint8Array,
  x: number,
  plankY: number,
  style: MaterialDef['plank'],
  wx: number,
): void {
  const rope = style === 'wood';
  // The strap on the plank.
  if (!rope) {
    over[plankY * RW + x - 1] = IRON.mid;
    over[plankY * RW + x] = IRON.lit;
    over[plankY * RW + x + 1] = IRON.dark;
  }
  for (let y = plankY - 1, k = 0; y >= 0; y--, k++) {
    const i = y * RW + x;
    if (mask[i]) {
      // An anchor plate where it meets the rock.
      if (!rope) {
        over[(y + 1) * RW + x - 1] = IRON.dark;
        over[(y + 1) * RW + x + 1] = IRON.dark;
      }
      break;
    }
    // Stop under another plank.
    if (over[i] !== 0 && kinds[(y >> 4) * RT_W + (x >> 4)] === K_PLANK) break;
    if (rope) {
      // A twisted rope, two pixels wide.
      const twist = ((k + (wx & 1)) >> 1) & 1;
      over[i] = ROPE[twist];
      over[i + 1] = ROPE[1 - twist];
    } else {
      // A chain: an oval link face on, then one edge on.
      const p = k % 6;
      if (p < 4) {
        if (p === 0 || p === 3) over[i] = IRON.mid;
        else {
          over[i - 1] = IRON.lit;
          over[i + 1] = IRON.dark;
        }
      } else {
        over[i] = p === 4 ? IRON.lit : IRON.mid;
      }
    }
  }
}
