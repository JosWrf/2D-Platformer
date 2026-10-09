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
 * His paints: fourteen colours of the palette, lit from the upper left, in
 * ramps that shift as they darken - the blues from a cyan light through azure
 * and blue to a violet slate in the deepest folds, the gold to a brown, the
 * skin and the leather towards red.
 */
const PAINT: Record<string, string> = {
  /** The deepest fold, and the line that parts an arm from the chest. */
  K: RAMP.slate[1],
  /** Tucked into a roll: the side turned away from the light. */
  C: RAMP.blue[1],
  /** Hood and tunic in shadow. */
  B: RAMP.blue[2],
  /** Hood and tunic. */
  L: RAMP.blue[3],
  /** Hood and tunic in the light. */
  Y: RAMP.blue[4],
  /** His eye: the palest cyan, the brightest pixel of his face. */
  E: RAMP.blue[6],
  /** The cape in shadow, plain, and in the light: navy and violet slate. */
  Q: RAMP.slate[2],
  R: RAMP.blue[1],
  V: RAMP.slate[3],
  /** The scarf, his one warm colour: in the light, and in shadow. */
  X: RAMP.rose[3],
  x: RAMP.rose[2],
  /** The sword on his back: steel in the light, and its edge. */
  W: RAMP.slate[6],
  w: RAMP.slate[4],
  /** Breeches in the light, plain, in shadow (the far leg is a step darker). */
  M: RAMP.slate[3],
  m: RAMP.slate[2],
  t: RAMP.slate[1],
  /** Gold in the light, and gold. */
  G: RAMP.fire[3],
  g: RAMP.rust[3],
  /** Skin in shadow, gold in shadow, boots; skin, boots in the light. */
  o: RAMP.earth[4],
  S: RAMP.earth[5],
  /** Leather in shadow: bracers, gloves, the soles. */
  b: RAMP.earth[3],
  /** The hand that holds the sword: leather, and where the blade starts. */
  H: RAMP.earth[3],
};

/**
 * What he is made of: his paints and the white of his blade's edge and his
 * slashes - the only colours his frames, his sword, his slashes and his tells
 * come out in (the actor pass and the palette mapping leave a colour of the
 * palette exactly as it is drawn). Fifteen, and the actors' outline.
 */
export const HERO_PALETTE: readonly string[] = [...new Set([...Object.values(PAINT), RAMP.grey[7]])];

