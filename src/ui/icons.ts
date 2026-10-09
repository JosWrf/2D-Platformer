import { ART, PixelSprite, makeCanvas } from '../render/pixel';
import { UI, paletteColor, text, textWidth } from './kit';

/**
 * Every icon of the HUD and the menus, placed pixel by pixel: hearts, the
 * gem, the relics' and the attacks' badges, the bosses' medallions, the marks
 * under a boss bar, studs and key caps.
 *
 * An icon is a grid of letters, one per art pixel: 'a' to 'f' are its main
 * material from light to dark, 'A' to 'F' a second one, 'w' a white glint and
 * 'o' the ink line; '.' is empty. The grids hold only the fill - the one-pixel
 * ink outline round each shape is added when the icon is first used (see
 * outlined), so that every icon carries the same line the sprites do, and a
 * grid can be read as the shape it is.
 *
 * The light comes from the upper left, as everywhere in the game: the light
 * end of a ramp on the top and left of a shape, the dark end bottom right.
 */

type Key = Record<string, string>;

/** Ramps of the palette, light to dark. */
const R = {
  rose: ['#f68187', '#ea323c', '#c42430', '#891e2b', '#571c27'],
  gold: ['#ffeb57', '#ffc825', '#ffa214', '#ed7614', '#c64524', '#8e251d'],
  fire: ['#ffeb57', '#ffc825', '#ffa214', '#ed7614', '#ff5000', '#8e251d'],
  earth: ['#f6ca9f', '#e69c69', '#bf6f4a', '#8a4836', '#5d2c28', '#391f21'],
  ivory: ['#f9e6cf', '#f6ca9f', '#e69c69', '#bf6f4a', '#8a4836'],
  green: ['#d3fc7e', '#99e65f', '#5ac54f', '#33984b', '#1e6f50', '#134c4c'],
  cyan: ['#94fdff', '#0cf1ff', '#00cdf9', '#0098dc', '#0069aa', '#00396d'],
  steel: ['#c7cfdd', '#92a1b9', '#657392', '#424c6e', '#2a2f4e', '#1a1932'],
  violet: ['#fdd2ed', '#f389f5', '#db3ffd', '#7a09fa', '#3003d9', '#0c0293'],
  plum: ['#f389f5', '#ca52c9', '#93388f', '#622461', '#3b1443'],
} as const;

type Ramp = readonly string[];

/** A key: the main ramp as a-f, a second one as A-F, and anything else by hand. */
function key(main: Ramp, second: Ramp | null = null, extra: Key = {}): Key {
  const k: Key = { o: UI.ink, w: '#ffffff' };
  main.forEach((c, i) => (k['abcdef'[i]] = c));
  second?.forEach((c, i) => (k['ABCDEF'[i]] = c));
  return { ...k, ...extra };
}

/**
 * The grid with a one-pixel ink line added round everything in it, touching
 * side by side (not on the diagonal) - the same line the game puts round its
 * actors.
 */
export function outlined(rows: readonly string[]): string[] {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const solid = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < rows[y].length && rows[y][x] !== '.';
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) line += rows[y][x];
      else line += solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) ? 'o' : '.';
    }
    out.push(line);
  }
  return out;
}

interface IconDef {
  rows: readonly string[];
  key: Key;
  /** False for line drawings, where an outline round every line would clog it. */
  outline?: boolean;
  /**
   * Pixels laid over the outlined shape without a line of their own: rays,
   * sparks, speed lines - things that are light rather than objects, and
   * that an outline would turn into blobs.
   */
  over?: readonly string[];
}

/* ================================================================ hearts */

const HEART_KEY = key(R.rose, null, { w: '#fdd2ed' });
// Drained to the colour of old wine, but still there: on a dark screen an
// empty heart drawn in black is no heart at all.
const HEART_EMPTY_KEY: Key = { o: UI.ink, a: '#891e2b', b: '#571c27', c: '#391f21' };

const HEART_FULL = [
  '.........',
  '..aa.ab..',
  '.awbbbbc.',
  '.abbbbbc.',
  '..bbbbc..',
  '...bcd...',
  '....d....',
  '.........',
];

const HEART_EMPTY = [
  '.........',
  '..aa.ab..',
  '.abbbbbc.',
  '.bbbbbbc.',
  '..bbbbc..',
  '...bcc...',
  '....c....',
  '.........',
];

/* ================================================================ gem */

const GEM = [
  '.......',
  '...a...',
  '..awb..',
  '.aabbc.',
  '.bbbcd.',
  '..bcd..',
  '...d...',
  '.......',
];
const GEM_KEY = key(R.gold);

/* ================================================================ relics */

/**
 * The relics' signs, each on a 12×12 grid laid into the round badge at
 * (2, 2). The badge is a disc, so the grid's corners are off limits: rows 0
 * and 11 only between columns 3 and 8, rows 1-2 and 9-10 between 1 and 10,
 * outline included.
 */
