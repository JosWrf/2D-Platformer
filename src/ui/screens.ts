import { ART_H, ART_W } from '../render/pixel';
import { BADGE, keyCap, relicBadge, skillBadge, studIcon } from './icons';
import { UI, artCanvas, blinkOn, blit, box, drawFrame, frame, paletteColor, text, textWidth, wrap } from './kit';
import { logo, logoCentre } from './logo';

/**
 * The screens laid over the game: what is said, the pause menu, the fall,
 * the end, and the title. Like the HUD they are drawn in art pixels from
 * cached pieces, in colours of the palette, after the frame has been mapped
 * to it. The world under them is dimmed by shifting the palette (the game's
 * fadeRows) - the screen sinks down its ramps instead of under a sheet of grey
 * or a veil of dither - and the big words are set in two tones, light over
 * dark.
 */

const OVER = { outline: UI.ink } as const;

/** Key caps and words in a row, centred on cx: [P] FORTSETZEN  [R] NEUSTART ... */
function keyRow(ctx: CanvasRenderingContext2D, items: [string[], string][], cx: number, y: number, color: string = UI.frost): void {
  const gap = 10;
  const parts = items.map(([keys, label]) => {
    const caps = keys.map((k) => keyCap(k));
    const w = caps.reduce((s, c) => s + c.width + 2, 0) + 1 + textWidth(label, { font: 'small' });
    return { caps, label, w };
  });
  const total = parts.reduce((s, p) => s + p.w, 0) + gap * (parts.length - 1);
  let x = Math.round(cx - total / 2);
  for (const p of parts) {
    for (const cap of p.caps) {
      blit(ctx, cap, x, y);
      x += cap.width + 2;
    }
    x += 1;
    // On the cap's letters' rows (3-7): the small font's stand one row into their box.
    x += text(ctx, p.label, x, y + 2, { font: 'small', color, ...OVER });
    x += gap;
  }
}

/* ------------------------------------------------------------- dialogue */

export interface DialogueInfo {
  speaker: string;
  lines: string[];
  index: number;
}

const DIALOG_W = 352;
const DIALOG_BOTTOM = 232;

/**
 * The dialogue box. One line at a time, because five lines dumped at once are
 * five lines skipped; the line before it stays, in slate, so the sentence
 * keeps its shape while it is spoken. The speaker's name sits on a plate in
 * the top of the frame, and a marker blinks in the corner while it waits.
 */
export function drawDialogue(ctx: CanvasRenderingContext2D, d: DialogueInfo, time: number): void {
  const x = (ART_W - DIALOG_W) / 2;
  const inner = DIALOG_W - 24;
  const prev = d.index > 0 ? wrap(d.lines[d.index - 1] ?? '', inner) : [];
  const now = wrap(d.lines[d.index] ?? '', inner);
  const h = 17 + (prev.length + now.length) * 11 + 9;
  const y = DIALOG_BOTTOM - h;
  drawFrame(ctx, 'dialog', x, y, DIALOG_W, h);

  const nameW = textWidth(d.speaker, {});
  drawFrame(ctx, 'tab', x + 10, y - 6, nameW + 12, 14);
  text(ctx, d.speaker, x + 16, y - 3, { color: UI.cyan });

  let ly = y + 14;
  for (const line of prev) {
    text(ctx, line, x + 12, ly, { color: UI.slate });
    ly += 11;
  }
  for (const line of now) {
    text(ctx, line, x + 12, ly, { color: UI.white });
    ly += 11;
  }

  text(ctx, `${d.index + 1}/${d.lines.length}`, x + DIALOG_W - 20, y + h - 12, { font: 'small', color: UI.slate, align: 'right' });
  if (blinkOn(time, 2.2)) text(ctx, '▼', x + DIALOG_W - 17, y + h - 13, { color: UI.cyan });
  keyRow(ctx, [[['LEERTASTE'], 'WEITER']], ART_W / 2, y + h + 5);
}

/* ------------------------------------------------------------- pause */

export interface PauseEntry {
  id: string;
  name: string;
  text: string;
  from: string;
  color: string;
  /** The attack that is picked, marked in the list. */
  picked?: boolean;
}

