import { clamp } from '../core/math';
import { ART_W } from '../render/pixel';
import {
  BADGE,
  HEART_W,
  KEY_H,
  PIP,
  bossMedallion,
  gemIcon,
  heartIcon,
  keyCap,
  pipIcon,
  relicBadge,
  skillBadge,
  studIcon,
} from './icons';
import { UI, blit, box, drawFrame, paletteColor, text, textWidth } from './kit';

/**
 * The HUD in play: hearts, gems and score, the road so far, the relics and
 * the picked boss attack, the zone's name when it changes, and a boss's bar.
 *
 * Everything is placed in art pixels on the 480×270 grid and drawn from
 * cached pieces - icons, frames, lines of text - so a frame of HUD is a few
 * dozen drawImage calls, and every one of them lands on whole pixels in
 * colours of the palette.
 */

/** Text over the world: an ink line round it, so it reads on any ground. */
const OVER = { outline: UI.ink } as const;

/** The left edge everything in the corner hangs from. */
const LEFT = 6;

/* ------------------------------------------------------------- status */

/**
 * A plate of the darkest ink behind a cluster of the HUD, its corners cut by
 * a pixel: whatever the world shows behind the corner - a lit wall, a bright
 * sky - the hearts and the counters stand on the same dark ground.
 */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  box(ctx, x + 1, y, w - 2, h, UI.ink);
  box(ctx, x, y + 1, 1, h - 2, UI.ink);
  box(ctx, x + w - 1, y + 1, 1, h - 2, UI.ink);
}

/** The plate behind the hearts and the counters under them. */
export function drawStatusPlate(ctx: CanvasRenderingContext2D, maxHp: number, score: number, gems: number, totalGems: number, deaths: number): void {
  const small = { font: 'small' } as const;
  const w = Math.max(
    maxHp * (HEART_W + 1) - 1,
    9 + textWidth(`${gems}/${totalGems}`),
    textWidth('PUNKTE ', small) + textWidth(`${score}`, small) + textWidth('  TODE ', small) + textWidth(`${deaths}`, small),
  );
  plate(ctx, LEFT - 3, 2, w + 6, 31);
}

/** The hearts, one per point of health: full in red, empty in old wine. */
export function drawHearts(ctx: CanvasRenderingContext2D, hp: number, maxHp: number): void {
  for (let i = 0; i < maxHp; i++) blit(ctx, heartIcon(i < hp), LEFT + i * (HEART_W + 1), 5);
}

/**
 * Under the hearts: the gems found of all there are, beside a gem; and in the
 * small hand under that, the score and the deaths.
 */
export function drawCounters(ctx: CanvasRenderingContext2D, score: number, gems: number, totalGems: number, deaths: number): void {
  blit(ctx, gemIcon(), LEFT, 15);
  text(ctx, `${gems}/${totalGems}`, LEFT + 9, 15, { color: UI.cream, ...OVER });
  let x = LEFT;
  x += text(ctx, 'PUNKTE ', x, 26, { font: 'small', color: UI.mist, ...OVER });
  x += text(ctx, `${score}`, x, 26, { font: 'small', color: UI.gold, ...OVER });
  x += text(ctx, '  TODE ', x, 26, { font: 'small', color: UI.mist, ...OVER });
  text(ctx, `${deaths}`, x, 26, { font: 'small', color: UI.cream, ...OVER });
}

/** Where the relic badges start, and how far apart they sit. */
export const RELIC_ROW = { x: LEFT, y: 35, step: BADGE + 1, perRow: 6 } as const;

export function drawRelicBadge(
  ctx: CanvasRenderingContext2D,
  id: string,
  ax: number,
  ay: number,
  color: string,
  lit: boolean,
  fill: number | null,
): void {
  blit(ctx, relicBadge(id, color, lit, fill), ax, ay);
}

export function drawSkillBadge(
  ctx: CanvasRenderingContext2D,
  id: string,
  ax: number,
  ay: number,
  color: string,
  ready: boolean,
  fill: number | null,
): void {
  blit(ctx, skillBadge(id, color, ready, fill), ax, ay);
}

/* ------------------------------------------------------------- the road */

const TRACK_W = 130;

/**
 * How far along the whole road he is, top right: a recessed track that fills
 * in steel, a gold pin where he stands, and the name of the zone under it.
 */
