import type { Camera } from '../core/camera';
import type { Particles } from '../fx/particles';
import type { Level } from './level';
import type { Player } from '../entities/player';
import type { Enemy } from '../entities/enemy';
import type { Projectile } from '../entities/projectile';
import type { Boss } from '../entities/boss';

/** Everything an entity is allowed to reach for during its update. */
export interface World {
  readonly level: Level;
  readonly particles: Particles;
  readonly camera: Camera;
  readonly player: Player;
  readonly enemies: Enemy[];
  readonly projectiles: Projectile[];
  boss: Boss | null;
  time: number;
  hitStop(seconds: number): void;
  addScore(points: number, x: number, y: number, label?: string): void;
  spawnEnemy(enemy: Enemy): void;
  spawnProjectile(projectile: Projectile): void;
  onBossDefeated(): void;
  onBossEngaged(): void;
}
