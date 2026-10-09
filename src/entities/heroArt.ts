import { RAMP } from '../render/palette';
import { ART, PixelSprite } from '../render/pixel';

/**
 * The hero, drawn for the grid.
 *
 * Every frame of him is a block of characters below, one per art pixel, each
 * standing for one of his paints - placed by hand, turned into a canvas the
 * first time it is drawn and blitted from then on. Nothing about him is
 * rotated, scaled or nudged by a fraction: a bob is a frame one pixel lower,
 * a landing is a frame with bent knees.
 *
 * The frames face right. The row under each is the ground he stands on, with
 * '^' under the middle column of his hitbox (nine art pixels wide, so its
 * middle is a whole pixel): that is what holds him to the body the game moves,
 * whichever way he faces. His hood rises above the hitbox, as a head does above
 * a collision box; his feet stand on its bottom.
 */

/**
 * His paints: sixteen colours of the palette in four ramps and a few
 * accents, lit from the upper left. The blues of the cloak run from a violet
 * slate in the folds to an azure in the light; the gold goes brown in its
 * shadow, the skin goes red.
 */
const PAINT: Record<string, string> = {
  /** The deepest fold, and the line that parts an arm from the chest. */
  K: RAMP.slate[1],
  /** Cloak and hood: in shadow, plain, in the light. */
  C: RAMP.blue[1],
  B: RAMP.blue[2],
  L: RAMP.blue[3],
  /** The eye, and the blade's glow. */
  Y: RAMP.blue[4],
  /** Steel in the light, and steel. */
  W: RAMP.slate[6],
  M: RAMP.slate[5],
  /** Breeches: in the light, plain, in shadow. */
  m: RAMP.slate[4],
  t: RAMP.slate[3],
  d: RAMP.slate[2],
  /** Gold in the light, and gold. */
  G: RAMP.fire[3],
  g: RAMP.rust[3],
  /** Skin in shadow (and the gold's shadow), and skin. */
  o: RAMP.earth[4],
  S: RAMP.earth[5],
  /** Leather: boots, gloves, the grip. */
  b: RAMP.earth[3],
  /** The hand that holds the sword: leather, and where the blade starts. */
  H: RAMP.earth[3],
};

/** What he is made of: the colours his frames come out in. */
export const HERO_PALETTE: readonly string[] = [...new Set(Object.values(PAINT))];

/**
 * The actor pass darkens every body pixel a breath towards the zone's night
 * - by 16 to 21 per cent, with the darkness of the zone (game.ts, drawActors)
 * - before the frame is mapped to the palette. On a palette of ramps a breath
 * is a whole step: drawn as they are, his azure came out as the plain blue, his
 * steel as grey, and two of his paints split into a dither of two colours.
 * So every paint is laid on that much brighter, and comes out of the pass as
 * itself: checked for every zone's darkness and every phase of the dither.
 * (The palest steel can only nearly make it in the darkest grotto: a channel
 * cannot be laid on brighter than 255.)
 */
const NIGHT = 0.19;

/** A paint as it has to be laid on to come out of the night as itself. */
export function throughNight(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const up = (c: number): number => Math.min(255, Math.round(c / (1 - NIGHT)));
  return `rgb(${up((v >> 16) & 255)},${up((v >> 8) & 255)},${up(v & 255)})`;
}

const LAID: Record<string, string> = Object.fromEntries(Object.entries(PAINT).map(([k, v]) => [k, throughNight(v)]));