const RELIC_SIGNS: Record<string, IconDef> = {
  // A heart with its core showing.
  herzkern: {
    key: key(R.rose),
    rows: [
      '............',
      '............',
      '..aab..abc..',
      '.awbbbbbbbc.',
      '.abbbbbbbbc.',
      '.abbbwwbbbc.',
      '..bbbwwbbc..',
      '...bbbbbc...',
      '....bbcc....',
      '.....cd.....',
      '............',
      '............',
    ],
  },
  // A boar's tusk, curving up out of the hide.
  keilerhaut: {
    key: key(R.ivory, R.earth),
    rows: [
      '............',
      '............',
      '.........a..',
      '........ab..',
      '.......abc..',
      '......abbc..',
      '....aabbc...',
      '..aabbbcc...',
      '.CCbbccd....',
      '..DDDDD.....',
      '............',
      '............',
    ],
  },
  // A molar of gold.
  goldzahn: {
    key: key(R.gold),
    rows: [
      '............',
      '............',
      '..abb..abc..',
      '.awbbbbbbbc.',
      '.abbbbbbbbc.',
      '.abbbbbbbcc.',
      '..bbbbbbbc..',
      '..bbc..bcc..',
      '..bc....cd..',
      '...d....d...',
      '............',
      '............',
    ],
  },
  // The jester's mask, harlequin: half plum, half bone, grinning.
  gauklerschritt: {
    key: key(R.ivory, R.plum),
    rows: [
      '............',
      '....ABbc....',
      '..AABBbbcc..',
      '.AABBBbbbbc.',
      '.AooBBboobc.',
      '.ABBBBbbbbc.',
      '.ABBBBbbbbc.',
      '..BoBBbbobc.',
      '..BBoooobc..',
      '...BCCccd...',
      '....CCdd....',
      '............',
    ],
  },
  // A fist of temple stone: three fingers curled, the thumb across them.
  bebenfaust: {
    key: key(R.earth),
    rows: [
      '............',
      '............',
      '..ab.ab.bc..',
      '..abdabdbc..',
      '..abdabdbcc.',
      '..bbdbbdccc.',
      '.aaaaaabcc..',
      '..abbbbbcc..',
      '...bbbbcc...',
      '...ccccdd...',
      '............',
      '............',
    ],
  },
  // A heart made of light, giving off light.
  lichtkern: {
    key: key(['#ffffff', '#ffeb57', '#ffc825', '#ffa214']),
    rows: [
      '............',
      '............',
      '............',
      '..abb..abc..',
      '.awbbbbbbbc.',
      '.abbbaabbbc.',
      '..bbbaabbc..',
      '...bbbbbc...',
      '....bbcc....',
      '.....cd.....',
      '............',
      '............',
    ],
    over: [
      '.....bb.....',
      '..c......c..',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  // A web: what the silk cloak is spun from.
  seidenmantel: {
    key: key(['#ffffff', '#c7cfdd', '#92a1b9', '#657392']),
    outline: false,
    rows: [
      '............',
      '.c...b...c..',
      '..c..b..c...',
      '...bbbbb....',
      '..cbc.cbc...',
      'bbbb.a.bbbb.',
      '..cbc.cbc...',
      '...bbbbb....',
      '..c..b..c...',
      '.c...b...c..',
      '............',
      '............',
    ],
  },
  // An ember.
  glutklinge: {
    key: key(R.fire),
    rows: [
      '............',
      '......e.....',
      '.....ee.....',
      '....edd.....',
      '...eddc..e..',
      '..edcccd.e..',
      '..edcbbcde..',
      '.edcbbabcde.',
      '.edcbaaabcd.',
      '..edcbbbcd..',
      '...eddddd...',
      '............',
    ],
  },
  // The sun, and the moon's crescent turned towards it.
  zwillingsstern: {
    key: key(R.gold, R.steel),
    rows: [
      '............',
      '............',
      '.......AA...',
      '........AB..',
      '..abb...AB..',
      '.awbbc..AB..',
      '.abbbc..AB..',
      '.bbbcc..BC..',
      '..ccd..BC...',
      '......CC....',
      '............',
      '............',
    ],
    over: [
      '............',
      '............',
      '...c........',
      '.c..........',
      '............',
      '............',
      'c...........',
      '............',
      '............',
      '.c..........',
      '...c........',
      '............',
    ],
  },
  // A sickle of water, thrown.
  flutklinge: {
    key: key(R.cyan),
    rows: [
      '............',
      '.....abb....',
      '...aabc.....',
      '..abc.......',
      '.abc........',
      '.abc....c...',
      '.abc...cd...',
      '.bbc..cd....',
      '..bccdd.....',
      '...ddd......',
      '............',
      '............',
    ],
  },
  // An eye cut in stone.
  steinblick: {
    key: key(R.steel, R.gold),
    rows: [
      '............',
      '............',
      '............',
      '...abbbbc...',
      '..abcAAcbc..',
      '.abcAwoAcbc.',
      '..bcAooAcc..',
      '...bccccd...',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  // A cog of the clock tower.
  taktgeber: {
    key: key(R.gold),
    rows: [
      '............',
      '.....bb.....',
      '..b.bbbb.c..',
      '...abbbbc...',
      '.aab.oo.bcc.',
      '.abbooo.bcc.',
      '..bb.oo.cc..',
      '...bcccccc..',
      '..c.cccc.d..',
      '.....dd.....',
      '............',
      '............',
    ],
  },
  // A drop of blood.
  blutdurst: {
    key: key(R.rose),
    rows: [
      '............',
      '.....b......',
      '.....bb.....',
      '....bbbc....',
      '...abbbbc...',
      '..abbbbbbc..',
      '..awbbbbbc..',
      '..abbbbbcc..',
      '...bbbbccd..',
      '....cccdd...',
      '............',
      '............',
    ],
  },
  // Two steps of shadow, one after the other.
  schattenschritt: {
    key: key(R.violet),
    rows: [
      '............',
      '............',
      '............',
      '.aa...aa....',
      '..ab...ab...',
      '...ab...ab..',
      '...bc...bc..',
      '..bc...bc...',
      '.cd...cd....',
      '............',
      '............',
      '............',
    ],
  },
  // A breath caught under a halo: a life that is not over yet.
  zweiteratem: {
    key: key(R.violet, R.gold),
    rows: [
      '............',
      '...BBBBBB...',
      '..B......C..',
      '...BCCCCC...',
      '............',
      '....abbc....',
      '...abwbbc...',
      '...abbbbc...',
      '....bbcc....',
      '.....cd.....',
      '............',
      '............',
    ],
  },
  // A splinter of crystal.
  splitterparade: {
    key: key(R.violet),
    rows: [
      '............',
      '.....ab.....',
      '....abbc....',
      '....awbc....',
      '...abbbcc...',
      '.b.abbbcc.c.',
      '...abbbcc...',
      '...bbbccd...',
      '....bccd....',
      '....bccd....',
      '.....cd.....',
      '............',
    ],
  },
  // A leaf on its stem: what is cut grows back.
  hydrablut: {
    key: key(R.green),
    rows: [
      '............',
      '............',
      '.......abb..',
      '.....aabbc..',
      '....abbbcc..',
      '...abbdcc...',
      '..abdccc....',
      '..adcc......',
      '.dd.........',
      '............',
      '............',
      '............',
    ],
  },
  // The blade's wave of light.
  klingenwelle: {
    key: key(['#ffffff', '#94fdff', '#0cf1ff', '#00cdf9', '#0098dc']),
    rows: [
      '............',
      '......ab....',
      '.......bc...',
      '........bc..',
      '.aaa....abc.',
      '........abc.',
      '.bbbb...abc.',
      '........bcd.',
      '.ccc...bcd..',
      '......bcd...',
      '.....cd.....',
      '............',
    ],
  },
};

/* ================================================================ skills */

/** The boss attacks' signs: 12×12 grids laid into the square badge at (2, 2). */
const SKILL_SIGNS: Record<string, IconDef> = {
  // A blob in the air over the ring it is about to make.
  klatschsprung: {
    key: key(R.green),
    rows: [
      '............',
      '....abbc....',
      '...awbbbc...',
      '...abbbbc...',
      '...bbbbcc...',
      '....cccd....',
      '............',
      '...cccccc...',
      '.cc......cc.',
      '...dddddd...',
      '............',
      '............',
    ],
  },
  // A boulder, thrown in an arc.
  felswurf: {
    key: key(R.earth, R.steel),
    rows: [
      '............',
      '.B..........',
      '..B.........',
      '....abbb....',
      '...abbbbc...',
      '..abbbcbcc..',
      '..abbbbccc..',
      '..bbcbbccd..',
      '...bccccd...',
      '....cddd....',
      '............',
      '............',
    ],
  },
  // Coins, falling.
  goldregen: {
    key: key(R.gold),
    rows: [
      '............',
      '.......abc..',
      '.......bwc..',
      '.......ccd..',
      '....abc.....',
      '....bwc.....',
      '....ccd.....',
      '.abc........',
      '.bwc........',
      '.ccd........',
      '............',
      '............',
    ],
  },
  // A figure stepping out of its own shadow.
  trugbild: {
    key: key(R.plum, R.steel),
    rows: [
      '............',
      '..CC....ab..',
      '..CD....bc..',
      '.CCDD..abbc.',
      '.CCDD..abbc.',
      '..CD....bc..',
      '..CD....bc..',
      '.C..D..b..c.',
      '.C..D..b..c.',
      '............',
      '............',
      '............',
    ],
    over: [
      '............',
      '............',
      '............',
      '............',
      '.....D......',
      '......D.....',
      '.....D......',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  // A pillar of sunlight, coming down on the spot.
  sonnenblick: {
    key: key(R.gold),
    rows: [
      '....abbc....',
      '....awbc....',
      '....awbc....',
      '....awbc....',
      '....awbc....',
      '....awbc....',
      '....awbc....',
      '...aawbcc...',
      '.cbbbwbbccd.',
      '..dddddddd..',
      '............',
      '............',
    ],
    over: [
      '.c........c.',
      '..c......c..',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  // Three lights on a ring.
  irrlichter: {
    key: key(['#ffffff', '#ffeb57', '#ffc825', '#ffa214']),
    rows: [
      '............',
      '.....ab.....',
      '.....bc.....',
      '............',
      '..c......c..',
      '.c........c.',
      '............',
      '.ab......ab.',
      '.bc......bc.',
      '...c....c...',
      '....cccc....',
      '............',
    ],
  },
  // A ball of silk and the threads behind it.
  netzschuss: {
    key: key(['#ffffff', '#c7cfdd', '#92a1b9', '#657392']),
    rows: [
      '............',
      '............',
      '.......abc..',
      '.c....awbbc.',
      '..cc..abbbc.',
      'c...ccbbbcc.',
      '..cc..bbccd.',
      '.c.....ccd..',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  // The ground breaking open in fire, pillar after pillar.
  feuerwelle: {
    key: key(R.fire),
    rows: [
      '.........d..',
      '........dcd.',
      '........cbc.',
      '....d...cbd.',
      '...dcd..cbc.',
      '...cbc.dbad.',
      '.d.cbd.cbac.',
      'dcdcbcdcaad.',
      'cbcbadcbaac.',
      'dddddddddde.',
      '............',
      '............',
    ],
  },
  // A sickle of moonlight that comes back.
  mondsichel: {
    key: key(R.steel, R.cyan),
    rows: [
      '............',
      '....aab.....',
      '......abc...',
      '.......bc...',
      '.......bc...',
      '.......bc...',
      '......bcc...',
      '....bccd....',
      '............',
      '.D........D.',
      '..DD....DD..',
      '....DDDD....',
    ],
  },
  // Water shooting up out of the floor.
  springflut: {
    key: key(R.cyan),
    rows: [
      '.....ab.....',
      '....abbc....',
      '..a.abbc.c..',
      '....abbc....',
      '....abbc....',
      '....abbc....',
      '....bbcc....',
      '.b..bbcd..c.',
      '..bbbccdd...',
      'ccddddddddd.',
      '............',
      '............',
    ],
  },
  // A block of stone, coming down onto the floor.
  steinsturz: {
    key: key(R.steel),
    rows: [
      '............',
      '............',
      '............',
      '...abbbbc...',
      '...awbbbc...',
      '...abbbcc...',
      '...bbbccc...',
      '...cccccd...',
      '............',
      '............',
      'cbbbbbbbbbbd',
      '............',
    ],
    over: [
      '....c...c...',
      '...c.c.c.c..',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '.c........c.',
      '............',
      '............',
    ],
  },
  // A pendulum of brass, swinging.
  pendelschlag: {
    key: key(R.gold, R.steel),
    rows: [
      '.cd.........',
      '..c.........',
      '...c........',
      '....c.......',
      '.....c......',
      '......abc...',
      '.....awbbc..',
      '.....abbbc..',
      '......bccd..',
      '.B........B.',
      '..BB....BB..',
      '....BBBB....',
    ],
  },
  // Sickles of blood.
  blutsicheln: {
    key: key(R.rose),
    rows: [
      '............',
      '..ab....ab..',
      '...bc....bc.',
      '...bc....bc.',
      '....bc....bc',
      '....bc....bc',
      '....bc....bc',
      '...bc....bc.',
      '...cd....cd.',
      '..cd....cd..',
      '............',
      '............',
    ],
  },
  // The blade in the ground, a wave each way.
  schattenwelle: {
    key: key(R.violet, R.steel),
    rows: [
      '.....AB.....',
      '.....AB.....',
      '.....AB.....',
      '....BBCC....',
      '.....AB.....',
      '.....AB.....',
      '.a...AB...a.',
      '.ab..AB..ba.',
      'abc..AB..cba',
      'cccccCDccccc',
      '............',
      '............',
    ],
  },
  // Through the dark, behind the foe.
  schattensprung: {
    key: key(R.violet),
    rows: [
      '............',
      '....abbc....',
      '...b....c...',
      '..b......c..',
      '..b......c..',
      '.b........c.',
      '.b........c.',
      '............',
      'cddd....cddd',
      '.ee......ee.',
      '............',
      '............',
    ],
  },
  // A storm of crystal, straight ahead.
  splitteransturm: {
    key: key(R.violet),
    rows: [
      '............',
      '.......ab...',
      '......abbc..',
      'cc...abbbbc.',
      '....awbbbbcc',
      'bbb..bbbbccd',
      '......bbccd.',
      'cc.....bcd..',
      '........d...',
      '............',
      '............',
      '............',
    ],
  },
  // Five throws, one for each head.
  kronenfeuer: {
    key: key(R.green, null, {
      A: '#99e65f',
      B: '#ffa214',
      C: '#c7cfdd',
      D: '#0cf1ff',
      E: '#ffeb57',
    }),
    rows: [
      '............',
      '............',
      '.....EE.....',
      '..DD.EE.CC..',
      '..DD....CC..',
      '............',
      'AA........BB',
      'AA........BB',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  // Crystals raining on the foe.
  splitterregen: {
    key: key(['#ffffff', '#94fdff', '#0cf1ff', '#00cdf9', '#0098dc']),
    rows: [
      '.ab.........',
      '.bc....ab...',
      '.bc....bc...',
      '..d....bc...',
      '........d...',
      '...ab.......',
      '...bc....ab.',
      '...bc....bc.',
      '....d....bc.',
      '..........d.',
      '............',
      '............',
    ],
  },
};

/* ================================================================ bosses */

/**
 * A sign for each boss on its bar. Where the relic it guards is its emblem
 * already - Ankhor's fist, Vesperon's blood - the relic's sign is reused: the
 * badge a player earns is the one he fought under. The rest have their own.
 */
const BOSS_SIGNS: Record<string, IconDef> = {
  // The knight's great helm: a slit to see by, two eyes burning in it.
  helm: {
    key: key(R.steel, R.violet),
    rows: [
      '............',
      '....abbc....',
      '...abbbbc...',
      '..abbbbbbc..',
      '..awbbbbbc..',
      '..oBooooBo..',
      '..abbobbbc..',
      '..abbobbcc..',
      '..bbbobccc..',
      '...ccccdd...',
      '............',
      '............',
    ],
  },
  // The bog's slime, two eyes in it.
  slime: {
    key: key(R.green),
    rows: [
      '............',
      '............',
      '....abbc....',
      '...abbbbc...',
      '..abwbbwbc..',
      '..abobbobc..',
      '.abbbbbbbcc.',
      '.abbbbbbbcc.',
      '..bccbccdd..',
      '............',
      '............',
      '............',
    ],
  },
  // A drowned crown.
  crown: {
    key: key(R.cyan, R.gold),
    rows: [
      '............',
      '............',
      '..A..A..A...',
      '..B.AB..B...',
      '..BBBBBBBC..',
      '..BwBBDBBC..',
      '..CCCCCCCD..',
      '...a..a..b..',
      '...b..b..c..',
      '......c.....',
      '............',
      '............',
    ],
  },
  // A sun of stone and fire: Ankhor's heart.
  sun: {
    key: key(R.gold),
    rows: [
      '............',
      '.....bb.....',
      '..c..bb..c..',
      '...abbbbc...',
      '...awbbbc...',
      'bb.bbbbbc.dd',
      'bb.bbbbcc.dd',
      '...bbccdd...',
      '...cccddd...',
      '..c..dd..d..',
      '.....dd.....',
      '............',
    ],
  },
  // A bat, wings spread.
  bat: {
    key: key(R.rose, R.steel),
    rows: [
      '............',
      '............',
      '............',
      '.a...bb...c.',
      '.ab.abbc.cc.',
      '.abbbwwbccc.',
      '.abbbbbbccc.',
      '.b.bbbbcc.c.',
      '...b.cc.c...',
      '............',
      '............',
      '............',
    ],
  },
  // The chest with teeth.
  chest: {
    key: key(R.earth, R.gold),
    rows: [
      '............',
      '............',
      '...abbbbc...',
      '..abbbbbcc..',
      '..ABBBBBBC..',
      '..wowowowo..',
      '..obobobob..',
      '..bbbABbcc..',
      '..bbbCCbcc..',
      '..ccccdddd..',
      '............',
      '............',
    ],
  },
  // A spider, hanging.
  spider: {
    key: key(R.steel, R.rose),
    rows: [
      '.....b......',
      '.....b......',
      '..b..b..b...',
      '...babbcb...',
      '.bb.bbbc.bb.',
      '...bbAAcb...',
      '.bb.bccc.bb.',
      '...b.cc.b...',
      '..b......b..',
      '............',
      '............',
      '............',
    ],
  },
  // The hero's own shape, gone dark.
  shade: {
    key: key(R.violet, R.steel),
    rows: [
      '............',
      '.....DD.....',
      '....DDDD....',
      '....DaaD....',
      '...DDDDDD...',
      '..DDDDDDDD..',
      '..D.DDDD.D..',
      '....DDDD....',
      '....DD.DD...',
      '...DD...DD..',
      '............',
      '............',
    ],
  },
  // A clock face, its hands near twelve.
  clock: {
    key: key(R.gold, R.ivory),
    rows: [
      '............',
      '....bbbb....',
      '...bAAAAc...',
      '..bAAoAABc..',
      '..bAAoAABc..',
      '..bAAoooBc..',
      '..bAAAAABc..',
      '...cBBBBc...',
      '....cccc....',
      '............',
      '............',
      '............',
    ],
  },
  // An eclipse: light with a dark eye in it.
  eclipse: {
    key: key(['#ffffff', '#ffeb57', '#ffc825', '#ffa214']),
    rows: [
      '............',
      '.....bb.....',
      '..c.abbc.c..',
      '...abbbbc...',
      '..abooooc...',
      '.babooooccb.',
      '..bbooooc...',
      '...bbccc....',
      '..c.bccd.d..',
      '.....dd.....',
      '............',
      '............',
    ],
  },
  // Five serpent heads reared up over one body, eyes burning.
  hydra: {
    key: key(R.green, null, { E: '#f5555d' }),
    rows: [
      '............',
      '.....bE.....',
      '..bE.bc.Eb..',
      '..bc.bc.cb..',
      'bE.bc.c.cb.E',
      'bc..cbc.c.cb',
      '.cc.cbbcc.c.',
      '..ccbbbbccc.',
      '...abbbbcc..',
      '...bbbccdd..',
      '....ccdd....',
      '............',
    ],
  },
  // Any other foe that carries a bar: a plain star of steel.
  star: {
    key: key(R.steel),
    rows: [
      '............',
      '.....ab.....',
      '.....ab.....',
      '.....ab.....',
      '....abbc....',
      '.aaabwbbccc.',
      '.bbbbbbcccd.',
      '....bccd....',
      '.....cd.....',
      '.....cd.....',
      '.....dd.....',
      '............',
    ],
  },
  // A prism, splitting the light.
  prism: {
    key: key(['#ffffff', '#94fdff', '#0cf1ff', '#00cdf9', '#0098dc']),
    rows: [
      '............',
      '.....ab.....',
      '....abbc....',
      '....awbc....',
      '...abbbcc...',
      '...abbbcc...',
      '..abbbbccd..',
      '..bbbbcccd..',
      '.ccccccdddd.',
      '............',
      '............',
      '............',
    ],
  },
};

/** Which sign each boss's bar carries, by the first part of the name on it. */
const BOSS_SIGN_OF: Record<string, string> = {
  'SCHATTENRITTER MORVAIN': 'helm',
  GALLERT: 'slime',
  THALASSA: 'crown',
  SPLITTERWÄCHTER: 'relic:splitterparade',
  ANKHOR: 'sun',
  IGNIVOR: 'relic:glutklinge',
  VESPERON: 'bat',
  GIERSCHLUND: 'chest',
  ARACHNA: 'spider',
  UMBRA: 'shade',
  GRIMMZAHN: 'relic:keilerhaut',
  'SOL UND LUNA': 'relic:zwillingsstern',
  TICKMAR: 'clock',
  MASKARILL: 'relic:gauklerschritt',
  NYKTOS: 'eclipse',
  GRAUWACHT: 'relic:steinblick',
  'DIE FÜNFKRONIGE': 'hydra',
  PRISMARCH: 'prism',
};

/* ================================================================ plates */

/** The relic badge: a disc with a ring that can light up step by step. */
const ROUND_PLATE = [
  '.....oooooo.....',
  '...ooRRRRRRoo...',
  '..oRRffffffRRo..',
  '.oRffffffffffRo.',
  '.oRffffffffffRo.',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  '.oRffffffffffRo.',
  '.oRffffffffffRo.',
  '..oRRffffffRRo..',
  '...ooRRRRRRoo...',
  '.....oooooo.....',
];

/** The skill badge: square, so the two rows never read as one. */
const SQUARE_PLATE = [
  '.oooooooooooooo.',
  'oRRRRRRRRRRRRRRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRffffffffffffRo',
  'oRRRRRRRRRRRRRRo',
  '.oooooooooooooo.',
];

/** The ring's pixels, clockwise from twelve o'clock - the order a meter lights them in. */
function ringOrder(plate: readonly string[]): [number, number][] {
  const ring: [number, number, number][] = [];
  const c = (plate.length - 1) / 2;
  plate.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'R') continue;
      // Angle from twelve o'clock, clockwise, 0..2π.
      let a = Math.atan2(x - c, c - y);
      if (a < 0) a += Math.PI * 2;
      ring.push([x, y, a]);
    }
  });
  ring.sort((p, q) => p[2] - q[2]);
  return ring.map(([x, y]) => [x, y]);
}

/* ================================================================ caches */

const sprites = new Map<string, PixelSprite>();

/** The grid as it is drawn: outlined (unless it says not to), with its over-layer on top. */
export function iconRows(def: IconDef): string[] {
  const rows = def.outline === false ? [...def.rows] : outlined(def.rows);
  if (!def.over) return rows;
  return rows.map((row, y) => {
    const over = def.over?.[y] ?? '';
    let line = '';
    for (let x = 0; x < row.length; x++) line += over[x] && over[x] !== '.' ? over[x] : row[x];
    return line;
  });
}

function spriteOf(id: string, def: IconDef, dim: boolean): PixelSprite {
  const k = `${id}|${dim ? 'dim' : 'lit'}`;
  let s = sprites.get(k);
  if (!s) {
    s = new PixelSprite(iconRows(def), dim ? dimKey(def.key) : def.key);
    sprites.set(k, s);
  }
  return s;
}

/**
 * A key with every colour pushed down into the cold slates, by how light it
 * was: a relic that is spent, an attack still coming back. The shape stays,
 * the colour goes - which reads as "not now" without reading as "gone".
 */
function dimKey(k: Key): Key {
  const out: Key = {};
  for (const [ch, hex] of Object.entries(k)) {
    if (ch === 'o') {
      out[ch] = hex;
      continue;
    }
    const v = parseInt(hex.slice(1), 16);
    const lum = 0.3 * ((v >> 16) & 255) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255);
    out[ch] = lum > 170 ? '#657392' : lum > 100 ? '#424c6e' : '#2a2f4e';
  }
  return out;
}

/**
 * Canvases put together from several pieces, kept by what went into them,
 * most recently used last: a badge whose meter moves makes a new one every
 * few seconds, and must not push out the ones drawn every frame.
 */
const composed = new Map<string, HTMLCanvasElement>();
const COMPOSED_CACHE = 384;

function compose(k: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const hit = composed.get(k);
  if (hit) {
    composed.delete(k);
    composed.set(k, hit);
    return hit;
  }
  const { canvas, ctx } = makeCanvas(w, h);
  paint(ctx);
  composed.set(k, canvas);
  if (composed.size > COMPOSED_CACHE) composed.delete(composed.keys().next().value as string);
  return canvas;
}

function paintRows(ctx: CanvasRenderingContext2D, rows: readonly string[], k: Key, ox = 0, oy = 0): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = k[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

/* ================================================================ public */

export const HEART_W = 9;

/** A heart of the HUD, full or empty: 9×8, outlined. */
export function heartIcon(full: boolean): HTMLCanvasElement {
  return spriteOf(full ? 'heart' : 'heart-empty', { rows: full ? HEART_FULL : HEART_EMPTY, key: full ? HEART_KEY : HEART_EMPTY_KEY }, false).canvas;
}

/** The gem beside the gem count: 7×8, outlined. */
export function gemIcon(): HTMLCanvasElement {
  return spriteOf('gem', { rows: GEM, key: GEM_KEY }, false).canvas;
}

export const BADGE = 16;
const ROUND_RING = ringOrder(ROUND_PLATE);

/**
 * A relic's badge, 16×16: the disc, its sign, and - for the relics that fill
 * up or run out - the ring lit clockwise from the top as far as `fill` goes,
 * a pixel at a time. `lit` false shows the sign in slate: spent for now.
 */
export function relicBadge(id: string, color: string, lit: boolean, fill: number | null): HTMLCanvasElement {
  const steps = fill === null ? -1 : Math.round(Math.max(0, Math.min(1, fill)) * ROUND_RING.length);
  const hue = paletteColor(color);
  return compose(`relic|${id}|${hue}|${lit ? 1 : 0}|${steps}`, BADGE, BADGE, (ctx) => {
    paintRows(ctx, ROUND_PLATE, { o: UI.ink, R: UI.steel, f: UI.night });
    if (steps < 0) {
      // No meter: a steel rim, lit on its upper left like everything else.
      ROUND_RING.forEach(([x, y]) => {
        ctx.fillStyle = x + y < 15 ? UI.slate : UI.dusk;
        ctx.fillRect(x, y, 1, 1);
      });
    } else {
      ROUND_RING.forEach(([x, y], i) => {
        ctx.fillStyle = i < steps ? hue : UI.dusk;
        ctx.fillRect(x, y, 1, 1);
      });
    }
    const def = RELIC_SIGNS[id];
    if (def) ctx.drawImage(spriteOf(`relic:${id}`, def, !lit).canvas, 2, 2);
  });
}

/**
 * A boss attack's badge, 16×16 and square. Ready, its rim is lit in its
 * colour; cooling down, the rim is dark, the sign is slate, and the inside
 * fills from the bottom, a row at a time, as it comes back.
 */
export function skillBadge(id: string, color: string, ready: boolean, fill: number | null): HTMLCanvasElement {
  const rows = fill === null ? -1 : Math.round(Math.max(0, Math.min(1, fill)) * 12);
  const hue = paletteColor(color);
  return compose(`skill|${id}|${hue}|${ready ? 1 : 0}|${rows}`, BADGE, BADGE, (ctx) => {
    paintRows(ctx, SQUARE_PLATE, { o: UI.ink, R: ready ? hue : UI.dusk, f: UI.night });
    if (rows > 0) {
      ctx.fillStyle = UI.dusk;
      ctx.fillRect(2, 14 - rows, 12, rows);
      ctx.fillStyle = UI.steel;
      ctx.fillRect(2, 14 - rows, 12, 1);
    }
    const def = SKILL_SIGNS[id];
    if (def) ctx.drawImage(spriteOf(`skill:${id}`, def, !ready).canvas, 2, 2);
  });
}

/**
 * A boss's medallion for the end of its bar, 16×16: the disc in old blood
 * and bronze, and the boss's sign. `name` is the first part of the bar's
 * name ("ANKHOR"); an unknown name gets a plain star.
 */
export function bossMedallion(name: string): HTMLCanvasElement {
  return compose(`boss|${name}`, BADGE, BADGE, (ctx) => {
    paintRows(ctx, ROUND_PLATE, { o: UI.ink, R: UI.blood, f: '#1c121c' });
    ROUND_RING.forEach(([x, y]) => {
      ctx.fillStyle = x + y < 15 ? '#bf6f4a' : '#8a4836';
      ctx.fillRect(x, y, 1, 1);
    });
    const sign = BOSS_SIGN_OF[name] ?? 'star';
    const def = sign.startsWith('relic:') ? RELIC_SIGNS[sign.slice(6)] : BOSS_SIGNS[sign];
    if (def) ctx.drawImage(spriteOf(sign.startsWith('relic:') ? sign : `boss:${sign}`, def, false).canvas, 2, 2);
  });
}

/* ================================================================ marks */

/** A ring of nine pixels across, for the marks under a boss bar. */
const PIP_RING = [
  '..RRRRR..',
  '.R.....R.',
  'R.......R',
  'R.......R',
  'R.......R',
  'R.......R',
  'R.......R',
  '.R.....R.',
  '..RRRRR..',
];
const PIP_RING_ORDER = ringOrder(PIP_RING);

/** A head still standing: a disc in its colour, an eye in it. */
const PIP_HEAD = [
  '.........',
  '...abb...',
  '..awbbc..',
  '.aabbocc.',
  '.abbbbcc.',
  '.bbbbccd.',
  '..bbccd..',
  '...cdd...',
  '.........',
];

/** A stump: what is left of the neck, small, inside its countdown. */
const PIP_STUMP = [
  '.........',
  '.........',
  '...ooo...',
  '..oaabo..',
  '..oabco..',
  '..obcco..',
  '...ooo...',
  '.........',
  '.........',
];

/** Burned out: a cold ring with a cross of ash through it. */
const PIP_SEALED = [
  '.........',
  '.........',
  '..x...x..',
  '...x.x...',
  '....x....',
  '...x.x...',
  '..x...x..',
  '.........',
  '.........',
];

/** The ramp a palette colour sits in, from one step lighter to two darker. */
function rampAround(hex: string): string[] {
  for (const ramp of Object.values(R) as Ramp[]) {
    const i = ramp.indexOf(hex);
    if (i < 0) continue;
    return [ramp[Math.max(0, i - 1)], ramp[i], ramp[Math.min(ramp.length - 1, i + 1)], ramp[Math.min(ramp.length - 1, i + 2)]];
  }
  return [hex, hex, hex, hex];
}

export const PIP = 9;

/**
 * One mark under a boss bar, 9×9: a head still to cut (in its colour), a stump
 * with the seconds it has left as a ring that empties - gone urgent red in its
 * last third - or a burned-out ring.
 */
export function pipIcon(kind: 'head' | 'stump' | 'sealed', color: string, left: number): HTMLCanvasElement {
  const hue = paletteColor(color);
  const steps = Math.round(Math.max(0, Math.min(1, left)) * PIP_RING_ORDER.length);
  const urgent = left < 0.34;
  return compose(`pip|${kind}|${hue}|${kind === 'stump' ? steps : 0}|${urgent && kind === 'stump' ? 1 : 0}`, PIP, PIP, (ctx) => {
    const [a, b, c, d] = rampAround(hue);
    if (kind === 'head') {
      paintRows(ctx, outlined(PIP_HEAD), { o: UI.ink, w: '#ffffff', a, b, c, d });
    } else if (kind === 'stump') {
      // In the colour of what fell - the hydra's green, a twin's own light -
      // and the ring gone red in its last third.
      PIP_RING_ORDER.forEach(([x, y], i) => {
        ctx.fillStyle = i < steps ? (urgent ? UI.roseLight : a) : UI.dusk;
        ctx.fillRect(x, y, 1, 1);
      });
      paintRows(ctx, PIP_STUMP, { o: UI.ink, a, b, c });
    } else {
      paintRows(ctx, PIP_RING, { R: UI.steel });
      paintRows(ctx, PIP_SEALED, { x: '#c64524' });
    }
  });
}

/** A stud of bronze to end a bar with: 7×7, a diamond. */
const STUD = ['.......', '...a...', '..abb..', '.abbbc.', '..bcc..', '...c...', '.......'];

export function studIcon(): HTMLCanvasElement {
  return spriteOf('stud', { rows: STUD, key: { a: '#e69c69', b: '#bf6f4a', c: '#8a4836' } }, false).canvas;
}

/* ================================================================ keys */

export const KEY_H = 10;

/**
 * A key cap with its name on it, 10 pixels tall: a steel face lit along its
 * top and left, the darker front edge of the key under it, the ink line round
 * it with its corners cut, and the name in the small font with a pixel of
 * air round it.
 */
export function keyCap(label: string, color: string = UI.cream): HTMLCanvasElement {
  const w = Math.max(KEY_H, textWidth(label, { font: 'small' }) + 6);
  const h = KEY_H;
  return compose(`key|${label}|${color}`, w, h, (ctx) => {
    ctx.fillStyle = UI.steel;
    ctx.fillRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = UI.mist;
    ctx.fillRect(1, 1, w - 2, 1);
    ctx.fillRect(1, 1, 1, h - 3);
    ctx.fillStyle = UI.dusk;
    ctx.fillRect(1, h - 2, w - 2, 1);
    ctx.fillRect(w - 2, 2, 1, h - 3);
    ctx.fillStyle = UI.ink;
    ctx.fillRect(1, 0, w - 2, 1);
    ctx.fillRect(1, h - 1, w - 2, 1);
    ctx.fillRect(0, 1, 1, h - 2);
    ctx.fillRect(w - 1, 1, 1, h - 2);
    ctx.setTransform(1 / ART, 0, 0, 1 / ART, 0, 0);
    // The small font's letters stand one row into their line box: rows 3-7.
    text(ctx, label, 3, 2, { font: 'small', color });
  });
}

/** For the specimen sheet and the checks: every sign by family. */
export const SIGNS = { relic: RELIC_SIGNS, skill: SKILL_SIGNS, boss: BOSS_SIGNS };
