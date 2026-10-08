import { ZONE_START } from '../world/levelData';

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
  skyTop: string;
  skyBottom: string;
  hillFar: string;
  hillNear: string;
  ambient: string;
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
    skyTop: '#070b14',
    skyBottom: '#0c1520',
    hillFar: '#1b2c3c',
    hillNear: '#16232f',
    ambient: 'rgba(90,160,190,0.05)',
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
    skyTop: '#080a0c',
    skyBottom: '#14120e',
    hillFar: '#2a2418',
    hillNear: '#1e1a12',
    ambient: 'rgba(200,150,90,0.05)',
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
    skyTop: '#0a0716',
    skyBottom: '#140f22',
    hillFar: '#2a2140',
    hillNear: '#1d1830',
    ambient: 'rgba(150,110,200,0.06)',
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
    skyTop: '#0c0910',
    skyBottom: '#1a1410',
    hillFar: '#2e2418',
    hillNear: '#211a12',
    ambient: 'rgba(242,193,78,0.07)',
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
    skyTop: '#0a0716',
    skyBottom: '#140f22',
    hillFar: '#2a2140',
    hillNear: '#1d1830',
    ambient: 'rgba(150,110,200,0.06)',
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
    skyTop: '#0c0714',
    skyBottom: '#1a1020',
    hillFar: '#2c2038',
    hillNear: '#1f172a',
    ambient: 'rgba(230,170,90,0.06)',
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
    skyTop: '#03080d',
    skyBottom: '#071620',
    hillFar: '#0f2634',
    hillNear: '#0a1a25',
    ambient: 'rgba(80,220,255,0.07)',
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
    skyTop: '#04080c',
    skyBottom: '#0a141c',
    hillFar: '#16242e',
    hillNear: '#0e1a22',
    ambient: 'rgba(200,225,240,0.06)',
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
    skyTop: '#03080d',
    skyBottom: '#071620',
    hillFar: '#0f2634',
    hillNear: '#0a1a25',
    ambient: 'rgba(80,220,255,0.07)',
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
    skyTop: '#0a0506',
    skyBottom: '#1a0b08',
    hillFar: '#2a120c',
    hillNear: '#1c0c08',
    ambient: 'rgba(255,120,60,0.07)',
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
    skyTop: '#03080e',
    skyBottom: '#08202c',
    hillFar: '#0e3040',
    hillNear: '#092230',
    ambient: 'rgba(50,150,175,0.07)',
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
    skyTop: '#06070e',
    skyBottom: '#12162a',
    hillFar: '#1e2440',
    hillNear: '#151a30',
    ambient: 'rgba(210,190,255,0.06)',
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
    skyTop: '#03080e',
    skyBottom: '#08202c',
    hillFar: '#0e3040',
    hillNear: '#092230',
    ambient: 'rgba(50,150,175,0.07)',
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
    skyTop: '#0d0710',
    skyBottom: '#1a0c14',
    hillFar: '#2c1620',
    hillNear: '#1d0f17',
    ambient: 'rgba(255,110,80,0.06)',
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
    skyTop: '#0e0a08',
    skyBottom: '#1c140c',
    hillFar: '#2e2214',
    hillNear: '#20180e',
    ambient: 'rgba(240,190,110,0.06)',
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
    skyTop: '#140409',
    skyBottom: '#2a0a14',
    hillFar: '#3a1220',
    hillNear: '#240a14',
    ambient: 'rgba(255,70,90,0.07)',
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
    skyTop: '#0d0710',
    skyBottom: '#1a0c14',
    hillFar: '#2c1620',
    hillNear: '#1d0f17',
    ambient: 'rgba(255,110,80,0.06)',
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
    skyTop: '#0c040a',
    skyBottom: '#1e0710',
    hillFar: '#340d18',
    hillNear: '#20080f',
    ambient: 'rgba(255,60,60,0.09)',
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
    skyTop: '#080312',
    skyBottom: '#160a26',
    hillFar: '#1d1030',
    hillNear: '#130a20',
    ambient: 'rgba(150,90,255,0.07)',
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
    skyTop: '#06020e',
    skyBottom: '#120820',
    hillFar: '#1a0e2c',
    hillNear: '#10081c',
    ambient: 'rgba(130,80,240,0.08)',
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
    skyTop: '#080312',
    skyBottom: '#160a26',
    hillFar: '#1d1030',
    hillNear: '#130a20',
    ambient: 'rgba(150,90,255,0.07)',
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
    skyTop: '#050c07',
    skyBottom: '#0e1b0f',
    hillFar: '#1b3520',
    hillNear: '#112415',
    ambient: 'rgba(120,220,110,0.07)',
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
    skyTop: '#080312',
    skyBottom: '#160a26',
    hillFar: '#1d1030',
    hillNear: '#130a20',
    ambient: 'rgba(150,90,255,0.07)',
    label: 'Der Riss',
    interior: false,
    calm: true,
  },
  {
    name: 'crystalworld',
    // Behind the rift, reached only by teleport. Nothing walks in here.
    start: ZONE_START.crystalworld,
    // This colour is also the rim light along every ledge. Cyan carries a lot
    // of luminance, so it is pulled down until the floor stops outshining the
    // hero walking on it.
    sporeRgb: '126,188,226',
    darkness: 0.8,
    darkTint: '#02080f',
    skyTop: '#02060f',
    skyBottom: '#071626',
    hillFar: '#123048',
    hillNear: '#0b1e30',
    ambient: 'rgba(80,190,235,0.07)',
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