const FRAMES = {
  idle0: `
    ..........YYLL..
    ......G.YYYLLLB.
    .....b.YYLLLLBBK
    .....b.YLLLLKKoS
    ...GGgYLLLLKoSES
    ....WwYLLLBKoSS.
    ....WwXLLBXXxo..
    ...WwXQQ.YLLLL..
    ...WwxQQYLLLKY..
    ..WwVRQQYLLLKYL.
    ..WwVRQQLLLLKYL.
    .Ww.VRQKLLLLKob.
    .Ww.VRQKgggGgbb.
    Ww..RQK.tmmMMm..
    W...gg..tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........ooS.ooS.
    ........ooo.oooo
    -----------^----
  `,
  idle1: `
    ..........YYLL..
    ......G.YYYLLLB.
    .....b.YYLLLLBBK
    .....b.YLLLLKKoS
    ...GGgYLLLLKoSES
    ....WwYLLLBKoSS.
    ....WwXLLBXXxo..
    ...WwXQQ.YLLLL..
    ...WwxQQYLLLKY..
    ..WwVRQQYLLLKYL.
    ..WwVRQQLLLLKYL.
    .Ww.VRQKLLLLKob.
    .Ww.VRQKgggGgbb.
    Ww..RQKKtmmMMm..
    W....gg.tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........ooS.ooS.
    ........ooo.oooo
    -----------^----
  `,
  idle2: `
    ..........YYLL..
    ......G.YYYLLLB.
    .....b.YYLLLLBBK
    .....b.YLLLLKKoS
    ...GGgYLLLLKoSES
    ....WwYLLLBKoSS.
    ....WwXLLBXXxo..
    ...WwXQQ.YLLLL..
    ...WwxQQYLLLKY..
    ..WwVRQQYLLLKYL.
    ..WwVRQQLLLLKYL.
    .Ww.VRQKgggGKob.
    .Ww.VRQKtmmMMbb.
    Ww..RQKKtm.mM...
    W....gg.tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........ooS.ooS.
    ........ooo.oooo
    -----------^----
  `,
  idle3: `
    ..........YYLL..
    ......G.YYYLLLB.
    .....b.YYLLLLBBK
    .....b.YLLLLKKoS
    ...GGgYLLLLKoSES
    ....WwYLLLBKoSS.
    ....WwXLLBXXxo..
    ...WwXQQ.YLLLL..
    ...WwxQQYLLLKY..
    ..WwVRQQYLLLKYL.
    ..WwVRQQLLLLKYL.
    .Ww.VRQKgggGKob.
    .Ww.VRQKtmmMMbb.
    Ww..RQK.tm.mM...
    W...gg..tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........tm.mM...
    ........ooS.ooS.
    ........ooo.oooo
    -----------^----
  `,
  run0: `
    ...........YYLL...
    ......G..YYYLLLB..
    .....b..YYLLLLBBK.
    .....b..YLLLLKKoS.
    ...GGg.YLLLLKoSES.
    ....Ww.YLLLBKoSS..
    .V.xxw.XLLBXXxo...
    .VVWwXXRQQYLLLL...
    .gVVVRRRQYLLKYL...
    ..gRRQQKKYLYYLL...
    ..WggK...LobLLBb..
    .Ww......boLLBB...
    .Ww.....gggGgg....
    Ww......tmmMMm....
    W.......mt..Mm....
    ........mt..Mm....
    .......mmt...Mm...
    .....mmtt....Mm...
    ....obt.......Mm..
    ....bb........Soo.
    ..............oooo
    -----------^------
  `,
  run1: `
    ...........YYLL..
    ......G..YYYLLLB.
    .....b..YYLLLLBBK
    .....b..YLLLLKKoS
    ...xGg.YLLLLKoSES
    ....xX.YLLLBKoSS.
    ....WwXXLLBXXxo..
    ...Ww.RRQQYLLLL..
    ...WVVRRQYLLKYL..
    ..VVRRRQQYLYYLL..
    .VRRRQQKKLobLLBb.
    .gRQQKK..boLLBB..
    .WgK....gggGgg...
    Ww......tmmMMm...
    W.......mt..Mm...
    .....ob.mt...Mm..
    .....bmmmt..Mm...
    ......tttt.Mm....
    ...........Soo...
    ...........oooo..
    -----------^-----
  `,
  run2: `
    ...........YYLL..
    ......G..YYYLLLB.
    .....b..YYLLLLBBK
    .....b..YLLLLKKoS
    ...xGg.YLLLLKoSES
    ....xX.YLLLBKoSS.
    ....WwXXLLBXXxo..
    ...Ww.RRQQYLLLL..
    ...WVVRRQYLLLKY..
    ..VVRRRQQYLLLKYL.
    .VRRRQQKKLLLLKYL.
    .gRQQKK..LLLLKob.
    .WgK....gggGggbb.
    Ww......tmmMMm...
    W........mtMm....
    ..........mMm....
    .........mtMm....
    .......obmMm.....
    .......bbbMm.....
    ..........Soo....
    ..........oooo...
    -----------^-----
  `,
  run3: `
    ...........YYLL..
    ......G..YYYLLLB.
    .....b..YYLLLLBBK
    .....b..YLLLLKKoS
    ...GGg.YLLLLKoSES
    ...xxw.YLLLBKoSS.
    ....WXXXLLBXXxo..
    ...WVVRRQQYLLLL..
    ..VVRRRRQYLLLKY..
    .VRRRRQQKYLLLKYL.
    .gRQQKK..LLLLLobb
    .Wgg.....LLLLBB..
    .Ww.....gggGgg...
    Ww......tmmMMm...
    W........mMmt....
    ..........Mmt....
    .........Mmmt....
    .........Mmmt....
    ........Mmobb....
    .......So..bbb...
    ......oo.........
    .................
    -----------^-----
  `,
  run4: `
    ...........YYLL..
    ......G..YYYLLLB.
    .....b..YYLLLLBBK
    .....b..YLLLLKKoS
    ...GGg.YLLLLKoSES
    ...xxw.YLLLBKoSS.
    ....WXXXLLBXXxo..
    ...WVVRRQQYLLLL..
    ..VVRRRRQYLLLKY..
    .VRRRRQQKYLLLKYL.
    .gRQQKK..LLLLLobb
    .Wgg.....LLLLBB..
    .Ww.....gggGgg...
    Ww......tmmMMm...
    W.........Mm.....
    ..........Mm.....
    .........MMmt....
    .......MMmmmt....
    ......Som...mt...
    ......oo....obb..
    ............bbbb.
    -----------^-----
  `,
  run5: `
    ...........YYLL..
    ......G..YYYLLLB.
    .....b..YYLLLLBBK
    .....b..YLLLLKKoS
    ...GGg.YLLLLKoSES
    ....Ww.YLLLBKoSS.
    ....xXXXLLBXXxo..
    .VVxVRRRQQYLLLL..
    .gRRRRQQQYLLLKY..
    ..ggQQKKKYLLLKYL.
    ..Ww.....LLLLLobb
    .Ww......LLLLBB..
    .Ww.....gggGgg...
    Ww......tmmMMm...
    W.........Mm.....
    .......So.Mmt....
    .......oMMMm.....
    ........mmmm.....
    .........obb.....
    .........bbbb....
    -----------^-----
  `,
  run6: `
    ...........YYLL..
    ......G..YYYLLLB.
    .....b..YYLLLLBBK
    .....b..YLLLLKKoS
    ...GGg.YLLLLKoSES
    ....Ww.YLLLBKoSS.
    ....xXXXLLBXXxo..
    .VVxVRRRQQYLLLL..
    .gRRRRQQQYLLLKY..
    ..ggQQKKKYLLLKYL.
    ..Ww.....LLLLKYL.
    .Ww......LLLLKob.
    .Ww.....gggGggbb.
    Ww......tmmMMm...
    W........mtMmm...
    .........mt.Mm...
    .........mtMm....
    ........mSoMm....
    ........mooo.....
    ........obb......
    ........bbbb.....
    -----------^-----
  `,
  run7: `
    ...........YYLL..
    ......G..YYYLLLB.
    .....b..YYLLLLBBK
    .....b..YLLLLKKoS
    ...GGg.YLLLLKoSES
    ....Ww.YLLLBKoSS.
    .V.xxw.XLLBXXxo..
    .VVWwXXRQQYLLLL..
    .gVVVRRRQYLLKYL..
    ..gRRQQKKYLYYLL..
    ..WggK...LobLLBb.
    .Ww......boLLBB..
    .Ww.....gggGgg...
    Ww......tmmMMm...
    W.......mt.MMmm..
    ........mt...Mm..
    .......mt....Mm..
    .......mt....Mm..
    ......mt....Soo..
    .....ob......ooo.
    ....bb...........
    .................
    -----------^-----
  `,
  jump0: `
    ..........YYLL..
    ......G.YYYLLLB.
    .....b.YYLLLLBBK
    .....b.YLLLLKKoS
    ...GGgYLLLLKoSES
    ....WwYLLLBKoSS.
    ....WwXLLBXXxo..
    ...WxX.QQYLLLL..
    ...xw.RQYLLLKY..
    ..Ww.VRQYLLYYL..
    ..WwVRRQLLobLB..
    .Ww.VRQQLboLBB..
    .Ww.VRQKgggGgg..
    Ww..RQK.tmmMMm..
    W...gK...tmMm...
    ....g....tmMm...
    .........tm.Mm..
    ........tm...Mm.
    ........bo...So.
    .........b....oo
    ................
    -----------^----
  `,
  jump1: `
    ..........YYLL...
    ......G.YYYLLLB..
    .....b.YYLLLLBBK.
    .....b.YLLLLKKoS.
    ...GGgYLLLLKoSES.
    ....WwYLLLBKoSS..
    ....WwXLLBXXxo...
    ...WxX.QQYLLLL...
    ...xw.RQYLLLKYobb
    ..Ww.VRQYLLLKYL..
    ..WwVRRQLLLLKL...
    .Ww.VRQQLLLLBB...
    .Ww.VRQKgggGgg...
    Ww..RQK.tmmMMm...
    W...gK..tm.mMMm..
    ....g...tm..mMM..
    .........tm..mM..
    ..........bo.So..
    ...........b.oo..
    .................
    .................
    .................
    -----------^-----
  `,
  fall0: `
    ...gg.....YYLL...
    ..gVVgG.YYYLLLB..
    .gVRRRgYYLLLLBBK.
    .gRRRRRYLLLLKKoS.
    ..QxRRYLLLLKoSES.
    ...KxXYLLLBKoSS..
    ....KKXLLBXXxo...
    ...Ww.KQQYLLLL...
    ...Ww...YLLLKYobb
    ..Ww....YLLLKYL..
    ..Ww....LLLLKL...
    .Ww.....LLLLBB...
    .Ww.....gggGgg...
    Ww......tmmMMm...
    W.......tm..mM...
    ........tm..mM...
    .........tm..mM..
    .........tm..mM..
    .........bo..Soo.
    .................
    .................
    .................
    -----------^-----
  `,
  fall1: `
    ..........YYLL...
    ...gggG.YYYLLLB..
    ..gVVRgYYLLLLBBK.
    .gVRRRRYLLLLKKoS.
    .gRxRRYLLLLKoSES.
    ..KQxXYLLLBKoSSbb
    ...KKKXLLBXXxoKYL
    ...Ww.KQQYLLLKYL.
    ...Ww...YLLLLKY..
    ..Ww....YLLLLL...
    ..Ww....LLLLLB...
    .Ww.....LLLLBB...
    .Ww.....gggGgg...
    Ww......tmmMMm...
    W.......tm.mM....
    ........tm.mM....
    ........tm.mM....
    ........tm.mM....
    ........tm.mM....
    ........bo.So....
    ........b..oo....
    -----------^-----
  `,
  land: `
    ...........YYLL...
    ......G..YYYLLLB..
    .....b..YYLLLLBBK.
    .....b..YLLLLKKoS.
    ...GGg.YLLLLKoSES.
    ....Ww.YLLLBKoSS..
    ....WwQXLLBXXxo...
    ...WwRXQ..YLLLL...
    ...WwRxQ.YLLLLL...
    ..WwVRQQ.YLLLKYobb
    ..WwVRQQ.LLLLKYL..
    .Ww.VRQK.LLLLKL...
    .Ww.VRQKgggGgg....
    Ww..RQKKtmmMMMm...
    W....gg.tm..mMM...
    ........tm...mM...
    ........tm..mM....
    ........boo.Soo...
    ........bbo.oooo..
    -----------^------
  `,
  atk_high: `
    ......YYLL....
    ....YYYLLLB...
    ...YYLLLLBBK..
    ...YLLHbKKoS..
    ..YLLLKobSES..
    ..YLLLBKYLS...
    ..XLLBXXYL....
    .XQQ.YLLKY....
    .xQQYLLLLL....
    VRQQYLLLLL....
    VRQQLLLLLB....
    VRQKLLLLBB....
    VRQKgggGgg....
    RQKK.tmmMMm...
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
    ...YLLLLKoSES.
    ...YLLLBKoSS..
    ..QXLLBXXxo...
    .RXQ..YLLLL...
    .RxQ.YLLLKY...
    VRQQ.YLLLKYL..
    VRQQ.LLLLLKob.
    VRQK.LLLLBBKob
    VRQKtgggGgg.KH
    RQKKtm..mM....
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
    ..YLLLLKoSES..
    ..YLLLBKoSS...
    ..XLLHobbo....
    .XQQ.YKYLL....
    .xQQYLLKYL....
    VRQQYLLLLL....
    VRQQLLLLLB....
    VRQKLLLLBB....
    VRQKgggGgg....
    RQKK.tmmMMm...
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
    ...YLLLLKoSES..
    ...YLLLBKoSS...
    ..QXLLBXXxo....
    .RXQ..YLLLL....
    .RxQ.YLLKYYLoob
    VRQQ.YLLKLLLbbH
    VRQQ.LLLLLB....
    VRQK.LLLLBB....
    VRQK.gggGgg....
    RQKKtmmMMm.....
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
    ....YLLLLKoSES.
    ....YLLLBKoSS..
    ..QQXLLBXXxo...
    .RQX...YLLKY...
    .RQx..YLLLLKYL.
    VRQQ..YLLLLLKob
    VRQQ..LLLLLB.ob
    VRQK..LLLLBB..H
    VRQKtgggGgg....
    RQKKtm..mM.....
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
    ...YLLLLKoSES..
    ...YLLLBKoSS.oH
    ..QXLLBXXxo.obb
    .RXQ..YLLLLKYL.
    .RxQ.YLLLLKYL..
    VRQQ.YLLLKYL...
    VRQQ.LLLLLB....
    VRQK.LLLLBB....
    VRQK.gggGgg....
    RQKKtmmMMm.....
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
    ...YLLLLKoSES.
    ...YLLLBKoSS..
    ..QXLLBXXxo...
    .RXQ..YLLKY...
    .RxQ.YLLLKYL..
    VRQQ.YLLLLKYL.
    VRQQ.LLLLLKob.
    VRQK.LLLLBBH..
    VRQK.gggGgg...
    RQKKtmmMMm....
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
    .......YYLL..
    .....YYYLLLB.
    ....YYLLLLBBK
    ....YLLHbKKoS
    ...YLLLKobSES
    ...YLLLBKYLS.
    ...XLLBXXYL..
    .xX...YLLKY..
    x...QYLLLLL..
    ...RQYLLLLL..
    ..VRQLLLLLB..
    .VRRQLLLLBB..
    .VRQQgggGgg..
    .VRQK.tmmMMm.
    .RQK..tm.mMMm
    .gK...tm..mMM
    .g.....tm..mM
    ........bo.So
    .........b.oo
    .............
    .............
    .............
    ---------^---
  `,
  air_low: `
    .......YYLL...
    .....YYYLLLB..
    ....YYLLLLBBK.
    ....YLLLLKKoS.
    ...YLLLLKoSES.
    ...YLLLBKoSS..
    ...XLLBXXxo...
    .xX...YLLLL...
    x..QQYLLLKY...
    ..RQQYLLLKYL..
    .VRQQLLLLLKob.
    VRRQKgggGggKob
    VRQQtmmMMm..KH
    VRQKtm.mMMm...
    RQK.tm..mMM...
    gK...tm..mM...
    g.....bo.So...
    .......b.oo...
    ..............
    ..............
    ..............
    -------^------
  `,
  air_back: `
    .......YYLL..
    .....YYYLLLB.
    ....YYLLLLBBK
    ....YLLLLKKoS
    ...YLLLLKoSES
    ...YLLLBKoSS.
    ...XLLHobbo..
    .xX...YKYLL..
    x...QYLLKYL..
    ...RQYLLLLL..
    ..VRQLLLLLB..
    .VRRQLLLLBB..
    .VRQQgggGgg..
    .VRQK.tmmMMm.
    .RQK..tm.mMMm
    .gK...tm..mMM
    .g.....tm..mM
    ........bo.So
    .........b.oo
    .............
    .............
    .............
    ---------^---
  `,
  air_strike: `
    .......YYLL....
    .....YYYLLLB...
    ....YYLLLLBBK..
    ....YLLLLKKoS..
    ...YLLLLKoSES..
    ...YLLLBKoSS...
    ...XLLBXXxo....
    .xX...YLLLL....
    x..QQYLLKYYLoob
    ..RQQYLLKLLLbbH
    .VRQQLLLLLB....
    VRRQKLLLLBB....
    VRQQKgggGgg....
    VRQKtmmMMm.....
    RQK.tm.mMMm....
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
    ....YLLLLKoSES.
    ....YLLLBKoSS..
    ....XLLBXXxo...
    ..xX...YLLKY...
    .x.QQ.YLLLLKYL.
    ..RQQ.YLLLLLKob
    .VRQQ.LLLLLB.ob
    VRRQKgggGggB..H
    VRQQtmmMMm.....
    VRQKtm.mMMm....
    RQK.tm..mMM....
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
    ...YLLLLKoSES..
    ...YLLLBKoSS.oH
    ...XLLBXXxo.obb
    .xX...YLLLLKYL.
    x..QQYLLLLKYL..
    ..RQQYLLLKYL...
    .VRQQLLLLLB....
    VRRQKLLLLBB....
    VRQQKgggGgg....
    VRQKtmmMMm.....
    RQK.tm.mMMm....
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
    ...YLLLLKoSES
    ...YLLLBKoSS.
    ...XLLBXXxo..
    .xX...YLLKY..
    x..QQYLLLKYL.
    ..RQQYLLLLKYL
    .VRQQLLLLLKob
    VRRQKLLLLBBH.
    VRQQKgggGgg..
    VRQKtmmMMm...
    RQK.tm.mMMm..
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
    ..YLLLLKoSES.
    ..YLLLBKoSS..
    ..XLLBXXxo...
    .XQQ.YLLLL...
    .xQQYLLLKY...
    VRQQYLLLKYL..
    VRQQLLLLLKobH
    VRQKLLLLBBKbb
    VRQKgggGgg...
    RQKKtmmMMm...
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
    .......YYLL...
    .....YYYLLLB..
    ....YYLLLLBBK.
    ....YLLLLKKoS.
    ...YLLLLKoSES.
    ...YLLLBKoSS..
    ...XLLBXXxo...
    .xX...YLLLL...
    x...QYLLLKY...
    ...RQYLLLKYL..
    ..VRQLLLLLKobH
    .VRRQLLLLBBKbb
    .VRQQgggGgg...
    .VRQKtmmMMm...
    .RQK.tm.mMMm..
    .gK..tm..mMM..
    .g....tm..mM..
    .......bo.So..
    ........b.oo..
    ..............
    ..............
    ..............
    --------^-----
  `,
  idle_c0: `
    ......YYLL..
    ....YYYLLLB.
    ...YYLLLLBBK
    ...YLLLLKKoS
    ..YLLLLKoSES
    ..YLLLBKoSS.
    ..XLLBXXxo..
    .XQQ.YLLLL..
    .xQQYLLYLL..
    VRQQYLYLLL..
    VRQQLobLLB..
    VRQKHbLLBB..
    VRQKgggGgg..
    RQK.tmmMMm..
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
    ..YLLLLKoSES
    ..YLLLBKoSS.
    ..XLLBXXxo..
    .XQQ.YLLLL..
    .xQQYLLYLL..
    VRQQYLYLLL..
    VRQQLobLLB..
    VRQKHbLLBB..
    VRQKgggGgg..
    RQKKtmmMMm..
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
    ..YLLLLKoSES
    ..YLLLBKoSS.
    ..XLLBXXxo..
    .XQQ.YLLLL..
    .xQQYLLYLL..
    VRQQYLYLLL..
    VRQQLobLLB..
    VRQKHbgGgg..
    VRQKtmmMMm..
    RQKKtm.mM...
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
    ..YLLLLKoSES
    ..YLLLBKoSS.
    ..XLLBXXxo..
    .XQQ.YLLLL..
    .xQQYLLYLL..
    VRQQYLYLLL..
    VRQQLobLLB..
    VRQKHbgGgg..
    VRQKtmmMMm..
    RQK.tm.mM...
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
    ......YLLLLKoSES.
    ......YLLLBKoSS..
    V.xx..XLLBXXxo...
    VV..XXRQQYLLLL...
    gVVVRRRQYLLYLL...
    .gRRQQKKYLYLLL...
    ..ggK...LobLLB...
    ........HbLLBB...
    .......gggGgg....
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
    ..x...YLLLLKoSES
    ...xX.YLLLBKoSS.
    .....XXLLBXXxo..
    .....RRQQYLLLL..
    ...VVRRQYLLYLL..
    .VVRRRQQYLYLLL..
    VRRRQQKKLobLLB..
    gRQQKK..HbLLBB..
    .gK....gggGgg...
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
    ..x...YLLLLKoSES
    ...xX.YLLLBKoSS.
    .....XXLLBXXxo..
    .....RRQQYLLLL..
    ...VVRRQYLLYLL..
    .VVRRRQQYLYLLL..
    VRRRQQKKLobLLB..
    gRQQKK..HbLLBB..
    .gK....gggGgg...
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
    ......YLLLLKoSES
    ..xx..YLLLBKoSS.
    ....XXXLLBXXxo..
    ...VVRRQQYLLLL..
    .VVRRRRQYLLYLL..
    VRRRRQQKYLYLLL..
    gRQQKK..LobLLB..
    .gg.....HbLLBB..
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
    ......YLLLLKoSES
    ..xx..YLLLBKoSS.
    ....XXXLLBXXxo..
    ...VVRRQQYLLLL..
    .VVRRRRQYLLYLL..
    VRRRRQQKYLYLLL..
    gRQQKK..LobLLB..
    .gg.....HbLLBB..
    .......gggGgg...
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
    ......YLLLLKoSES
    ......YLLLBKoSS.
    ...xXXXLLBXXxo..
    VVxVRRRQQYLLLL..
    gRRRRQQQYLLYLL..
    .ggQQKKKYLYLLL..
    ........LobLLB..
    ........HbLLBB..
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
    ......YLLLLKoSES
    ......YLLLBKoSS.
    ...xXXXLLBXXxo..
    VVxVRRRQQYLLLL..
    gRRRRQQQYLLYLL..
    .ggQQKKKYLYLLL..
    ........LobLLB..
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
    ......YLLLLKoSES
    ......YLLLBKoSS.
    V.xx..XLLBXXxo..
    VV..XXRQQYLLLL..
    gVVVRRRQYLLYLL..
    .gRRQQKKYLYLLL..
    ..ggK...LobLLB..
    ........HbLLBB..
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
    .......YYLL..
    .....YYYLLLB.
    ....YYLLLLBBK
    ....YLLLLKKoS
    ...YLLLLKoSES
    ...YLLLBKoSS.
    ...XLLBXXxo..
    .xX.QQYLLLL..
    x..RQYLLYLL..
    ..VRQYLYLLL..
    .VRRQLobLLB..
    .VRQQHbLLBB..
    .VRQKgggGgg..
    .RQK.tmmMMm..
    .gK...tmMm...
    .g....tmMm...
    ......tm.Mm..
    .....tm...Mm.
    .....bo...So.
    ......b....oo
    .............
    --------^----
  `,
  jump_c1: `
    .......YYLL..
    .....YYYLLLB.
    ....YYLLLLBBK
    ....YLLLLKKoS
    ...YLLLLKoSES
    ...YLLLBKoSS.
    ...XLLBXXxo..
    .xX.QQYLLLL..
    x..RQYLLYLL..
    ..VRQYLYLLL..
    .VRRQLobLLB..
    .VRQQHbLLBB..
    .VRQKgggGgg..
    .RQK.tmmMMm..
    .gK..tm.mMMm.
    .g...tm..mMM.
    ......tm..mM.
    .......bo.So.
    ........b.oo.
    .............
    .............
    .............
    --------^----
  `,
  fall_c0: `
    ..gg.....YYLL..
    .gVVg..YYYLLLB.
    gVRRRgYYLLLLBBK
    gRRRRRYLLLLKKoS
    .QxRRYLLLLKoSES
    ..KxXYLLLBKoSS.
    ...KKXLLBXXxo..
    .....KQQYLLLL..
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
    .gVVRgYYLLLLBBK
    gVRRRRYLLLLKKoS
    gRxRRYLLLLKoSES
    .KQxXYLLLBKoSS.
    ..KKKXLLBXXxo..
    .....KQQYLLLL..
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
    ......G..YYLL.....
    .....b.YYYLLLB....
    .....bYYLLLLBBK...
    ...GGgYLLLLKKoS...
    ..x.WYLLLLKoSoS...
    ...xXYLLLBKoSo.bb.
    ...WwXLLBXXxoKYL..
    ...Ww.RQYLLLKYL...
    ..Ww.VRQYLLKYL....
    ..WwVRRQLLLLLB....
    .Ww.VRQQLLLLBB....
    .Ww.VRQK.gggGgg...
    Ww..RQK..tmmMMm...
    W...gK...tm..mM...
    ....g....tm..mM...
    .........tm...mM..
    .........tm...mM..
    .........tm...mM..
    .........bo...Soo.
    .........bb...oooo
    ------------^-----
  `,
  hurt1: `
    ......G.....YYLL..
    .....b....YYYLLLB.
    .....b...YYLLLLBBK
    ...GGg...YLLLLKKoS
    ....Ww..YLLLLKoSoS
    ....WwQQYLLLBKoSo.
    ...WwRQQXLLBXXxo..
    ...WwRQX..YLLLL...
    ..WwVRQx.YLLLKY...
    ..WwVRQQ.YLLLKYL..
    .Ww.VRQK.LLLLKYL..
    .Ww.VRQK.LLLLKob..
    Ww..RQK.gggGggbb..
    W...gg..tmmMMMm...
    ........tm..mMM...
    ........tm...mM...
    ........tm..mM....
    ........boo.Soo...
    ........bbo.oooo..
    -----------^------
  `,
  roll0: `
    .........YYLL..
    .......YYYLLLB.
    ......YYLLLLBBK
    ......YLLLLKKoS
    ..QQ.YLLLLKoSES
    .RQQ.YLLLBKoSS.
    .RQQ.XLLBXXxo..
    VRQxX.YLLLLL...
    VRxQ..LLLLKYobb
    VRQK..LLLLKYL..
    VRQKtgggGgKL...
    RQKKtm..mMM....
    .gg.tm...mM....
    ....tm..mM.....
    ....boo.Soo....
    ....bbo.oooo...
    -------^-------
  `,
  roll1: `
    ...YYYY...
    ..YLLLLSo.
    .YLLLLSES.
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
    .ttmmooSES.
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
    .SESBBBBC.
    .oSBBBBC..
    ...BCCC...
    ----^-----
  `,
  roll4: `
    ....ooo....
    .oSoooom...
    .SESoommtt.
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
    ....YLLLLKoSES.
    ....YLLLBKoSS..
    ....XLLBXXxo...
    ..xX...YLLLL...
    .x.QQ.YLLLLL...
    ..RQQ.YLLLKYobb
    .VRQQ.LLLLKYL..
    VRRQK.LLLLKL...
    VRQQKgggGgg....
    VRQK.tmmMMMm...
    RQK..tm..mMM...
    gK...tm...mM...
    g....tm..mM....
    .....boo.Soo...
    .....bbo.oooo..
    --------^------
  `,
  fallen: `
    ......G.....YYLL..
    .....b....YYYLLLB.
    .....b...YYLLLLBBK
    ...GGg...YLLLLKKoS
    ....Ww..YLLLLKoSoS
    ....WwQQYLLLBKoSo.
    ...WwRQQXLLBXXxo..
    ...WwRQXYLLLLL....
    ..WwVRQxYLLLKY....
    ..WwVRQQLLLLKYL...
    .Ww.VRQtLLLLKYL...
    .Ww.VRQgggGgKob...
    Ww..RQKtm...mbb...
    W...gg.tm..mM.....
    .......boo.Soo....
    .......bbo.oooo...
    ----------^-------
  `,
  sheath: `
    ......YYLL....
    ....YYYLLLB...
    ...YYLLLLBBK..
    ...YLLHbKKoS..
    ..YLLLKobSES..
    ..YLLLBKYLS...
    ..XLLBXXYL....
    .XQQ.YLLKY....
    .xQQYLLLLL....
    VRQQYLLLLL....
    VRQQLLLLLB....
    VRQKLLLLBB....
    VRQKgggGgg....
    RQKK.tmmMMm...
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
    .......YYLL..
    .....YYYLLLB.
    ....YYLLLLBBK
    ....YLLHbKKoS
    ...YLLLKobSES
    ...YLLLBKYLS.
    ...XLLBXXYL..
    .xX...YLLKY..
    x...QYLLLLL..
    ...RQYLLLLL..
    ..VRQLLLLLB..
    .VRRQLLLLBB..
    .VRQQgggGgg..
    .VRQK.tmmMMm.
    .RQK..tm.mMMm
    .gK...tm..mMM
    .g.....tm..mM
    ........bo.So
    .........b.oo
    .............
    .............
    .............
    ---------^---
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
  /** His eye (the pale 'E'), the same way; null where it is shut. */
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
      const e = row.indexOf('E');
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