export function drawProgress(ctx: CanvasRenderingContext2D, progress: number, zone: string): void {
  const x = ART_W - LEFT - TRACK_W;
  const y = 6;
  const f = Math.round((TRACK_W - 2) * clamp(progress, 0, 1));
  const pw = Math.max(TRACK_W, textWidth(zone, { font: 'small' })) + 6;
  plate(ctx, ART_W - LEFT + 3 - pw, y - 4, pw, 23);
  box(ctx, x, y, TRACK_W, 6, UI.ink);
  box(ctx, x + 1, y + 1, TRACK_W - 2, 4, UI.night);
  box(ctx, x + 1, y + 4, TRACK_W - 2, 1, UI.dusk);
  if (f > 0) {
    box(ctx, x + 1, y + 1, f, 1, UI.frost);
    box(ctx, x + 1, y + 2, f, 2, UI.mist);
    box(ctx, x + 1, y + 4, f, 1, UI.slate);
  }
  blit(ctx, studIcon(), x + 1 + f - 3, y - 1);
  // (The small font sets every letter as a capital by itself.)
  text(ctx, zone, ART_W - LEFT, y + 9, { font: 'small', color: UI.mist, align: 'right', ...OVER });
}

/* ------------------------------------------------------------- banner */

/** A banner's letters as it comes and goes: four steps up the slate ramp to white. */
const FADE = [UI.steel, UI.slate, UI.mist, UI.white] as const;
/** And the lower half of the letters, a step under. */
const FADE_LOWER = [UI.dusk, UI.steel, UI.slate, UI.frost] as const;

/**
 * The banner across the top: big letters, a rule with a stud under them, and
 * an optional second line in gold. `level` 0..1 is how far in it is; it comes
 * up through four colours rather than through transparency, the way a
 * palette fade does, and never as a dither crawling over the letters.
 */
export function drawBanner(ctx: CanvasRenderingContext2D, title: string, sub: string | undefined, level: number, at = BANNER_Y): void {
  if (level <= 0.12) return;
  const step = Math.min(FADE.length - 1, Math.floor(level * FADE.length));
  const big = { scale: 2, color: FADE[step], lower: FADE_LOWER[step], ...OVER, shadow: UI.night };
  const lines = bannerLines(title);
  let y = at - (lines.length - 1) * 11;
  let widest = 0;
  for (const line of lines) {
    widest = Math.max(widest, text(ctx, line, ART_W / 2, y, { ...big, align: 'center' }));
    y += 22;
  }
  // The rule: as wide as the words, with a stud in the middle.
  const ruleW = Math.min(ART_W - 40, Math.max(60, widest + 12));
  const ruleY = y - 4;
  const rule = step >= 2 ? UI.slate : UI.steel;
  box(ctx, ART_W / 2 - ruleW / 2, ruleY, ruleW, 1, rule);
  box(ctx, ART_W / 2 - ruleW / 2 + 1, ruleY + 1, ruleW - 2, 1, UI.ink);
  if (step >= 1) blit(ctx, studIcon(), ART_W / 2 - 3, ruleY - 3);
  if (sub && step >= 1) {
    text(ctx, sub, ART_W / 2, ruleY + 7, { font: 'small', color: step >= 3 ? UI.gold : UI.goldDark, align: 'center', ...OVER });
  }
}

/** The art row a banner's title stands on: near the top, and further down when a boss up there would be behind it. */
export const BANNER_Y = 46;
export const BANNER_LOW_Y = 128;
/** The stretch of the screen a banner covers, in art pixels: x, y, w, h. */
export const BANNER_BAND = [90, 20, 300, 50] as const;

const bannerSplits = new Map<string, readonly string[]>();

/**
 * A banner's title as it is set: one line, or - too wide for the screen at
 * twice the size, as the longest hints are at fifty letters - two, broken at
 * the space nearest its middle. Worked out once a title.
 */
function bannerLines(title: string): readonly string[] {
  const hit = bannerSplits.get(title);
  if (hit) return hit;
  const style = { scale: 2 };
  let best: string[] = [title];
  if (textWidth(title, style) > ART_W - 24) {
    const words = title.split(' ');
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const w = Math.max(textWidth(a, style), textWidth(b, style));
      if (w < bestW) {
        bestW = w;
        best = [a, b];
      }
    }
  }
  bannerSplits.set(title, best);
  if (bannerSplits.size > 64) bannerSplits.delete(bannerSplits.keys().next().value as string);
  return best;
}

/* ------------------------------------------------------------- skill */

export interface SkillPanelInfo {
  id: string;
  name: string;
  color: string;
  /** Seconds until it can be used again; 0 when it is ready. */
  left: number;
  cooldown: number;
  /** Ready again a moment ago: the badge and the word lit white. */
  flash: boolean;
  /** The caps of the keys in use: the one that uses it, the one that changes it. */
  keys: readonly [string, string];
  /** Every attack learned, in order, and how far each has come back. */
  owned: { id: string; color: string; left: number; cooldown: number }[];
}

/** A chip per attack in the panel: three pixels wide, five high, nine to a row. */
const CHIP_W = 3;
const CHIP_H = 5;
const CHIP_PITCH = 4;
const CHIPS_PER_ROW = 9;

