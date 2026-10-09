import { ZONE_START } from '../world/levelData';
import type { BackdropKind } from './backdrops';

/** Central colour palette so every zone of the level shares one coherent look. */
export const PALETTE = {
  skyTop: '#0b1024',
  skyBottom: '#241a35',
  moon: '#f6f0d8',
  fog: 'rgba(120,140,200,0.06)',

  stoneDark: '#1b2136',
  stone: '#2b3350',
  stoneLight: '#3b4569',
  stoneEdge: '#556084',

  grass: '#46b84f',
  grassLight: '#7ee07a',
  grassDark: '#1c7a38',

  dirt: '#542c26',
  dirtDark: '#331a19',
  dirtLight: '#74392f',

  wood: '#6b4326',
  woodLight: '#8a5a34',

  crystal: '#63e6ff',
  crystalDeep: '#1f7f9c',
  lava: '#ff7a3c',
  spike: '#c6ccdf',
  spikeDark: '#7d859e',

  player: '#e8eefc',
  playerCloak: '#3f6fd8',
  playerCloakDark: '#2a4c9c',
  skin: '#f0c39a',
  blade: '#dff3ff',
  bladeGlow: 'rgba(140,220,255,0.85)',

  hearts: '#ff5773',
  heartsDark: '#7a1e33',
  gold: '#f2c14e',

  slime: '#7ce07a',
  slimeDark: '#2f7d3d',
  bat: '#8c6fc9',
  batDark: '#4b3675',
  skeleton: '#dfe3ef',
  skeletonDark: '#8d94ab',
  mage: '#c85adf',
  mageDark: '#63216f',

  boss: '#2a2130',
  bossPlate: '#4a3b58',
  bossTrim: '#c1493c',
  bossEye: '#ff4d3d',
  bossAura: 'rgba(255,60,60,0.35)',
} as const;

export type ZoneName =
  | 'forest'
  | 'ruins'
  | 'caverns'
  | 'drowned'
  | 'castle'
  | 'throne'
  | 'rift'
  | 'lair'
  | 'riftend'
  | 'crystalworld';

export interface Zone {
  name: ZoneName;
  /** World-x where this zone starts. */
  start: number;
  /*
   * The backdrop's key colours (render/backdrops.ts), each one of the
   * palette's own and each as it should come out on screen, after the light
   * pass's darkness - the backdrop paints whatever that darkness turns into
   * the colour chosen here.
   */
  /** The top of the sky, or of the hall's far wall. */
  skyTop: string;
  /** Along the horizon, or the foot of the far wall. */
  skyBottom: string;
  /** The far layers of scenery. */
  hillFar: string;
  /** The near layers, right behind the play: kept dark, so the hero stands out. */
  hillNear: string;
  /** The zone's accent in its backdrop: mist, water light, glow. */
  ambient: string;
  /** What the zone's backdrop shows: its scenery, set pieces and all. */
  backdrop: BackdropKind;
  label: string;
  /** Interior zones swap the sky backdrop for a hall/cave wall. */
  interior: boolean;
  /** How black the zone falls away from its light sources, 0..1. */
  darkness: number;
  /** Colour of that darkness, so each zone sinks into its own kind of black. */
  darkTint: string;
  /** Colour of the spores drifting through the zone, as "r,g,b". */
  sporeRgb: string;
  /**
   * A calm zone holds still: no swaying growth, no bobbing silhouettes, and
   * spores that drift instead of pulsing. Against a nearly black background
   * every moving highlight is a flicker, and a screen full of them is tiring
   * to look at rather than atmospheric.
   */
  calm: boolean;
}

