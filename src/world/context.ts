import type { Camera } from '../core/camera';
import type { Particles } from '../fx/particles';
import type { Level } from './level';
import type { Player } from '../entities/player';
import type { Enemy, EnemyKind } from '../entities/enemy';
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
  onCrystalBossDefeated(): void;
  onDrownedCrownDefeated(): void;
  onMireBossDefeated(): void;
  onHydraEngaged(): void;
  onHydraNeckCut(wasTheFire: boolean): void;
  onHydraNeckSealed(sealed: number): void;
  onHydraDefeated(): void;
  /** One of the arena bosses without a reward of its own has fallen. */
  onBossFelled(kind: EnemyKind, x: number, y: number): void;
  /**
   * A line across the top of the screen: what a boss wants the hero to have
   * understood, said once, at the moment it is true - the way the hydra says
   * that a cut neck grows back.
   */
  announce(text: string, seconds?: number): void;
}
