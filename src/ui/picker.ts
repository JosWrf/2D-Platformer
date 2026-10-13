import { audio } from '../core/audio';
import type { Keys } from '../core/input';
import type { Player } from '../entities/player';
import { type SkillId, skillInfo } from '../entities/skills';
import { ART_H, ART_W } from '../render/pixel';
import { BADGE, KEY_H, keyCap, skillBadge } from './icons';
import { UI, blit, box, drawFrame, paletteColor, text, textWidth } from './kit';

/**
 * Picking a boss attack.
 *
 * A tap of the key that changes it (Q, O or V) takes the next one, as it
 * always did. Held, it opens the picker: every attack learned, as a grid of
 * its badges over the hero's head, the world slowed to a third while it is
 * open. Left and right walk the cursor along the list - off the end of a row
 * into the next - up and down a row at a time, both round at the ends; and
 * letting go of the key takes the one under it. The grid is the one with the
 * fewest steps between any two badges: eighteen attacks are at most four
 * steps apart, six at most two, and the one before is always a single step.
 *
 * Every change shows itself at the hero, not in the corner of the screen: the
 * picked attack's badge between the one before and the one after it, its name
 * and whether it is ready, for a second and a half, following him as he runs.
 */

/** How long the key must be held before it opens the picker, in seconds. */
export const PICKER_HOLD = 0.18;
/** How fast the world goes on while the picker is open. */
export const PICKER_PACE = 0.3;
/** The picker takes what it shows and closes on its own after this long, in real seconds. */
const PICKER_LIMIT = 4;
/** How long the toast at the hero stays whole after the last change, and then blinks out. */
const TOAST_FULL = 1.3;
const TOAST_BLINK = 0.4;
/** The widest the grid gets: wider, and it no longer fits over the hero. */
const MAX_COLS = 7;

/** The actions the picker takes from the hero while it is open: the cursor's, and the key's own. */
export const PICKER_KEYS = new Set(['left', 'right', 'up', 'down', 'jump', 'cycle'] as const);

export interface PickerGrid {
  cols: number;
  rows: number;
}

/** What the picker has on screen, for the tools that measure it. */
export interface PickerView {
  kind: 'none' | 'toast' | 'grid';
  /** The box it is drawn in, in art pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Seconds the toast has left, or the picker has been open. */
  timer: number;
}

/** The cursor moved by (dx, dy) in a grid of n laid out cols wide. */
function step(at: number, dx: number, dy: number, n: number, cols: number): number {
  if (dx !== 0) return (at + dx + n) % n;
  const rows = Math.ceil(n / cols);
  const row = (Math.floor(at / cols) + dy + rows) % rows;
  const width = Math.min(cols, n - row * cols);
  return row * cols + Math.min(at % cols, width - 1);
}

/** The most steps between any two of n badges laid out cols wide. */
function farthest(n: number, cols: number): number {
  let worst = 0;
  for (let from = 0; from < n; from++) {
    const dist = new Array<number>(n).fill(Infinity);
    dist[from] = 0;
    const queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const to = step(at, dx, dy, n, cols);
        if (dist[to] > dist[at] + 1) {
          dist[to] = dist[at] + 1;
          queue.push(to);
        }
      }
    }
    worst = Math.max(worst, ...dist);
  }
  return worst;
}

const grids = new Map<number, PickerGrid>();

/**
 * The grid n attacks are laid out in: the fewest steps between the two
 * farthest apart; of grids as good, the flattest, since it hangs over the
 * hero's head; and then the one with the fewest gaps. Worked out once a size.
 */
export function gridOf(n: number): PickerGrid {
  const count = Math.max(1, n);
  const hit = grids.get(count);
  if (hit) return hit;
  let best: PickerGrid = { cols: count, rows: 1 };
  let bestKey = [Infinity, Infinity, Infinity];
  for (let cols = 1; cols <= Math.min(count, MAX_COLS); cols++) {
    const rows = Math.ceil(count / cols);
    const key = [farthest(count, cols), rows, cols * rows - count];
    const better = key[0] !== bestKey[0] ? key[0] < bestKey[0] : key[1] !== bestKey[1] ? key[1] < bestKey[1] : key[2] < bestKey[2];
    if (better) {
      best = { cols, rows };
      bestKey = key;
    }
  }
  grids.set(count, best);
  return best;
}

/** The cursor moved by (dx, dy) among n attacks: along the list round its ends, or a row up or down. */
export function stepCursor(at: number, dx: number, dy: number, n: number): number {
  return step(at, dx, dy, n, gridOf(n).cols);
}

/** "BEREIT", or the seconds still to go, in the German way. */
export function readiness(left: number): string {
  return left <= 0 ? 'BEREIT' : `${left.toFixed(1).replace('.', ',')} S`;
}

export class AttackPicker {
  /** Open: the grid shows and the world goes slow. */
  open = false;
  /** Where the cursor is, as an index into the attacks owned. */
  cursor = 0;
  /** Seconds left of the toast at the hero. */
  toast = 0;
  /** What was drawn last frame, and where. */
  readonly view: PickerView = { kind: 'none', x: 0, y: 0, w: 0, h: 0, timer: 0 };
  /** Seconds the key has been held, or -1 when it is up. */
  private held = -1;
  private openFor = 0;