export const ZONES: Zone[] = [
  {
    name: 'forest',
    start: 0,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#2a2f4e',
    hillNear: '#1a1932',
    ambient: '#424c6e',
    backdrop: 'forest',
    label: 'Nebelwald',
    sporeRgb: '255,206,116',
    darkness: 0.72,
    darkTint: '#050a10',
    interior: false,
    calm: false,
  },
  {
    /*
     * Grimmzahn's den: still the forest, trampled and darker under the
     * trees, the mist gone brown with the earth he churns up.
     */
    name: 'forest',
    start: ZONE_START.den,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#391f21',
    hillNear: '#1a1932',
    ambient: '#5d2c28',
    backdrop: 'den',
    label: 'Der Keilerbau',
    sporeRgb: '236,196,140',
    darkness: 0.74,
    darkTint: '#07060a',
    interior: false,
    calm: false,
  },
  {
    name: 'ruins',
    start: ZONE_START.ruins,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'ruins',
    label: 'Versunkene Ruinen',
    sporeRgb: '246,204,150',
    darkness: 0.76,
    darkTint: '#080512',
    interior: false,
    calm: false,
  },
  {
    /*
     * The treasury: the ruins' stone and sky, with the dark leaning towards
     * gold - there is a great deal of it lying about in here, and all of it
     * in the one place.
     */
    name: 'ruins',
    start: ZONE_START.vault,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#391f21',
    hillNear: '#1a1932',
    ambient: '#8a4836',
    backdrop: 'vault',
    label: 'Die Schatzkammer',
    sporeRgb: '255,214,120',
    darkness: 0.76,
    darkTint: '#0a0706',
    interior: false,
    calm: false,
  },
  {
    name: 'ruins',
    start: ZONE_START.ruinsAgain,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'ruins',
    label: 'Versunkene Ruinen',
    sporeRgb: '246,204,150',
    darkness: 0.76,
    darkTint: '#080512',
    interior: false,
    calm: false,
  },
  {
    /*
     * The theatre: the ruins under a sky gone violet with the footlights'
     * smoke, and warmer at the bottom, where the lamps are.
     */
    name: 'ruins',
    start: ZONE_START.theater,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#3b1443',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'theater',
    label: 'Das Theater',
    sporeRgb: '236,200,255',
    darkness: 0.78,
    darkTint: '#0a0512',
    interior: false,
    calm: false,
  },
  {
    name: 'ruins',
    start: ZONE_START.ruinsBeyondStage,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'ruins',
    label: 'Versunkene Ruinen',
    sporeRgb: '246,204,150',
    darkness: 0.76,
    darkTint: '#080512',
    interior: false,
    calm: false,
  },
  {
    /*
     * The temple's inner court, where Ankhor stands. Still the ruins - the same
     * stone, the same sky - with the dark leaning a little towards his amber,
     * so the room reads as somewhere before the banner says so.
     */
    name: 'ruins',
    start: ZONE_START.temple,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#8e251d',
    backdrop: 'temple',
    label: 'Das Tempelherz',
    sporeRgb: '250,206,140',
    darkness: 0.76,
    darkTint: '#0a0610',
    interior: false,
    calm: false,
  },
  {
    name: 'caverns',
    start: ZONE_START.caverns,
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#00396d',
    hillNear: '#1a1932',
    ambient: '#0069aa',
    backdrop: 'caves',
    label: 'Kristallhöhlen',
    sporeRgb: '255,220,150',
    darkness: 0.88,
    darkTint: '#01060c',
    interior: true,
    calm: false,
  },
  {
    /*
     * The dark grotto: the caves with every light eaten out of them. Nearly
     * black, and still - what little moves in here should be what matters.
     */
    name: 'caverns',
    start: ZONE_START.grotto,
    skyTop: '#0e071b',
    skyBottom: '#0c2e44',
    hillFar: '#1a1932',
    hillNear: '#1a1932',
    ambient: '#03193f',
    backdrop: 'grotto',
    label: 'Die Dunkelgrotte',
    sporeRgb: '190,180,240',
    darkness: 0.95,
    darkTint: '#010205',
    interior: true,
    calm: true,
  },
  {
    name: 'caverns',
    start: ZONE_START.cavernsDeep,
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#00396d',
    hillNear: '#1a1932',
    ambient: '#0069aa',
    backdrop: 'caves',
    label: 'Kristallhöhlen',
    sporeRgb: '255,220,150',
    darkness: 0.88,
    darkTint: '#01060c',
    interior: true,
    calm: false,
  },
  {
    // Her chamber: the caves gone pale and cold, silk catching what light
    // there is.
    name: 'caverns',
    start: ZONE_START.web,
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#2a2f4e',
    hillNear: '#1a1932',
    ambient: '#424c6e',
    backdrop: 'web',
    label: 'Die Netzkammer',
    sporeRgb: '210,232,246',
    darkness: 0.88,
    darkTint: '#02060a',
    interior: true,
    calm: false,
  },
  {
    name: 'caverns',
    start: ZONE_START.cavernsAgain,
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#00396d',
    hillNear: '#1a1932',
    ambient: '#0069aa',
    backdrop: 'caves',
    label: 'Kristallhöhlen',
    sporeRgb: '255,220,150',
    darkness: 0.88,
    darkTint: '#01060c',
    interior: true,
    calm: false,
  },
  {
    // Ignivor's chamber: the caves, a little redder in their black.
    name: 'caverns',
    start: ZONE_START.forge,
    skyTop: '#0e071b',
    skyBottom: '#391f21',
    hillFar: '#5d2c28',
    hillNear: '#1a1932',
    ambient: '#8e251d',
    backdrop: 'forge',
    label: 'Die Glutkammer',
    sporeRgb: '255,190,120',
    darkness: 0.86,
    darkTint: '#0a0302',
    interior: true,
    calm: false,
  },
  {
    name: 'drowned',
    // Between the caves and the castle: a hall that the water took.
    start: ZONE_START.drowned,
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#00396d',
    hillNear: '#1a1932',
    ambient: '#134c4c',
    backdrop: 'drowned',
    label: 'Die Ertrunkene Halle',
    sporeRgb: '150,214,222',
    darkness: 0.8,
    darkTint: '#02090f',
    interior: true,
    calm: true,
  },
  {
    /*
     * The altar of the sun and the moon: the drowned hall, with one half of
     * its dark warm and the other cold - the twins carry their own light, and
     * the room lends them both a little.
     */
    name: 'drowned',
    start: ZONE_START.altar,
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#00396d',
    hillNear: '#1a1932',
    ambient: '#134c4c',
    backdrop: 'altar',
    label: 'Der Sternenaltar',
    sporeRgb: '230,220,255',
    darkness: 0.8,
    darkTint: '#03050c',
    interior: true,
    calm: true,
  },
  {
    name: 'drowned',
    start: ZONE_START.drownedAgain,
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#00396d',
    hillNear: '#1a1932',
    ambient: '#134c4c',
    backdrop: 'drowned',
    label: 'Die Ertrunkene Halle',
    sporeRgb: '150,214,222',
    darkness: 0.8,
    darkTint: '#02090f',
    interior: true,
    calm: true,
  },
  {
    name: 'castle',
    start: ZONE_START.castle,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#891e2b',
    backdrop: 'castle',
    label: 'Burg Nachtfall',
    sporeRgb: '255,196,126',
    darkness: 0.78,
    darkTint: '#0c0509',
    interior: false,
    calm: false,
  },
  {
    /*
     * The battlements: the castle's night gone grey and cold, the colour of
     * the stone he is made of, with the moon over it.
     */
    name: 'castle',
    start: ZONE_START.battlement,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#424c6e',
    backdrop: 'battlement',
    label: 'Die Zinnen',
    sporeRgb: '210,220,236',
    darkness: 0.78,
    darkTint: '#06070c',
    interior: false,
    calm: false,
  },
  {
    name: 'castle',
    start: ZONE_START.towers,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#891e2b',
    backdrop: 'castle',
    label: 'Burg Nachtfall',
    sporeRgb: '255,196,126',
    darkness: 0.78,
    darkTint: '#0c0509',
    interior: false,
    calm: false,
  },
  {
    /*
     * The clock tower: brass and lamp-oil, the castle's red gone the colour
     * of old gold - so the room reads as his before the banner says so.
     */
    name: 'castle',
    start: ZONE_START.clock,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#391f21',
    hillNear: '#1a1932',
    ambient: '#8a4836',
    backdrop: 'clock',
    label: 'Der Uhrturm',
    sporeRgb: '250,214,150',
    darkness: 0.78,
    darkTint: '#0b0706',
    interior: false,
    calm: false,
  },
  {
    // The roof of the keep, under a moon that has gone the colour of him.
    name: 'castle',
    start: ZONE_START.keep,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#891e2b',
    backdrop: 'keep',
    label: 'Der Blutturm',
    sporeRgb: '255,150,150',
    darkness: 0.78,
    darkTint: '#0e0307',
    interior: false,
    calm: false,
  },
  {
    // Back down onto the walls for the last stretch to the throne.
    name: 'castle',
    start: ZONE_START.castleEnd,
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#891e2b',
    backdrop: 'castle',
    label: 'Burg Nachtfall',
    sporeRgb: '255,196,126',
    darkness: 0.78,
    darkTint: '#0c0509',
    interior: false,
    calm: false,
  },
  {
    name: 'throne',
    start: ZONE_START.throne,
    skyTop: '#0e071b',
    skyBottom: '#391f21',
    hillFar: '#5d2c28',
    hillNear: '#1a1932',
    ambient: '#571c27',
    backdrop: 'throne',
    label: 'Thronsaal des Schattenritters',
    sporeRgb: '255,168,116',
    darkness: 0.82,
    darkTint: '#0b0207',
    interior: true,
    calm: false,
  },
  {
    name: 'rift',
    start: ZONE_START.rift,
    sporeRgb: '206,178,255',
    darkness: 0.86,
    darkTint: '#08040f',
    skyTop: '#1a1932',
    skyBottom: '#3b1443',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'rift',
    label: 'Der Riss',
    interior: false,
    calm: true,
  },
  {
    // Still enough to show a reflection: the rift, darker, holding its breath.
    name: 'rift',
    start: ZONE_START.mirror,
    sporeRgb: '190,160,255',
    darkness: 0.88,
    darkTint: '#06030c',
    skyTop: '#1a1932',
    skyBottom: '#3b1443',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'mirror',
    label: 'Der Spiegelgrund',
    interior: false,
    calm: true,
  },
  {
    name: 'rift',
    start: ZONE_START.riftAgain,
    sporeRgb: '206,178,255',
    darkness: 0.86,
    darkTint: '#08040f',
    skyTop: '#1a1932',
    skyBottom: '#3b1443',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'rift',
    label: 'Der Riss',
    interior: false,
    calm: true,
  },
  {
    /*
     * Her lair, walled off inside the rift: the one stretch of the rift that is
     * a room. Green where the rift is violet, so the door you just walked
     * through reads as a threshold rather than more corridor.
     */
    name: 'lair',
    start: ZONE_START.lair,
    sporeRgb: '168,226,138',
    darkness: 0.87,
    darkTint: '#040b06',
    skyTop: '#03193f',
    skyBottom: '#0c2e44',
    hillFar: '#134c4c',
    hillNear: '#1a1932',
    ambient: '#1e6f50',
    backdrop: 'lair',
    label: 'Der Schlund der Fünfkronigen',
    interior: true,
    calm: true,
  },
  {
    // Out the far door, back into the rift for the last stretch to the gate.
    name: 'riftend',
    start: ZONE_START.riftend,
    sporeRgb: '206,178,255',
    darkness: 0.86,
    darkTint: '#08040f',
    skyTop: '#1a1932',
    skyBottom: '#3b1443',
    hillFar: '#424c6e',
    hillNear: '#1a1932',
    ambient: '#622461',
    backdrop: 'rift',
    label: 'Der Riss',
    interior: false,
    calm: true,
  },
  {
    name: 'crystalworld',
    // Behind the rift, reached only by teleport. Nothing walks in here.
    start: ZONE_START.crystalworld,
    // This colour is also the rim light along the wall faces (the tops of
    // ledges take their material's own highlight). Cyan carries a lot of
    // luminance, so it is pulled down until no wall outshines the hero.
    sporeRgb: '126,188,226',
    darkness: 0.8,
    darkTint: '#02080f',
    skyTop: '#1a1932',
    skyBottom: '#2a2f4e',
    hillFar: '#00396d',
    hillNear: '#1a1932',
    ambient: '#0069aa',
    backdrop: 'crystal',
    label: 'Der Kristallhort',
    interior: false,
    calm: true,
  },
];