/**
 * The boss attack he has picked, in the bottom left corner where nothing else
 * is: its name, its badge filling as it cools down, the key that uses it with
 * whether it is ready, and the key that changes it with a chip for every
 * attack he has - lit in its colour when it is ready, dark and filling from
 * the bottom while it comes back, the picked one standing a pixel taller. The
 * caps are the ones of the keys he plays with.
 */
export function drawSkillPanel(ctx: CanvasRenderingContext2D, info: SkillPanelInfo): void {
  const ready = info.left <= 0;
  const x = LEFT;
  const y = 226;
  // Narrow enough to stay clear of the boss bar, which starts at x 84.
  drawFrame(ctx, 'plate', x, y, 74, 36);
  text(ctx, info.name, x + 4, y + 3, { font: 'small', color: info.flash ? UI.white : ready ? paletteColor(info.color) : UI.slate });
  drawSkillBadge(ctx, info.id, x + 4, y + 12, info.color, ready, ready ? null : 1 - info.left / info.cooldown);
  if (info.flash) {
    // Ready again: a frame of white round the badge, for a moment.
    box(ctx, x + 3, y + 11, BADGE + 2, 1, UI.white);
    box(ctx, x + 3, y + 12 + BADGE, BADGE + 2, 1, UI.white);
    box(ctx, x + 3, y + 11, 1, BADGE + 2, UI.white);
    box(ctx, x + 4 + BADGE, y + 11, 1, BADGE + 2, UI.white);
  }
  blit(ctx, keyCap(info.keys[0]), x + 22, y + 11);
  const status = ready ? 'BEREIT' : `${info.left.toFixed(1).replace('.', ',')} S`;
  text(ctx, status, x + 33, y + 13, { font: 'small', color: info.flash ? UI.white : ready ? UI.green : UI.mist });
  if (info.owned.length > 1) {
    blit(ctx, keyCap(info.keys[1]), x + 22, y + 12 + KEY_H);
    const rows = Math.ceil(info.owned.length / CHIPS_PER_ROW);
    const top = rows > 1 ? y + 22 : y + 25;
    info.owned.forEach((k, i) => {
      const cx = x + 33 + (i % CHIPS_PER_ROW) * CHIP_PITCH;
      const cy = top + Math.floor(i / CHIPS_PER_ROW) * (CHIP_H + 2);
      const picked = k.id === info.id;
      const lift = picked ? 1 : 0;
      if (k.left <= 0) {
        box(ctx, cx, cy - lift, CHIP_W, CHIP_H + lift, paletteColor(k.color));
      } else {
        // Dark, and filling from the bottom as it comes back.
        const fill = Math.floor(CHIP_H * (1 - k.left / k.cooldown));
        box(ctx, cx, cy - lift, CHIP_W, CHIP_H + lift, UI.dusk);
        box(ctx, cx, cy + CHIP_H - fill, CHIP_W, fill, UI.slate);
      }
      if (picked) box(ctx, cx, cy - lift, CHIP_W, 1, UI.white);
    });
  }
}

/**
 * R held in play: over the hero's head, the word and a bar of old blood
 * filling to the restart. Let go before it is full, and nothing happened.
 */
export function drawRestartHold(ctx: CanvasRenderingContext2D, hx: number, hy: number, progress: number): void {
  const w = 64;
  const h = 18;
  const x = Math.max(2, Math.min(ART_W - w - 2, Math.round(hx - w / 2)));
  const y = Math.max(36, Math.round(hy - h - 26));
  drawFrame(ctx, 'plate', x, y, w, h);
  text(ctx, 'NEUSTART', x + w / 2, y + 3, { font: 'small', color: UI.roseLight, align: 'center' });
  const bw = w - 10;
  box(ctx, x + 5, y + 11, bw, 4, UI.ink);
  box(ctx, x + 6, y + 12, bw - 2, 2, UI.wine);
  box(ctx, x + 6, y + 12, Math.round((bw - 2) * clamp(progress, 0, 1)), 2, UI.rose);
}

/* ------------------------------------------------------------- boss bar */

export interface BossBarInfo {
  /** The name ("ANKHOR"), which also picks the medallion's sign. */
  name: string;
  /** What it is called after the name ("DER TEMPELKOLOSS"), set smaller. */
  title?: string;
  /** Right above the bar's end: "PHASE 2", or what the hydra's necks are doing. */
  status?: string;
  hp: number;
  maxHp: number;
  ghost: number;
  phase: number;
  /**
   * One mark per part, for a boss whose fight is not one bar coming down.
   * 'head' still has to be cut, 'stump' is cut but counting back, 'sealed' is
   * finished - the hydra's whole state in five symbols.
   */
  pips?: ('head' | 'stump' | 'sealed')[];
  /** Seconds left on each open stump, 0..1 of its full time. */
  pipUrgency?: number[];
  /** The colour of each mark while it stands; the hydra's green if not given. */
  pipColors?: string[];
}

