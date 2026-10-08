/**
 * What a boss leaves behind.
 *
 * Every boss on the road gives the hero something to keep, for the rest of the
 * run. It used to be three of nine: Gallert's heart, Thalassa's water and the
 * Prismarch's light. Ankhor, Ignivor and Vesperon only filled the hearts back
 * up, and the knight, the warden and the hydra opened a door and nothing more -
 * a fight that pays nothing is a fight that is only in the way.
 *
 * Each relic is one thing the hero can do, or one thing that saves him, and
 * the ones that save him all come with a condition: a shield that has to grow
 * back, blood that has to be drawn first, a second breath once per life. And
 * the monsters take stock of them - see mightOf below - so that eleven relics
 * make a hero who plays differently, not one who walks through everything.
 */

export type RelicId =
  | 'herzkern'
  | 'keilerhaut'
  | 'goldzahn'
  | 'gauklerschritt'
  | 'bebenfaust'
  | 'lichtkern'
  | 'seidenmantel'
  | 'glutklinge'
  | 'zwillingsstern'
  | 'flutklinge'
  | 'steinblick'
  | 'taktgeber'
  | 'blutdurst'
  | 'schattenschritt'
  | 'zweiteratem'
  | 'splitterparade'
  | 'hydrablut'
  | 'klingenwelle';

export interface Relic {
  id: RelicId;
  /** The name on the banner, in the pause list and under the icon. */
  name: string;
  /** One line of what it does, for the pause list. */
  text: string;
  /** What goes up on the banner the moment it is taken. */
  banner: string;
  /** Its colour on the HUD. */
  color: string;
  /** Who it comes from. */
  from: string;
  /** What it adds to the hero, as the monsters reckon it. See mightOf. */
  offense: number;
  defense: number;
}

/** In the order the road hands them out. */
export const RELICS: readonly Relic[] = [
  {
    id: 'herzkern',
    name: 'Herzkern',
    text: 'Ein Herz mehr, für den ganzen Lauf.',
    banner: 'HERZKERN — EIN HERZ MEHR',
    color: '#ff6b86',
    from: 'Gallert',
    offense: 0,
    // Every fight after the bog was built against seven hearts, so the heart
    // the bog gives is the baseline rather than a step above it.
    defense: 0,
  },
  {
    id: 'keilerhaut',
    name: 'Keilerhaut',
    text: 'Treffer werfen dich kaum noch zurück und bringen dich nicht mehr ins Taumeln.',
    banner: 'KEILERHAUT — DU STEHST FEST',
    color: '#c8946a',
    from: 'Grimmzahn',
    offense: 0,
    // A blow that does not throw him off his feet costs him no swing and no
    // footing - worth something, not a heart.
    defense: 0.04,
  },
  {
    id: 'goldzahn',
    name: 'Goldzahn',
    text: 'Jeder zehnte Edelstein bringt ein Herz zurück.',
    banner: 'GOLDZAHN — EDELSTEINE HEILEN',
    color: '#f2c14e',
    from: 'Gierschlund',
    offense: 0,
    defense: 0.05,
  },
  {
    id: 'gauklerschritt',
    name: 'Gauklerschritt',
    text: 'Rollst du durch einen Angriff hindurch, trifft dein nächster Hieb doppelt.',
    banner: 'GAUKLERSCHRITT — AUSWEICHEN SCHÄRFT',
    color: '#d9a8ff',
    from: 'Maskarill',
    // Paid for with a roll through something that would have hit, so it
    // comes up a few times a fight, not every swing: measured, see verify:relics.
    offense: 0.04,
    defense: 0.02,
  },
  {
    id: 'bebenfaust',
    name: 'Bebenfaust',
    text: 'Der Ladeschlag lädt schneller und schickt eine Schockwelle los.',
    banner: 'BEBENFAUST — DER LADESCHLAG BEBT',
    color: '#e8c27a',
    from: 'Ankhor',
    offense: 0.06,
    defense: 0,
  },
  {
    id: 'lichtkern',
    name: 'Lichtkern',
    text: 'Ein verlorenes Herz fällt als Licht zu Boden: Heb es auf, bevor es erlischt, und es ist wieder deins.',
    banner: 'LICHTKERN — VERLORENES LICHT KEHRT ZURÜCK',
    color: '#fff0a8',
    from: 'Nyktos',
    offense: 0,
    // Only what is picked up comes back, and only one heart a blow.
    defense: 0.08,
  },
  {
    id: 'seidenmantel',
    name: 'Seidenmantel',
    text: 'Fängt einen Treffer ab und webt sich nach zwölf ruhigen Sekunden neu.',
    banner: 'SEIDENMANTEL — EIN TREFFER PRALLT AB',
    color: '#d8e6f2',
    from: 'Arachna',
    offense: 0,
    defense: 0.12,
  },
  {
    id: 'glutklinge',
    name: 'Glutklinge',
    text: 'Abschlusshieb und Ladeschlag treffen mit Glut: ein Schaden mehr.',
    banner: 'GLUTKLINGE — SCHWERE HIEBE BRENNEN',
    color: '#ff8a3a',
    from: 'Ignivor',
    offense: 0.25,
    defense: 0,
  },
  {
    id: 'zwillingsstern',
    name: 'Zwillingsstern',
    text: 'Jede gelungene Parade macht deinen gewählten Boss-Angriff sofort wieder bereit.',
    banner: 'ZWILLINGSSTERN — PARADEN LADEN NACH',
    color: '#e3d6ff',
    from: 'Sol und Luna',
    // It only works on the boss attacks, and the monsters do not reckon those
    // (see skills.ts) - so they do not reckon this either.
    offense: 0,
    defense: 0,
  },
  {
    id: 'flutklinge',
    name: 'Flutklinge',
    text: 'Jeder Hieb wirft eine kurze Sichel aus Wasser voraus.',
    banner: 'FLUTKLINGE — JEDER HIEB SCHNEIDET WEITER',
    color: '#7fe3cd',
    from: 'Thalassa',
    offense: 0.22,
    defense: 0,
  },
  {
    id: 'steinblick',
    name: 'Steinblick',
    text: 'Was auf dich zufliegt, während du es ansiehst, fliegt ein Drittel langsamer.',
    banner: 'STEINBLICK — DEIN BLICK BREMST',
    color: '#b8c2d0',
    from: 'Grauwacht',
    offense: 0,
    defense: 0.05,
  },
  {
    id: 'taktgeber',
    name: 'Taktgeber',
    text: 'Deine Boss-Angriffe laden ein Drittel schneller nach.',
    banner: 'TAKTGEBER — ANGRIFFE LADEN SCHNELLER',
    color: '#f0c27a',
    from: 'Tickmar',
    // Like the Zwillingsstern: it only hurries the boss attacks along.
    offense: 0,
    defense: 0,
  },
  {
    id: 'blutdurst',
    name: 'Blutdurst',
    text: 'Je sechzehn Schaden, die du austeilst, bringen ein Herz zurück.',
    banner: 'BLUTDURST — TREFFER HEILEN',
    color: '#e0304e',
    from: 'Vesperon',
    offense: 0,
    defense: 0.15,
  },
  {
    id: 'schattenschritt',
    name: 'Schattenschritt',
    text: 'Zwei Ausweichrollen hintereinander, auch in der Luft.',
    banner: 'SCHATTENSCHRITT — ZWEI ROLLEN',
    color: '#9a86e8',
    from: 'Morvain',
    offense: 0,
    defense: 0.06,
  },
  {
    id: 'zweiteratem',
    name: 'Zweiter Atem',
    text: 'Einmal pro Leben bleibt ein tödlicher Schlag bei einem Herz stehen.',
    banner: 'ZWEITER ATEM — EINMAL PRO LEBEN',
    color: '#c9b8ff',
    from: 'Umbra',
    offense: 0,
    defense: 0.1,
  },
  {
    id: 'splitterparade',
    name: 'Splitterparade',
    text: 'Das Paradefenster ist länger, und jede Parade wirft drei Splitter.',
    banner: 'SPLITTERPARADE — DIE PARADE SCHIESST',
    color: '#c79bff',
    from: 'Splitterwächter',
    offense: 0.04,
    defense: 0.04,
  },
  {
    id: 'hydrablut',
    name: 'Hydrablut',
    text: 'Alle achtzehn Sekunden wächst ein verlorenes Herz nach.',
    banner: 'HYDRABLUT — HERZEN WACHSEN NACH',
    color: '#8fd45c',
    from: 'Die Fünfkronige',
    offense: 0,
    defense: 0.1,
  },
  {
    id: 'klingenwelle',
    name: 'Klingenwelle',
    text: 'Die Sichel fliegt doppelt so weit und trifft so hart wie der Hieb.',
    banner: 'KLINGENWELLE — JEDER HIEB SCHIESST',
    color: '#8fe8ff',
    from: 'Prismarch',
    offense: 0.22,
    defense: 0,
  },
];

