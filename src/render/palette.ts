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

export type ZoneName = 'forest' | 'ruins' | 'caverns' | 'castle' | 'throne';

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
  },
  {
    name: 'ruins',
    start: 5120,
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
  },
  {
    name: 'caverns',
    start: 8960,
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
  },
  {
    name: 'castle',
    start: 12800,
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
  },
  {
    name: 'throne',
    start: 16640,
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
