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

  grass: '#3fa14a',
  grassLight: '#63c96b',
  grassDark: '#1f6a35',

  dirt: '#4a3324',
  dirtDark: '#33231a',
  dirtLight: '#65462f',

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
}

export const ZONES: Zone[] = [
  {
    name: 'forest',
    start: 0,
    skyTop: '#101a33',
    skyBottom: '#2c3a4f',
    hillFar: '#1b2c3c',
    hillNear: '#16232f',
    ambient: 'rgba(90,160,190,0.05)',
    label: 'Nebelwald',
    interior: false,
  },
  {
    name: 'ruins',
    start: 5120,
    skyTop: '#181433',
    skyBottom: '#3d2f4b',
    hillFar: '#2a2140',
    hillNear: '#1d1830',
    ambient: 'rgba(150,110,200,0.06)',
    label: 'Versunkene Ruinen',
    interior: false,
  },
  {
    name: 'caverns',
    start: 8960,
    skyTop: '#07131c',
    skyBottom: '#123043',
    hillFar: '#0f2634',
    hillNear: '#0a1a25',
    ambient: 'rgba(80,220,255,0.07)',
    label: 'Kristallhöhlen',
    interior: true,
  },
  {
    name: 'castle',
    start: 12800,
    skyTop: '#1a0f18',
    skyBottom: '#43202a',
    hillFar: '#2c1620',
    hillNear: '#1d0f17',
    ambient: 'rgba(255,110,80,0.06)',
    label: 'Burg Nachtfall',
    interior: false,
  },
  {
    name: 'throne',
    start: 16640,
    skyTop: '#170810',
    skyBottom: '#521320',
    hillFar: '#340d18',
    hillNear: '#20080f',
    ambient: 'rgba(255,60,60,0.09)',
    label: 'Thronsaal des Schattenritters',
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
