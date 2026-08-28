import { PALETTE } from '../render/palette';
import { TILE } from '../world/tiles';
import type { Player } from './player';

export type MoverAxis = 'h' | 'v';

/** Solid platform that slides between two points and carries the player. */
export class MovingPlatform {
  x: number;
  y: number;
  readonly w: number;
  readonly h = 14;
  private readonly originX: number;
  private readonly originY: number;
  private t: number;
  private prevX = 0;
  private prevY = 0;

  constructor(
    readonly axis: MoverAxis,
    x: number,
    y: number,
    readonly range = TILE * 3.5,
    readonly speed = 0.45,
    phase = 0,
  ) {
    this.w = TILE * 2.5;
    this.x = x;
    this.y = y;
    this.originX = x;
    this.originY = y;
    this.t = phase;
    this.prevX = x;
    this.prevY = y;
  }

  update(dt: number, player: Player): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.t += dt * this.speed;
    const offset = Math.sin(this.t * Math.PI * 2) * this.range;
    if (this.axis === 'h') this.x = this.originX + offset;
    else this.y = this.originY + offset;

    const dx = this.x - this.prevX;
    const dy = this.y - this.prevY;

    // Carry a player standing on top.
    const onTop =
      player.bottom >= this.y - 4 &&
      player.bottom <= this.y + 12 &&
      player.x + player.w > this.x + 2 &&
      player.x < this.x + this.w - 2 &&
      player.vy >= -20;
    if (onTop) {
      player.carryX += dx;
      player.y += dy;
      player.y = this.y - player.h - 0.01;
      player.vy = Math.max(player.vy, 0);
      player.onGround = true;
    }
  }

  /** Called during the player's collision pass so the top acts as ground. */
  landOn(player: Player): void {
    const prevBottom = player.bottom - player.vy * (1 / 60);
    if (player.vy < 0) return;
    if (prevBottom > this.y + 6) return;
    if (player.bottom < this.y) return;
    if (player.x + player.w <= this.x + 2 || player.x >= this.x + this.w - 2) return;
    player.y = this.y - player.h - 0.01;
    player.vy = 0;
    player.onGround = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { x, y, w, h } = this;
    ctx.fillStyle = '#1b1f2f';
    ctx.fillRect(x, y + 2, w, h);
    ctx.fillStyle = PALETTE.stoneLight;
    ctx.fillRect(x, y, w, h - 3);
    ctx.fillStyle = PALETTE.stoneEdge;
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(x + 4, y + 5, 4, 4);
    ctx.fillRect(x + w - 8, y + 5, 4, 4);
    // Faint track showing the platform's path, with anchors at both ends.
    ctx.save();
    ctx.strokeStyle = 'rgba(150,170,210,0.16)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (this.axis === 'v') {
      ctx.moveTo(x + w / 2, this.originY - this.range);
      ctx.lineTo(x + w / 2, this.originY + this.range + h);
    } else {
      ctx.moveTo(this.originX - this.range + w / 2, y + h / 2);
      ctx.lineTo(this.originX + this.range + w / 2, y + h / 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(120,140,180,0.35)';
    if (this.axis === 'v') {
      ctx.fillRect(x + w / 2 - 5, this.originY - this.range - 3, 10, 3);
      ctx.fillRect(x + w / 2 - 5, this.originY + this.range + h, 10, 3);
    } else {
      ctx.fillRect(this.originX - this.range + w / 2 - 3, y + h / 2 - 5, 3, 10);
      ctx.fillRect(this.originX + this.range + w / 2, y + h / 2 - 5, 3, 10);
    }
    ctx.restore();
  }
}
