export const TILE = 32;

export const enum Tile {
  Empty = 0,
  Solid = 1,
  Earth = 2,
  Platform = 3,
  Spike = 4,
  LavaTop = 5,
  Lava = 6,
  Gate = 7,
  /** Seals the way past the throne until the knight has fallen. */
  Seal = 8,
}

export function isSolid(tile: Tile): boolean {
  return tile === Tile.Solid || tile === Tile.Earth || tile === Tile.Gate || tile === Tile.Seal;
}

export function isPlatform(tile: Tile): boolean {
  return tile === Tile.Platform;
}

export function isHazard(tile: Tile): boolean {
  return tile === Tile.Spike || tile === Tile.LavaTop || tile === Tile.Lava;
}

export type SpawnKind =
  | 'player'
  | 'slime'
  | 'bat'
  | 'skeleton'
  | 'mage'
  | 'bomber'
  | 'shieldman'
  | 'charger'
  | 'warden'
  | 'thalassa'
  | 'prismarch'
  | 'boss'
  | 'gem'
  | 'heart'
  | 'checkpoint'
  | 'torch'
  | 'crystal'
  | 'moverH'
  | 'moverV'
  | 'portal';

export interface Spawn {
  kind: SpawnKind;
  /** Tile coordinates. */
  tx: number;
  ty: number;
}

export const CHAR_TO_TILE: Record<string, Tile> = {
  '.': Tile.Empty,
  ' ': Tile.Empty,
  '#': Tile.Solid,
  '=': Tile.Earth,
  '-': Tile.Platform,
  '^': Tile.Spike,
  L: Tile.LavaTop,
  l: Tile.Lava,
  G: Tile.Gate,
  S: Tile.Seal,
};

export const CHAR_TO_SPAWN: Record<string, SpawnKind> = {
  P: 'player',
  s: 'slime',
  b: 'bat',
  k: 'skeleton',
  m: 'mage',
  z: 'bomber',
  w: 'shieldman',
  r: 'charger',
  W: 'warden',
  K: 'prismarch',
  Y: 'thalassa',
  B: 'boss',
  $: 'gem',
  H: 'heart',
  C: 'checkpoint',
  T: 'torch',
  X: 'crystal',
  M: 'moverH',
  V: 'moverV',
  O: 'portal',
};
