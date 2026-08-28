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
}

export function isSolid(tile: Tile): boolean {
  return tile === Tile.Solid || tile === Tile.Earth || tile === Tile.Gate;
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
  | 'boss'
  | 'gem'
  | 'heart'
  | 'checkpoint'
  | 'torch'
  | 'crystal'
  | 'moverH'
  | 'moverV';

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
};

export const CHAR_TO_SPAWN: Record<string, SpawnKind> = {
  P: 'player',
  s: 'slime',
  b: 'bat',
  k: 'skeleton',
  m: 'mage',
  B: 'boss',
  $: 'gem',
  H: 'heart',
  C: 'checkpoint',
  T: 'torch',
  X: 'crystal',
  M: 'moverH',
  V: 'moverV',
};
