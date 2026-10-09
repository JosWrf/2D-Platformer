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
    .........YYLL..
    .......YYYLLLB.
    ......YYLLLLBBK
    ......YLLLLKKoS
    .....YLLLLKoSYS
    .....YLLLBKoSS.
    .....CLLBBBKo..
    ....BCC.YLLLL..
    ....BCCYLLLKY..
    ..WLBCCYLLLKYL.
    ..WLBCCLLLLKYL.
    .W.LBCKLLLLKob.
    .W.LBCKgggGgbb.
    W..BCK.tmmMMm..
    M..gg..tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......ooS.ooS.
    .......ooo.oooo
    ----------^----
  `,
  idle1: `
    .........YYLL..
    .......YYYLLLB.
    ......YYLLLLBBK
    ......YLLLLKKoS
    .....YLLLLKoSYS
    .....YLLLBKoSS.
    .....CLLBBBKo..
    ....BCC.YLLLL..
    ....BCCYLLLKY..
    ..WLBCCYLLLKYL.
    ..WLBCCLLLLKYL.
    .W.LBCKLLLLKob.
    .W.LBCKgggGgbb.
    W..BCKKtmmMMm..
    M...gg.tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......ooS.ooS.
    .......ooo.oooo
    ----------^----
  `,
  idle2: `
    .........YYLL..
    .......YYYLLLB.
    ......YYLLLLBBK
    ......YLLLLKKoS
    .....YLLLLKoSYS
    .....YLLLBKoSS.
    .....CLLBBBKo..
    ....BCC.YLLLL..
    ....BCCYLLLKY..
    ..WLBCCYLLLKYL.
    ..WLBCCLLLLKYL.
    .W.LBCKgggGKob.
    .W.LBCKtmmMMbb.
    W..BCKKtm.mM...
    M...gg.tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......ooS.ooS.
    .......ooo.oooo
    ----------^----
  `,
  idle3: `
    .........YYLL..
    .......YYYLLLB.
    ......YYLLLLBBK
    ......YLLLLKKoS
    .....YLLLLKoSYS
    .....YLLLBKoSS.
    .....CLLBBBKo..
    ....BCC.YLLLL..
    ....BCCYLLLKY..
    ..WLBCCYLLLKYL.
    ..WLBCCLLLLKYL.
    .W.LBCKgggGKob.
    .W.LBCKtmmMMbb.
    W..BCK.tm.mM...
    M..gg..tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......ooS.ooS.
    .......ooo.oooo
    ----------^----
  `,
  run0: `
    ..........YYLL...
    ........YYYLLLB..
    .......YYLLLLBBK.
    .......YLLLLKKoS.
    ......YLLLLKoSYS.
    ......YLLLBKoSS..
    .......LLBBBKo...
    .....BBCCYLLLL...
    ...LLBBCYLLKYL...
    .LLBBBCCYLYYLL...
    LBBBCCKKLobLLBb..
    gBCCKK..boLLBB...
    .gK....gggGgg....
    .......tmmMMm....
    .......mt..Mm....
    .......mt..Mm....
    ......mmt...Mm...
    ....mmtt....Mm...
    ...obt.......Mm..
    ...bb........Soo.
    .............oooo
    ----------^------
  `,
  run1: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    ..LLBBBCYLLKYL..
    LLBBBCCKYLYYLL..
    gBBCCKK.LobLLBb.
    .gCK....boLLBB..
    .......gggGgg...
    .......tmmMMm...
    .......mt..Mm...
    ....ob.mt...Mm..
    ....bmmmt..Mm...
    .....tttt.Mm....
    ..........Soo...
    ..........oooo..
    ----------^-----
  `,
  run2: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ...LLBBCCYLLLL..
    LLLBBBCCYLLLKY..
    gBBBCCKKYLLLKYL.
    .gCCK...LLLLKYL.
    ........LLLLKob.
    .......gggGggbb.
    .......tmmMMm...
    ........mtMm....
    .........mMm....
    ........mtMm....
    ......obmMm.....
    ......bbbMm.....
    .........Soo....
    .........oooo...
    ----------^-----
  `,
  run3: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    .LLLBBCCYLLLKY..
    LBBBBCCKYLLLKYL.
    gBCCKK..LLLLLobb
    .gK.....LLLLBB..
    .......gggGgg...
    .......tmmMMm...
    ........mMmt....
    .........Mmt....
    ........Mmmt....
    ........Mmmt....
    .......Mmobb....
    ......So..bbb...
    .....oo.........
    ................
    ----------^-----
  `,
  run4: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    .....BBCCYLLLL..
    ...LLBBCYLLLKY..
    .LLBBBCCYLLLKYL.
    LBBBCCKKLLLLLobb
    gBCCKK..LLLLBB..
    .gK....gggGgg...
    .......tmmMMm...
    .........Mm.....
    .........Mm.....
    ........MMmt....
    ......MMmmmt....
    .....Som...mt...
    .....oo....obb..
    ...........bbbb.
    ----------^-----
  `,
  run5: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    ..LLBBBCYLLLKY..
    LLBBBCCKYLLLKYL.
    gBBCCKK.LLLLLobb
    .gCK....LLLLBB..
    .......gggGgg...
    .......tmmMMm...
    .........Mm.....
    ......So.Mmt....
    ......oMMMm.....
    .......mmmm.....
    ........obb.....
    ........bbbb....
    ----------^-----
  `,
  run6: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ...LLBBCCYLLLL..
    LLLBBBCCYLLLKY..
    gBBBCCKKYLLLKYL.
    .gCCK...LLLLKYL.
    ........LLLLKob.
    .......gggGggbb.
    .......tmmMMm...
    ........mtMmm...
    ........mt.Mm...
    ........mtMm....
    .......mSoMm....
    .......mooo.....
    .......obb......
    .......bbbb.....
    ----------^-----
  `,
  run7: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    .LLLBBCCYLLKYL..
    LBBBBCCKYLYYLL..
    gBCCKK..LobLLBb.
    .gK.....boLLBB..
    .......gggGgg...
    .......tmmMMm...
    .......mt.MMmm..
    .......mt...Mm..
    ......mt....Mm..
    ......mt....Mm..
    .....mt....Soo..
    ....ob......ooo.
    ...bb...........
    ................
    ----------^-----
  `,
  jump0: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ...LLBBBKo..
    ...CCYLLLL..
    ..BCYLLLKY..
    .LBCYLLYYL..
    LBBCLLobLB..
    LBCCLboLBB..
    LBCKgggGgg..
    BCK.tmmMMm..
    gK...tmMm...
    g....tmMm...
    .....tm.Mm..
    ....tm...Mm.
    ....bo...So.
    .....b....oo
    ............
    -------^----
  `,
  jump1: `
    ......YYLL...
    ....YYYLLLB..
    ...YYLLLLBBK.
    ...YLLLLKKoS.
    ..YLLLLKoSYS.
    ..YLLLBKoSS..
    ...LLBBBKo...
    ...CCYLLLL...
    ..BCYLLLKYobb
    .LBCYLLLKYL..
    LBBCLLLLKL...
    LBCCLLLLBB...
    LBCKgggGgg...
    BCK.tmmMMm...
    gK..tm.mMMm..
    g...tm..mMM..
    .....tm..mM..
    ......bo.So..
    .......b.oo..
    .............
    .............
    .............
    -------^-----
  `,
  fall0: `
    ..gg.....YYLL...
    .gLLg..YYYLLLB..
    gLBBBgYYLLLLBBK.
    gBBBBBYLLLLKKoS.
    .CBBBYLLLLKoSYS.
    ..KCCYLLLBKoSS..
    ...KKKLLBBBKo...
    .....KCCYLLLL...
    .......YLLLKYobb
    ..W....YLLLKYL..
    ..W....LLLLKL...
    .W.....LLLLBB...
    .W.....gggGgg...
    W......tmmMMm...
    M......tm..mM...
    .......tm..mM...
    ........tm..mM..
    ........tm..mM..
    ........bo..Soo.
    ................
    ................
    ................
    ----------^-----
  `,
  fall1: `
    .........YYLL...
    ..ggg..YYYLLLB..
    .gLLBgYYLLLLBBK.
    gLBBBBYLLLLKKoS.
    gBBBBYLLLLKoSYS.
    .KCCCYLLLBKoSSbb
    ..KKK.LLBBBKoKYL
    .....KCCYLLLKYL.
    .......YLLLLKY..
    ..W....YLLLLL...
    ..W....LLLLLB...
    .W.....LLLLBB...
    .W.....gggGgg...
    W......tmmMMm...
    M......tm.mM....
    .......tm.mM....
    .......tm.mM....
    .......tm.mM....
    .......tm.mM....
    .......bo.So....
    .......b..oo....
    ----------^-----
  `,
  land: `
    ..........YYLL...
    ........YYYLLLB..
    .......YYLLLLBBK.
    .......YLLLLKKoS.
    ......YLLLLKoSYS.
    ......YLLLBKoSS..
    .....CCLLBBBKo...
    ....BCC..YLLLL...
    ....BCC.YLLLLL...
    ..WLBCC.YLLLKYobb
    ..WLBCC.LLLLKYL..
    .W.LBCK.LLLLKL...
    .W.LBCKgggGgg....
    W..BCKKtmmMMMm...
    M...gg.tm..mMM...
    .......tm...mM...
    .......tm..mM....
    .......boo.Soo...
    .......bbo.oooo..
    ----------^------
  `,
  atk_high: `
    ......YYLL....
    ....YYYLLLB...
    ...YYLLLLBBK..
    ...YLLHbKKoS..
    ..YLLLKobSYS..
    ..YLLLBKYLS...
    ..CLLBBBYL....
    .BCC.YLLKY....
    .BCCYLLLLL....
    LBCCYLLLLL....
    LBCCLLLLLB....
    LBCKLLLLBB....
    LBCKgggGgg....
    BCKK.tmmMMm...
    .gg..tm..mM...
    .....tm..mM...
    .....tm...mM..
    .....tm...mM..
    .....tm...mM..
    .....bo...Soo.
    .....bb...oooo
    --------^-----
  `,
  atk_low: `
    .......YYLL...
    .....YYYLLLB..
    ....YYLLLLBBK.
    ....YLLLLKKoS.
    ...YLLLLKoSYS.
    ...YLLLBKoSS..
    ..CCLLBBBKo...
    .BCC..YLLLL...
    .BCC.YLLLKY...
    LBCC.YLLLKYL..
    LBCC.LLLLLKob.
    LBCK.LLLLBBKob
    LBCKtgggGgg.KH
    BCKKtm..mM....
    .ggtm....mM...
    ...tm.....mM..
    ...tm.....mM..
    ...tm.....mM..
    ...bo.....Soo.
    ...bb.....oooo
    -------^------
  `,
  atk_back: `
    ......YYLL....
    ....YYYLLLB...
    ...YYLLLLBBK..
    ...YLLLLKKoS..
    ..YLLLLKoSYS..
    ..YLLLBKoSS...
    ..CLLHobbo....
    .BCC.YKYLL....
    .BCCYLLKYL....
    LBCCYLLLLL....
    LBCCLLLLLB....
    LBCKLLLLBB....
    LBCKgggGgg....
    BCKK.tmmMMm...
    .gg..tm..mM...
    .....tm..mM...
    .....tm...mM..
    .....tm...mM..
    .....tm...mM..
    .....bo...Soo.
    .....bb...oooo
    --------^-----
  `,
  atk_strike: `
    .......YYLL....
    .....YYYLLLB...
    ....YYLLLLBBK..
    ....YLLLLKKoS..
    ...YLLLLKoSYS..
    ...YLLLBKoSS...
    ..CCLLBBBKo....
    .BCC..YLLLL....
    .BCC.YLLKYYLoob
    LBCC.YLLKLLLbbH
    LBCC.LLLLLB....
    LBCK.LLLLBB....
    LBCK.gggGgg....
    BCKKtmmMMm.....
    .gg.tm..mM.....
    ...tm....mM....
    ...tm.....mM...
    ...tm.....mM...
    ...tm.....mM...
    ...bo.....Soo..
    ...bb.....oooo.
    -------^-------
  `,
  atk_follow: `
    ........YYLL...
    ......YYYLLLB..
    .....YYLLLLBBK.
    .....YLLLLKKoS.
    ....YLLLLKoSYS.
    ....YLLLBKoSS..
    ..CC.LLBBBKo...
    .BCC...YLLKY...
    .BCC..YLLLLKYL.
    LBCC..YLLLLLKob
    LBCC..LLLLLB.ob
    LBCK..LLLLBB..H
    LBCKtgggGgg....
    BCKKtm..mM.....
    .ggtm....mM....
    ...tm.....mM...
    ...tm.....mM...
    ...tm.....mM...
    ...bo.....Soo..
    ...bb.....oooo.
    -------^-------
  `,
  atk_rise: `
    .......YYLL....
    .....YYYLLLB...
    ....YYLLLLBBK..
    ....YLLLLKKoS..
    ...YLLLLKoSYS..
    ...YLLLBKoSS.oH
    ..CCLLBBBKo.obb
    .BCC..YLLLLKYL.
    .BCC.YLLLLKYL..
    LBCC.YLLLKYL...
    LBCC.LLLLLB....
    LBCK.LLLLBB....
    LBCK.gggGgg....
    BCKKtmmMMm.....
    .gg.tm..mM.....
    ...tm....mM....
    ...tm.....mM...
    ...tm.....mM...
    ...tm.....mM...
    ...bo.....Soo..
    ...bb.....oooo.
    -------^-------
  `,
  atk_recover: `
    .......YYLL...
    .....YYYLLLB..
    ....YYLLLLBBK.
    ....YLLLLKKoS.
    ...YLLLLKoSYS.
    ...YLLLBKoSS..
    ..CCLLBBBKo...
    .BCC..YLLKY...
    .BCC.YLLLKYL..
    LBCC.YLLLLKYL.
    LBCC.LLLLLKob.
    LBCK.LLLLBBH..
    LBCK.gggGgg...
    BCKKtmmMMm....
    .gg.tm..mM....
    ...tm....mM...
    ...tm.....mM..
    ...tm.....mM..
    ...tm.....mM..
    ...bo.....Soo.
    ...bb.....oooo
    -------^------
  `,
  air_high: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLHbKKoS
    ..YLLLKobSYS
    ..YLLLBKYLS.
    ...LLBBBYL..
    .....YLLKY..
    ...CYLLLLL..
    ..BCYLLLLL..
    .LBCLLLLLB..
    LBBCLLLLBB..
    LBCCgggGgg..
    LBCK.tmmMMm.
    BCK..tm.mMMm
    gK...tm..mMM
    g.....tm..mM
    .......bo.So
    ........b.oo
    ............
    ............
    ............
    --------^---
  `,
  air_low: `
    .......YYLL...
    .....YYYLLLB..
    ....YYLLLLBBK.
    ....YLLLLKKoS.
    ...YLLLLKoSYS.
    ...YLLLBKoSS..
    ....LLBBBKo...
    ......YLLLL...
    ...CCYLLLKY...
    ..BCCYLLLKYL..
    .LBCCLLLLLKob.
    LBBCKgggGggKob
    LBCCtmmMMm..KH
    LBCKtm.mMMm...
    BCK.tm..mMM...
    gK...tm..mM...
    g.....bo.So...
    .......b.oo...
    ..............
    ..............
    ..............
    -------^------
  `,
  air_back: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ...LLHobbo..
    .....YKYLL..
    ...CYLLKYL..
    ..BCYLLLLL..
    .LBCLLLLLB..
    LBBCLLLLBB..
    LBCCgggGgg..
    LBCK.tmmMMm.
    BCK..tm.mMMm
    gK...tm..mMM
    g.....tm..mM
    .......bo.So
    ........b.oo
    ............
    ............
    ............
    --------^---
  `,
  air_strike: `
    .......YYLL....
    .....YYYLLLB...
    ....YYLLLLBBK..
    ....YLLLLKKoS..
    ...YLLLLKoSYS..
    ...YLLLBKoSS...
    ....LLBBBKo....
    ......YLLLL....
    ...CCYLLKYYLoob
    ..BCCYLLKLLLbbH
    .LBCCLLLLLB....
    LBBCKLLLLBB....
    LBCCKgggGgg....
    LBCKtmmMMm.....
    BCK.tm.mMMm....
    gK..tm..mMM....
    g....tm..mM....
    ......bo.So....
    .......b.oo....
    ...............
    ...............
    ...............
    -------^-------
  `,
  air_follow: `
    ........YYLL...
    ......YYYLLLB..
    .....YYLLLLBBK.
    .....YLLLLKKoS.
    ....YLLLLKoSYS.
    ....YLLLBKoSS..
    .....LLBBBKo...
    .......YLLKY...
    ...CC.YLLLLKYL.
    ..BCC.YLLLLLKob
    .LBCC.LLLLLB.ob
    LBBCKgggGggB..H
    LBCCtmmMMm.....
    LBCKtm.mMMm....
    BCK.tm..mMM....
    gK...tm..mM....
    g.....bo.So....
    .......b.oo....
    ...............
    ...............
    ...............
    -------^-------
  `,
  air_rise: `
    .......YYLL....
    .....YYYLLLB...
    ....YYLLLLBBK..
    ....YLLLLKKoS..
    ...YLLLLKoSYS..
    ...YLLLBKoSS.oH
    ....LLBBBKo.obb
    ......YLLLLKYL.
    ...CCYLLLLKYL..
    ..BCCYLLLKYL...
    .LBCCLLLLLB....
    LBBCKLLLLBB....
    LBCCKgggGgg....
    LBCKtmmMMm.....
    BCK.tm.mMMm....
    gK..tm..mMM....
    g....tm..mM....
    ......bo.So....
    .......b.oo....
    ...............
    ...............
    ...............
    -------^-------
  `,
  air_recover: `
    .......YYLL..
    .....YYYLLLB.
    ....YYLLLLBBK
    ....YLLLLKKoS
    ...YLLLLKoSYS
    ...YLLLBKoSS.
    ....LLBBBKo..
    ......YLLKY..
    ...CCYLLLKYL.
    ..BCCYLLLLKYL
    .LBCCLLLLLKob
    LBBCKLLLLBBH.
    LBCCKgggGgg..
    LBCKtmmMMm...
    BCK.tm.mMMm..
    gK..tm..mMM..
    g....tm..mM..
    ......bo.So..
    .......b.oo..
    .............
    .............
    .............
    -------^-----
  `,
  parry: `
    ......YYLL...
    ....YYYLLLB..
    ...YYLLLLBBK.
    ...YLLLLKKoS.
    ..YLLLLKoSYS.
    ..YLLLBKoSS..
    ..CLLBBBKo...
    .BCC.YLLLL...
    .BCCYLLLKY...
    LBCCYLLLKYL..
    LBCCLLLLLKobH
    LBCKLLLLBBKbb
    LBCKgggGgg...
    BCKKtmmMMm...
    .gg.tm..mM...
    ....tm..mM...
    ....tm...mM..
    ....tm...mM..
    ....tm...mM..
    ....bo...Soo.
    ....bb...oooo
    -------^-----
  `,
  air_parry: `
    ......YYLL...
    ....YYYLLLB..
    ...YYLLLLBBK.
    ...YLLLLKKoS.
    ..YLLLLKoSYS.
    ..YLLLBKoSS..
    ...LLBBBKo...
    .....YLLLL...
    ...CYLLLKY...
    ..BCYLLLKYL..
    .LBCLLLLLKobH
    LBBCLLLLBBKbb
    LBCCgggGgg...
    LBCKtmmMMm...
    BCK.tm.mMMm..
    gK..tm..mMM..
    g....tm..mM..
    ......bo.So..
    .......b.oo..
    .............
    .............
    .............
    -------^-----
  `,
  idle_c0: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ..CLLBBBKo..
    .BCC.YLLLL..
    .BCCYLLYLL..
    LBCCYLYLLL..
    LBCCLobLLB..
    LBCKHbLLBB..
    LBCKgggGgg..
    BCK.tmmMMm..
    gg..tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....ooS.ooS.
    ....ooo.oooo
    -------^----
  `,
  idle_c1: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ..CLLBBBKo..
    .BCC.YLLLL..
    .BCCYLLYLL..
    LBCCYLYLLL..
    LBCCLobLLB..
    LBCKHbLLBB..
    LBCKgggGgg..
    BCKKtmmMMm..
    .gg.tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....ooS.ooS.
    ....ooo.oooo
    -------^----
  `,
  idle_c2: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ..CLLBBBKo..
    .BCC.YLLLL..
    .BCCYLLYLL..
    LBCCYLYLLL..
    LBCCLobLLB..
    LBCKHbgGgg..
    LBCKtmmMMm..
    BCKKtm.mM...
    .gg.tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....ooS.ooS.
    ....ooo.oooo
    -------^----
  `,
  idle_c3: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ..CLLBBBKo..
    .BCC.YLLLL..
    .BCCYLLYLL..
    LBCCYLYLLL..
    LBCCLobLLB..
    LBCKHbgGgg..
    LBCKtmmMMm..
    BCK.tm.mM...
    gg..tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....tm.mM...
    ....ooS.ooS.
    ....ooo.oooo
    -------^----
  `,
  run_c0: `
    ..........YYLL...
    ........YYYLLLB..
    .......YYLLLLBBK.
    .......YLLLLKKoS.
    ......YLLLLKoSYS.
    ......YLLLBKoSS..
    .......LLBBBKo...
    .....BBCCYLLLL...
    ...LLBBCYLLYLL...
    .LLBBBCCYLYLLL...
    LBBBCCKKLobLLB...
    gBCCKK..HbLLBB...
    .gK....gggGgg....
    .......tmmMMm....
    .......mt..Mm....
    .......mt..Mm....
    ......mmt...Mm...
    ....mmtt....Mm...
    ...obt.......Mm..
    ...bb........Soo.
    .............oooo
    ----------^------
  `,
  run_c1: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    ..LLBBBCYLLYLL..
    LLBBBCCKYLYLLL..
    gBBCCKK.LobLLB..
    .gCK....HbLLBB..
    .......gggGgg...
    .......tmmMMm...
    .......mt..Mm...
    ....ob.mt...Mm..
    ....bmmmt..Mm...
    .....tttt.Mm....
    ..........Soo...
    ..........oooo..
    ----------^-----
  `,
  run_c2: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ...LLBBCCYLLLL..
    LLLBBBCCYLLYLL..
    gBBBCCKKYLYLLL..
    .gCCK...LobLLB..
    ........HbLLBB..
    .......gggGgg...
    .......tmmMMm...
    ........mtMm....
    .........mMm....
    ........mtMm....
    ......obmMm.....
    ......bbbMm.....
    .........Soo....
    .........oooo...
    ----------^-----
  `,
  run_c3: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    .LLLBBCCYLLYLL..
    LBBBBCCKYLYLLL..
    gBCCKK..LobLLB..
    .gK.....HbLLBB..
    .......gggGgg...
    .......tmmMMm...
    ........mMmt....
    .........Mmt....
    ........Mmmt....
    ........Mmmt....
    .......Mmobb....
    ......So..bbb...
    .....oo.........
    ................
    ----------^-----
  `,
  run_c4: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    .....BBCCYLLLL..
    ...LLBBCYLLYLL..
    .LLBBBCCYLYLLL..
    LBBBCCKKLobLLB..
    gBCCKK..HbLLBB..
    .gK....gggGgg...
    .......tmmMMm...
    .........Mm.....
    .........Mm.....
    ........MMmt....
    ......MMmmmt....
    .....Som...mt...
    .....oo....obb..
    ...........bbbb.
    ----------^-----
  `,
  run_c5: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    ..LLBBBCYLLYLL..
    LLBBBCCKYLYLLL..
    gBBCCKK.LobLLB..
    .gCK....HbLLBB..
    .......gggGgg...
    .......tmmMMm...
    .........Mm.....
    ......So.Mmt....
    ......oMMMm.....
    .......mmmm.....
    ........obb.....
    ........bbbb....
    ----------^-----
  `,
  run_c6: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ...LLBBCCYLLLL..
    LLLBBBCCYLLYLL..
    gBBBCCKKYLYLLL..
    .gCCK...LobLLB..
    ........HbLLBB..
    .......gggGgg...
    .......tmmMMm...
    ........mtMmm...
    ........mt.Mm...
    ........mtMm....
    .......mSoMm....
    .......mooo.....
    .......obb......
    .......bbbb.....
    ----------^-----
  `,
  run_c7: `
    ..........YYLL..
    ........YYYLLLB.
    .......YYLLLLBBK
    .......YLLLLKKoS
    ......YLLLLKoSYS
    ......YLLLBKoSS.
    .......LLBBBKo..
    ....LBBCCYLLLL..
    .LLLBBCCYLLYLL..
    LBBBBCCKYLYLLL..
    gBCCKK..LobLLB..
    .gK.....HbLLBB..
    .......gggGgg...
    .......tmmMMm...
    .......mt.MMmm..
    .......mt...Mm..
    ......mt....Mm..
    ......mt....Mm..
    .....mt....Soo..
    ....ob......ooo.
    ...bb...........
    ................
    ----------^-----
  `,
  jump_c0: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ...LLBBBKo..
    ...CCYLLLL..
    ..BCYLLYLL..
    .LBCYLYLLL..
    LBBCLobLLB..
    LBCCHbLLBB..
    LBCKgggGgg..
    BCK.tmmMMm..
    gK...tmMm...
    g....tmMm...
    .....tm.Mm..
    ....tm...Mm.
    ....bo...So.
    .....b....oo
    ............
    -------^----
  `,
  jump_c1: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSYS
    ..YLLLBKoSS.
    ...LLBBBKo..
    ...CCYLLLL..
    ..BCYLLYLL..
    .LBCYLYLLL..
    LBBCLobLLB..
    LBCCHbLLBB..
    LBCKgggGgg..
    BCK.tmmMMm..
    gK..tm.mMMm.
    g...tm..mMM.
    .....tm..mM.
    ......bo.So.
    .......b.oo.
    ............
    ............
    ............
    -------^----
  `,
  fall_c0: `
    ..gg.....YYLL..
    .gLLg..YYYLLLB.
    gLBBBgYYLLLLBBK
    gBBBBBYLLLLKKoS
    .CBBBYLLLLKoSYS
    ..KCCYLLLBKoSS.
    ...KKKLLBBBKo..
    .....KCCYLLLL..
    .......YLLYLL..
    .......YLYLLL..
    .......LobLLB..
    .......HbLLBB..
    .......gggGgg..
    .......tmmMMm..
    .......tm..mM..
    .......tm..mM..
    ........tm..mM.
    ........tm..mM.
    ........bo..Soo
    ...............
    ...............
    ...............
    ----------^----
  `,
  fall_c1: `
    .........YYLL..
    ..ggg..YYYLLLB.
    .gLLBgYYLLLLBBK
    gLBBBBYLLLLKKoS
    gBBBBYLLLLKoSYS
    .KCCCYLLLBKoSS.
    ..KKK.LLBBBKo..
    .....KCCYLLLL..
    .......YLLYLL..
    .......YLYLLL..
    .......LobLLB..
    .......HbLLBB..
    .......gggGgg..
    .......tmmMMm..
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......tm.mM...
    .......bo.So...
    .......b..oo...
    ----------^----
  `,
  hurt0: `
    ........YYLL.....
    ......YYYLLLB....
    .....YYLLLLBBK...
    .....YLLLLKKoS...
    ....YLLLLKoSoS...
    ....YLLLBKoSo.bb.
    .....LLBBBKoKYL..
    .....BCYLLLKYL...
    ..W.LBCYLLKYL....
    ..WLBBCLLLLLB....
    .W.LBCCLLLLBB....
    .W.LBCK.gggGgg...
    W..BCK..tmmMMm...
    M..gK...tm..mM...
    ...g....tm..mM...
    ........tm...mM..
    ........tm...mM..
    ........tm...mM..
    ........bo...Soo.
    ........bb...oooo
    -----------^-----
  `,
  hurt1: `
    ...........YYLL..
    .........YYYLLLB.
    ........YYLLLLBBK
    ........YLLLLKKoS
    .......YLLLLKoSoS
    .....CCYLLLBKoSo.
    ....BCC.LLBBBKo..
    ....BCC..YLLLL...
    ..WLBCC.YLLLKY...
    ..WLBCC.YLLLKYL..
    .W.LBCK.LLLLKYL..
    .W.LBCK.LLLLKob..
    W..BCK.gggGggbb..
    M..gg..tmmMMMm...
    .......tm..mMM...
    .......tm...mM...
    .......tm..mM....
    .......boo.Soo...
    .......bbo.oooo..
    ----------^------
  `,
  roll0: `
    .........YYLL..
    .......YYYLLLB.
    ......YYLLLLBBK
    ......YLLLLKKoS
    ..CC.YLLLLKoSYS
    .BCC.YLLLBKoSS.
    .BCC..LLBBBKo..
    LBCC..YLLLLL...
    LBCC..LLLLKYobb
    LBCK..LLLLKYL..
    LBCKtgggGgKL...
    BCKKtm..mMM....
    .gg.tm...mM....
    ....tm..mM.....
    ....boo.Soo....
    ....bbo.oooo...
    -------^-------
  `,
  roll1: `
    ...YYYY...
    ..YLLLLSo.
    .YLLLLSYS.
    .YLLLLLSo.
    YLLLLLLooo
    YLLLLLoooo
    YLLLLLMmoo
    .LLLLBMmm.
    .gLLBBmt..
    ..ggBBtt..
    ....BC....
    -----^----
  `,
  roll2: `
    ....YYY....
    ..gYLLLLL..
    .gLLLLLLLL.
    .gLLLLLLLBB
    YLLLLLLLBBB
    YLLLLLLBBBC
    .tmMMoBBSBC
    .ttmmooSYS.
    ...mooooSo.
    ....ooo....
    ...........
    -----^-----
  `,
  roll3: `
    ....YY....
    ..ttLLgg..
    ..tmLLLLg.
    .mmMLLLLB.
    oomMLLLBBB
    ooooLLBBBC
    oooLLBBBBC
    .oSLBBBBC.
    .SYSBBBBC.
    .oSBBBBC..
    ...BCCC...
    ----^-----
  `,
  roll4: `
    ....ooo....
    .oSoooom...
    .SYSoommtt.
    YLSLLoMMmt.
    YLLLLLLBBBC
    YLLLLLBBBBC
    LLLLLBBBBg.
    .LLLBBBBBg.
    ..LBBBBCg..
    ....BCC....
    -----^-----
  `,
  roll5: `
    ........YYLL...
    ......YYYLLLB..
    .....YYLLLLBBK.
    .....YLLLLKKoS.
    ....YLLLLKoSYS.
    ....YLLLBKoSS..
    .....LLBBBKo...
    .......YLLLL...
    ...CC.YLLLLL...
    ..BCC.YLLLKYobb
    .LBCC.LLLLKYL..
    LBBCK.LLLLKL...
    LBCCKgggGgg....
    LBCK.tmmMMMm...
    BCK..tm..mMM...
    gK...tm...mM...
    g....tm..mM....
    .....boo.Soo...
    .....bbo.oooo..
    --------^------
  `,
  fallen: `
    ...........YYLL..
    .........YYYLLLB.
    ........YYLLLLBBK
    ........YLLLLKKoS
    .......YLLLLKoSoS
    .....CCYLLLBKoSo.
    ....BCC.LLBBBKo..
    ....BCCYLLLLL....
    ..WLBCCYLLLKY....
    ..WLBCCLLLLKYL...
    .W.LBCtLLLLKYL...
    .W.LBCgggGgKob...
    W..BCKtm...mbb...
    M..gg.tm..mM.....
    ......boo.Soo....
    ......bbo.oooo...
    ---------^-------
  `,
  sheath: `
    ......YYLL....
    ....YYYLLLB...
    ...YYLLLLBBK..
    ...YLLHbKKoS..
    ..YLLLKobSYS..
    ..YLLLBKYLS...
    ..CLLBBBYL....
    .BCC.YLLKY....
    .BCCYLLLLL....
    LBCCYLLLLL....
    LBCCLLLLLB....
    LBCKLLLLBB....
    LBCKgggGgg....
    BCKK.tmmMMm...
    .gg..tm..mM...
    .....tm..mM...
    .....tm...mM..
    .....tm...mM..
    .....tm...mM..
    .....bo...Soo.
    .....bb...oooo
    --------^-----
  `,
  air_sheath: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLHbKKoS
    ..YLLLKobSYS
    ..YLLLBKYLS.
    ...LLBBBYL..
    .....YLLKY..
    ...CYLLLLL..
    ..BCYLLLLL..
    .LBCLLLLLB..
    LBBCLLLLBB..
    LBCCgggGgg..
    LBCK.tmmMMm.
    BCK..tm.mMMm
    gK...tm..mMM
    g.....tm..mM
    .......bo.So
    ........b.oo
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
