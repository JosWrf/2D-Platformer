import { Colossus } from './colossus';
import { Mimic } from './mimic';
import { Shadow } from './shadow';
import { Spider, Spiderling } from './spider';
import { Vesper } from './vesper';
import { Wyrm } from './wyrm';
import { Enemy, EnemyKind, createBaseEnemy } from './enemy';

/** Builds any enemy in the game, from its kind. */
export function createEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  switch (kind) {
    case 'colossus':
      return new Colossus(x, y);
    case 'wyrm':
      return new Wyrm(x, y);
    case 'vesper':
      return new Vesper(x, y);
    case 'mimic':
      return new Mimic(x, y);
    case 'spider':
      return new Spider(x, y);
    case 'spiderling':
      return new Spiderling(x, y);
    case 'shadow':
      return new Shadow(x, y);
    default:
      return createBaseEnemy(kind, x, y);
  }
}
