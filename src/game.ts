import { audio } from './core/audio';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { clamp, rand } from './core/math';
import { Boss } from './entities/boss';
import { Enemy, EnemyKind, createEnemy } from './entities/enemy';
import { MovingPlatform } from './entities/platform';
import { Checkpoint, Pickup } from './entities/pickup';
import { Player } from './entities/player';
import { Projectile } from './entities/projectile';
import { Particles } from './fx/particles';
import { Background } from './render/background';
import { Decor } from './render/decor';
import { Spores } from './render/atmosphere';
import { LightPass, type Light } from './render/lighting';
import { drawEdgeLight } from './render/rims';
import { PALETTE, mixHex, zoneAt, zoneBlend } from './render/palette';
import { glow } from './render/sprites';
import { drawTilemap } from './render/tilemap';
import { drawBossBar, drawHeart, drawPanel, drawTextCentered, font } from './ui/hud';
import type { World } from './world/context';
import { Level } from './world/level';
import { TILE, Tile } from './world/tiles';

const TILE_LAVA_TOP = Tile.LavaTop;

export const VIEW_W = 960;
export const VIEW_H = 540;

export type GameState = 'title' | 'playing' | 'paused' | 'dead' | 'victory';

interface SpawnRecord {
  kind: EnemyKind;
  x: number;
  y: number;
}

