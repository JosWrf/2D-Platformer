import { audio } from '../core/audio';
import { Rect, clamp, rectsOverlap } from '../core/math';
import { shadow, withHitFlash } from '../render/sprites';
import type { World } from '../world/context';
import { Enemy } from './enemy';

const GLOOM_HP = 46;
const GLOOM_POISE = 8;

type GloomState = 'dormant' | 'intro' | 'idle' | 'dying';

/**
 * Nyktos, der Lichtfresser - the dark in the grotto that ate its crystals' light.
 *
 * Placeholder: the fight itself is still to come. It wakes, hangs, takes its
 * blows, falls and leaves its relic, so the road, the wards and the tools work
 * around it.
 */
export class Gloom extends Enemy {
  private state: GloomState = 'dormant';
  private timer = 0;
  private arenaLeft = 0;
  private arenaRight = 0;
  private poiseMax = GLOOM_POISE;

  constructor(x: number, y: number) {
    super('gloom', x, y);
    this.w = 34;
    this.h = 64;
    this.hp = this.maxHp = GLOOM_HP;
    this.scoreValue = 900;
    this.aggroRange = 520;
    this.contactDamage = 0;
  }

  override barName(): string {
    return 'NYKTOS   ·   DER LICHTFRESSER';
  }

  protected override deathColor(): string {
    return '#7d6aa8';
  }

  override overlaps(r: Rect): boolean {
    if (this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return false;
    return rectsOverlap(this.rect, r);
  }

  override hurt(amount: number, _fromDir: number, world: World): void {
    if (this.dead || this.state === 'dormant' || this.state === 'intro' || this.state === 'dying') return;
    this.hp -= amount;
    this.flash = 1;
    audio.play('bossHit', 1.2);
    if (this.hp <= 0) this.beginDying(world);
  }

  beginDying(world: World): void {
    if (this.dead || this.state === 'dying') return;
    this.hp = 0;
    this.state = 'dying';
    this.timer = 1.6;
    audio.play('bossRoar', 1.3);
    world.camera.addShake(6);
  }

  override update(dt: number, world: World): void {
    this.updateCommon(dt);
    const p = world.player;
    if (this.arenaRight === 0) {
      const arena = world.level.arenaAt(this.cx);
      this.arenaLeft = arena ? arena.left : this.cx - 560;
      this.arenaRight = arena ? arena.right : this.cx + 560;
    }
    switch (this.state) {
      case 'dormant': {
        const inside = p.cx > this.arenaLeft + 16 && p.cx < this.arenaRight - 16;
        if (inside && Math.abs(p.cx - this.cx) < this.aggroRange && !p.dead) {
          this.engaged = true;
          this.poiseMax = this.sizeUpFor(world, GLOOM_POISE);
          this.state = 'intro';
          this.timer = 1.2;
        }
        break;
      }
      case 'intro':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'idle';
        break;
      case 'idle':
        this.facing = p.cx > this.cx ? 1 : -1;
        break;
      case 'dying':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.die(world);
          world.onBossFelled('gloom', this.cx, this.y - 30);
        }
        break;
    }
    void this.poiseMax;
    this.vy += 1400 * dt;
    this.moveAndCollide(world.level, dt);
    this.x = clamp(this.x, this.arenaLeft, this.arenaRight - this.w);
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    shadow(ctx, this.cx, this.bottom + 1, this.w * 1.1, 0.35);
    withHitFlash(ctx, this.flash, () => {
      ctx.fillStyle = '#1a1426';
      ctx.fillRect(this.x, this.y + 14, this.w, this.h - 14);
      ctx.fillStyle = '#d8d0f0';
      ctx.beginPath();
      ctx.ellipse(this.cx, this.y + 10, 10, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