const FRAMES = {
  idle0: `
    .........LLBB..
    .......LLLBBBC.
    ......LLBBBBCCK
    ......LBBBBKKoS
    .....LBBBBKoSYS
    ....dLBBBCKoSS.
    ...gGCBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKBB.
    .W.LBCKBBBBKBB.
    .W.LBCKgggGgbb.
    W..BCK.dttmmt..
    M..gg..dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......bbo.bbo.
    .......bbb.bbbb
    ----------^----
  `,
  idle1: `
    .........LLBB..
    .......LLLBBBC.
    ......LLBBBBCCK
    ......LBBBBKKoS
    .....LBBBBKoSYS
    ....dLBBBCKoSS.
    ...gGCBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKBB.
    .W.LBCKBBBBKBB.
    .W.LBCKgggGgbb.
    W..BCKKdttmmt..
    M...gg.dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......bbo.bbo.
    .......bbb.bbbb
    ----------^----
  `,
  idle2: `
    .........LLBB..
    .......LLLBBBC.
    ......LLBBBBCCK
    ......LBBBBKKoS
    .....LBBBBKoSYS
    ....dLBBBCKoSS.
    ...gGCBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKBB.
    .W.LBCKgggGKBB.
    .W.LBCKdttmmbb.
    W..BCKKdt.tm...
    M...gg.dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......bbo.bbo.
    .......bbb.bbbb
    ----------^----
  `,
  idle3: `
    .........LLBB..
    .......LLLBBBC.
    ......LLBBBBCCK
    ......LBBBBKKoS
    .....LBBBBKoSYS
    ....dLBBBCKoSS.
    ...gGCBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKBB.
    .W.LBCKgggGKBB.
    .W.LBCKdttmmbb.
    W..BCK.dt.tm...
    M..gg..dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......bbo.bbo.
    .......bbb.bbbb
    ----------^----
  `,
  run0: `
    ..........LLBB...
    ........LLLBBBC..
    .......LLBBBBCCK.
    .......LBBBBKKoS.
    ......LBBBBKoSYS.
    ......LBBBCKoSS..
    .......BBCCCKo...
    .....BBCCLBBBB...
    ...LLBBCLBBKLB...
    .LLBBBCCLBKLBB...
    LBBBCCKKBKLBBCb..
    gBCCKK..bbBBCC...
    .gK....gggGgg....
    .......dttmmt....
    .......td..mt....
    .......td..mt....
    ......ttd...mt...
    ....ttdd....mt...
    ...bKd.......mt..
    ...KK........obb.
    .............bbbb
    ----------^------
  `,
  run1: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    ..LLBBBCLBBKLB..
    LLBBBCCKLBKLBB..
    gBBCCKK.BKLBBCb.
    .gCK....bbBBCC..
    .......gggGgg...
    .......dttmmt...
    .......td..mt...
    ....bK.td...mt..
    ....Ktttd..mt...
    .....dddd.mt....
    ..........obb...
    ..........bbbb..
    ----------^-----
  `,
  run2: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ...LLBBCCLBBBB..
    LLLBBBCCLBBBKL..
    gBBBCCKKLBBBKLB.
    .gCCK...BBBBKBB.
    ........BBBBKBB.
    .......gggGggbb.
    .......dttmmt...
    ........tdmt....
    .........tmt....
    ........tdmt....
    ......bKtmt.....
    ......KKKmt.....
    .........obb....
    .........bbbb...
    ----------^-----
  `,
  run3: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    .LLLBBCCLBBBKL..
    LBBBBCCKLBBBKLB.
    gBCCKK..BBBBBBbb
    .gK.....BBBBCC..
    .......gggGgg...
    .......dttmmt...
    ........tmtd....
    .........mtd....
    ........mttd....
    ........mttd....
    .......mtbKK....
    ......ob..KKK...
    .....bb.........
    ................
    ----------^-----
  `,
  run4: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    .....BBCCLBBBB..
    ...LLBBCLBBBKL..
    .LLBBBCCLBBBKLB.
    LBBBCCKKBBBBBBbb
    gBCCKK..BBBBCC..
    .gK....gggGgg...
    .......dttmmt...
    .........mt.....
    .........mt.....
    ........mmtd....
    ......mmtttd....
    .....obt...td...
    .....bb....bKK..
    ...........KKKK.
    ----------^-----
  `,
  run5: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    ..LLBBBCLBBBKL..
    LLBBBCCKLBBBKLB.
    gBBCCKK.BBBBBBbb
    .gCK....BBBBCC..
    .......gggGgg...
    .......dttmmt...
    .........mt.....
    ......ob.mtd....
    ......bmmmt.....
    .......tttt.....
    ........bKK.....
    ........KKKK....
    ----------^-----
  `,
  run6: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ...LLBBCCLBBBB..
    LLLBBBCCLBBBKL..
    gBBBCCKKLBBBKLB.
    .gCCK...BBBBKBB.
    ........BBBBKBB.
    .......gggGggbb.
    .......dttmmt...
    ........tdmtt...
    ........td.mt...
    ........tdmt....
    .......tobmt....
    .......tbbb.....
    .......bKK......
    .......KKKK.....
    ----------^-----
  `,
  run7: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    .LLLBBCCLBBKLB..
    LBBBBCCKLBKLBB..
    gBCCKK..BKLBBCb.
    .gK.....bbBBCC..
    .......gggGgg...
    .......dttmmt...
    .......td.mmtt..
    .......td...mt..
    ......td....mt..
    ......td....mt..
    .....td....obb..
    ....bK......bbb.
    ...KK...........
    ................
    ----------^-----
  `,
  jump0: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ...BBCCCKo..
    ...CCLBBBB..
    ..BCLBBBKL..
    .LBCLBBKLB..
    LBBCBBKLBC..
    LBCCBbbBCC..
    LBCKgggGgg..
    BCK.dttmmt..
    gK...dtmt...
    g....dtmt...
    .....dt.mt..
    ....dt...mt.
    ....Kb...ob.
    .....K....bb
    ............
    -------^----
  `,
  jump1: `
    ......LLBB...
    ....LLLBBBC..
    ...LLBBBBCCK.
    ...LBBBBKKoS.
    ..LBBBBKoSYS.
    ..LBBBCKoSS..
    ...BBCCCKo...
    ...CCLBBBB...
    ..BCLBBBKLBbb
    .LBCLBBBKLB..
    LBBCBBBBKB...
    LBCCBBBBCC...
    LBCKgggGgg...
    BCK.dttmmt...
    gK..dt.tmmt..
    g...dt..tmm..
    .....dt..tm..
    ......Kb.ob..
    .......K.bb..
    .............
    .............
    .............
    -------^-----
  `,
  fall0: `
    ..gg.....LLBB...
    .gLLg..LLLBBBC..
    gLBBBgLLBBBBCCK.
    gBBBBBLBBBBKKoS.
    .CBBBLBBBBKoSYS.
    ..KCCLBBBCKoSS..
    ...KKKBBCCCKo...
    .....KCCLBBBB...
    .......LBBBKLBbb
    ..W....LBBBKLB..
    ..W....BBBBKB...
    .W.....BBBBCC...
    .W.....gggGgg...
    W......dttmmt...
    M......dt..tm...
    .......dt..tm...
    ........dt..tm..
    ........dt..tm..
    ........Kb..obb.
    ................
    ................
    ................
    ----------^-----
  `,
  fall1: `
    .........LLBB...
    ..ggg..LLLBBBC..
    .gLLBgLLBBBBCCK.
    gLBBBBLBBBBKKoS.
    gBBBBLBBBBKoSYS.
    .KCCCLBBBCKoSSbb
    ..KKKgBBCCCKoKLB
    .....KCCLBBBKLB.
    .......LBBBBKL..
    ..W....LBBBBB...
    ..W....BBBBBC...
    .W.....BBBBCC...
    .W.....gggGgg...
    W......dttmmt...
    M......dt.tm....
    .......dt.tm....
    .......dt.tm....
    .......dt.tm....
    .......dt.tm....
    .......Kb.ob....
    .......K..bb....
    ----------^-----
  `,
  land: `
    ..........LLBB...
    ........LLLBBBC..
    .......LLBBBBCCK.
    .......LBBBBKKoS.
    .....GLBBBBKoSYS.
    ....d.LBBBCKoSS..
    ...gGCCBBCCCKo...
    ....BCC..LBBBB...
    ....BCC.LBBBBB...
    ..WLBCC.LBBBKLBbb
    ..WLBCC.BBBBKLB..
    .W.LBCK.BBBBKB...
    .W.LBCKgggGgg....
    W..BCKKdttmmmt...
    M...gg.dt..tmm...
    .......dt...tm...
    .......dt..tm....
    .......Kbb.obb...
    .......KKb.bbbb..
    ----------^------
  `,
};