export interface PauseInfo {
  page: 'relics' | 'skills';
  entries: PauseEntry[];
  music: boolean;
  sound: boolean;
  motion: boolean;
}

const ENTRY_H = 24;
const COL_W = 224;

/**
 * The pause menu: its name, the two pages as tabs with a cursor on the open
 * one (left and right turn between them), the open page as a list in two
 * columns, and along the bottom every key the menu answers to, each with
 * what it does and how it is set. One casing throughout: capitals.
 */
export function drawPause(ctx: CanvasRenderingContext2D, p: PauseInfo, time: number): void {
  // A solid bar along the top and a strip along the bottom, so the HUD under
  // them does not show through the menu's own words.
  box(ctx, 0, 0, ART_W, 23, UI.night);
  box(ctx, 0, 23, ART_W, 1, UI.steel);
  box(ctx, 0, 24, ART_W, 1, UI.ink);
  box(ctx, 0, ART_H - 17, ART_W, 1, UI.ink);
  box(ctx, 0, ART_H - 16, ART_W, 1, UI.steel);
  box(ctx, 0, ART_H - 15, ART_W, 15, UI.night);
  // The menu bar: the menu's name on the left, the two pages as tabs on the
  // right between the two arrow keys that turn them.
  text(ctx, 'PAUSE', 14, 5, { scale: 2, color: UI.white, lower: UI.mist, ...OVER, shadow: UI.ink });
  const tabs: ['relics' | 'skills', string][] = [
    ['relics', 'RELIKTE'],
    ['skills', 'ANGRIFFE'],
  ];
  const tabW = 78;
  const tabsX = ART_W - 14 - 14 - tabW * 2;
  const tabY = 5;
  blit(ctx, keyCap('←'), tabsX - 14, tabY + 2);
  blit(ctx, keyCap('→'), tabsX + tabW * 2 + 3, tabY + 2);
  tabs.forEach(([page, label], i) => {
    const tx = tabsX + i * tabW;
    const open = page === p.page;
    if (open) {
      drawFrame(ctx, 'tab', tx + 2, tabY, tabW - 4, 14);
      // The cursor never goes out; it nudges a pixel towards the page, twice a second.
      text(ctx, '▶', tx + 7 + (blinkOn(time, 2, 0.5) ? 1 : 0), tabY + 3, { color: UI.gold });
    }
    text(ctx, label, tx + tabW / 2 + 3, tabY + 3, { color: open ? UI.white : UI.slate, align: 'center' });
  });

  const top = 26;
  const kind = p.page;
  if (p.entries.length === 0) {
    const empty =
      kind === 'relics' ? 'Noch keine Relikte — jeder Boss hinterlässt eines.' : 'Noch keine Angriffe — jeder Boss bringt dir einen seiner bei.';
    const w = textWidth(empty) + 28;
    drawFrame(ctx, 'panel', ART_W / 2 - w / 2, top, w, 25);
    text(ctx, empty, ART_W / 2, top + 9, { color: UI.mist, align: 'center' });
  } else {
    const rows = Math.ceil(p.entries.length / 2);
    const panelW = COL_W * 2 + 16;
    const panelX = ART_W / 2 - panelW / 2;
    drawFrame(ctx, 'panel', panelX, top, panelW, rows * ENTRY_H + 10);
    p.entries.forEach((e, i) => {
      const col = i < rows ? 0 : 1;
      const row = col === 0 ? i : i - rows;
      drawEntry(ctx, e, kind, panelX + 6 + col * (COL_W + 4), top + 5 + row * ENTRY_H);
    });
  }

  keyRow(
    ctx,
    [
      [['P', 'LEERTASTE'], 'FORTSETZEN'],
      [['R'], 'NEUSTART'],
      [['M'], p.music ? 'MUSIK AN' : 'MUSIK AUS'],
      [['N'], p.sound ? 'TON AN' : 'TON AUS'],
      [['B'], p.motion ? 'BILDWACKELN AN' : 'BILDWACKELN AUS'],
    ],
    ART_W / 2,
    ART_H - 12,
  );
}

