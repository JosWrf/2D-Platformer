import { Rng } from '../core/math';
import type { Particles } from '../fx/particles';
import { zoneAt } from './palette';
import { ART, PixelSprite } from './pixel';

export type DecorKind = 'torch' | 'crystal';

export type DecorMount = 'ground' | 'hanging';

/*
 * Torches and crystal clusters, drawn for the grid. A torch is iron and fire:
 * its stand or its chain, a bowl, and a flame in three hand-drawn frames - no
 * soft glow round it, the light pass gives it its pool of light. A crystal
 * cluster is three prisms lit from the upper left, standing on a ledge or
 * hanging point-down from a roof - cold crystal in the caves, obsidian with
 * the fire in its edges in the Glutkammer.
 */
const KEY = {
  /** Iron: shadow, body, lit edge. */
  i: '#0e071b',
  I: '#2a2f4e',
  l: '#424c6e',
  /** Fire, from its edge to its heart. */
  r: '#c64524',
  f: '#ed7614',
  F: '#ffa214',
  y: '#ffc825',
  /** Crystal: deep, body, lit face, edge. */
  d: '#03193f',
  q: '#00396d',
  Q: '#0069aa',
  e: '#0098dc',
  /** Obsidian with the fire showing through its edges, where it is hot. */
  D: '#0e071b',
  o: '#1c121c',
  O: '#3b1443',
  E: '#e07438',
} as const;

const FLAMES = [
  ['...f...', '..fFf..', '..fFf..', '.fFyFf.', '.fFyFr.', '..ryr..'],
  ['....f..', '..fF...', '.fFFf..', '.fFyFf.', '.rFyFf.', '..ryr..'],
  ['..f....', '...Ff..', '..fFFf.', '.fFyFf.', '.fFyFr.', '..ryr..'],
].map((rows) => new PixelSprite(rows, KEY));

const BOWL = new PixelSprite(['lIIIIIIII', '.iIIIIIi.', '..iiiii..'], KEY);
const FOOT = new PixelSprite(['.lIIIIi.', 'lIIIIIIi'], KEY);
const LINK = new PixelSprite(['.l.', 'I.I', '.i.', '.I.'], KEY);

const CLUSTER_ROWS = [
  '.......e.......',
  '......Qe.......',
  '......Qeq......',
  '..e...Qeq......',
  '.Qe..QQeq...e..',
  '.Qeq.QQeqq.Qe..',
  'QQeq.QQeqqQQeq.',
  'QQeqqQQeqqQQeq.',
  'QQeqqQQeqqQQeqd',
  'dQeqqdQeqqdQeqd',
];
const CLUSTER = new PixelSprite(CLUSTER_ROWS, KEY);
const CLUSTER_HANGING = new PixelSprite([...CLUSTER_ROWS].reverse(), KEY);
/** The Glutkammer's cluster: the same prisms in obsidian, their edges glowing with the fire. */
const HOT_ROWS = CLUSTER_ROWS.map((r) => r.replace(/[dqQe]/g, (c) => ({ d: 'D', q: 'o', Q: 'O', e: 'E' })[c] ?? c));
const CLUSTER_HOT = new PixelSprite(HOT_ROWS, KEY);
const CLUSTER_HOT_HANGING = new PixelSprite([...HOT_ROWS].reverse(), KEY);

export class Decor {
  private readonly seed: number;
  private anim: number;
  /** A crystal in the Glutkammer is obsidian, lit by the fire inside it. */
  readonly hot: boolean;

  constructor(
    readonly kind: DecorKind,
    readonly x: number,
    readonly y: number,
    /** Standing on the floor, or suspended from the ceiling above. */
    readonly mount: DecorMount = 'ground',
    /** Distance up to the ceiling the decoration hangs from. */
    readonly hangLength = 24,
  ) {
    const rng = new Rng(Math.floor(x * 31 + y * 17) + 1);
    this.seed = rng.next();
    this.anim = this.seed * 10;
    this.hot = kind === 'crystal' && zoneAt(x).backdrop === 'forge';
  }

  update(dt: number, particles: Particles, visible: boolean): void {
    this.anim += dt;
    if (!visible || this.kind !== 'torch') return;
    if (Math.random() < 0.22) {
      particles.spawn({
        x: this.x + 8 + (Math.random() - 0.5) * 4,
        y: this.y + 4,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 34 - 12,
        color: Math.random() < 0.5 ? '#ffa214' : '#ed7614',
        gravity: -30,
        size: 2,
        life: 0.5 + Math.random() * 0.4,
        drag: 0.98,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.x + 8;
    if (this.kind === 'torch') {
      if (this.mount === 'hanging') {
        // A chain up to the ceiling, link under link.
        for (let y = this.y - this.hangLength; y < this.y; y += LINK.h * ART) LINK.draw(ctx, cx - LINK.w, y);
      } else {
        // An iron stand rising from the floor.
        ctx.fillStyle = KEY.I;
        const top = this.y + 8;
        const bottom = this.y + 6 + this.hangLength;
        ctx.fillRect(Math.round(cx / ART) * ART - ART, Math.round(top / ART) * ART, ART * 2, Math.max(ART, Math.round((bottom - top) / ART) * ART));
        ctx.fillStyle = KEY.l;
        ctx.fillRect(Math.round(cx / ART) * ART - ART, Math.round(top / ART) * ART, ART, Math.max(ART, Math.round((bottom - top) / ART) * ART));
        FOOT.draw(ctx, cx - FOOT.w, bottom);
      }
      BOWL.draw(ctx, cx - BOWL.w, this.y + 2);
      // The flame: three frames, each torch on its own clock.
      const flame = FLAMES[Math.floor(this.anim * 9 + this.seed * 7) % FLAMES.length];
      flame.draw(ctx, cx - flame.w, this.y + 2 - flame.h * ART);
      return;
    }
    // A cluster of crystals; hung from a roof it points down.
    if (this.mount === 'hanging') (this.hot ? CLUSTER_HOT_HANGING : CLUSTER_HANGING).draw(ctx, this.x + 16 - CLUSTER.w, this.y);
    else (this.hot ? CLUSTER_HOT : CLUSTER).draw(ctx, this.x + 16 - CLUSTER.w, this.y + 30 - CLUSTER.h * ART);
  }
}
