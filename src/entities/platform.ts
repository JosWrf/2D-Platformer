import { ART, PixelSprite, snap } from '../render/pixel';
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

  /**
   * An iron-framed slab with a stone inlay and two brass rivets, lit along its
   * top, with the teeth of its runner underneath: a sprite, drawn on whole art
   * pixels however its sine carries it. Its path is a row of single pixels
   * with a bracket at either end, faint enough to sit behind everything.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = TRACK;
    if (this.axis === 'v') {
      const tx = snap(this.x + w / 2 - 1);
      const top = snap(this.originY - this.range);
      const bottom = snap(this.originY + this.range + h);
      for (let ty = top + 8; ty < bottom - 4; ty += 8) ctx.fillRect(tx, ty, ART, ART);
      ctx.globalAlpha = 0.7;
      ctx.fillRect(tx - 2 * ART, top, 5 * ART, ART);
      ctx.fillRect(tx - 2 * ART, bottom, 5 * ART, ART);
    } else {
      const ty = snap(this.y + h / 2 - 1);
      const left = snap(this.originX - this.range + w / 2);
      const right = snap(this.originX + this.range + w / 2);
      for (let tx = left + 8; tx < right - 4; tx += 8) ctx.fillRect(tx, ty, ART, ART);
      ctx.globalAlpha = 0.7;
      ctx.fillRect(left, ty - 2 * ART, ART, 5 * ART);
      ctx.fillRect(right, ty - 2 * ART, ART, 5 * ART);
    }
    ctx.restore();
    SLAB.draw(ctx, this.x, this.y);
  }
}

/** The track's dots and brackets. */
const TRACK = '#424c6e';

/** The platform, 40×7 art pixels: frame, inlay, rivets, and its runner's teeth below. */
const SLAB = new PixelSprite(
  [
    '.LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL.',
    'LMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMD',
    'MgSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSgD',
    'MbSsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSsSbD',
    'MSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSD',
    'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    '..D...D...D...D...DKKD...D...D...D...D..',
  ],
  { L: '#657392', M: '#424c6e', S: '#2a2f4e', s: '#1a1932', D: '#1a1932', K: '#0e071b', g: '#edab50', b: '#8a4836' },
);
