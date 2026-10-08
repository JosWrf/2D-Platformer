import { Boar } from './boar';
import { Clockwork } from './clockwork';
import { Colossus } from './colossus';
import { Gargoyle } from './gargoyle';
import { Gloom } from './gloom';
import { Jester } from './jester';
import { Mimic } from './mimic';
import { Shadow } from './shadow';
import { Spider, Spiderling } from './spider';
import { Twins } from './twins';
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
    case 'boar':
      return new Boar(x, y);
    case 'twins':
      return new Twins(x, y);
    case 'clock':
      return new Clockwork(x, y);
    case 'jester':
      return new Jester(x, y);
    case 'gloom':
      return new Gloom(x, y);
    case 'gargoyle':
      return new Gargoyle(x, y);
    default:
      return createBaseEnemy(kind, x, y);
  }
}