export function zoneAt(x: number): Zone {
  let current = ZONES[0];
  for (const zone of ZONES) {
    if (x >= zone.start) current = zone;
  }
  return current;
}

export function zoneBlend(x: number): { from: Zone; to: Zone; t: number } {
  for (let i = 0; i < ZONES.length - 1; i++) {
    const a = ZONES[i];
    const b = ZONES[i + 1];
    if (x >= a.start && x < b.start) {
      const fadeStart = b.start - 700;
      const t = x <= fadeStart ? 0 : (x - fadeStart) / 700;
      return { from: a, to: b, t };
    }
  }
  const last = ZONES[ZONES.length - 1];
  return { from: last, to: last, t: 0 };
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * The palette every frame is mapped to (render/palettemap.ts, PaletteMap):
 * sixty-four colours in ramps - greys, cold slate blues down to a violet
 * black, flesh and rust, fire from deep red to pale yellow, the greens of the
 * forest and the teals of the drowned hall, the blues of the caves, violets for
 * the rift and pinks for the crystal - each ramp shifting hue as it darkens,
 * the way a painter's shadows do. The canvas makes tens of thousands of
 * colours in a frame, from every gradient, glow and soft edge; mapped to these,
 * with an ordered dither where something falls between two of them, a frame
 * holds a few dozen, and every zone is drawn from the same box of paints.
 */
export const ART_PALETTE: readonly number[] = [
  0x131313, 0x1b1b1b, 0x272727, 0x3d3d3d, 0x5d5d5d, 0x858585, 0xb4b4b4, 0xffffff,
  0xc7cfdd, 0x92a1b9, 0x657392, 0x424c6e, 0x2a2f4e, 0x1a1932, 0x0e071b, 0x1c121c,
  0x391f21, 0x5d2c28, 0x8a4836, 0xbf6f4a, 0xe69c69, 0xf6ca9f, 0xf9e6cf, 0xedab50,
  0xe07438, 0xc64524, 0x8e251d, 0xff5000, 0xed7614, 0xffa214, 0xffc825, 0xffeb57,
  0xd3fc7e, 0x99e65f, 0x5ac54f, 0x33984b, 0x1e6f50, 0x134c4c, 0x0c2e44, 0x00396d,
  0x0069aa, 0x0098dc, 0x00cdf9, 0x0cf1ff, 0x94fdff, 0xfdd2ed, 0xf389f5, 0xdb3ffd,
  0x7a09fa, 0x3003d9, 0x0c0293, 0x03193f, 0x3b1443, 0x622461, 0x93388f, 0xca52c9,
  0xc85086, 0xf68187, 0xf5555d, 0xea323c, 0xc42430, 0x891e2b, 0x571c27, 0xff0040,
];

/** The same colours as "#rrggbb", for drawing with. */
export const ART_HEX: readonly string[] = ART_PALETTE.map((c) => `#${c.toString(16).padStart(6, '0')}`);

/**
 * The palette's ramps, darkest first, by what they are for. Art drawn for the
 * grid takes its colours from here: a colour of the palette comes through the
 * mapping as it is, anything between two of them comes out as a dither of
 * both - which is right for a falloff of light and wrong for a cloak.
 */
export const RAMP = {
  /** Neutral greys, black to white. */
  grey: ['#131313', '#1b1b1b', '#272727', '#3d3d3d', '#5d5d5d', '#858585', '#b4b4b4', '#ffffff'],
  /** Cold slate, from violet black up to a pale steel: night, stone, metal. */
  slate: ['#0e071b', '#1a1932', '#2a2f4e', '#424c6e', '#657392', '#92a1b9', '#c7cfdd'],
  /** Flesh, wood and earth, from a plum black up to cream. */
  earth: ['#1c121c', '#391f21', '#5d2c28', '#8a4836', '#bf6f4a', '#e69c69', '#f6ca9f', '#f9e6cf'],
  /** Rust and copper. */
  rust: ['#8e251d', '#c64524', '#e07438', '#edab50'],
  /** Fire, deep orange to pale yellow. */
  fire: ['#ff5000', '#ed7614', '#ffa214', '#ffc825', '#ffeb57'],
  /** Leaf and moss, from a sea-blue black up to a lime light. */
  green: ['#0c2e44', '#134c4c', '#1e6f50', '#33984b', '#5ac54f', '#99e65f', '#d3fc7e'],
  /** Water and ice. */
  blue: ['#03193f', '#00396d', '#0069aa', '#0098dc', '#00cdf9', '#0cf1ff', '#94fdff'],
  /** Ultramarine to lilac: the rift and its magic. */
  violet: ['#0c0293', '#3003d9', '#7a09fa', '#db3ffd', '#f389f5', '#fdd2ed'],
  /** Plum and orchid. */
  plum: ['#3b1443', '#622461', '#93388f', '#ca52c9', '#c85086'],
  /** Blood, wine and rose. */
  rose: ['#571c27', '#891e2b', '#c42430', '#ea323c', '#f5555d', '#f68187', '#ff0040'],
} as const;
