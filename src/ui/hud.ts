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
export function drawBanner(ctx: CanvasRenderingContext2D, title: string, sub: string | undefined, level: number): void {
  if (level <= 0.12) return;
  const step = Math.min(FADE.length - 1, Math.floor(level * FADE.length));
  const big = { scale: 2, color: FADE[step], lower: FADE_LOWER[step], ...OVER, shadow: UI.night };
  const lines = bannerLines(title);
  let y = 46 - (lines.length - 1) * 11;
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
  /** Every attack learned, in order, and which one is picked. */
  owned: { id: string; color: string }[];
}

/**
 * The boss attack he has picked, in the bottom left corner where nothing else
 * is: its name, its badge filling as it cools down, F with whether it is
 * ready, and Q with a mark for every other attack he could pick instead.
 */
export function drawSkillPanel(ctx: CanvasRenderingContext2D, info: SkillPanelInfo): void {
  const ready = info.left <= 0;
  const x = LEFT;
  const y = 226;
  // Narrow enough to stay clear of the boss bar, which starts at x 84.
  drawFrame(ctx, 'plate', x, y, 70, 36);
  text(ctx, info.name, x + 4, y + 3, { font: 'small', color: ready ? paletteColor(info.color) : UI.slate });
  drawSkillBadge(ctx, info.id, x + 4, y + 12, info.color, ready, ready ? null : 1 - info.left / info.cooldown);
  blit(ctx, keyCap('F'), x + 22, y + 11);
  const status = ready ? 'BEREIT' : `${info.left.toFixed(1).replace('.', ',')} S`;
  text(ctx, status, x + 33, y + 13, { font: 'small', color: ready ? UI.green : UI.mist });
  if (info.owned.length > 1) {
    blit(ctx, keyCap('Q'), x + 22, y + 12 + KEY_H);
    // A mark a pixel wide for each, two apart - all eighteen fit - and the
    // picked one standing taller, in its colour.
    const top = y + 15 + KEY_H;
    info.owned.forEach((k, i) => {
      const px = x + 33 + i * 2;
      if (k.id === info.id) {
        box(ctx, px, top - 1, 1, 5, paletteColor(k.color));
      } else {
        box(ctx, px, top, 1, 3, UI.steel);
      }
    });
  }
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