/** One relic or attack in the list: its badge, its name and whose it was, and what it does. */
function drawEntry(ctx: CanvasRenderingContext2D, e: PauseEntry, kind: 'relics' | 'skills', x: number, y: number): void {
  if (e.picked) box(ctx, x - 2, y - 2, COL_W, ENTRY_H - 1, UI.dusk);
  const badge = kind === 'relics' ? relicBadge(e.id, e.color, true, null) : skillBadge(e.id, e.color, true, null);
  blit(ctx, badge, x, y + 1);
  const hue = paletteColor(e.color);
  const nameW = text(ctx, e.name, x + BADGE + 4, y, { color: hue });
  if (e.picked) text(ctx, '◀', x + BADGE + 4 + nameW + 4, y, { color: UI.gold });
  text(ctx, e.from, x + COL_W - 8, y + 1, { font: 'small', color: UI.slate, align: 'right' });
  wrap(e.text, COL_W - BADGE - 12, { font: 'small' })
    .slice(0, 2)
    .forEach((line, i) => text(ctx, line, x + BADGE + 4, y + 9 + i * 7, { font: 'small', color: UI.frost }));
}

/* ------------------------------------------------------------- fallen */

/**
 * The fall: the screen sinks into old blood as `fade` comes up (0..1),
 * GEFALLEN across it on a band of its own, and - once he can go back - the
 * way back, blinking.
 */
export function drawFallen(ctx: CanvasRenderingContext2D, fade: number, canReturn: boolean, time: number): void {
  const cy = ART_H / 2 - 14;
  // A band of dark blood behind the word, so it stands on something, with a
  // seam of brighter blood along each edge.
  box(ctx, 0, cy - 9, ART_W, 30, '#1c121c');
  box(ctx, 0, cy - 9, ART_W, 1, UI.blood);
  box(ctx, 0, cy + 20, ART_W, 1, UI.blood);
  box(ctx, 0, cy + 21, ART_W, 1, UI.ink);
  const early = fade < 0.35;
  text(ctx, 'GEFALLEN', ART_W / 2, cy, {
    scale: 2,
    color: early ? UI.roseDark : UI.roseLight,
    lower: early ? UI.blood : UI.rose,
    align: 'center',
    ...OVER,
    shadow: UI.wine,
  });
  if (canReturn && blinkOn(time, 1.4, 0.7)) {
    keyRow(ctx, [[['LEERTASTE'], 'ZURÜCK ZUM LETZTEN KONTROLLPUNKT']], ART_W / 2, cy + 28, UI.cream);
  }
}

/* ------------------------------------------------------------- the end */

export interface VictoryInfo {
  trueEnding: boolean;
  score: number;
  gems: number;
  totalGems: number;
  /** Seconds played. */
  time: number;
  deaths: number;
}

/**
 * The end of the run: the title of it, a line of what happened, the run in
 * numbers on a sheet, a word about what is still out there (or what was
 * found), and how to go again.
 */
export function drawVictory(ctx: CanvasRenderingContext2D, v: VictoryInfo, time: number): void {
  const title = v.trueEnding ? 'DAS WAHRE ENDE' : 'SIEG!';
  const [color, lower, shadow] = v.trueEnding ? [UI.cyan, '#0cf1ff', '#0069aa'] : [UI.goldLight, UI.goldDark, UI.amber];
  text(ctx, title, ART_W / 2, 52, { scale: 2, color, lower, align: 'center', ...OVER, shadow });
  blit(ctx, studIcon(), ART_W / 2 - 3, 72);
  box(ctx, ART_W / 2 - 70, 75, 64, 1, UI.slate);
  box(ctx, ART_W / 2 + 6, 75, 64, 1, UI.slate);
  const line = v.trueEnding ? 'Morvain gefallen, das Herz des Kristalls zersprungen.' : 'Morvain ist gefallen — Nachtfall ist frei.';
  text(ctx, line, ART_W / 2, 84, { color: UI.frost, align: 'center', ...OVER });

  const minutes = Math.floor(v.time / 60);
  const seconds = Math.floor(v.time % 60);
  const rows: [string, string][] = [
    ['Punkte', `${v.score}`],
    ['Edelsteine', `${v.gems} / ${v.totalGems}`],
    ['Zeit', `${minutes}:${seconds.toString().padStart(2, '0')}`],
    ['Tode', `${v.deaths}`],
  ];
  drawFrame(ctx, 'panel', ART_W / 2 - 80, 102, 160, 62);
  rows.forEach(([label, value], i) => {
    const y = 109 + i * 13;
    text(ctx, label, ART_W / 2 - 70, y, { color: UI.mist });
    text(ctx, value, ART_W / 2 + 70, y, { color: UI.white, align: 'right' });
  });
  const note = v.trueEnding ? 'Klingenwelle erworben.' : 'Alle Edelsteine — und hinter der Welt wartet noch etwas.';
  text(ctx, note, ART_W / 2, 174, { color: v.trueEnding ? UI.cyan : UI.slate, align: 'center', ...OVER });
  if (blinkOn(time, 1.4, 0.7)) keyRow(ctx, [[['R'], 'NOCH EINMAL']], ART_W / 2, 196, UI.white);
}

