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

/**
 * What he is made of: his sixteen paints, and the only colours his frames,
 * his sword and his slashes come out in (the actor pass and the palette
 * mapping leave a colour of the palette exactly as it is drawn).
 */
export const HERO_PALETTE: readonly string[] = [...new Set([...Object.values(PAINT), RAMP.grey[7]])];

const FRAMES = {
  idle0: `
    .........LLBB..
    .......LLLBBBC.
    ......LLBBBBCCK
    ......LBBBBKKoS
    .....LBBBBKoSYS
    .....LBBBCKoSS.
    .....CBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKLB.
    .W.LBCKBBBBKob.
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
    .....LBBBCKoSS.
    .....CBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKLB.
    .W.LBCKBBBBKob.
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
    .....LBBBCKoSS.
    .....CBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKLB.
    .W.LBCKgggGKob.
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
    .....LBBBCKoSS.
    .....CBBCCCKo..
    ....BCC.LBBBB..
    ....BCCLBBBKL..
    ..WLBCCLBBBKLB.
    ..WLBCCBBBBKLB.
    .W.LBCKgggGKob.
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
    LBBBCCKKBKobBCb..
    gBCCKK..bboBCC...
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
    gBBCCKK.BKobBCb.
    .gCK....bboBCC..
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
    .gCCK...BBBBKLB.
    ........BBBBKob.
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
    gBCCKK..BBBBBobb
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
    LBBBCCKKBBBBBobb
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
    gBBCCKK.BBBBBobb
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
    .gCCK...BBBBKLB.
    ........BBBBKob.
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
    gBCCKK..BKobBCb.
    .gK.....bboBCC..
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
    LBBCBBKobC..
    LBCCBbboCC..
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
    ..BCLBBBKLobb
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
    .......LBBBKLobb
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
    ..KKK.BBCCCKoKLB
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
    ......LBBBBKoSYS.
    ......LBBBCKoSS..
    .....CCBBCCCKo...
    ....BCC..LBBBB...
    ....BCC.LBBBBB...
    ..WLBCC.LBBBKLobb
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
  atk_high: `
    ......LLBB....
    ....LLLBBBC...
    ...LLBBBBCCK..
    ...LBBHbKKoS..
    ..LBBBKobSYS..
    ..LBBBCKLBS...
    ..CBBCCCLB....
    .BCC.LBBKL....
    .BCCLBBBBB....
    LBCCLBBBBB....
    LBCCBBBBBC....
    LBCKBBBBCC....
    LBCKgggGgg....
    BCKK.dttmmt...
    .gg..dt..tm...
    .....dt..tm...
    .....dt...tm..
    .....dt...tm..
    .....dt...tm..
    .....Kb...obb.
    .....KK...bbbb
    --------^-----
  `,
  atk_low: `
    .......LLBB...
    .....LLLBBBC..
    ....LLBBBBCCK.
    ....LBBBBKKoS.
    ...LBBBBKoSYS.
    ...LBBBCKoSS..
    ..CCBBCCCKo...
    .BCC..LBBBB...
    .BCC.LBBBKL...
    LBCC.LBBBKLB..
    LBCC.BBBBBKob.
    LBCK.BBBBCCKob
    LBCKdgggGgg.KH
    BCKKdt..tm....
    .ggdt....tm...
    ...dt.....tm..
    ...dt.....tm..
    ...dt.....tm..
    ...Kb.....obb.
    ...KK.....bbbb
    -------^------
  `,
  atk_back: `
    ......LLBB....
    ....LLLBBBC...
    ...LLBBBBCCK..
    ...LBBBBKKoS..
    ..LBBBBKoSYS..
    ..LBBBCKoSS...
    ..CBBHobbo....
    .BCC.LKLBB....
    .BCCLBBKLB....
    LBCCLBBBBB....
    LBCCBBBBBC....
    LBCKBBBBCC....
    LBCKgggGgg....
    BCKK.dttmmt...
    .gg..dt..tm...
    .....dt..tm...
    .....dt...tm..
    .....dt...tm..
    .....dt...tm..
    .....Kb...obb.
    .....KK...bbbb
    --------^-----
  `,
  atk_strike: `
    .......LLBB....
    .....LLLBBBC...
    ....LLBBBBCCK..
    ....LBBBBKKoS..
    ...LBBBBKoSYS..
    ...LBBBCKoSS...
    ..CCBBCCCKo....
    .BCC..LBBBB....
    .BCC.LBBKLLBoob
    LBCC.LBBKBBBbbH
    LBCC.BBBBBC....
    LBCK.BBBBCC....
    LBCK.gggGgg....
    BCKKdttmmt.....
    .gg.dt..tm.....
    ...dt....tm....
    ...dt.....tm...
    ...dt.....tm...
    ...dt.....tm...
    ...Kb.....obb..
    ...KK.....bbbb.
    -------^-------
  `,
  atk_follow: `
    ........LLBB...
    ......LLLBBBC..
    .....LLBBBBCCK.
    .....LBBBBKKoS.
    ....LBBBBKoSYS.
    ....LBBBCKoSS..
    ..CC.BBCCCKo...
    .BCC...LBBKL...
    .BCC..LBBBBKLB.
    LBCC..LBBBBBKob
    LBCC..BBBBBC.ob
    LBCK..BBBBCC..H
    LBCKdgggGgg....
    BCKKdt..tm.....
    .ggdt....tm....
    ...dt.....tm...
    ...dt.....tm...
    ...dt.....tm...
    ...Kb.....obb..
    ...KK.....bbbb.
    -------^-------
  `,
  atk_rise: `
    .......LLBB....
    .....LLLBBBC...
    ....LLBBBBCCK..
    ....LBBBBKKoS..
    ...LBBBBKoSYS..
    ...LBBBCKoSS.oH
    ..CCBBCCCKo.obb
    .BCC..LBBBBKLB.
    .BCC.LBBBBKLB..
    LBCC.LBBBKLB...
    LBCC.BBBBBC....
    LBCK.BBBBCC....
    LBCK.gggGgg....
    BCKKdttmmt.....
    .gg.dt..tm.....
    ...dt....tm....
    ...dt.....tm...
    ...dt.....tm...
    ...dt.....tm...
    ...Kb.....obb..
    ...KK.....bbbb.
    -------^-------
  `,
  atk_recover: `
    .......LLBB...
    .....LLLBBBC..
    ....LLBBBBCCK.
    ....LBBBBKKoS.
    ...LBBBBKoSYS.
    ...LBBBCKoSS..
    ..CCBBCCCKo...
    .BCC..LBBKL...
    .BCC.LBBBKLB..
    LBCC.LBBBBKLB.
    LBCC.BBBBBKob.
    LBCK.BBBBCCH..
    LBCK.gggGgg...
    BCKKdttmmt....
    .gg.dt..tm....
    ...dt....tm...
    ...dt.....tm..
    ...dt.....tm..
    ...dt.....tm..
    ...Kb.....obb.
    ...KK.....bbbb
    -------^------
  `,
  air_high: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBHbKKoS
    ..LBBBKobSYS
    ..LBBBCKLBS.
    ...BBCCCLB..
    .....LBBKL..
    ...CLBBBBB..
    ..BCLBBBBB..
    .LBCBBBBBC..
    LBBCBBBBCC..
    LBCCgggGgg..
    LBCK.dttmmt.
    BCK..dt.tmmt
    gK...dt..tmm
    g.....dt..tm
    .......Kb.ob
    ........K.bb
    ............
    ............
    ............
    --------^---
  `,
  air_low: `
    .......LLBB...
    .....LLLBBBC..
    ....LLBBBBCCK.
    ....LBBBBKKoS.
    ...LBBBBKoSYS.
    ...LBBBCKoSS..
    ....BBCCCKo...
    ......LBBBB...
    ...CCLBBBKL...
    ..BCCLBBBKLB..
    .LBCCBBBBBKob.
    LBBCKgggGggKob
    LBCCdttmmt..KH
    LBCKdt.tmmt...
    BCK.dt..tmm...
    gK...dt..tm...
    g.....Kb.ob...
    .......K.bb...
    ..............
    ..............
    ..............
    -------^------
  `,
  air_back: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ...BBHobbo..
    .....LKLBB..
    ...CLBBKLB..
    ..BCLBBBBB..
    .LBCBBBBBC..
    LBBCBBBBCC..
    LBCCgggGgg..
    LBCK.dttmmt.
    BCK..dt.tmmt
    gK...dt..tmm
    g.....dt..tm
    .......Kb.ob
    ........K.bb
    ............
    ............
    ............
    --------^---
  `,
  air_strike: `
    .......LLBB....
    .....LLLBBBC...
    ....LLBBBBCCK..
    ....LBBBBKKoS..
    ...LBBBBKoSYS..
    ...LBBBCKoSS...
    ....BBCCCKo....
    ......LBBBB....
    ...CCLBBKLLBoob
    ..BCCLBBKBBBbbH
    .LBCCBBBBBC....
    LBBCKBBBBCC....
    LBCCKgggGgg....
    LBCKdttmmt.....
    BCK.dt.tmmt....
    gK..dt..tmm....
    g....dt..tm....
    ......Kb.ob....
    .......K.bb....
    ...............
    ...............
    ...............
    -------^-------
  `,
  air_follow: `
    ........LLBB...
    ......LLLBBBC..
    .....LLBBBBCCK.
    .....LBBBBKKoS.
    ....LBBBBKoSYS.
    ....LBBBCKoSS..
    .....BBCCCKo...
    .......LBBKL...
    ...CC.LBBBBKLB.
    ..BCC.LBBBBBKob
    .LBCC.BBBBBC.ob
    LBBCKgggGggC..H
    LBCCdttmmt.....
    LBCKdt.tmmt....
    BCK.dt..tmm....
    gK...dt..tm....
    g.....Kb.ob....
    .......K.bb....
    ...............
    ...............
    ...............
    -------^-------
  `,
  air_rise: `
    .......LLBB....
    .....LLLBBBC...
    ....LLBBBBCCK..
    ....LBBBBKKoS..
    ...LBBBBKoSYS..
    ...LBBBCKoSS.oH
    ....BBCCCKo.obb
    ......LBBBBKLB.
    ...CCLBBBBKLB..
    ..BCCLBBBKLB...
    .LBCCBBBBBC....
    LBBCKBBBBCC....
    LBCCKgggGgg....
    LBCKdttmmt.....
    BCK.dt.tmmt....
    gK..dt..tmm....
    g....dt..tm....
    ......Kb.ob....
    .......K.bb....
    ...............
    ...............
    ...............
    -------^-------
  `,
  air_recover: `
    .......LLBB..
    .....LLLBBBC.
    ....LLBBBBCCK
    ....LBBBBKKoS
    ...LBBBBKoSYS
    ...LBBBCKoSS.
    ....BBCCCKo..
    ......LBBKL..
    ...CCLBBBKLB.
    ..BCCLBBBBKLB
    .LBCCBBBBBKob
    LBBCKBBBBCCH.
    LBCCKgggGgg..
    LBCKdttmmt...
    BCK.dt.tmmt..
    gK..dt..tmm..
    g....dt..tm..
    ......Kb.ob..
    .......K.bb..
    .............
    .............
    .............
    -------^-----
  `,
  parry: `
    ......LLBB...
    ....LLLBBBC..
    ...LLBBBBCCK.
    ...LBBBBKKoS.
    ..LBBBBKoSYS.
    ..LBBBCKoSS..
    ..CBBCCCKo...
    .BCC.LBBBB...
    .BCCLBBBKL...
    LBCCLBBBKLB..
    LBCCBBBBBKobH
    LBCKBBBBCCKbb
    LBCKgggGgg...
    BCKKdttmmt...
    .gg.dt..tm...
    ....dt..tm...
    ....dt...tm..
    ....dt...tm..
    ....dt...tm..
    ....Kb...obb.
    ....KK...bbbb
    -------^-----
  `,
  air_parry: `
    ......LLBB...
    ....LLLBBBC..
    ...LLBBBBCCK.
    ...LBBBBKKoS.
    ..LBBBBKoSYS.
    ..LBBBCKoSS..
    ...BBCCCKo...
    .....LBBBB...
    ...CLBBBKL...
    ..BCLBBBKLB..
    .LBCBBBBBKobH
    LBBCBBBBCCKbb
    LBCCgggGgg...
    LBCKdttmmt...
    BCK.dt.tmmt..
    gK..dt..tmm..
    g....dt..tm..
    ......Kb.ob..
    .......K.bb..
    .............
    .............
    .............
    -------^-----
  `,
  idle_c0: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ..CBBCCCKo..
    .BCC.LBBBB..
    .BCCLBBLBB..
    LBCCLBLBBB..
    LBCCBobBBC..
    LBCKHbBBCC..
    LBCKgggGgg..
    BCK.dttmmt..
    gg..dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....bbo.bbo.
    ....bbb.bbbb
    -------^----
  `,
  idle_c1: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ..CBBCCCKo..
    .BCC.LBBBB..
    .BCCLBBLBB..
    LBCCLBLBBB..
    LBCCBobBBC..
    LBCKHbBBCC..
    LBCKgggGgg..
    BCKKdttmmt..
    .gg.dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....bbo.bbo.
    ....bbb.bbbb
    -------^----
  `,
  idle_c2: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ..CBBCCCKo..
    .BCC.LBBBB..
    .BCCLBBLBB..
    LBCCLBLBBB..
    LBCCBobBBC..
    LBCKHbgGgg..
    LBCKdttmmt..
    BCKKdt.tm...
    .gg.dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....bbo.bbo.
    ....bbb.bbbb
    -------^----
  `,
  idle_c3: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ..CBBCCCKo..
    .BCC.LBBBB..
    .BCCLBBLBB..
    LBCCLBLBBB..
    LBCCBobBBC..
    LBCKHbgGgg..
    LBCKdttmmt..
    BCK.dt.tm...
    gg..dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....dt.tm...
    ....bbo.bbo.
    ....bbb.bbbb
    -------^----
  `,
  run_c0: `
    ..........LLBB...
    ........LLLBBBC..
    .......LLBBBBCCK.
    .......LBBBBKKoS.
    ......LBBBBKoSYS.
    ......LBBBCKoSS..
    .......BBCCCKo...
    .....BBCCLBBBB...
    ...LLBBCLBBLBB...
    .LLBBBCCLBLBBB...
    LBBBCCKKBobBBC...
    gBCCKK..HbBBCC...
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
  run_c1: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    ..LLBBBCLBBLBB..
    LLBBBCCKLBLBBB..
    gBBCCKK.BobBBC..
    .gCK....HbBBCC..
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
  run_c2: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ...LLBBCCLBBBB..
    LLLBBBCCLBBLBB..
    gBBBCCKKLBLBBB..
    .gCCK...BobBBC..
    ........HbBBCC..
    .......gggGgg...
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
  run_c3: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    .LLLBBCCLBBLBB..
    LBBBBCCKLBLBBB..
    gBCCKK..BobBBC..
    .gK.....HbBBCC..
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
  run_c4: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    .....BBCCLBBBB..
    ...LLBBCLBBLBB..
    .LLBBBCCLBLBBB..
    LBBBCCKKBobBBC..
    gBCCKK..HbBBCC..
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
  run_c5: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    ..LLBBBCLBBLBB..
    LLBBBCCKLBLBBB..
    gBBCCKK.BobBBC..
    .gCK....HbBBCC..
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
  run_c6: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ...LLBBCCLBBBB..
    LLLBBBCCLBBLBB..
    gBBBCCKKLBLBBB..
    .gCCK...BobBBC..
    ........HbBBCC..
    .......gggGgg...
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
  run_c7: `
    ..........LLBB..
    ........LLLBBBC.
    .......LLBBBBCCK
    .......LBBBBKKoS
    ......LBBBBKoSYS
    ......LBBBCKoSS.
    .......BBCCCKo..
    ....LBBCCLBBBB..
    .LLLBBCCLBBLBB..
    LBBBBCCKLBLBBB..
    gBCCKK..BobBBC..
    .gK.....HbBBCC..
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
  jump_c0: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ...BBCCCKo..
    ...CCLBBBB..
    ..BCLBBLBB..
    .LBCLBLBBB..
    LBBCBobBBC..
    LBCCHbBBCC..
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
  jump_c1: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBBBKKoS
    ..LBBBBKoSYS
    ..LBBBCKoSS.
    ...BBCCCKo..
    ...CCLBBBB..
    ..BCLBBLBB..
    .LBCLBLBBB..
    LBBCBobBBC..
    LBCCHbBBCC..
    LBCKgggGgg..
    BCK.dttmmt..
    gK..dt.tmmt.
    g...dt..tmm.
    .....dt..tm.
    ......Kb.ob.
    .......K.bb.
    ............
    ............
    ............
    -------^----
  `,
  fall_c0: `
    ..gg.....LLBB..
    .gLLg..LLLBBBC.
    gLBBBgLLBBBBCCK
    gBBBBBLBBBBKKoS
    .CBBBLBBBBKoSYS
    ..KCCLBBBCKoSS.
    ...KKKBBCCCKo..
    .....KCCLBBBB..
    .......LBBLBB..
    .......LBLBBB..
    .......BobBBC..
    .......HbBBCC..
    .......gggGgg..
    .......dttmmt..
    .......dt..tm..
    .......dt..tm..
    ........dt..tm.
    ........dt..tm.
    ........Kb..obb
    ...............
    ...............
    ...............
    ----------^----
  `,
  fall_c1: `
    .........LLBB..
    ..ggg..LLLBBBC.
    .gLLBgLLBBBBCCK
    gLBBBBLBBBBKKoS
    gBBBBLBBBBKoSYS
    .KCCCLBBBCKoSS.
    ..KKK.BBCCCKo..
    .....KCCLBBBB..
    .......LBBLBB..
    .......LBLBBB..
    .......BobBBC..
    .......HbBBCC..
    .......gggGgg..
    .......dttmmt..
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......dt.tm...
    .......Kb.ob...
    .......K..bb...
    ----------^----
  `,
  hurt0: `
    ........LLBB.....
    ......LLLBBBC....
    .....LLBBBBCCK...
    .....LBBBBKKoS...
    ....LBBBBKoSoS...
    ....LBBBCKoSo.bb.
    .....BBCCCKoKLB..
    .....BCLBBBKLB...
    ..W.LBCLBBKLB....
    ..WLBBCBBBBBC....
    .W.LBCCBBBBCC....
    .W.LBCK.gggGgg...
    W..BCK..dttmmt...
    M..gK...dt..tm...
    ...g....dt..tm...
    ........dt...tm..
    ........dt...tm..
    ........dt...tm..
    ........Kb...obb.
    ........KK...bbbb
    -----------^-----
  `,
  hurt1: `
    ...........LLBB..
    .........LLLBBBC.
    ........LLBBBBCCK
    ........LBBBBKKoS
    .......LBBBBKoSoS
    .....CCLBBBCKoSo.
    ....BCC.BBCCCKo..
    ....BCC..LBBBB...
    ..WLBCC.LBBBKL...
    ..WLBCC.LBBBKLB..
    .W.LBCK.BBBBKLB..
    .W.LBCK.BBBBKob..
    W..BCK.gggGggbb..
    M..gg..dttmmmt...
    .......dt..tmm...
    .......dt...tm...
    .......dt..tm....
    .......Kbb.obb...
    .......KKb.bbbb..
    ----------^------
  `,
  roll0: `
    .........LLBB..
    .......LLLBBBC.
    ......LLBBBBCCK
    ......LBBBBKKoS
    ..CC.LBBBBKoSYS
    .BCC.LBBBCKoSS.
    .BCC..BBCCCKo..
    LBCC..LBBBBB...
    LBCC..BBBBKLobb
    LBCK..BBBBKLB..
    LBCKdgggGgKB...
    BCKKdt..tmm....
    .gg.dt...tm....
    ....dt..tm.....
    ....Kbb.obb....
    ....KKb.bbbb...
    -------^-------
  `,
  roll1: `
    ...LLLL...
    ..LBBBBSo.
    .LBBBBSYS.
    .LBBBBBSo.
    LBBBBBBbbo
    LBBBBBbbbo
    LBBBBBmtbb
    .BBBBCmtt.
    .gBBCCtd..
    ..ggCCdd..
    ....CK....
    -----^----
  `,
  roll2: `
    ....LLL....
    ..gLBBBBB..
    .gBBBBBBBB.
    .gBBBBBBBCC
    LBBBBBBBCCC
    LBBBBBBCCCK
    .dtmmbCCSCK
    .ddttbbSYS.
    ...tbbboSo.
    ....boo....
    ...........
    -----^-----
  `,
  roll3: `
    ....LL....
    ..ddBBgg..
    ..dtBBBBg.
    .ttmBBBBC.
    bbtmBBBCCC
    obbbBBCCCK
    obbBBCCCCK
    .oSBCCCCK.
    .SYSCCCCK.
    .oSCCCCK..
    ...CKKK...
    ----^-----
  `,
  roll4: `
    ....oob....
    .oSobbbt...
    .SYSbbttdd.
    LBSBBbmmtd.
    LBBBBBBCCCK
    LBBBBBCCCCK
    BBBBBCCCCg.
    .BBBCCCCCg.
    ..BCCCCKg..
    ....CKK....
    -----^-----
  `,
  roll5: `
    ........LLBB...
    ......LLLBBBC..
    .....LLBBBBCCK.
    .....LBBBBKKoS.
    ....LBBBBKoSYS.
    ....LBBBCKoSS..
    .....BBCCCKo...
    .......LBBBB...
    ...CC.LBBBBB...
    ..BCC.LBBBKLobb
    .LBCC.BBBBKLB..
    LBBCK.BBBBKB...
    LBCCKgggGgg....
    LBCK.dttmmmt...
    BCK..dt..tmm...
    gK...dt...tm...
    g....dt..tm....
    .....Kbb.obb...
    .....KKb.bbbb..
    --------^------
  `,
  sheath: `
    ......LLBB....
    ....LLLBBBC...
    ...LLBBBBCCK..
    ...LBBHbKKoS..
    ..LBBBKobSYS..
    ..LBBBCKLBS...
    ..CBBCCCLB....
    .BCC.LBBKL....
    .BCCLBBBBB....
    LBCCLBBBBB....
    LBCCBBBBBC....
    LBCKBBBBCC....
    LBCKgggGgg....
    BCKK.dttmmt...
    .gg..dt..tm...
    .....dt..tm...
    .....dt...tm..
    .....dt...tm..
    .....dt...tm..
    .....Kb...obb.
    .....KK...bbbb
    --------^-----
  `,
  air_sheath: `
    ......LLBB..
    ....LLLBBBC.
    ...LLBBBBCCK
    ...LBBHbKKoS
    ..LBBBKobSYS
    ..LBBBCKLBS.
    ...BBCCCLB..
    .....LBBKL..
    ...CLBBBBB..
    ..BCLBBBBB..
    .LBCBBBBBC..
    LBBCBBBBCC..
    LBCCgggGgg..
    LBCK.dttmmt.
    BCK..dt.tmmt
    gK...dt..tmm
    g.....dt..tm
    .......Kb.ob
    ........K.bb
    ............
    ............
    ............
    --------^---
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
  /** His eye (the cyan 'Y'), the same way; null where it is shut. */
  readonly eye: { readonly x: number; readonly y: number } | null;
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
    let eye: { x: number; y: number } | null = null;
    rows.forEach((row, y) => {
      const x = row.indexOf('H');
      if (x >= 0) hand = { x: x - anchor, y: rows.length - 1 - y };
      const e = row.indexOf('Y');
      if (e >= 0 && !eye) eye = { x: e - anchor, y: rows.length - 1 - y };
    });
    const sprite = new PixelSprite(rows, PAINT);
    s = { sprite, w: sprite.w, h: sprite.h, anchor, hand, eye };
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

const whites = new Map<HeroFrame, HTMLCanvasElement>();

/**
 * A frame of him all in white: what a blow shows for its first frames.
 * Made once per frame - a silhouette, not a filter over the whole screen.
 */
export function heroWhite(name: HeroFrame): HTMLCanvasElement {
  let canvas = whites.get(name);
  if (!canvas) {
    const rows = FRAMES[name]
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .slice(0, -1);
    canvas = new PixelSprite(
      rows.map((r) => r.replace(/[^.]/g, 'w')),
      { w: RAMP.grey[7] },
    ).canvas;
    whites.set(name, canvas);
  }
  return canvas;
}

/**
 * The after-images of a roll: his silhouette in two blues, its edge paler
 * than its inside - the nearest after-image palest, the farthest darkest.
 * Opaque, so they stay crisp, and few, so they stay readable.
 */
const GHOST_TONES: readonly (readonly [string, string])[] = [
  [RAMP.blue[3], RAMP.blue[2]],
  [RAMP.blue[2], RAMP.blue[1]],
  [RAMP.blue[1], RAMP.slate[1]],
];

const ghosts = new Map<HeroFrame, PixelSprite[]>();

export function drawGhost(ctx: CanvasRenderingContext2D, name: HeroFrame, tone: number, mid: number, feet: number, facing: 1 | -1): void {
  let list = ghosts.get(name);
  if (!list) ghosts.set(name, (list = []));
  const t = Math.min(GHOST_TONES.length - 1, tone);
  let ghost = list[t];
  if (!ghost) {
    const rows = FRAMES[name]
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .slice(0, -1);
    const solid = (x: number, y: number): boolean => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] !== '.';
    // Edge pixels (any side open) in the paler blue, the rest in the darker.
    const marked = rows.map((row, y) =>
      [...row].map((c, x) => (c === '.' ? '.' : solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1) ? 'i' : 'e')).join(''),
    );
    ghost = new PixelSprite(marked, { e: GHOST_TONES[t][0], i: GHOST_TONES[t][1] });
    list[t] = ghost;
  }
  const s = heroSprite(name);
  const column = facing > 0 ? s.anchor : s.w - 1 - s.anchor;
  ghost.draw(ctx, mid - column * ART, feet - s.h * ART, facing);
}