export type HeroFrame = keyof typeof FRAMES;

/** A frame made ready to draw. */
export interface HeroSprite {
  readonly sprite: PixelSprite;
  /** Width and height in art pixels. */
  readonly w: number;
  readonly h: number;
  /** The column of the middle of his hitbox, counted from the left. */
  readonly anchor: number;
  /** His sword hand ('H'): art pixels forward of that column, and up from his feet. */
  readonly hand: { readonly x: number; readonly y: number } | null;
}

const made = new Map<HeroFrame, HeroSprite>();

/** A frame, rasterised the first time it is asked for. */
export function heroSprite(name: HeroFrame): HeroSprite {
  let s = made.get(name);
  if (!s) {
    const rows = FRAMES[name]
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    const ground = rows.pop() ?? '^';
    const anchor = ground.indexOf('^');
    let hand: { x: number; y: number } | null = null;
    rows.forEach((row, y) => {
      const x = row.indexOf('H');
      if (x >= 0) hand = { x: x - anchor, y: rows.length - 1 - y };
    });
    const sprite = new PixelSprite(rows, LAID);
    s = { sprite, w: sprite.w, h: sprite.h, anchor, hand };
    made.set(name, s);
  }
  return s;
}

/**
 * Draws a frame with the middle column of his hitbox starting at logical x
 * `mid` and his feet on logical y `feet` - both already on the grid - facing
 * right or, mirrored about that column, left.
 */
export function drawHero(ctx: CanvasRenderingContext2D, name: HeroFrame, mid: number, feet: number, facing: 1 | -1): void {
  const s = heroSprite(name);
  const column = facing > 0 ? s.anchor : s.w - 1 - s.anchor;
  s.sprite.draw(ctx, mid - column * ART, feet - s.h * ART, facing);
}