/* ------------------------------------------------------------- title */

/** Every control the game has, as the title shows it: keys, and what they do. */
const CONTROLS: [string, string][] = [
  ['← → / A D', 'Laufen'],
  ['LEERTASTE / W', 'Springen · Doppelsprung'],
  ['J / K', 'Schwert (3er-Kombo, halten: Ladeschlag)'],
  ['E / I', 'Parade'],
  ['SHIFT / L', 'Ausweichrolle (unverwundbar)'],
  ['F / Q', 'Boss-Angriff · wechseln'],
  ['↓ + SPRUNG', 'Durch Plattform fallen'],
  ['P / R', 'Pause · Neustart'],
  ['M / N', 'Musik · Ton an/aus'],
  ['B', 'Bildwackeln an/aus'],
];

let controlsCard: HTMLCanvasElement | null = null;

/**
 * The controls, set once into a card: two columns of five, the keys in gold
 * on the right of their column's gutter, what they do in pale steel.
 */
function controls(): HTMLCanvasElement {
  if (controlsCard) return controlsCard;
  const w = 468;
  const h = 52;
  const { canvas, ctx } = artCanvas(w, h);
  blit(ctx, frame('panel', w, h), 0, 0);
  CONTROLS.forEach(([keys, what], i) => {
    const col = Math.floor(i / 5);
    const row = i % 5;
    const gutter = 6 + col * 232 + 74;
    const y = 5 + row * 9;
    text(ctx, keys, gutter, y, { font: 'small', color: UI.gold, align: 'right' });
    text(ctx, what, gutter + 6, y, { font: 'small', color: UI.frost });
  });
  controlsCard = canvas;
  return canvas;
}

export interface TitleInfo {
  build: string;
}

/**
 * The title: the logotype over the scene the game is standing in, quieted
 * a step down the palette rather than blacked out; the name of the
 * story under it, the call to start, the controls on a card along the bottom,
 * and which build this is in the corner.
 */
export function drawTitle(ctx: CanvasRenderingContext2D, info: TitleInfo, time: number): void {
  blit(ctx, logo(), Math.round(ART_W / 2 - logoCentre()), 12);
  text(ctx, 'Die Klinge von Nachtfall', ART_W / 2, 61, { color: UI.cyan, align: 'center', ...OVER });
  text(ctx, 'Vierzehn Bosse stehen zwischen dir und dem Tor nach Hause — keiner lässt sich umgehen.', ART_W / 2, 76, {
    font: 'small',
    color: UI.mist,
    align: 'center',
    ...OVER,
  });
  // The call to start, pulsing between two steps of the slate ramp rather
  // than vanishing: whenever someone looks, it is there to be read.
  const on = blinkOn(time, 1.6, 0.6);
  text(ctx, 'LEERTASTE ZUM STARTEN', ART_W / 2, 146, {
    scale: 2,
    color: on ? UI.white : UI.mist,
    lower: on ? UI.frost : UI.slate,
    align: 'center',
    ...OVER,
    shadow: UI.night,
  });
  blit(ctx, controls(), 6, ART_H - 58);
  text(ctx, `STAND ${info.build}`, ART_W - 5, 4, { font: 'small', color: UI.steel, align: 'right' });
}