export class Game implements World {
  readonly level = new Level();
  readonly particles = new Particles();
  readonly camera = new Camera(VIEW_W, VIEW_H);
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly pickups: Pickup[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly platforms: MovingPlatform[] = [];
  readonly decor: Decor[] = [];
  readonly background = new Background(VIEW_W, VIEW_H);
  private readonly lightPass = new LightPass(VIEW_W, VIEW_H);
  private readonly spores = new Spores(VIEW_W, VIEW_H);
  private readonly castLayer = Game.makeLayer();
  private readonly castCtx = this.castLayer.getContext('2d') as CanvasRenderingContext2D;

  player: Player;
  boss: Boss | null = null;

  state: GameState = 'title';
  time = 0;
  playTime = 0;
  score = 0;
  deaths = 0;
  gems = 0;
  totalGems = 0;

  private hitStopTimer = 0;
  private deathTimer = 0;
  private victoryTimer = 0;
  private bossIntro = 0;
  private bossGhostHp = 0;
  private zoneBanner = { text: '', timer: 0 };
  private currentZone = '';
  private titlePulse = 0;
  private readonly enemySpawns: SpawnRecord[] = [];
  private readonly collected = new Set<string>();
  private checkpointX: number;
  private checkpointY: number;
  private flashWhite = 0;

  constructor() {
    const start = this.level.spawns.find((s) => s.kind === 'player');
    const px = (start?.tx ?? 2) * TILE;
    const py = (start?.ty ?? 2) * TILE - 2;
    this.player = new Player(px, py);
    this.checkpointX = px;
    this.checkpointY = py;
    this.buildFromSpawns();
    this.camera.worldBounds = { w: this.level.pixelWidth, h: this.level.pixelHeight };
    this.camera.snapTo(this.player.cx, this.player.cy);
    this.currentZone = zoneAt(this.player.cx).label;
  }

  /** Offscreen layer at view resolution, used for compositing whole passes. */
  private static makeLayer(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    return canvas;
  }

  private buildFromSpawns(): void {
    for (const spawn of this.level.spawns) {
      const x = spawn.tx * TILE;
      const y = spawn.ty * TILE;
      switch (spawn.kind) {
        case 'slime':
        case 'bat':
        case 'skeleton':
        case 'mage':
          this.enemySpawns.push({ kind: spawn.kind, x, y });
          break;
        case 'boss':
          this.boss = new Boss(x - 16, y - 60);
          break;
        case 'gem':
          this.pickups.push(new Pickup('gem', x + 8, y + 8));
          this.totalGems++;
          break;
        case 'heart':
          this.pickups.push(new Pickup('heart', x + 6, y + 8));
          break;
        case 'checkpoint':
          this.checkpoints.push(new Checkpoint(x + 4, y + TILE - 56));
          break;
        case 'torch': {
          const ground = this.distanceToGround(spawn.tx, spawn.ty, 4);
          if (ground !== null) {
            this.decor.push(new Decor('torch', x + 8, y + TILE - 12 - ground, 'ground', ground + 4));
          } else {
            const ceiling = this.distanceToCeiling(spawn.tx, spawn.ty, 8) ?? 24;
            this.decor.push(new Decor('torch', x + 8, y + 12, 'hanging', ceiling + 12));
          }
          break;
        }
        case 'crystal': {
          const ground = this.distanceToGround(spawn.tx, spawn.ty, 6);
          if (ground !== null) {
            this.decor.push(new Decor('crystal', x, y + TILE - 30 + ground, 'ground'));
          } else {
            const ceiling = this.distanceToCeiling(spawn.tx, spawn.ty, 6) ?? 0;
            this.decor.push(new Decor('crystal', x, y - ceiling, 'hanging'));
          }
          break;
        }
        case 'moverH':
          this.platforms.push(new MovingPlatform('h', x, y, TILE * 3.5, 0.28, Math.random()));
          break;
        case 'moverV':
          this.platforms.push(new MovingPlatform('v', x, y, TILE * 3, 0.3, Math.random()));
          break;
        default:
          break;
      }
    }
    this.spawnEnemiesFresh();
    this.pickups.forEach((pickup, i) => (pickup.id = `p${i}`));
  }

  /** Pixels down to the first solid tile below a spawn tile, or null. */
  private distanceToGround(tx: number, ty: number, maxTiles: number): number | null {
    for (let i = 1; i <= maxTiles; i++) {
      if (this.level.solidAt(tx, ty + i)) return (i - 1) * TILE;
    }
    return null;
  }

  /** Pixels up to the first solid tile above a spawn tile, or null. */
  private distanceToCeiling(tx: number, ty: number, maxTiles: number): number | null {
    for (let i = 1; i <= maxTiles; i++) {
      if (this.level.solidAt(tx, ty - i)) return (i - 1) * TILE;
    }
    return null;
  }

  private spawnEnemiesFresh(): void {
    this.enemies.length = 0;
    for (const rec of this.enemySpawns) {
      const enemy = createEnemy(rec.kind, rec.x, rec.y);
      // Anchor ground-bound enemies on the floor of their tile.
      if (rec.kind !== 'bat' && rec.kind !== 'mage') enemy.y = rec.y + TILE - enemy.h;
      this.enemies.push(enemy);
    }
  }

  /* --------------------------------------------------------- World hooks */

  hitStop(seconds: number): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, seconds);
  }

  addScore(points: number, x: number, y: number, label?: string): void {
    this.score += points;
    if (label) this.particles.text(x, y, label, PALETTE.gold);
  }

  spawnEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
  }

  spawnProjectile(projectile: Projectile): void {
    this.projectiles.push(projectile);
  }

  onBossEngaged(): void {
    this.level.gateClosed = true;
    this.bossIntro = 3;
    this.zoneBanner = { text: 'SCHATTENRITTER MORVAIN', timer: 3 };
    this.camera.addShake(8);
  }

  onBossDefeated(): void {
    this.level.gateClosed = false;
    this.victoryTimer = 1.8;
    this.flashWhite = 1;
    audio.play('victory');
  }

  /* --------------------------------------------------------------- update */

  update(dt: number, input: Input): void {
    this.time += dt;
    this.titlePulse += dt;
    this.flashWhite = Math.max(0, this.flashWhite - dt * 1.6);

    if (this.state === 'title') {
      this.camera.follow(this.player.cx, this.player.cy, 0, dt);
      this.particles.update(dt);
      for (const d of this.decor) d.update(dt, this.particles, this.isVisible(d.x, d.y));
      if (input.pressed('confirm') || input.pressed('attack') || input.pressed('jump')) {
        audio.unlock();
        this.state = 'playing';
      }
      input.endFrame();
      return;
    }

    if (input.pressed('restart')) {
      this.restart();
      input.endFrame();
      return;
    }

    if (this.state === 'paused') {
      if (input.pressed('pause') || input.pressed('confirm')) this.state = 'playing';
      input.endFrame();
      return;
    }

    if (this.state === 'victory') {
      this.particles.update(dt);
      this.camera.follow(this.player.cx, this.player.cy - 20, 0, dt);
      if (Math.random() < 0.28) {
        this.particles.spawn({
          x: this.camera.x + rand(0, VIEW_W),
          y: this.camera.y - 10,
          vx: rand(-20, 20),
          vy: rand(20, 70),
          color: Math.random() < 0.5 ? '#ffd166' : '#8fe6ff',
          gravity: 30,
          size: rand(2, 4),
          life: rand(1.5, 3),
          shape: 'circle',
        });
      }
      input.endFrame();
      return;
    }

    if (this.state === 'dead') {
      this.deathTimer -= dt;
      this.particles.update(dt);
      this.camera.follow(this.player.cx, this.player.cy, 0, dt);
      if (this.deathTimer <= 0 && (input.pressed('confirm') || input.pressed('attack') || this.deathTimer < -1.2)) {
        this.respawnAtCheckpoint();
      }
      input.endFrame();
      return;
    }

    if (input.pressed('pause')) {
      this.state = 'paused';
      input.endFrame();
      return;
    }

    this.playTime += dt;

    if (this.victoryTimer > 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer <= 0) {
        this.state = 'victory';
        this.score += Math.max(0, 3000 - Math.floor(this.playTime) * 5);
      }
    }

    // Hit-stop freezes the simulation for a couple of frames on impact.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this.particles.update(dt * 0.25);
      this.camera.follow(this.player.cx, this.player.cy - 10, this.player.facing * 40, dt);
      input.endFrame();
      return;
    }

    this.player.update(dt, input, this);

    for (const platform of this.platforms) {
      if (!this.isVisible(platform.x, platform.y, 260)) continue;
      platform.update(dt, this.player);
      platform.landOn(this.player);
    }

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (!enemy.active) {
        if (this.isVisible(enemy.x, enemy.y, 220)) enemy.active = true;
        else continue;
      }
      enemy.update(dt, this);
      enemy.touchPlayer(this);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) this.enemies.splice(i, 1);
    }

    if (this.boss) {
      this.boss.update(dt, this);
      // The lagging "ghost" bar trails the real value for a bit of drama.
      this.bossGhostHp += (this.boss.hp - this.bossGhostHp) * Math.min(1, dt * 2.4);
    }
    if (this.bossIntro > 0) this.bossIntro -= dt;

    for (const p of this.projectiles) {
      p.update(dt, this);
      if (p.dead) continue;
      if (p.friendly) {
        for (const enemy of this.enemies) {
          if (!enemy.dead && enemy.overlaps(p.rect)) {
            enemy.hurt(p.damage, Math.sign(p.vx) || 1, this);
            p.dead = true;
            break;
          }
        }
        if (!p.dead && this.boss && !this.boss.dead && this.boss.vulnerable && this.boss.overlaps(p.rect)) {
          this.boss.hurt(p.damage, Math.sign(p.vx) || 1, this);
          p.dead = true;
        }
      } else if (!this.player.dead && !this.player.isInvulnerable && this.player.overlaps(p.rect)) {
        this.player.hurt(p.damage, Math.sign(p.vx) || (this.player.cx < p.cx ? -1 : 1), this);
        p.dead = true;
        this.particles.burst(p.cx, p.cy, 12, '#ff9a5c', { speed: 150 });
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    }

    for (const pickup of this.pickups) {
      if (pickup.dead) continue;
      if (!this.isVisible(pickup.x, pickup.y, 120)) continue;
      pickup.update(dt, this);
      if (pickup.dead) {
        this.collected.add(pickup.id);
        if (pickup.kind === 'gem') this.gems++;
      }
    }

    for (const cp of this.checkpoints) {
      if (!this.isVisible(cp.x, cp.y, 200)) continue;
      if (cp.update(dt, this)) {
        this.checkpointX = cp.x;
        this.checkpointY = cp.y;
        this.player.heal(2);
      }
    }

    for (const d of this.decor) d.update(dt, this.particles, this.isVisible(d.x, d.y));

    this.particles.update(dt);

    const zone = zoneAt(this.player.cx);
    if (zone.label !== this.currentZone) {
      this.currentZone = zone.label;
      if (!this.boss?.engaged) this.zoneBanner = { text: zone.label, timer: 3.2 };
    }
    if (this.zoneBanner.timer > 0) this.zoneBanner.timer -= dt;

    const lookAhead = clamp(this.player.vx * 0.35, -110, 110);
    const focusY = this.boss?.engaged && !this.boss.dead ? this.player.cy + 30 : this.player.cy - 10;
    this.camera.follow(this.player.cx, focusY, lookAhead, dt);

    if (this.player.dead && this.state === 'playing') {
      this.state = 'dead';
      this.deathTimer = 1.1;
      this.deaths++;
      this.camera.addShake(9);
      this.particles.burst(this.player.cx, this.player.cy, 40, PALETTE.playerCloak, { speed: 240, gravity: 500 });
    }

    input.endFrame();
  }

  private isVisible(x: number, y: number, margin = 80): boolean {
    return (
      x > this.camera.x - margin &&
      x < this.camera.x + VIEW_W + margin &&
      y > this.camera.y - margin - 200 &&
      y < this.camera.y + VIEW_H + margin + 200
    );
  }

  private respawnAtCheckpoint(): void {
    this.player.respawn(this.checkpointX, this.checkpointY - 8);
    this.projectiles.length = 0;
    this.particles.clear();
    this.spawnEnemiesFresh();
    for (const pickup of this.pickups) {
      pickup.dead = this.collected.has(pickup.id);
    }
    if (this.boss) {
      this.boss.reset();
      this.bossGhostHp = this.boss.maxHp;
      this.level.gateClosed = false;
    }
    this.state = 'playing';
    this.camera.snapTo(this.player.cx, this.player.cy);
  }

  restart(): void {
    this.state = 'playing';
    this.score = 0;
    this.gems = 0;
    this.deaths = 0;
    this.playTime = 0;
    this.collected.clear();
    const start = this.level.spawns.find((s) => s.kind === 'player');
    this.checkpointX = (start?.tx ?? 2) * TILE;
    this.checkpointY = (start?.ty ?? 2) * TILE - 2;
    for (const cp of this.checkpoints) cp.activated = false;
    for (const pickup of this.pickups) pickup.dead = false;
    this.victoryTimer = 0;
    this.respawnAtCheckpoint();
  }

  /**
   * Everything that glows, in world space. The lighting pass burns these out of
   * the darkness, so anything the player must see - hazards, pickups, the
   * knight - has to be in here.
   */
  private collectLights(): Light[] {
    const lights: Light[] = [];
    const add = (x: number, y: number, radius: number, rgb: string, strength: number, tint = 0.22): void => {
      if (!this.isVisible(x, y, radius)) return;
      lights.push({ x, y, radius, rgb, strength, tint });
    };

    for (const d of this.decor) {
      if (d.kind === 'torch') {
        const flicker = 0.92 + Math.sin(this.time * 7 + d.x) * 0.08;
        add(d.x + 8, d.y + 2, 190 * flicker, '255,168,84', 1, 0.34);
      } else {
        add(d.x + 8, d.y - 6, 120, '99,230,255', 0.85, 0.4);
      }
    }

    // Lava lights the cave from below; sampling every other column is plenty.
    const t0 = Math.floor(this.camera.x / TILE) - 1;
    const t1 = Math.ceil((this.camera.x + VIEW_W) / TILE) + 1;
    const r0 = Math.floor(this.camera.y / TILE) - 1;
    const r1 = Math.ceil((this.camera.y + VIEW_H) / TILE) + 1;
    for (let tx = t0; tx <= t1; tx += 2) {
      for (let ty = r0; ty <= r1; ty++) {
        if (this.level.tileAt(tx, ty) === TILE_LAVA_TOP) {
          add(tx * TILE + TILE, ty * TILE + 6, 150, '255,122,60', 0.95, 0.42);
        }
      }
    }

    for (const pickup of this.pickups) {
      if (pickup.dead) continue;
      const glowRgb = pickup.kind === 'gem' ? '242,193,78' : '255,87,115';
      add(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, 46, glowRgb, 0.9, 0.42);
    }
    for (const cp of this.checkpoints) {
      add(cp.x + 12, cp.y + 20, cp.activated ? 150 : 70, cp.activated ? '255,214,110' : '110,140,190', 0.8, 0.32);
    }
    for (const p of this.projectiles) {
      const rgb = p.kind === 'orb' ? '210,110,255' : p.kind === 'shockwave' ? '255,140,90' : '200,180,160';
      add(p.cx, p.cy, p.kind === 'bone' ? 40 : 84, rgb, 0.8, 0.34);
    }
    // Every enemy carries some light. A threat the player cannot see is not a
    // difficulty, it is a bug.
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      switch (enemy.kind) {
        case 'mage':
          add(enemy.cx, enemy.cy, 104, '200,90,223', 0.85, 0.36);
          break;
        case 'slime':
          add(enemy.cx, enemy.cy, 62, '124,224,122', 0.7, 0.3);
          break;
        case 'bat':
          add(enemy.cx, enemy.cy, 70, '176,140,235', 0.75, 0.32);
          break;
        default:
          add(enemy.cx, enemy.cy, 76, '206,214,235', 0.7, 0.26);
      }
    }

    // The hero carries his own light, and the blade flares when it swings.
    const swing = this.player.isAttacking ? 1 : 0;
    add(
      this.player.cx,
      this.player.cy - 2,
      172 + swing * 52,
      '168,214,255',
      0.94,
      0.13 + swing * 0.1,
    );

    const boss = this.boss;
    if (boss && !boss.dead && boss.engaged) {
      add(boss.cx, boss.cy - 10, 210, '255,74,58', 0.8, 0.16);
    }
    return lights;
  }

  /**
   * Draws the enemies a second time, additively and faintly, on top of the
   * darkness, so a bat in an unlit corner still reads as a bat.
   *
   * This goes through an offscreen layer on purpose. The entities reset
   * globalAlpha inside their own draw calls (blink, trails, flashes), which
   * silently ignores any alpha set here and stacks them at full strength -
   * that is what bleached the hero white. Compositing the finished layer once
   * keeps the intended weight.
   *
   * The hero is deliberately not in here: he already carries the brightest
   * light in the game, and drawing him twice only costs him his colours.
   */
  private drawCastLight(ctx: CanvasRenderingContext2D): void {
    const layer = this.castCtx;
    let any = false;
    layer.clearRect(0, 0, VIEW_W, VIEW_H);
    layer.save();
    layer.translate(-this.camera.renderX, -this.camera.renderY);
    for (const enemy of this.enemies) {
      if (!enemy.dead && this.isVisible(enemy.x, enemy.y, 140)) {
        enemy.draw(layer, this);
        any = true;
      }
    }
    layer.restore();
    if (!any) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34;
    ctx.drawImage(this.castLayer, 0, 0);
    ctx.restore();
  }

  /* --------------------------------------------------------------- render */

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    this.background.draw(ctx, this.camera, this.time);

    ctx.save();
    ctx.translate(-this.camera.renderX, -this.camera.renderY);

    drawTilemap(ctx, this.level, this.camera, this.time);

    for (const d of this.decor) {
      if (this.isVisible(d.x, d.y, 120)) d.draw(ctx);
    }
    for (const cp of this.checkpoints) {
      if (this.isVisible(cp.x, cp.y, 120)) cp.draw(ctx);
    }
    for (const platform of this.platforms) {
      if (this.isVisible(platform.x, platform.y, 200)) platform.draw(ctx);
    }
    for (const pickup of this.pickups) {
      if (!pickup.dead && this.isVisible(pickup.x, pickup.y, 100)) pickup.draw(ctx);
    }
    for (const enemy of this.enemies) {
      if (!enemy.dead && this.isVisible(enemy.x, enemy.y, 140)) enemy.draw(ctx, this);
    }
    if (this.boss && !this.boss.dead && this.isVisible(this.boss.x, this.boss.y, 300)) {
      this.boss.draw(ctx);
    }
    for (const p of this.projectiles) {
      if (this.isVisible(p.x, p.y, 120)) p.draw(ctx);
    }
    if (!this.player.dead || this.state === 'victory') this.player.draw(ctx, this);
    this.particles.draw(ctx);
    this.particles.drawTexts(ctx);

    ctx.restore();

    const blend = zoneBlend(this.player.cx);
    const darkness = blend.from.darkness + (blend.to.darkness - blend.from.darkness) * blend.t;
    const tint = mixHex(blend.from.darkTint, blend.to.darkTint, blend.t);
    const lights = this.collectLights();
    this.lightPass.draw(ctx, this.camera, lights, darkness, tint);

    // Readability first: ledges, pit walls, then the characters themselves keep
    // a share of their own colour on top of the darkness.
    const sporeRgb = blend.t > 0.5 ? blend.to.sporeRgb : blend.from.sporeRgb;
    drawEdgeLight(ctx, this.level, this.camera, VIEW_W, VIEW_H, sporeRgb, lights);
    this.drawCastLight(ctx);

    // Spores sit in front of the darkness, so they glow through it.
    this.spores.draw(ctx, this.camera, this.time, sporeRgb);

    this.drawLighting(ctx);
    if (this.state !== 'title') this.drawHud(ctx);
    this.drawOverlays(ctx);
  }

  private drawLighting(ctx: CanvasRenderingContext2D): void {
    // Vignette.
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Low-health pulse.
    if (this.state === 'playing' && this.player.hp <= 2 && !this.player.dead) {
      const pulse = 0.16 + Math.sin(this.time * 6) * 0.08;
      ctx.fillStyle = `rgba(180,20,40,${Math.max(0, pulse).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.flashWhite > 0) {
      ctx.fillStyle = `rgba(255,245,225,${(this.flashWhite * 0.8).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    // Hearts.
    const hp = this.player.hp;
    for (let i = 0; i < this.player.maxHp; i++) {
      drawHeart(ctx, 34 + i * 26, 36, 1.15, i < hp);
    }

    // Score + gems.
    // Gem icon + score.
    ctx.save();
    ctx.translate(31, 67);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, -1);
    ctx.lineTo(0, 8);
    ctx.lineTo(-6, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff0b8';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(3, -1);
    ctx.lineTo(0, 2);
    ctx.lineTo(-3, -1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = font(16);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(`${this.score}`, 45, 74);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`${this.score}`, 44, 73);
    ctx.font = font(12, 600);
    ctx.fillStyle = '#8b95bd';
    ctx.fillText(`EDELSTEINE ${this.gems}/${this.totalGems}   TODE ${this.deaths}`, 24, 92);

    // Progress bar of the whole level.
    const barW = 260;
    const barX = VIEW_W - barW - 24;
    const progress = clamp(this.player.cx / (this.level.pixelWidth - 200), 0, 1);
    ctx.fillStyle = 'rgba(10,12,22,0.7)';
    ctx.fillRect(barX, 28, barW, 8);
    ctx.fillStyle = 'rgba(140,170,230,0.85)';
    ctx.fillRect(barX, 28, barW * progress, 8);
    ctx.strokeStyle = 'rgba(150,170,225,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, 28.5, barW - 1, 7);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(barX + barW * progress - 1, 25, 3, 14);
    ctx.font = font(11, 600);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8b95bd';
    ctx.fillText(this.currentZone.toUpperCase(), VIEW_W - 24, 54);
    ctx.textAlign = 'left';

    // Zone banner.
    if (this.zoneBanner.timer > 0) {
      const a = clamp(this.zoneBanner.timer > 2.6 ? (3.2 - this.zoneBanner.timer) / 0.6 : this.zoneBanner.timer / 1.2, 0, 1);
      ctx.globalAlpha = a;
      drawTextCentered(ctx, this.zoneBanner.text, VIEW_W / 2, 130, 26, '#f4f7ff');
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = 'rgba(200,215,255,0.6)';
      ctx.fillRect(VIEW_W / 2 - 90, 142, 180, 1);
      ctx.globalAlpha = 1;
    }

    // Boss bar.
    if (this.boss && this.boss.engaged && !this.boss.dead) {
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        {
          name: `${this.boss.name}   ·   PHASE ${this.boss.phase}`,
          hp: this.boss.hp,
          maxHp: this.boss.maxHp,
          ghost: this.bossGhostHp,
          phase: this.boss.phase,
        },
        this.bossIntro,
      );
    }
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    switch (this.state) {
      case 'title':
        this.drawTitle(ctx);
        break;
      case 'paused':
        ctx.fillStyle = 'rgba(4,6,12,0.72)';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        drawTextCentered(ctx, 'PAUSE', VIEW_W / 2, VIEW_H / 2 - 6, 46, '#f4f7ff');
        drawTextCentered(ctx, 'P oder LEERTASTE zum Fortsetzen  ·  R für Neustart', VIEW_W / 2, VIEW_H / 2 + 30, 14, '#94a0c8', 600);
        break;
      case 'dead': {
        const a = clamp(1.1 - this.deathTimer, 0, 1) * 0.78;
        ctx.fillStyle = `rgba(40,4,10,${a.toFixed(3)})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        drawTextCentered(ctx, 'GEFALLEN', VIEW_W / 2, VIEW_H / 2 - 4, 52, '#ff6b78');
        if (this.deathTimer <= 0) {
          const blink = 0.55 + Math.sin(this.time * 5) * 0.45;
          ctx.globalAlpha = blink;
          drawTextCentered(ctx, 'LEERTASTE — zurück zum letzten Kontrollpunkt', VIEW_W / 2, VIEW_H / 2 + 34, 15, '#e8d7d7', 600);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'victory':
        this.drawVictory(ctx);
        break;
      default:
        break;
    }
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(4,6,14,0.68)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    glow(ctx, VIEW_W / 2, 170, 260, 'rgba(90,140,255,0.16)');

    drawTextCentered(ctx, 'SHADOWBLADE', VIEW_W / 2, 178, 68, '#f4f7ff');
    ctx.globalAlpha = 0.9;
    drawTextCentered(ctx, 'Die Klinge von Nachtfall', VIEW_W / 2, 212, 18, '#8fb4ff', 600);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(150,170,225,0.35)';
    ctx.fillRect(VIEW_W / 2 - 170, 232, 340, 1);

    const rows: [string, string][] = [
      ['← →  /  A D', 'Laufen'],
      ['LEERTASTE / W', 'Springen · Doppelsprung'],
      ['J  /  K', 'Schwert (3er-Kombo)'],
      ['SHIFT  /  L', 'Ausweichrolle (unverwundbar)'],
      ['↓ + Sprung', 'Durch Plattform fallen'],
      ['P  /  R', 'Pause  ·  Neustart'],
    ];
    drawPanel(ctx, VIEW_W / 2 - 220, 252, 440, 168, 0.6);
    ctx.font = font(13, 600);
    rows.forEach(([key, desc], i) => {
      const y = 278 + i * 25;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f2c14e';
      ctx.fillText(key, VIEW_W / 2 - 20, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#b9c3e4';
      ctx.fillText(desc, VIEW_W / 2 + 4, y);
    });
    ctx.textAlign = 'left';

    const blink = 0.5 + Math.sin(this.titlePulse * 3.4) * 0.5;
    ctx.globalAlpha = 0.35 + blink * 0.65;
    drawTextCentered(ctx, 'LEERTASTE ZUM STARTEN', VIEW_W / 2, 470, 20, '#ffffff');
    ctx.globalAlpha = 1;
    drawTextCentered(ctx, 'Schlage dich durch 5 Zonen bis zum Thronsaal des Schattenritters.', VIEW_W / 2, 502, 12, '#6f7ba3', 600);
  }

  private drawVictory(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(6,8,16,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    glow(ctx, VIEW_W / 2, 150, 300, 'rgba(255,200,90,0.18)');
    drawTextCentered(ctx, 'SIEG!', VIEW_W / 2, 168, 74, '#ffd166');
    drawTextCentered(ctx, 'Morvain ist gefallen — Nachtfall ist frei.', VIEW_W / 2, 208, 17, '#e7ecff', 600);

    const minutes = Math.floor(this.playTime / 60);
    const seconds = Math.floor(this.playTime % 60);
    const rows: [string, string][] = [
      ['Punkte', `${this.score}`],
      ['Edelsteine', `${this.gems} / ${this.totalGems}`],
      ['Zeit', `${minutes}:${seconds.toString().padStart(2, '0')}`],
      ['Tode', `${this.deaths}`],
    ];
    drawPanel(ctx, VIEW_W / 2 - 180, 236, 360, 150, 0.66);
    ctx.font = font(15, 600);
    rows.forEach(([label, value], i) => {
      const y = 268 + i * 32;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#939ec4';
      ctx.fillText(label, VIEW_W / 2 - 150, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f4f7ff';
      ctx.fillText(value, VIEW_W / 2 + 150, y);
    });
    ctx.textAlign = 'left';
    const blink = 0.5 + Math.sin(this.titlePulse * 3.4) * 0.5;
    ctx.globalAlpha = 0.4 + blink * 0.6;
    drawTextCentered(ctx, 'R — noch einmal', VIEW_W / 2, 440, 18, '#ffffff');
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ debug aid */

  /** Row index of the highest walkable floor in a column, if there is one. */
  private floorRowAt(tx: number): number | null {
    if (tx < 0 || tx >= this.level.width) return null;
    for (let ty = this.level.height - 1; ty >= 2; ty--) {
      if (
        this.level.solidAt(tx, ty) &&
        !this.level.solidAt(tx, ty - 1) &&
        !this.level.solidAt(tx, ty - 2) &&
        !this.level.hazardAt(tx, ty - 1)
      ) {
        return ty;
      }
    }
    return null;
  }

  /** Used by the screenshot tool to inspect any part of the level. */
  warpTo(tileX: number): void {
    // Find a column with real footing - the requested one may be over a pit.
    let column = tileX;
    let floorY: number | null = null;
    for (let offset = 0; offset <= 12 && floorY === null; offset++) {
      for (const candidate of offset === 0 ? [tileX] : [tileX + offset, tileX - offset]) {
        const found = this.floorRowAt(candidate);
        if (found !== null) {
          column = candidate;
          floorY = found;
          break;
        }
      }
    }
    const x = column * TILE;
    const y = floorY !== null ? floorY * TILE - this.player.h - 2 : (this.level.height - 4) * TILE;
    this.player.x = x;
    this.player.y = y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.checkpointX = x;
    this.checkpointY = y;
    this.camera.snapTo(this.player.cx, this.player.cy);
    for (const enemy of this.enemies) enemy.active = false;
  }
}