/**
 * A bar name as the bosses give it - "ANKHOR   ·   DER TEMPELKOLOSS" - as
 * the name and what it is called, which the bar sets in two sizes.
 */
export function splitBarName(full: string): { name: string; title?: string } {
  const [name = '', ...rest] = full
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  return rest.length ? { name, title: rest.join(' · ') } : { name };
}

/** The bar's five rows of fill, light on top: life, what was just lost, and nothing. */
const LIFE = [UI.roseLight, UI.rose, UI.rose, UI.roseDark, UI.roseDark] as const;
const LOST = [UI.cream, '#f6ca9f', '#f6ca9f', '#e69c69', '#e69c69'] as const;
const NONE = [UI.ink, '#1c121c', '#1c121c', '#1c121c', UI.wine] as const;

const PANEL_X = 84;
const PANEL_W = 312;
const BAR_X = 110;
const BAR_W = 278;

/**
 * A boss's bar, across the bottom where it always was: a panel in old blood
 * and bronze, the boss's medallion at its left, its name (and what it is
 * called) over a recessed bar capped with bronze studs, the phase over the
 * bar's end, and the notches the phases change at. A boss that is more than
 * one bar gets its marks under it instead of the notches.
 *
 * `intro` (the knight's three seconds) fills the bar up from empty in the
 * first of them, the way a boss's life has always come in.
 */
export function drawBossBar(ctx: CanvasRenderingContext2D, info: BossBarInfo, intro: number): void {
  const pips = info.pips && info.pips.length ? info.pips : null;
  const panelH = pips ? 41 : 29;
  const panelY = 262 - panelH;
  drawFrame(ctx, 'boss', PANEL_X, panelY, PANEL_W, panelH);
  blit(ctx, bossMedallion(info.name), PANEL_X + 5, panelY + Math.floor((panelH - BADGE) / 2));

  const textY = panelY + 6;
  const nameW = text(ctx, info.name, BAR_X, textY, { color: UI.cream });
  if (info.title) text(ctx, info.title, BAR_X + nameW + 5, textY + 1, { font: 'small', color: '#e69c69' });
  if (info.status) text(ctx, info.status, BAR_X + BAR_W, textY + 1, { font: 'small', color: UI.gold, align: 'right' });

  const barY = textY + 10;
  const shown = intro > 2 ? clamp(3 - intro, 0, 1) : 1;
  const life = Math.round((BAR_W - 2) * clamp(info.hp / info.maxHp, 0, 1) * shown);
  const lost = Math.max(life, Math.round((BAR_W - 2) * clamp(info.ghost / info.maxHp, 0, 1) * shown));
  box(ctx, BAR_X, barY, BAR_W, 7, UI.ink);
  for (let r = 0; r < 5; r++) {
    box(ctx, BAR_X + 1, barY + 1 + r, BAR_W - 2, 1, NONE[r]);
    box(ctx, BAR_X + 1 + life, barY + 1 + r, lost - life, 1, LOST[r]);
    box(ctx, BAR_X + 1, barY + 1 + r, life, 1, LIFE[r]);
  }
  // A bronze stud capping each end.
  blit(ctx, studIcon(), BAR_X - 3, barY);
  blit(ctx, studIcon(), BAR_X + BAR_W - 4, barY);

  if (pips) {
    drawPips(ctx, BAR_X + BAR_W / 2, barY + 10, pips, info.pipUrgency ?? [], info.pipColors);
  } else {
    // The notches the phases turn at, cut through the bar and marked over it.
    for (const p of [0.3, 0.62]) {
      const nx = BAR_X + 1 + Math.round((BAR_W - 2) * p);
      box(ctx, nx, barY + 1, 1, 5, UI.ink);
      box(ctx, nx, barY - 1, 1, 1, '#bf6f4a');
    }
  }
}

/**
 * The hydra's five necks (or the twins' two stars) under the bar: a head
 * still to cut, an open stump with its seconds as a ring running out, or a
 * burned-out ring. A player has to see at a glance which of his cuts are
 * about to come undone.
 */
function drawPips(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  pips: ('head' | 'stump' | 'sealed')[],
  urgency: number[],
  colors: string[] = [],
): void {
  const gap = 17;
  const first = Math.round(cx - ((pips.length - 1) * gap) / 2 - PIP / 2);
  pips.forEach((pip, i) => {
    blit(ctx, pipIcon(pip, colors[i] ?? '#8fd45c', urgency[i] ?? 1), first + i * gap, y);
  });
}