  /** Shuts the picker without taking anything, and the toast with it: a pause, a death, a dialogue. */
  close(): void {
    this.open = false;
    this.held = -1;
  }

  /** As close, and the toast gone too: a restart, a fall back to the last checkpoint. */
  reset(): void {
    this.close();
    this.toast = 0;
  }

  /** Reads the key that changes the attack, in real time; the world's pace follows `open`. */
  update(dt: number, input: Keys, player: Player): void {
    this.toast = Math.max(0, this.toast - dt);
    const owned = player.ownedSkills();
    if (owned.length === 0) {
      this.close();
      return;
    }
    if (input.pressed('cycle')) this.held = 0;
    if (this.held < 0) return;
    const down = input.isDown('cycle');
    if (down) this.held += dt;
    if (!this.open && down && this.held >= PICKER_HOLD && owned.length > 1) {
      this.open = true;
      this.openFor = 0;
      this.cursor = Math.max(0, player.skill ? owned.indexOf(player.skill) : 0);
      audio.play('blip', 1.5);
    }
    if (this.open) {
      this.openFor += dt;
      this.cursor = Math.min(this.cursor, owned.length - 1);
      const before = this.cursor;
      if (input.pressed('left')) this.cursor = stepCursor(this.cursor, -1, 0, owned.length);
      if (input.pressed('right')) this.cursor = stepCursor(this.cursor, 1, 0, owned.length);
      if (input.pressed('up')) this.cursor = stepCursor(this.cursor, 0, -1, owned.length);
      if (input.pressed('down')) this.cursor = stepCursor(this.cursor, 0, 1, owned.length);
      if (this.cursor !== before) audio.play('blip', 1.2 + (this.cursor % 6) * 0.08);
      if (!down || this.openFor >= PICKER_LIMIT) {
        player.pickSkill(owned[this.cursor]);
        this.open = false;
        this.held = -1;
        this.toast = TOAST_FULL + TOAST_BLINK;
      }
      return;
    }
    if (!down) {
      // A tap: the next one.
      player.cycleSkill();
      this.held = -1;
      this.toast = TOAST_FULL + TOAST_BLINK;
    }
  }

  /**
   * Draws the picker or the toast over the hero, whose head is at (hx, hy) on
   * the art grid and whose feet are at fy; under him, if over him is off the
   * screen. `keys` are the caps of the keys in use: the one that changes the
   * attack, and the four that move.
   */
  draw(ctx: CanvasRenderingContext2D, player: Player, hx: number, hy: number, fy: number, keys: PickerKeys): void {
    this.view.kind = 'none';
    const owned = player.ownedSkills();
    if (owned.length === 0) return;
    if (this.open) {
      Object.assign(this.view, drawGrid(ctx, player, owned, this.cursor, hx, hy, fy, keys), { kind: 'grid', timer: this.openFor });
      return;
    }
    if (this.toast <= 0) return;
    // Blinking out over its last moments, a whole frame on, a whole frame off.
    if (this.toast < TOAST_BLINK && Math.floor(this.toast * 10) % 2 === 1) return;
    Object.assign(this.view, drawToast(ctx, player, owned, hx, hy, fy), { kind: 'toast', timer: this.toast });
  }
}

/** The caps the picker shows: the key that changes the attack, and left, right, up and down. */
export interface PickerKeys {
  cycle: string;
  move: readonly [string, string, string, string];
}

interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a badge shows for an attack now: lit, or filling up as it comes back. */
function badgeFor(player: Player, id: SkillId): HTMLCanvasElement {
  const info = skillInfo(id);
  const left = player.cooldownLeft(id);
  return skillBadge(id, info.color, left <= 0, left <= 0 ? null : 1 - left / info.cooldown);
}

/**
 * Where a box of w × h goes over the hero: centred over his head, or under
 * his feet when over him would run into the HUD's top row; and on the screen.
 */
function place(hx: number, hy: number, fy: number, w: number, h: number, gap: number): Placed {
  const x = Math.max(2, Math.min(ART_W - w - 2, Math.round(hx - w / 2)));
  let y = Math.round(hy - h - gap);
  if (y < 36) y = Math.round(fy + gap);
  y = Math.max(36, Math.min(ART_H - h - 2, y));
  return { x, y, w, h };
}