export function relic(id: RelicId): Relic {
  const found = RELICS.find((r) => r.id === id);
  if (!found) throw new Error(`no relic ${id}`);
  return found;
}

/**
 * How strong the hero has become, as a monster reckons it. 1 is a bare sword.
 *
 * The offence figures are measured, not guessed: a hero swinging at a pinned
 * target for twenty seconds deals 3.7 a second with the sword alone and 4.6
 * with Ignivor's ember in the heavy cuts (+25 %); Ankhor's fist adds about a
 * fifth to the heavy strike and nothing to the combo. The two blades keep the
 * figures they were tuned with: their crescent lands on top of the cut it is
 * thrown from, which is worth a good deal more than 22 % up close - and the
 * fights after Thalassa were built and measured with exactly that.
 */
export interface Might {
  /** How much faster he takes a monster apart. */
  offense: number;
  /** How much more he can take before he goes down. */
  defense: number;
}

export function mightOf(relics: ReadonlySet<RelicId>): Might {
  let offense = 1;
  let defense = 1;
  for (const r of RELICS) {
    if (!relics.has(r.id)) continue;
    offense += r.offense;
    defense += r.defense;
  }
  return { offense, defense };
}

/** Gems per heart, for the Goldzahn. */
export const GOLD_PER_HEART = 10;
/** Damage dealt per heart, for Blutdurst. */
export const BLOOD_PER_HEART = 16;
/** Quiet seconds before the Seidenmantel has grown back. */
export const SILK_REGROW = 12;
/** Seconds per heart for Hydrablut. */
export const HYDRA_REGROW = 18;
/** How much faster the boss attacks come back with the Taktgeber: a third. */
export const TAKT_PACE = 4 / 3;
/** How long a heart lost with the Lichtkern lies glowing before it goes out. */
export const LIGHT_MOTE_LIFE = 3;
/** How much slower what the hero looks at flies, with the Steinblick: a third. */
export const STONE_GAZE_PACE = 2 / 3;
/** How long a roll through an attack keeps the next blow doubled, with the Gauklerschritt. */
export const TUMBLE_TIME = 3;