/** The toast: the picked attack between its neighbours, its name and how ready it is. */
function drawToast(ctx: CanvasRenderingContext2D, player: Player, owned: readonly SkillId[], hx: number, hy: number, fy: number): Placed {
  const at = Math.max(0, player.skill ? owned.indexOf(player.skill) : 0);
  const id = owned[at];
  const info = skillInfo(id);
  const left = player.cooldownLeft(id);
  const name = info.name.toUpperCase();
  const status = readiness(left);
  const many = owned.length > 1;
  const rowW = many ? BADGE * 3 + 4 : BADGE;
  const w = Math.max(rowW, textWidth(name, { font: 'small' }), textWidth(status, { font: 'small' })) + 8;
  const h = BADGE + 22;
  const placed = place(hx, hy, fy, w, h, 4);
  const { x, y } = placed;
  drawFrame(ctx, 'plate', x, y, w, h);
  const mid = x + Math.floor(w / 2);
  text(ctx, name, mid, y + 3, { font: 'small', color: left <= 0 ? paletteColor(info.color) : UI.mist, align: 'center' });
  const by = y + 11;
  if (many) {
    const prev = owned[(at - 1 + owned.length) % owned.length];
    const next = owned[(at + 1) % owned.length];
    blit(ctx, badgeFor(player, prev), mid - BADGE / 2 - BADGE - 2, by);
    blit(ctx, badgeFor(player, next), mid + BADGE / 2 + 2, by);
    // The neighbours a step back: a rule of steel under them, the picked one's in its colour.
    box(ctx, mid - BADGE / 2 - BADGE - 2, by + BADGE + 1, BADGE, 1, UI.steel);
    box(ctx, mid + BADGE / 2 + 2, by + BADGE + 1, BADGE, 1, UI.steel);
  }
  blit(ctx, badgeFor(player, id), mid - BADGE / 2, by);
  box(ctx, mid - BADGE / 2, by + BADGE + 1, BADGE, 1, left <= 0 ? paletteColor(info.color) : UI.slate);
  text(ctx, status, mid, by + BADGE + 3, { font: 'small', color: left <= 0 ? UI.green : UI.mist, align: 'center' });
  return placed;
}

/** Key caps in a row and a word after them; returns the width. */
function hintRow(ctx: CanvasRenderingContext2D | null, caps: readonly string[], word: string, x: number, y: number): number {
  let at = x;
  for (const c of caps) {
    const cap = keyCap(c);
    if (ctx) blit(ctx, cap, at, y);
    at += cap.width + 1;
  }
  at += 2;
  if (ctx) text(ctx, word, at, y + 2, { font: 'small', color: UI.frost });
  return at - x + textWidth(word, { font: 'small' });
}

/** The picker: every attack owned as a grid, the cursor's name and readiness over it, the keys under it. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  player: Player,
  owned: readonly SkillId[],
  cursor: number,
  hx: number,
  hy: number,
  fy: number,
  keys: PickerKeys,
): Placed {
  const { cols, rows } = gridOf(owned.length);
  const pitch = BADGE + 2;
  const gridW = cols * pitch - 2;
  const id = owned[cursor];
  const info = skillInfo(id);
  const left = player.cooldownLeft(id);
  const name = info.name.toUpperCase();
  const status = readiness(left);
  const moveWord = 'WÄHLEN';
  const takeWord = 'LOSLASSEN: NEHMEN';
  const moveW = hintRow(null, keys.move, moveWord, 0, 0);
  const takeW = hintRow(null, [keys.cycle], takeWord, 0, 0);
  const nameW = textWidth(name) + 4 + textWidth(status, { font: 'small' });
  const w = Math.max(gridW, nameW, moveW, takeW) + 10;
  const h = 14 + rows * pitch - 2 + 4 + KEY_H * 2 + 1 + 5;
  const placed = place(hx, hy, fy, w, h, 6);
  const { x, y } = placed;
  drawFrame(ctx, 'panel', x, y, w, h);
  const mid = x + Math.floor(w / 2);
  const nx = mid - Math.floor(nameW / 2);
  const after = text(ctx, name, nx, y + 4, { color: left <= 0 ? paletteColor(info.color) : UI.mist });
  text(ctx, status, nx + after + 4, y + 5, { font: 'small', color: left <= 0 ? UI.green : UI.mist });
  const gx = mid - Math.floor(gridW / 2);
  const gy = y + 14;
  owned.forEach((k, i) => {
    const bx = gx + (i % cols) * pitch;
    const by = gy + Math.floor(i / cols) * pitch;
    blit(ctx, badgeFor(player, k), bx, by);
    // The one picked now, until the key lets go: a notch of mist under it.
    if (k === player.skill) box(ctx, bx + 5, by + BADGE, 6, 1, UI.mist);
    if (i === cursor) {
      // The cursor: a frame of gold a pixel outside the badge.
      box(ctx, bx - 1, by - 1, BADGE + 2, 1, UI.gold);
      box(ctx, bx - 1, by + BADGE, BADGE + 2, 1, UI.gold);
      box(ctx, bx - 1, by - 1, 1, BADGE + 2, UI.gold);
      box(ctx, bx + BADGE, by - 1, 1, BADGE + 2, UI.gold);
    }
  });
  const ky = gy + rows * pitch + 2;
  hintRow(ctx, keys.move, moveWord, mid - Math.floor(moveW / 2), ky);
  hintRow(ctx, [keys.cycle], takeWord, mid - Math.floor(takeW / 2), ky + KEY_H + 1);
  return placed;
}
