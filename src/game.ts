import { audio, type TrackName } from './core/audio';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { clamp, rand } from './core/math';
import { Boss } from './entities/boss';
import {
  BOSS_KINDS,
  Enemy,
  EnemyKind,
  Gallert,
  Hydra,
  Prismarch,
  Thalassa,
  Warden,
} from './entities/enemy';
import { createEnemy } from './entities/roster';
import { MovingPlatform } from './entities/platform';
import { Checkpoint, Pickup } from './entities/pickup';
import { PLAYER_MAX_HP, Player } from './entities/player';
import { Portal } from './entities/portal';
import { Projectile } from './entities/projectile';
import { BLOOD_PER_HEART, GOLD_PER_HEART, HYDRA_REGROW, RELICS, SILK_REGROW, type RelicId, relic } from './entities/relics';
import { SKILLS, SNARE_PACE, SNARE_PACE_BOSS, drawSnare, skillForRelic, skillInfo } from './entities/skills';
import { Particles } from './fx/particles';
import { Background } from './render/background';
import { Decor } from './render/decor';
import { Spores } from './render/atmosphere';
import { LightPass, type Light } from './render/lighting';
import { drawEdgeLight } from './render/rims';
import { Scatter } from './render/scatter';
import { PALETTE, mixHex, zoneAt, zoneBlend } from './render/palette';
import { glow } from './render/sprites';
import { drawTilemap } from './render/tilemap';
import { drawBossBar, drawHeart, drawPanel, drawRelicBadge, drawSkillBadge, drawTextCentered, font } from './ui/hud';
import type { World } from './world/context';
import { Arena, Level } from './world/level';
import { TILE, Tile } from './world/tiles';

const TILE_LAVA_TOP = Tile.LavaTop;

/**
 * Handed to the hero while the gate is closing around him. The run is decided
 * at that point, and a held key must not be able to walk him off the ledge
 * behind the portal and turn a finished run into a death.
 */
const NO_INPUT = new Input();

export const VIEW_W = 960;
export const VIEW_H = 540;

export type GameState = 'title' | 'playing' | 'paused' | 'dead' | 'victory';

interface SpawnRecord {
  kind: EnemyKind;
  x: number;
  y: number;
}

/** What goes up over the arena when its wards come down. */
const ARENA_TITLES: Partial<Record<EnemyKind, string>> = {
  gallert: 'GALLERT, DER AUFGEQUOLLENE',
  thalassa: 'THALASSA, DIE ERTRUNKENE KRONE',
  warden: 'DER SPLITTERWÄCHTER',
  colossus: 'ANKHOR, DER TEMPELKOLOSS',
  wyrm: 'IGNIVOR, DER GLUTWURM',
  vesper: 'VESPERON, DER BLUTFÜRST',
  mimic: 'GIERSCHLUND, DIE GIERIGE TRUHE',
  spider: 'ARACHNA, DIE NETZKÖNIGIN',
  shadow: 'UMBRA, DEIN SCHATTEN',
};

/** The fight each boss is fought to. */
const BOSS_TRACK: Partial<Record<EnemyKind, TrackName>> = {
  gallert: 'boss',
  warden: 'boss',
  thalassa: 'bossTide',
  colossus: 'bossStone',
  wyrm: 'bossFire',
  vesper: 'bossBlood',
  hydra: 'bossHydra',
  prismarch: 'bossCrystal',
  mimic: 'bossGold',
  spider: 'bossWeb',
  shadow: 'bossShadow',
};

/**
 * What each boss leaves, and what is said over it. The words come first and
 * the relic once they have been read, the way the bog and the drowned crown
 * always did it: a reward handed over without a word reads as a number going
 * up, not as something taken from the one who held it.
 */
interface BossRelic {
  relic: RelicId;
  /** Over the arena as it falls, before anything is said. */
  fell: string;
  speaker: string;
  lines: string[];
}

const BOSS_RELIC: Record<string, BossRelic> = {
  gallert: {
    relic: 'herzkern',
    fell: 'GALLERT ZERFLIESST',
    speaker: 'DAS MOOR',
    lines: [
      'Was hier zusammengelaufen ist, war einmal alles, was in mir gestorben ist.',
      'Du hast es auseinandergenommen. Der Kern gehört jetzt dir.',
      'Er schlägt weiter — in deiner Brust, nicht in seiner.',
    ],
  },
  mimic: {
    relic: 'goldzahn',
    fell: 'GIERSCHLUND IST LEER',
    speaker: 'DIE SCHATZKAMMER',
    lines: [
      'Alles, was in diese Kammer kam, hat er gefressen: Gold, Steine, Diebe.',
      'Ein Zahn aus Gold ist von ihm übrig, und der hungert noch immer.',
      'Füttere ihn mit Edelsteinen. Jeder zehnte gibt dir ein Herz zurück.',
    ],
  },
  colossus: {
    relic: 'bebenfaust',
    fell: 'ANKHOR ZERFÄLLT',
    speaker: 'DAS TEMPELHERZ',
    lines: [
      'Solange der Tempel steht, hat er diesen Hof gehalten, ohne einen Schritt zu tun.',
      'Seine Faust ist zersprungen. Was in ihr war, liegt jetzt in deiner.',
      'Halte den Schlag, bis er voll ist — dann bebt der Boden für dich.',
    ],
  },
  spider: {
    relic: 'seidenmantel',
    fell: 'ARACHNA STÜRZT',
    speaker: 'DIE NETZKAMMER',
    lines: [
      'Jeden Faden in dieser Höhle hat sie selbst gesponnen.',
      'Der letzte gehört dir: ein Mantel, so fein, dass man ihn kaum sieht.',
      'Er fängt einen Schlag ab — und webt sich neu, wenn du ihm Ruhe lässt.',
    ],
  },
  wyrm: {
    relic: 'glutklinge',
    fell: 'IGNIVOR ERLISCHT',
    speaker: 'DIE GLUTKAMMER',
    lines: [
      'Das Feuer, das in ihm lief, sucht sich einen neuen Weg.',
      'Es nimmt den durch deine Klinge.',
      'Der dritte Hieb und der Ladeschlag treffen von nun an mit Glut.',
    ],
  },
  thalassa: {
    relic: 'flutklinge',
    fell: 'THALASSA VERSINKT',
    speaker: 'DIE ERTRUNKENE KRONE',
    lines: [
      'Tausend Jahre habe ich das Wasser dieser Halle gehalten.',
      'Nimm es. Halten kann ich es nicht mehr.',
      'Jeder deiner Hiebe wirft von nun an ein Stück davon voraus —',
      'kurz, aber weiter als ein Schwert reicht.',
    ],
  },
  vesper: {
    relic: 'blutdurst',
    fell: 'VESPERON ZERSTIEBT',
    speaker: 'DER BLUTTURM',
    lines: [
      'Hundert Jahre hat er vom Blut anderer gelebt.',
      'Jetzt lebt sein Durst in dir.',
      'Was deine Klinge austeilt, kommt dir als Herz zurück.',
    ],
  },
  knight: {
    relic: 'schattenschritt',
    fell: 'DAS SIEGEL BRICHT',
    speaker: 'MORVAINS SCHATTEN',
    lines: [
      'Ich habe diesen Thron gehalten, bis einer kam, der schneller war als ich.',
      'Nimm meinen Schritt. Im Riss wirst du ihn brauchen.',
      'Zwei Rollen ohne Atem dazwischen — auch in der Luft.',
    ],
  },
  shadow: {
    relic: 'zweiteratem',
    fell: 'DEIN SCHATTEN WEICHT',
    speaker: 'DEIN SCHATTEN',
    lines: [
      'Ich war alles, was du geworden wärst, wenn du stehen geblieben wärst.',
      'Jetzt stehe ich hinter dir.',
      'Wenn dich etwas fällen will, fange ich es auf. Einmal in jedem Leben.',
    ],
  },
  warden: {
    relic: 'splitterparade',
    fell: 'DER SPLITTERWÄCHTER ZERSPRINGT',
    speaker: 'DER RISS',
    lines: [
      'Was an Stelle des Ritters gewachsen ist, liegt in Splittern.',
      'Sie sammeln sich an deiner Klinge.',
      'Eine Parade hält jetzt länger — und wirft sie zurück.',
    ],
  },
  hydra: {
    relic: 'hydrablut',
    fell: 'DAS TOR IST OFFEN',
    speaker: 'DER SCHLUND',
    lines: [
      'Fünf Hälse, und jeder wuchs nach — bis du ihr eigenes Feuer gegen sie gewendet hast.',
      'Ihr Blut wächst jetzt in dir nach.',
      'Was du verlierst, kommt mit der Zeit zurück. Und das Tor ist offen.',
    ],
  },
};

/** And the piece each zone is walked to. */
const ZONE_TRACK: Record<string, TrackName> = {
  forest: 'forest',
  ruins: 'ruins',
  caverns: 'caverns',
  drowned: 'drowned',
  castle: 'castle',
  throne: 'throne',
  rift: 'rift',
  riftend: 'rift',
  lair: 'lair',
  crystalworld: 'crystal',
};

export class Game implements World {
  readonly level = new Level();
  readonly particles = new Particles();
  readonly camera = new Camera(VIEW_W, VIEW_H);
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly pickups: Pickup[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly platforms: MovingPlatform[] = [];
  readonly decor: Decor[] = [];
  readonly background = new Background(VIEW_W, VIEW_H);
  private readonly lightPass = new LightPass(VIEW_W, VIEW_H);
  private readonly spores = new Spores(VIEW_W, VIEW_H);
  private readonly scatter = new Scatter(this.level);
  private readonly castLayer = Game.makeLayer();
  private readonly castCtx = this.castLayer.getContext('2d') as CanvasRenderingContext2D;

  player: Player;
  boss: Boss | null = null;
  portal: Portal | null = null;
  /**
   * Lines waiting on screen. While this is set the world is frozen: the point
   * of a dialogue is that it is read, and a hero who can still walk during it
   * is a hero who walks off the ledge while you read.
   */
  dialogue: { speaker: string; lines: string[]; index: number; after: () => void } | null = null;
  /** True once the crystal hall has been opened, so it is offered only once. */
  private bonusOffered = false;
  /** True while the hero is behind the world, fighting the Prismarch. */
  inCrystalWorld = false;
  /** Where to put him back down, and which checkpoint was his before. */
  private returnTo: { x: number; y: number; cpX: number; cpY: number } | null = null;
  private trueEnding = false;
  /** Stays true once the knight has fallen, across deaths in the rift. */
  bossDefeated = false;

  state: GameState = 'title';
  time = 0;
  playTime = 0;
  score = 0;
  deaths = 0;
  gems = 0;
  totalGems = 0;

  private hitStopTimer = 0;
  private deathTimer = 0;
  private victoryTimer = 0;
  private bossIntro = 0;
  private bossGhostHp = 0;
  /** The banner across the top; `sub` is a smaller second line under it. */
  private zoneBanner: { text: string; timer: number; sub?: string } = { text: '', timer: 0 };
  /** Which list the pause screen shows: the relics, or the boss attacks. */
  private pausePage: 'relics' | 'skills' = 'relics';
  private currentZone = '';
  private titlePulse = 0;
  private readonly enemySpawns: SpawnRecord[] = [];
  /** Spawn keys of the bosses that have been beaten. They do not come back. */
  private readonly felledBosses = new Set<string>();
  /** The boss each warded arena belongs to, by spawn key, arena for arena. */
  private readonly arenaKeys: (string | null)[] = [];
  private readonly collected = new Set<string>();
  private checkpointX: number;
  private checkpointY: number;
  private flashWhite = 0;
  private ambientTimer = 0;

  constructor() {
    const start = this.level.spawns.find((s) => s.kind === 'player');
    const px = (start?.tx ?? 2) * TILE;
    const py = (start?.ty ?? 2) * TILE - 2;
    this.player = new Player(px, py);
    this.checkpointX = px;
    this.checkpointY = py;
    this.buildFromSpawns();
    this.camera.worldBounds = { w: this.level.pixelWidth, h: this.level.pixelHeight };
    this.camera.snapTo(this.player.cx, this.player.cy);
    this.currentZone = zoneAt(this.player.cx).label;
    try {
      if (localStorage.getItem('shadowblade.motion') === '0') this.camera.motion = 0;
    } catch {
      // See setMotion: no storage is not an error here.
    }
  }

  /** Offscreen layer at view resolution, used for compositing whole passes. */
  private static makeLayer(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    return canvas;
  }

  private buildFromSpawns(): void {
    for (const spawn of this.level.spawns) {
      const x = spawn.tx * TILE;
      const y = spawn.ty * TILE;
      switch (spawn.kind) {
        case 'slime':
        case 'bat':
        case 'skeleton':
        case 'mage':
        case 'bomber':
        case 'shieldman':
        case 'charger':
        case 'gallert':
        case 'hydra':
        case 'warden':
        case 'thalassa':
        case 'prismarch':
        case 'colossus':
        case 'wyrm':
        case 'vesper':
        case 'mimic':
        case 'spider':
        case 'shadow':
          this.enemySpawns.push({ kind: spawn.kind, x, y });
          break;
        case 'boss':
          this.boss = new Boss(x - 16, y - 60);
          break;
        case 'portal':
          this.portal = new Portal(x - 6, y + TILE - 62);
          break;
        case 'gem':
          this.pickups.push(new Pickup('gem', x + 8, y + 8));
          this.totalGems++;
          break;
        case 'heart':
          this.pickups.push(new Pickup('heart', x + 6, y + 8));
          break;
        case 'checkpoint':
          this.checkpoints.push(new Checkpoint(x + 4, y + TILE - 56));
          break;
        case 'torch': {
          const ground = this.distanceToGround(spawn.tx, spawn.ty, 4);
          if (ground !== null) {
            this.decor.push(new Decor('torch', x + 8, y + TILE - 12 - ground, 'ground', ground + 4));
          } else {
            const ceiling = this.distanceToCeiling(spawn.tx, spawn.ty, 8) ?? 24;
            this.decor.push(new Decor('torch', x + 8, y + 12, 'hanging', ceiling + 12));
          }
          break;
        }
        case 'crystal': {
          const ground = this.distanceToGround(spawn.tx, spawn.ty, 6);
          if (ground !== null) {
            this.decor.push(new Decor('crystal', x, y + TILE - 30 + ground, 'ground'));
          } else {
            const ceiling = this.distanceToCeiling(spawn.tx, spawn.ty, 6) ?? 0;
            this.decor.push(new Decor('crystal', x, y - ceiling, 'hanging'));
          }
          break;
        }
        case 'moverH':
          this.platforms.push(new MovingPlatform('h', x, y, TILE * 3.5, 0.28, Math.random()));
          break;
        case 'moverV':
          this.platforms.push(new MovingPlatform('v', x, y, TILE * 3, 0.3, Math.random()));
          break;
        default:
          break;
      }
    }
    for (const arena of this.level.arenas) {
      const rec = this.enemySpawns.find((r) => BOSS_KINDS.has(r.kind) && r.x >= arena.left && r.x < arena.right);
      this.arenaKeys.push(rec ? Game.keyOf(rec) : null);
    }
    this.spawnEnemiesFresh();
    this.pickups.forEach((pickup, i) => (pickup.id = `p${i}`));
  }

  private static keyOf(rec: SpawnRecord): string {
    return `${rec.kind}@${rec.x},${rec.y}`;
  }

  /** Pixels down to the first solid tile below a spawn tile, or null. */
  private distanceToGround(tx: number, ty: number, maxTiles: number): number | null {
    for (let i = 1; i <= maxTiles; i++) {
      if (this.level.solidAt(tx, ty + i)) return (i - 1) * TILE;
    }
    return null;
  }

  /** Pixels up to the first solid tile above a spawn tile, or null. */
  private distanceToCeiling(tx: number, ty: number, maxTiles: number): number | null {
    for (let i = 1; i <= maxTiles; i++) {
      if (this.level.solidAt(tx, ty - i)) return (i - 1) * TILE;
    }
    return null;
  }

  /**
   * The level's roster, built from scratch. Ordinary enemies come back with
   * every checkpoint - that is what a checkpoint is - but a boss that has
   * fallen stays fallen. It used to come back with them: dying anywhere in the
   * world put Thalassa, the warden and the Prismarch back on their feet, boss
   * bar and all, because this ran on every respawn. Only the knight was spared,
   * and only because he is not in this list.
   */
  private spawnEnemiesFresh(): void {
    this.enemies.length = 0;
    for (const rec of this.enemySpawns) {
      const key = Game.keyOf(rec);
      if (this.felledBosses.has(key)) continue;
      const enemy = createEnemy(rec.kind, rec.x, rec.y);
      enemy.spawnKey = key;
      // Anchor ground-bound enemies on the floor of their tile.
      if (rec.kind !== 'bat' && rec.kind !== 'mage' && rec.kind !== 'vesper') enemy.y = rec.y + TILE - enemy.h;
      this.enemies.push(enemy);
    }
  }

  /* --------------------------------------------------------- World hooks */

  hitStop(seconds: number): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, seconds);
  }

  addScore(points: number, x: number, y: number, label?: string): void {
    this.score += points;
    if (label) this.particles.text(x, y, label, PALETTE.gold);
  }

  spawnEnemy(enemy: Enemy): void {
    enemy.harden(this.player.relics);
    this.enemies.push(enemy);
  }

  /**
   * Places one enemy of a kind with its feet on a given floor line.
   *
   * Used by the verification tools to stage a single fight on known ground -
   * the same reason Input.forceDown exists. Measuring what one enemy does is
   * otherwise a matter of walking to wherever the level happens to put one.
   */
  spawnEnemyOfKind(kind: EnemyKind, x: number, floorTop: number): Enemy {
    const enemy = createEnemy(kind, x, floorTop);
    enemy.y = floorTop - enemy.h;
    enemy.active = true;
    this.enemies.push(enemy);
    return enemy;
  }

  spawnProjectile(projectile: Projectile): void {
    this.projectiles.push(projectile);
  }

  onBossEngaged(): void {
    this.level.gateClosed = true;
    audio.play('wardClose', 0.8);
    this.bossIntro = 3;
    this.zoneBanner = { text: 'SCHATTENRITTER MORVAIN', timer: 3 };
    this.camera.addShake(8);
  }

  onBossDefeated(): void {
    // The knight's fall is not the end any more: it breaks the seal behind the
    // throne and opens the road into the rift.
    this.level.gateClosed = false;
    this.level.exitSealed = false;
    this.bossDefeated = true;
    this.flashWhite = 1;
    this.zoneBanner = { text: 'DAS SIEGEL BRICHT', timer: 3.4 };
    audio.play('bossDown');
    audio.play('victory');
    this.camera.addShake(10);
    this.player.heal(this.player.maxHp);
    // His words come once the seal has had its moment: a dialogue on top of
    // the break would freeze the shake mid-swing and cover the very thing the
    // player is watching.
    this.queueRelic('knight', 1.6);
  }

  /**
   * The Prismarch falls. That is the end of the longer road, so it ends the run
   * outright rather than sending the hero back through the gate.
   */
  /**
   * The Prismarch falls. This is not the end of the run: the shards of its
   * heart go into the blade, and the hero is put back where he was taken from,
   * so the reward can actually be used on the rest of the world.
   */
  onCrystalBossDefeated(): void {
    if (this.trueEnding || this.state !== 'playing') return;
    this.trueEnding = true;
    this.score += 5000;
    this.flashWhite = 1;
    this.zoneBanner = { text: 'DAS HERZ ZERSPRINGT', timer: 3.4 };
    this.camera.addShake(10);
    audio.play('victory');
    this.player.vx = 0;
    this.player.vy = 0;
    this.dialogue = {
      speaker: 'DAS HERZ DES KRISTALLS',
      lines: [
        'Du hast mich zerschlagen. Also gehören mir meine Splitter nicht mehr.',
        'Sie liegen jetzt in deiner Klinge — nimm sie mit.',
        this.player.beamTier > 0
          ? 'Was die Krone dir gab, reicht damit doppelt so weit und schneidet tiefer.'
          : 'Jeder Hieb wirft von nun an eine Welle aus Licht voraus.',
        'Und du gehst zurück. Was du begonnen hast, ist nicht hier zu beenden.',
      ],
      index: 0,
      after: () => this.leaveCrystalWorld(),
    };
  }

  /** Said once each: what a cut neck does, and what closes one. */
  private hydraToldAboutRegrowth = false;
  private hydraToldAboutSealing = false;
  private hydraToldAboutFire = false;

  /** The one fight on the road that cannot be walked past - see the portal. */
  private get hydraStillGuarding(): boolean {
    return this.enemies.some((e) => e instanceof Hydra && !e.dead);
  }

  /**
   * She wakes, and her lair shuts at both ends - the same deal the throne room
   * offers. Her door is her own (Tile.LairGate), not the knight's: waking one
   * boss must not slam the other one's room.
   */
  onHydraEngaged(): void {
    this.level.lairClosed = true;
    audio.play('wardClose', 0.7);
    this.zoneBanner = { text: 'DIE FÜNFKRONIGE', timer: 3.4 };
    this.camera.addShake(8);
  }

  /**
   * The first neck the blade takes off, and what the hero has to be told: steel
   * alone does not finish a hydra. Said once, on the cut that teaches it, and
   * never again - a banner that fires five times is wallpaper.
   */
  onHydraNeckCut(wasTheFire: boolean): void {
    if (this.state !== 'playing') return;
    if (wasTheFire && !this.hydraToldAboutFire) {
      this.hydraToldAboutFire = true;
      this.zoneBanner = { text: 'OHNE IHR FEUER WÄCHST ALLES NACH', timer: 3.6 };
      return;
    }
    if (this.hydraToldAboutRegrowth) return;
    this.hydraToldAboutRegrowth = true;
    this.zoneBanner = { text: 'DER HALS WÄCHST NACH — BRENN IHN AUS', timer: 4.2 };
    audio.play('phase', 0.9);
  }

  /** And the first one burned shut, which is the answer. */
  onHydraNeckSealed(sealed: number): void {
    if (this.state !== 'playing') return;
    this.score += 500;
    if (!this.hydraToldAboutSealing) {
      this.hydraToldAboutSealing = true;
      this.zoneBanner = { text: 'AUSGEBRANNT — DIESER HALS BLEIBT UNTEN', timer: 3.6 };
    } else {
      this.zoneBanner = { text: `${sealed} VON 4 HÄLSEN AUSGEBRANNT`, timer: 2.2 };
    }
  }

  /**
   * The hydra's last head comes off. Her lair opens again, and so does the gate
   * home - she is the end of the road rather than an optional fight, so on top
   * of the door behind the hero she holds the one thing he came for.
   */
  onHydraDefeated(): void {
    if (this.state !== 'playing') return;
    this.level.lairClosed = false;
    audio.play('wardOpen', 0.8);
    this.score += 3000;
    this.flashWhite = 1;
    this.camera.addShake(10);
    audio.play('victory');
    this.zoneBanner = { text: 'DAS TOR IST OFFEN', timer: 4.2 };
    this.player.heal(this.player.maxHp);
    this.offerRelic('hydra');
  }

  /**
   * Gallert comes apart, at the end of the forest, and leaves the core that
   * held him together. It is worth a heart: six become seven for the rest of
   * the run, and the hero is topped up on the spot.
   */
  onMireBossDefeated(): void {
    if (this.player.has('herzkern') || this.state !== 'playing') return;
    this.flashWhite = 1;
    this.camera.addShake(7);
    audio.play('victory');
    this.offerRelic('gallert');
  }

  /**
   * An arena boss falls. Every one of them leaves something now - Ankhor,
   * Ignivor and Vesperon used to give back the hearts and nothing more, and the
   * warden gave nothing at all. The hearts still come back, and the relic comes
   * on top: see BOSS_RELIC.
   */
  onBossFelled(kind: EnemyKind, x: number, y: number): void {
    if (this.state !== 'playing') return;
    this.flashWhite = 0.9;
    this.camera.addShake(9);
    this.score += 1500;
    this.particles.text(x, y, '+1500', PALETTE.gold);
    this.player.heal(this.player.maxHp);
    this.zoneBanner = { text: BOSS_RELIC[kind]?.fell ?? 'BESIEGT', timer: 3.8 };
    audio.play('victory');
    this.offerRelic(kind);
  }

  /**
   * Thalassa falls, in the middle of the run, and what she held goes into the
   * blade: from here every swing throws a short crescent of water ahead of it.
   *
   * The upgrade used to hang entirely off the Prismarch, which meant a player
   * had to find every gem in the world to ever see it - and then had the last
   * stretch of the world left to use it on. Half of it now comes at the halfway
   * mark, and the Prismarch sharpens what is already there.
   */
  onDrownedCrownDefeated(): void {
    if (this.player.has('flutklinge') || this.state !== 'playing') return;
    this.flashWhite = 1;
    this.camera.addShake(8);
    audio.play('victory');
    this.player.heal(this.player.maxHp);
    this.offerRelic('thalassa');
  }

  /** A relic held back for a moment - see the knight. */
  private pendingRelic: { key: string; timer: number } | null = null;

  private queueRelic(key: string, delay: number): void {
    this.pendingRelic = { key, timer: delay };
  }

  /**
   * A boss has fallen: its words, then its relic. If something is already
   * being read, the words are skipped and the relic is taken at once -
   * skipping a speech is fine, silently dropping a reward is not.
   */
  private offerRelic(key: string): void {
    const info = BOSS_RELIC[key];
    if (!info || this.player.has(info.relic)) return;
    if (this.dialogue) {
      this.takeRelic(info.relic);
      return;
    }
    this.player.vx = 0;
    this.player.vy = 0;
    this.dialogue = { speaker: info.speaker, lines: info.lines, index: 0, after: () => this.takeRelic(info.relic) };
  }

  /** On the hero for good, starting now, and named on the banner. */
  takeRelic(id: RelicId): void {
    const p = this.player;
    if (p.has(id)) return;
    p.relics.add(id);
    p.onRelic(id);
    if (id === 'herzkern') {
      p.maxHp = PLAYER_MAX_HP + 1;
      p.hp = p.maxHp;
    }
    if (id === 'flutklinge' && p.beamTier < 1) p.beamTier = 1;
    if (id === 'klingenwelle') {
      // The Prismarch sharpens whatever the blade already throws - or, for a
      // hero who never had the first tier, hands him both at once.
      p.relics.add('flutklinge');
      p.beamTier = 2;
    }
    audio.play('upgrade');
    this.zoneBanner = { text: relic(id).banner, timer: 4.2 };
    // And one of its own attacks, on top: see skills.ts. Named on the same
    // banner, with the two keys that work it.
    const taught = skillForRelic(id);
    if (taught && !p.skills.has(taught.id)) {
      p.learnSkill(taught.id);
      this.zoneBanner = { text: relic(id).banner, timer: 4.2, sub: `NEUER ANGRIFF: ${taught.name.toUpperCase()}   ·   F EINSETZEN   ·   Q WECHSELN` };
    }
    this.flashWhite = 0.7;
  }

  /**
   * Every gem in the world, and the way behind it opens. The dialogue comes
   * first and the teleport only once it has been read - being pulled out of the
   * level mid-jump with no word of explanation reads as a bug, not a reward.
   */
  private offerCrystalWorld(): void {
    if (this.bonusOffered || this.inCrystalWorld || this.dialogue) return;
    this.bonusOffered = true;
    this.dialogue = {
      speaker: 'EINE STIMME AUS DEM STEIN',
      lines: [
        'Alle Splitter dieser Welt liegen in deiner Hand.',
        'Zusammen sind sie ein Schlüssel — und was sie öffnen,',
        'war nie dafür gedacht, geöffnet zu werden.',
        'Hinter der Welt wartet das Herz des Kristalls.',
        'Es weiß bereits, dass du kommst.',
      ],
      index: 0,
      after: () => this.enterCrystalWorld(),
    };
  }

  /** Puts the hero down at the near end of the crystal hall. */
  private enterCrystalWorld(): void {
    const spawn = this.level.spawns.find((s) => s.kind === 'prismarch');
    if (!spawn) return;
    const hallLeft = (spawn.tx - 30) * TILE;
    // Remembered before anything is overwritten, so there is a way back.
    this.returnTo = {
      x: this.player.x,
      y: this.player.y,
      cpX: this.checkpointX,
      cpY: this.checkpointY,
    };
    this.inCrystalWorld = true;
    this.player.respawn(hallLeft, 17 * TILE);
    this.checkpointX = hallLeft;
    this.checkpointY = 17 * TILE;
    this.camera.snapTo(this.player.cx, this.player.cy);
    this.currentZone = zoneAt(this.player.cx).label;
    this.zoneBanner = { text: 'DER KRISTALLHORT', timer: 3.4 };
    this.flashWhite = 1;
    audio.play('victory');
  }

  /**
   * Back out of the hall, with the blade upgraded. He lands where he was taken
   * from - a few tiles clear of the gate if that is where it happened, because
   * being dropped straight into it would end the run on the spot.
   */
  private leaveCrystalWorld(): void {
    const back = this.returnTo;
    this.inCrystalWorld = false;
    this.takeRelic('klingenwelle');
    this.flashWhite = 1;
    if (!back) return;
    this.checkpointX = back.cpX;
    this.checkpointY = back.cpY;
    this.player.respawn(back.x, back.y);
    if (this.portal && this.portal.overlaps(this.player.rect)) {
      this.player.respawn(back.x - TILE * 4, back.y);
    }
    this.camera.snapTo(this.player.cx, this.player.cy);
    this.currentZone = zoneAt(this.player.cx).label;
  }

  /** Reaching the gate home is what actually finishes the run. */
  onPortalReached(): void {
    if (this.victoryTimer > 0 || this.state !== 'playing') return;
    if (this.hydraStillGuarding) {
      // The gate is shut while she lives, and it says so rather than simply
      // doing nothing - a door that ignores you reads as broken.
      if (this.zoneBanner.timer <= 0) {
        this.zoneBanner = { text: 'VERSIEGELT, SOLANGE DIE FÜNFKRONIGE LEBT', timer: 2.6 };
        audio.play('clank', 0.6);
      }
      return;
    }
    // A second door into the crystal hall. The gate is where a player who has
    // everything goes looking for the reward, so it has to lead there too -
    // and it means the whole bonus never hangs on one trigger firing.
    if (!this.bonusOffered && !this.inCrystalWorld && this.gems >= this.totalGems && this.totalGems > 0) {
      this.offerCrystalWorld();
      return;
    }
    this.victoryTimer = 1.6;
    this.flashWhite = 1;
    // Stop him where the gate caught him; from here on he is a passenger.
    this.player.vx = 0;
    this.player.vy = 0;
    audio.play('victory');
  }

  /**
   * Screen shake is the one effect that can make a game unplayable rather than
   * merely worse, so the switch is remembered across sessions.
   */
  setMotion(value: number): void {
    this.camera.motion = value;
    this.camera.shake = 0;
    this.zoneBanner = { text: value > 0 ? 'BILDWACKELN AN' : 'BILDWACKELN AUS', timer: 2.2 };
    try {
      localStorage.setItem('shadowblade.motion', String(value));
    } catch {
      // Private browsing, or storage turned off. The setting just will not
      // survive a reload; that is no reason to break the game.
    }
  }

  /* --------------------------------------------------------------- arenas */

  /**
   * The wards around every boss arena. A boss is not optional: the way on
   * stands until it has fallen, and once the fight is on and the hero is
   * inside, the way back comes down behind him too.
   *
   * The way in only closes with the hero fully inside it. A boss that wakes
   * while he is still standing in the doorway would otherwise shut him out of
   * his own fight - awake, unreachable, and in the way for good. The boss is
   * kept inside its room for the same reason: one that followed him out
   * through the open door could end up on the wrong side of it.
   */
  private updateArenas(): void {
    const p = this.player;
    this.level.arenas.forEach((arena, i) => {
      const key = this.arenaKeys[i];
      if (!key || arena.cleared) return;
      if (this.felledBosses.has(key)) {
        arena.cleared = true;
        arena.fighting = false;
        this.onArenaCleared(arena);
        return;
      }
      const boss = this.enemies.find((e) => e.spawnKey === key && !e.dead);
      if (!boss) return;
      if (boss.x < arena.left) boss.x = arena.left;
      if (boss.x + boss.w > arena.right) boss.x = arena.right - boss.w;
      if (arena.fighting) return;
      const inside = !p.dead && p.x > arena.left + 2 && p.x + p.w < arena.right - 2;
      if (boss.engaged && inside) {
        arena.fighting = true;
        this.onArenaSealed(arena, boss);
      }
    });
  }

  /** The door behind him comes down. */
  private onArenaSealed(arena: Arena, boss: Enemy): void {
    audio.play('wardClose');
    this.camera.addShake(6);
    this.wardSparks(arena.entryTx);
    const title = ARENA_TITLES[boss.kind];
    if (title) this.zoneBanner = { text: title, timer: 3.4 };
  }

  /** Both doors go, for good. */
  private onArenaCleared(arena: Arena): void {
    audio.play('wardOpen');
    this.wardSparks(arena.entryTx);
    this.wardSparks(arena.exitTx);
  }

  private wardSparks(tx: number): void {
    const rgb = zoneAt(tx * TILE).name === 'castle' ? '#ff8aa0' : '#ffe2a8';
    for (let ty = 2; ty < 18; ty += 2) {
      if (this.level.tileAt(tx, ty) !== Tile.Ward) continue;
      this.particles.burst(tx * TILE + 16, ty * TILE + 16, 4, rgb, { speed: 110, gravity: -30, shape: 'spark' });
    }
  }

  /** The boss whose arena is shut around the hero right now, if any. */
  private get arenaFight(): Enemy | null {
    for (const [i, arena] of this.level.arenas.entries()) {
      if (!arena.fighting) continue;
      const key = this.arenaKeys[i];
      const boss = this.enemies.find((e) => e.spawnKey === key && !e.dead);
      if (boss) return boss;
    }
    return null;
  }

  /* ---------------------------------------------------------------- sound */

  /** What should be playing: the fight if there is one, else the zone. */
  private chooseMusic(): TrackName | null {
    if (this.state === 'title') return 'title';
    if (this.state === 'victory') return 'crystal';
    if (this.boss && this.boss.engaged && !this.boss.dead) return 'bossKnight';
    const fight = this.arenaFight;
    if (fight) return BOSS_TRACK[fight.kind] ?? 'boss';
    for (const e of this.enemies) {
      if (e.dead || !e.engaged) continue;
      if (e.kind === 'hydra' || e.kind === 'prismarch') return BOSS_TRACK[e.kind] ?? 'boss';
    }
    return ZONE_TRACK[zoneAt(this.player.cx).name] ?? null;
  }

  private updateSound(): void {
    audio.setMusic(this.chooseMusic());
    const zone = zoneAt(this.player.cx);
    audio.setSpace(zone.name === 'drowned' ? 1 : zone.interior ? 0.8 : zone.name === 'rift' ? 0.55 : 0.25);
    audio.duck(this.state === 'paused' || this.state === 'dead' || this.dialogue !== null);
    audio.tick();
  }

  /* --------------------------------------------------------------- update */

  update(dt: number, input: Input): void {
    this.time += dt;
    this.titlePulse += dt;

    // Screen shake off and on. It sits outside every other state check on
    // purpose: someone who cannot look at it must be able to switch it off
    // from wherever they are, including the title screen and the pause menu.
    if (input.pressed('calm')) this.setMotion(this.camera.motion > 0 ? 0 : 1);
    if (input.pressed('music')) {
      audio.unlock();
      const on = audio.toggleMusic();
      this.zoneBanner = { text: on ? 'MUSIK AN' : 'MUSIK AUS', timer: 2.2 };
    }
    if (input.pressed('sound')) {
      audio.unlock();
      const on = audio.toggleSound();
      this.zoneBanner = { text: on ? 'TON AN' : 'TON AUS', timer: 2.2 };
    }
    this.updateSound();

    // A dialogue holds everything else: no enemies, no gravity, no clock.
    if (this.dialogue) {
      this.particles.update(dt * 0.3);
      if (input.pressed('confirm') || input.pressed('attack') || input.pressed('jump')) {
        audio.play('blip');
        this.dialogue.index++;
        if (this.dialogue.index >= this.dialogue.lines.length) {
          const done = this.dialogue.after;
          this.dialogue = null;
          done();
        }
      }
      input.endFrame();
      return;
    }
    this.flashWhite = Math.max(0, this.flashWhite - dt * 1.6);

    if (this.state === 'title') {
      this.camera.follow(this.player.cx, this.player.cy, 0, dt);
      this.particles.update(dt);
      for (const d of this.decor) d.update(dt, this.particles, this.isVisible(d.x, d.y));
      if (input.pressed('confirm') || input.pressed('attack') || input.pressed('jump')) {
        audio.unlock();
        audio.play('confirm');
        this.state = 'playing';
      }
      input.endFrame();
      return;
    }

    if (input.pressed('restart')) {
      this.restart();
      input.endFrame();
      return;
    }

    if (this.state === 'paused') {
      if (input.pressed('pause') || input.pressed('confirm')) this.state = 'playing';
      // Two lists, one screen: left and right (or the key that picks an
      // attack) turn between the relics and the attacks.
      if (input.pressed('left') || input.pressed('right') || input.pressed('cycle')) {
        this.pausePage = this.pausePage === 'relics' ? 'skills' : 'relics';
        audio.play('blip');
      }
      input.endFrame();
      return;
    }

    if (this.state === 'victory') {
      this.particles.update(dt);
      this.camera.follow(this.player.cx, this.player.cy - 20, 0, dt);
      if (Math.random() < 0.28) {
        this.particles.spawn({
          x: this.camera.x + rand(0, VIEW_W),
          y: this.camera.y - 10,
          vx: rand(-20, 20),
          vy: rand(20, 70),
          color: Math.random() < 0.5 ? '#ffd166' : '#8fe6ff',
          gravity: 30,
          size: rand(2, 4),
          life: rand(1.5, 3),
          shape: 'circle',
        });
      }
      input.endFrame();
      return;
    }

    if (this.state === 'dead') {
      this.deathTimer -= dt;
      this.particles.update(dt);
      this.camera.follow(this.player.cx, this.player.cy, 0, dt);
      if (this.deathTimer <= 0 && (input.pressed('confirm') || input.pressed('attack') || this.deathTimer < -1.2)) {
        this.respawnAtCheckpoint();
      }
      input.endFrame();
      return;
    }

    if (input.pressed('pause')) {
      this.state = 'paused';
      input.endFrame();
      return;
    }

    this.playTime += dt;
    this.spawnAmbient(dt);

    if (this.pendingRelic) {
      this.pendingRelic.timer -= dt;
      if (this.pendingRelic.timer <= 0 && !this.dialogue) {
        const key = this.pendingRelic.key;
        this.pendingRelic = null;
        this.offerRelic(key);
      }
    }

    // Checked every frame rather than only in the branch that books a gem.
    // Hanging the one thing a player has to work for off a single line in a
    // loop means any path that ever counts a gem differently loses it silently.
    if (this.gems >= this.totalGems && this.totalGems > 0) this.offerCrystalWorld();

    if (this.victoryTimer > 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer <= 0) {
        this.state = 'victory';
        this.score += Math.max(0, 3000 - Math.floor(this.playTime) * 5);
        this.camera.shake = 0;
      }
    }

    // Hit-stop freezes the simulation for a couple of frames on impact.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this.particles.update(dt * 0.25);
      this.camera.follow(this.player.cx, this.player.cy - 10, this.player.facing * 40, dt);
      // No endFrame() here on purpose: the hero does not update during hit
      // stop, so clearing the input would swallow every key pressed in those
      // three to eight frames. They are kept and seen on the next real frame -
      // otherwise a parry pressed at the moment of impact is simply lost.
      return;
    }

    this.player.update(dt, this.victoryTimer > 0 ? NO_INPUT : input, this);

    for (const platform of this.platforms) {
      if (!this.isVisible(platform.x, platform.y, 260)) continue;
      platform.update(dt, this.player);
      platform.landOn(this.player);
    }

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (!enemy.active) {
        if (this.isVisible(enemy.x, enemy.y, 220)) enemy.active = true;
        else continue;
      }
      enemy.harden(this.player.relics);
      // Bound in the hero's silk, it lives slower for a while - everything it
      // does, its wind-ups too.
      const pace = enemy.snare > 0 ? (BOSS_KINDS.has(enemy.kind) ? SNARE_PACE_BOSS : SNARE_PACE) : 1;
      enemy.snare = Math.max(0, enemy.snare - dt);
      enemy.update(dt * pace, this);
      // Anything that ends up under the world is gone. Without this it falls
      // for ever, still updated every frame, and the player never meets it -
      // measured, three of eighteen skeletons left the level this way.
      if (enemy.y > this.level.pixelHeight + 80) enemy.dead = true;
      enemy.touchPlayer(this);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.dead) continue;
      if (BOSS_KINDS.has(enemy.kind)) this.felledBosses.add(enemy.spawnKey);
      this.enemies.splice(i, 1);
    }
    this.updateArenas();

    if (this.boss) {
      const pace = this.boss.snare > 0 ? SNARE_PACE_BOSS : 1;
      this.boss.snare = Math.max(0, this.boss.snare - dt);
      this.boss.update(dt * pace, this);
      // The lagging "ghost" bar trails the real value for a bit of drama.
      this.bossGhostHp += (this.boss.hp - this.bossGhostHp) * Math.min(1, dt * 2.4);
    }
    if (this.bossIntro > 0) this.bossIntro -= dt;

    for (const p of this.projectiles) {
      p.update(dt, this);
      if (p.dead) continue;
      if (p.friendly) {
        for (const enemy of this.enemies) {
          if (enemy.dead || p.spare?.has(enemy)) continue;
          if (enemy.overlaps(p.rect)) {
            const before = enemy.hp;
            enemy.hurt(p.damage, Math.sign(p.vx) || 1, this);
            this.player.onDamageDealt(Math.max(0, before - Math.max(0, enemy.hp)));
            p.dead = true;
            break;
          }
        }
        if (!p.dead && this.boss && !this.boss.dead && this.boss.vulnerable && !p.spare?.has(this.boss) && this.boss.overlaps(p.rect)) {
          const before = this.boss.hp;
          this.boss.hurt(p.damage, Math.sign(p.vx) || 1, this);
          this.player.onDamageDealt(Math.max(0, before - Math.max(0, this.boss.hp)));
          p.dead = true;
        }
      } else if (!p.resting && !this.player.dead && !this.player.isInvulnerable && this.player.overlaps(p.rect)) {
        if (p.damage <= 0) {
          // Silk: it binds rather than wounds.
          this.player.sticky = Math.max(this.player.sticky, 1.4);
          this.particles.burst(p.cx, p.cy, 12, '#e6eef8', { speed: 120, shape: 'spark' });
        } else {
          this.player.hurt(p.damage, Math.sign(p.vx) || (this.player.cx < p.cx ? -1 : 1), this);
          this.particles.burst(p.cx, p.cy, 12, '#ff9a5c', { speed: 150 });
        }
        p.dead = true;
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    }

    for (const pickup of this.pickups) {
      if (pickup.dead) continue;
      if (!this.isVisible(pickup.x, pickup.y, 120)) continue;
      pickup.update(dt, this);
      if (pickup.dead) {
        this.collected.add(pickup.id);
        if (pickup.kind === 'gem') {
          this.gems++;
          this.player.onGem();
        }
      }
    }

    if (this.portal) {
      this.portal.update(dt);
      if (!this.player.dead && this.portal.overlaps(this.player.rect)) this.onPortalReached();
    }

    for (const cp of this.checkpoints) {
      if (!this.isVisible(cp.x, cp.y, 200)) continue;
      if (cp.update(dt, this)) {
        this.checkpointX = cp.x;
        this.checkpointY = cp.y;
        this.player.heal(2);
      }
    }

    for (const d of this.decor) d.update(dt, this.particles, this.isVisible(d.x, d.y));

    this.particles.update(dt);

    const zone = zoneAt(this.player.cx);
    if (zone.label !== this.currentZone) {
      this.currentZone = zone.label;
      // A boss's name on screen outranks the name of the room it is in.
      if (!this.boss?.engaged && !this.arenaFight) this.zoneBanner = { text: zone.label, timer: 3.2 };
    }
    if (this.zoneBanner.timer > 0) this.zoneBanner.timer -= dt;

    const lookAhead = clamp(this.player.vx * 0.35, -110, 110);
    const focusY = this.boss?.engaged && !this.boss.dead ? this.player.cy + 30 : this.player.cy - 10;
    this.camera.follow(this.player.cx, focusY, lookAhead, dt);

    if (this.player.dead && this.state === 'playing') {
      this.state = 'dead';
      this.deathTimer = 1.1;
      this.deaths++;
      audio.play('death');
      this.camera.addShake(9);
      this.particles.burst(this.player.cx, this.player.cy, 40, PALETTE.playerCloak, { speed: 240, gravity: 500 });
    }

    input.endFrame();
  }

  private isVisible(x: number, y: number, margin = 80): boolean {
    return (
      x > this.camera.x - margin &&
      x < this.camera.x + VIEW_W + margin &&
      y > this.camera.y - margin - 200 &&
      y < this.camera.y + VIEW_H + margin + 200
    );
  }

  private respawnAtCheckpoint(): void {
    this.player.respawn(this.checkpointX, this.checkpointY - 8);
    this.projectiles.length = 0;
    this.particles.clear();
    this.spawnEnemiesFresh();
    for (const pickup of this.pickups) {
      pickup.dead = this.collected.has(pickup.id);
    }
    // Her door goes back up with her: a hero who died in there has to be able
    // to walk back in, and one who died outside must not find it shut.
    this.level.lairClosed = false;
    // The same for every warded arena: the fight starts again from the door.
    for (const arena of this.level.arenas) arena.fighting = false;
    if (this.boss && !this.bossDefeated) {
      this.boss.reset();
      this.bossGhostHp = this.boss.maxHp;
      this.level.gateClosed = false;
    } else if (this.boss) {
      // Dying in the rift must not raise the knight again, nor drop the seal
      // behind the player - that would shut the way forward for good.
      this.boss.dead = true;
      this.boss.engaged = false;
      this.level.gateClosed = false;
      this.level.exitSealed = false;
    }
    this.state = 'playing';
    this.camera.snapTo(this.player.cx, this.player.cy);
  }

  restart(): void {
    this.state = 'playing';
    this.score = 0;
    this.gems = 0;
    this.deaths = 0;
    this.playTime = 0;
    this.collected.clear();
    const start = this.level.spawns.find((s) => s.kind === 'player');
    this.checkpointX = (start?.tx ?? 2) * TILE;
    this.checkpointY = (start?.ty ?? 2) * TILE - 2;
    for (const cp of this.checkpoints) cp.activated = false;
    for (const pickup of this.pickups) pickup.dead = false;
    this.victoryTimer = 0;
    this.bossDefeated = false;
    this.bonusOffered = false;
    this.inCrystalWorld = false;
    this.trueEnding = false;
    this.returnTo = null;
    this.dialogue = null;
    this.player.beamTier = 0;
    this.player.maxHp = PLAYER_MAX_HP;
    // Every relic goes with a restart, and whatever they had saved up - and
    // every attack the bosses taught.
    this.player.relics.clear();
    this.player.skills.clear();
    this.player.skill = null;
    this.player.skillCooldowns.clear();
    this.player.skillEffects = [];
    this.player.goldCount = 0;
    this.player.bloodMeter = 0;
    this.pendingRelic = null;
    this.felledBosses.clear();
    for (const arena of this.level.arenas) {
      arena.cleared = false;
      arena.fighting = false;
    }
    this.level.exitSealed = true;
    this.level.lairClosed = false;
    this.hydraToldAboutRegrowth = false;
    this.hydraToldAboutSealing = false;
    this.hydraToldAboutFire = false;
    this.respawnAtCheckpoint();
  }

  /**
   * Everything that glows, in world space. The lighting pass burns these out of
   * the darkness, so anything the player must see - hazards, pickups, the
   * knight - has to be in here.
   */
  private collectLights(): Light[] {
    const lights: Light[] = [];
    const add = (x: number, y: number, radius: number, rgb: string, strength: number, tint = 0.22): void => {
      if (!this.isVisible(x, y, radius)) return;
      lights.push({ x, y, radius, rgb, strength, tint });
    };

    for (const d of this.decor) {
      if (d.kind === 'torch') {
        const flicker = 0.92 + Math.sin(this.time * 7 + d.x) * 0.08;
        add(d.x + 8, d.y + 2, 190 * flicker, '255,168,84', 1, 0.34);
      } else {
        add(d.x + 8, d.y - 6, 120, '99,230,255', 0.85, 0.4);
      }
    }

    // Lava lights the cave from below; sampling every other column is plenty.
    const t0 = Math.floor(this.camera.x / TILE) - 1;
    const t1 = Math.ceil((this.camera.x + VIEW_W) / TILE) + 1;
    const r0 = Math.floor(this.camera.y / TILE) - 1;
    const r1 = Math.ceil((this.camera.y + VIEW_H) / TILE) + 1;
    for (let tx = t0; tx <= t1; tx += 2) {
      for (let ty = r0; ty <= r1; ty++) {
        if (this.level.tileAt(tx, ty) === TILE_LAVA_TOP) {
          add(tx * TILE + TILE, ty * TILE + 6, 150, '255,122,60', 0.95, 0.42);
        }
      }
    }

    for (const pickup of this.pickups) {
      if (pickup.dead) continue;
      const glowRgb = pickup.kind === 'gem' ? '242,193,78' : '255,87,115';
      add(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, 46, glowRgb, 0.9, 0.42);
    }
    for (const cp of this.checkpoints) {
      add(cp.x + 12, cp.y + 20, cp.activated ? 150 : 70, cp.activated ? '255,214,110' : '110,140,190', 0.8, 0.32);
    }
    for (const p of this.projectiles) {
      const rgb =
        p.kind === 'orb'
          ? '210,110,255'
          : p.kind === 'shockwave' || p.kind === 'magma' || p.kind === 'ember'
            ? '255,140,90'
            : p.kind === 'blood'
              ? '255,60,90'
              : p.kind === 'quake' || p.kind === 'coin'
                ? '255,214,140'
                : p.kind === 'shard'
                  ? '200,160,255'
                  : p.kind === 'web'
                    ? '220,230,240'
                    : '200,180,160';
      add(p.cx, p.cy, p.kind === 'bone' ? 40 : 84, rgb, 0.8, 0.34);
    }
    // Every enemy carries some light. A threat the player cannot see is not a
    // difficulty, it is a bug.
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      for (const l of enemy.lights()) add(l.x, l.y, l.radius, l.rgb, l.strength, l.tint ?? 0.3);
      switch (enemy.kind) {
        case 'mage':
          add(enemy.cx, enemy.cy, 104, '200,90,223', 0.85, 0.36);
          break;
        case 'slime':
          add(enemy.cx, enemy.cy, 62, '124,224,122', 0.7, 0.3);
          break;
        case 'bat':
          // Dark purple on near-black: without a light of its own the bat is
          // the least readable thing in the game.
          add(enemy.cx, enemy.cy, 88, '176,140,235', 0.92, 0.4);
          break;
        default:
          add(enemy.cx, enemy.cy, 76, '206,214,235', 0.7, 0.26);
      }
    }

    // The hero carries his own light: it flares when the blade swings, and it
    // swells while a heavy strike is being wound up.
    const swing = this.player.isAttacking ? 1 : 0;
    const charge = Math.min(1, this.player.chargeTimer / this.player.chargeTime) * (this.player.chargeReady ? 1 : 0.6);
    const guard = this.player.parryTimer > 0 || this.player.parryFlash > 0.4 ? 0.5 : 0;
    add(
      this.player.cx,
      this.player.cy - 2,
      172 + swing * 52 + charge * 40 + guard * 30,
      '168,214,255',
      0.94,
      0.13 + swing * 0.1 + charge * 0.12 + guard * 0.08,
    );

    for (const e of this.player.skillEffects) {
      for (const l of e.lights()) add(l.x, l.y, l.radius, l.rgb, l.strength, l.tint ?? 0.3);
    }

    this.scatter.collectLights(this.camera, VIEW_W, VIEW_H, lights);
    if (this.portal) add(this.portal.cx, this.portal.cy, 190, '186,132,255', 0.9, 0.34);

    const boss = this.boss;
    if (boss && !boss.dead && boss.engaged) {
      add(boss.cx, boss.cy - 10, 210, '255,74,58', 0.8, 0.16);
    }
    return lights;
  }

  /**
   * Weather, of a sort: each zone drips, drifts or glows in its own way. It is
   * the cheapest way to make a place feel inhabited rather than painted, and it
   * runs entirely through the existing particle system.
   */
  private spawnAmbient(dt: number): void {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = rand(0.08, 0.2);

    const zone = zoneAt(this.player.cx).name;
    const x = this.camera.x + rand(-40, VIEW_W + 40);
    const y = this.camera.y + rand(-40, VIEW_H);

    switch (zone) {
      case 'forest':
        // Leaves, tumbling more than falling.
        this.particles.spawn({
          x,
          y: this.camera.y - 20,
          vx: rand(-26, 8),
          vy: rand(14, 34),
          color: Math.random() < 0.5 ? 'rgba(86,150,78,0.7)' : 'rgba(146,120,58,0.65)',
          gravity: 5,
          drag: 0.995,
          size: rand(2, 3.5),
          life: rand(3.5, 6),
        });
        break;
      case 'ruins':
        this.particles.spawn({
          x,
          y,
          vx: rand(-8, 8),
          vy: rand(-14, -4),
          color: 'rgba(186,168,214,0.4)',
          gravity: -3,
          size: rand(1, 2.2),
          life: rand(2.5, 4.5),
          shape: 'circle',
        });
        break;
      case 'caverns': {
        // Water finding its way down through the rock.
        const dropY = this.camera.y + rand(-30, 60);
        this.particles.spawn({
          x,
          y: dropY,
          vx: 0,
          vy: 60,
          color: 'rgba(150,220,255,0.75)',
          gravity: 520,
          drag: 1,
          size: rand(1.4, 2.4),
          life: rand(0.9, 1.5),
          shape: 'circle',
        });
        break;
      }
      case 'drowned':
        // Bubbles, slow. The water in here has been still a long time.
        this.particles.spawn({
          x,
          y: this.camera.y + VIEW_H + 10,
          vx: rand(-6, 6),
          vy: rand(-26, -12),
          color: 'rgba(150,225,225,0.4)',
          gravity: -4,
          drag: 0.998,
          size: rand(1.4, 3),
          life: rand(3, 5),
          shape: 'circle',
        });
        break;
      case 'castle':
        // Embers climbing out of the braziers.
        this.particles.spawn({
          x,
          y: this.camera.y + VIEW_H + 10,
          vx: rand(-12, 12),
          vy: rand(-40, -18),
          color: Math.random() < 0.6 ? 'rgba(255,150,70,0.7)' : 'rgba(255,90,50,0.6)',
          gravity: -8,
          drag: 0.99,
          size: rand(1.2, 2.6),
          life: rand(2.5, 4.5),
          shape: 'circle',
        });
        break;
      default:
        break;
    }
  }

  /**
   * Draws the enemies a second time, additively and faintly, on top of the
   * darkness, so a bat in an unlit corner still reads as a bat.
   *
   * This goes through an offscreen layer on purpose. The entities reset
   * globalAlpha inside their own draw calls (blink, trails, flashes), which
   * silently ignores any alpha set here and stacks them at full strength -
   * that is what bleached the hero white. Compositing the finished layer once
   * keeps the intended weight.
   *
   * The hero is deliberately not in here: he already carries the brightest
   * light in the game, and drawing him twice only costs him his colours.
   */
  private drawCastLight(ctx: CanvasRenderingContext2D): void {
    const layer = this.castCtx;
    let any = false;
    layer.clearRect(0, 0, VIEW_W, VIEW_H);
    layer.save();
    layer.translate(-this.camera.renderX, -this.camera.renderY);
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.castLight || !this.isVisible(enemy.x, enemy.y, 140)) continue;
      // Drawn without its hit flash. The flash is a canvas filter, and a canvas
      // filter costs a layer the size of the whole view per draw: measured, one
      // flashing enemy took this pass from 0.4 ms to 64 ms, for the dozen
      // frames after every explosion. In a faint additive overlay it is not
      // visible anyway - the flash on the play field is the one that reads.
      const flash = enemy.flash;
      enemy.flash = 0;
      enemy.draw(layer, this);
      enemy.flash = flash;
      any = true;
    }
    layer.restore();
    if (!any) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Weight chosen against a measurement: the brightest decoration in a scene
    // must stay below the dimmest enemy, or the eye goes to the mushroom
    // instead of the bat about to bite.
    ctx.globalAlpha = 0.68;
    ctx.drawImage(this.castLayer, 0, 0);
    ctx.restore();
  }

  /* --------------------------------------------------------------- render */

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    this.background.draw(ctx, this.camera, this.time);

    ctx.save();
    ctx.translate(-this.camera.renderX, -this.camera.renderY);

    drawTilemap(ctx, this.level, this.camera, this.time);
    this.scatter.draw(ctx, this.camera, VIEW_W, this.time);

    for (const d of this.decor) {
      if (this.isVisible(d.x, d.y, 120)) d.draw(ctx);
    }
    for (const cp of this.checkpoints) {
      if (this.isVisible(cp.x, cp.y, 120)) cp.draw(ctx);
    }
    if (this.portal && this.isVisible(this.portal.x, this.portal.y, 200)) this.portal.draw(ctx);
    for (const platform of this.platforms) {
      if (this.isVisible(platform.x, platform.y, 200)) platform.draw(ctx);
    }
    for (const pickup of this.pickups) {
      if (!pickup.dead && this.isVisible(pickup.x, pickup.y, 100)) pickup.draw(ctx);
    }
    for (const enemy of this.enemies) {
      if (!enemy.dead && this.isVisible(enemy.x, enemy.y, 140)) enemy.draw(ctx, this);
    }
    if (this.boss && !this.boss.dead && this.isVisible(this.boss.x, this.boss.y, 300)) {
      this.boss.draw(ctx);
    }
    // The hero's silk on whatever it holds.
    for (const enemy of this.enemies) {
      if (!enemy.dead && enemy.snare > 0) drawSnare(ctx, enemy.x, enemy.y, enemy.w, enemy.h, enemy.snare);
    }
    if (this.boss && !this.boss.dead && this.boss.snare > 0) {
      drawSnare(ctx, this.boss.x, this.boss.y, this.boss.w, this.boss.h, this.boss.snare);
    }
    for (const p of this.projectiles) {
      if (this.isVisible(p.x, p.y, 120)) p.draw(ctx);
    }
    if (!this.player.dead || this.state === 'victory') this.player.draw(ctx, this);
    this.particles.draw(ctx);
    this.particles.drawTexts(ctx);

    ctx.restore();

    const blend = zoneBlend(this.player.cx);
    const darkness = blend.from.darkness + (blend.to.darkness - blend.from.darkness) * blend.t;
    const tint = mixHex(blend.from.darkTint, blend.to.darkTint, blend.t);
    const lights = this.collectLights();
    this.lightPass.draw(ctx, this.camera, lights, darkness, tint);

    // Readability first: ledges, pit walls, then the characters themselves keep
    // a share of their own colour on top of the darkness.
    const sporeRgb = blend.t > 0.5 ? blend.to.sporeRgb : blend.from.sporeRgb;
    drawEdgeLight(ctx, this.level, this.camera, VIEW_W, VIEW_H, sporeRgb, lights);
    this.drawCastLight(ctx);

    // Spores sit in front of the darkness, so they glow through it.
    // B quiets the spore field everywhere, not just in the zones that are calm
    // by design: it is the one switch for players who cannot look at movement,
    // and a drifting field of bright dots is movement.
    const calm = (blend.t > 0.5 ? blend.to.calm : blend.from.calm) || this.camera.motion <= 0;
    this.spores.draw(ctx, this.camera, this.time, sporeRgb, calm);

    this.drawLighting(ctx);
    if (this.state !== 'title') this.drawHud(ctx);
    this.drawOverlays(ctx);
  }

  private drawLighting(ctx: CanvasRenderingContext2D): void {
    // Vignette.
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Low-health pulse.
    if (this.state === 'playing' && this.player.hp <= 2 && !this.player.dead) {
      const pulse = 0.16 + Math.sin(this.time * 6) * 0.08;
      ctx.fillStyle = `rgba(180,20,40,${Math.max(0, pulse).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.flashWhite > 0) {
      ctx.fillStyle = `rgba(255,245,225,${(this.flashWhite * 0.8).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    // Hearts.
    const hp = this.player.hp;
    for (let i = 0; i < this.player.maxHp; i++) {
      drawHeart(ctx, 34 + i * 26, 36, 1.15, i < hp);
    }

    // Score + gems.
    // Gem icon + score.
    ctx.save();
    ctx.translate(31, 67);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, -1);
    ctx.lineTo(0, 8);
    ctx.lineTo(-6, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff0b8';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(3, -1);
    ctx.lineTo(0, 2);
    ctx.lineTo(-3, -1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = font(16);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(`${this.score}`, 45, 74);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`${this.score}`, 44, 73);
    ctx.font = font(12, 600);
    ctx.fillStyle = '#8b95bd';
    ctx.fillText(`EDELSTEINE ${this.gems}/${this.totalGems}   TODE ${this.deaths}`, 24, 92);

    // What the bosses have left him, one badge each, in the order the road
    // hands them out. A power the player cannot see he has is a power he does
    // not use - and the ones that fill up or wear off show how far.
    this.drawRelicRow(ctx);
    this.drawSkillPanel(ctx);

    // Progress bar of the whole level.
    const barW = 260;
    const barX = VIEW_W - barW - 24;
    const progress = clamp(this.player.cx / (this.level.pixelWidth - 200), 0, 1);
    ctx.fillStyle = 'rgba(10,12,22,0.7)';
    ctx.fillRect(barX, 28, barW, 8);
    ctx.fillStyle = 'rgba(140,170,230,0.85)';
    ctx.fillRect(barX, 28, barW * progress, 8);
    ctx.strokeStyle = 'rgba(150,170,225,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, 28.5, barW - 1, 7);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(barX + barW * progress - 1, 25, 3, 14);
    ctx.font = font(11, 600);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8b95bd';
    ctx.fillText(this.currentZone.toUpperCase(), VIEW_W - 24, 54);
    ctx.textAlign = 'left';

    // Zone banner.
    if (this.zoneBanner.timer > 0) {
      const a = clamp(this.zoneBanner.timer > 2.6 ? (3.2 - this.zoneBanner.timer) / 0.6 : this.zoneBanner.timer / 1.2, 0, 1);
      ctx.globalAlpha = a;
      drawTextCentered(ctx, this.zoneBanner.text, VIEW_W / 2, 130, 26, '#f4f7ff');
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = 'rgba(200,215,255,0.6)';
      ctx.fillRect(VIEW_W / 2 - 90, 142, 180, 1);
      if (this.zoneBanner.sub) {
        ctx.globalAlpha = a;
        drawTextCentered(ctx, this.zoneBanner.sub, VIEW_W / 2, 164, 14, '#ffd98a', 700);
      }
      ctx.globalAlpha = 1;
    }

    // Boss bar.
    if (this.boss && this.boss.engaged && !this.boss.dead) {
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        {
          name: `${this.boss.name}   ·   PHASE ${this.boss.phase}`,
          hp: this.boss.hp,
          maxHp: this.boss.maxHp,
          ghost: this.bossGhostHp,
          phase: this.boss.phase,
        },
        this.bossIntro,
      );
    }

    // The arena bosses that carry their own name for the bar.
    const named = this.enemies.find((e) => e.engaged && !e.dead && e.barName() !== null);
    if (named) {
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        {
          name: `${named.barName()}   ·   PHASE ${named.barPhase()}`,
          hp: Math.max(0, named.hp),
          maxHp: named.maxHp,
          ghost: Math.max(0, named.hp),
          phase: named.barPhase(),
        },
        0,
      );
      return;
    }

    // The warden gets the same bar, half the width: it is a mini-boss, and a
    // fight with a health bar is a fight the player knows to take seriously.
    const prism = this.enemies.find((e): e is Prismarch => e instanceof Prismarch && e.engaged && !e.dead);
    if (prism) {
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        {
          name: `PRISMARCH   ·   HERZ DES KRISTALLS   ·   PHASE ${prism.phase}`,
          hp: prism.hp,
          maxHp: prism.maxHp,
          ghost: prism.hp,
          phase: prism.phase,
        },
        0,
      );
      return;
    }

    const hydra = this.enemies.find((e): e is Hydra => e instanceof Hydra && e.engaged && !e.dead);
    if (hydra) {
      const open = hydra.openStumps.length;
      const label = open > 0 ? `${open} HALS${open > 1 ? 'E' : ''} OFFEN` : `${hydra.sealed} VON 4 AUSGEBRANNT`;
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        {
          name: `DIE FÜNFKRONIGE   ·   ${label}`,
          hp: hydra.hp,
          maxHp: hydra.maxHp,
          ghost: hydra.hp,
          phase: 1 + hydra.sealed,
          pips: hydra.pips,
          pipUrgency: hydra.pipUrgency,
        },
        0,
      );
      return;
    }

    const mire = this.enemies.find((e): e is Gallert => e instanceof Gallert && e.engaged && !e.dead);
    if (mire) {
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        {
          name: `GALLERT   ·   DER AUFGEQUOLLENE   ·   PHASE ${mire.phase}`,
          hp: mire.hp,
          maxHp: mire.maxHp,
          ghost: mire.hp,
          phase: mire.phase,
        },
        0,
      );
      return;
    }

    const drowned = this.enemies.find((e): e is Thalassa => e instanceof Thalassa && e.engaged && !e.dead);
    if (drowned) {
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        {
          name: `THALASSA   ·   DIE ERTRUNKENE KRONE   ·   PHASE ${drowned.phase}`,
          hp: drowned.hp,
          maxHp: drowned.maxHp,
          ghost: drowned.hp,
          phase: drowned.phase,
        },
        0,
      );
      return;
    }

    const warden = this.enemies.find((e): e is Warden => e instanceof Warden && e.engaged && !e.dead);
    if (warden && !(this.boss && this.boss.engaged && !this.boss.dead)) {
      drawBossBar(
        ctx,
        VIEW_W,
        VIEW_H,
        { name: 'SPLITTERWÄCHTER', hp: warden.hp, maxHp: warden.maxHp, ghost: warden.hp, phase: 1 },
        0,
      );
    }
  }

  /**
   * The badges under the score, six to a row. See drawRelicBadge. In a single
   * row eleven of them ran out to the middle of the screen, under the banner
   * a boss's fall puts up - the very moment the newest one arrives.
   */
  private drawRelicRow(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    let n = 0;
    for (const r of RELICS) {
      if (!p.has(r.id)) continue;
      // Klingenwelle sharpens the Flutklinge rather than sitting beside it.
      if (r.id === 'flutklinge' && p.has('klingenwelle')) continue;
      let lit = true;
      let fill: number | null = null;
      switch (r.id) {
        case 'seidenmantel':
          lit = p.shieldUp;
          fill = p.shieldUp ? null : 1 - p.shieldTimer / SILK_REGROW;
          break;
        case 'zweiteratem':
          lit = p.secondWind;
          break;
        case 'blutdurst':
          fill = p.bloodMeter / BLOOD_PER_HEART;
          break;
        case 'goldzahn':
          fill = p.goldCount / GOLD_PER_HEART;
          break;
        case 'hydrablut':
          fill = p.hp < p.maxHp ? 1 - p.regrowTimer / HYDRA_REGROW : null;
          break;
      }
      drawRelicBadge(ctx, r.id, 34 + (n % 6) * 25, 114 + Math.floor(n / 6) * 24, r.color, lit, fill);
      n++;
    }
  }

  /**
   * The boss attack he has picked, in the bottom left corner where nothing
   * else is: its sign, a ring that fills while it cools down, its name, and a
   * pip for every other one he could pick instead.
   */
  private drawSkillPanel(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    if (!p.skill) return;
    const info = skillInfo(p.skill);
    const owned = SKILLS.filter((k) => p.skills.has(k.id));
    const left = p.cooldownLeft(info.id);
    // Narrow enough to stay clear of the boss bar, which starts at x 162.
    const x = 24;
    const y = VIEW_H - 66;
    const w = 134;
    drawPanel(ctx, x, y, w, 50, 0.62);
    drawSkillBadge(ctx, info.id, x + 24, y + 25, 1.4, info.color, left <= 0, left > 0 ? 1 - left / info.cooldown : null);
    ctx.textAlign = 'left';
    ctx.font = font(info.name.length > 12 ? 10 : 11, 700);
    ctx.fillStyle = left > 0 ? '#7d86a8' : info.color;
    ctx.fillText(info.name.toUpperCase(), x + 46, y + 17, w - 52);
    ctx.font = font(10, 600);
    ctx.fillStyle = '#f2c14e';
    ctx.fillText('F', x + 46, y + 31);
    ctx.fillStyle = left > 0 ? '#8b95bd' : '#c9f0c4';
    ctx.fillText(left > 0 ? `${left.toFixed(1).replace('.', ',')} s` : 'bereit', x + 58, y + 31);
    if (owned.length > 1) {
      // Q and a pip for every attack learned, the picked one lit.
      ctx.fillStyle = '#f2c14e';
      ctx.fillText('Q', x + 46, y + 43);
      owned.forEach((k, i) => {
        ctx.fillStyle = k.id === info.id ? k.color : 'rgba(150,165,210,0.35)';
        ctx.beginPath();
        ctx.arc(x + 60 + i * 6, y + 40, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  /**
   * The boss attacks, by name and by what they do, for the pause screen's
   * second page. The picked one is marked.
   */
  private drawSkillList(ctx: CanvasRenderingContext2D, top: number): void {
    const p = this.player;
    const owned = SKILLS.filter((k) => p.skills.has(k.id));
    if (owned.length === 0) {
      drawTextCentered(ctx, 'Noch keine Angriffe — jeder Boss bringt dir einen seiner bei.', VIEW_W / 2, top + 20, 13, '#6f7ba3', 600);
      return;
    }
    const rowH = 24;
    const h = owned.length * rowH + 24;
    const w = 860;
    const left = VIEW_W / 2 - w / 2;
    drawPanel(ctx, left, top, w, h, 0.7);
    ctx.font = font(12, 600);
    const fromRight = left + w - 18;
    const fromW = Math.max(...owned.map((k) => ctx.measureText(k.from).width));
    const textX = left + 178;
    const textW = fromRight - fromW - 20 - textX;
    owned.forEach((k, i) => {
      const y = top + 22 + i * rowH;
      drawSkillBadge(ctx, k.id, left + 26, y - 4, 1, k.color, true, null);
      ctx.font = font(13, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = k.color;
      ctx.fillText(k.id === p.skill ? `${k.name}  ◀` : k.name, left + 44, y);
      ctx.font = font(12, 600);
      ctx.fillStyle = '#aeb8dc';
      ctx.fillText(k.text, textX, y, textW);
      ctx.fillStyle = '#5f6a92';
      ctx.textAlign = 'right';
      ctx.fillText(k.from, fromRight, y);
      ctx.textAlign = 'left';
    });
  }

  /**
   * The relics, by name and by what they do, for the pause screen - the HUD
   * can only show a badge, and a badge does not say what it is for.
   */
  private drawRelicList(ctx: CanvasRenderingContext2D, top: number): void {
    const owned = RELICS.filter((r) => this.player.has(r.id));
    if (owned.length === 0) {
      drawTextCentered(ctx, 'Noch keine Relikte — jeder Boss hinterlässt eines.', VIEW_W / 2, top + 20, 13, '#6f7ba3', 600);
      return;
    }
    const rowH = 24;
    const h = owned.length * rowH + 24;
    // Wide enough for the longest line, and the line held to its column all
    // the same: it ran on under the boss's name once, measured in the
    // screenshots, and a list nobody can read is not a list.
    const w = 860;
    const left = VIEW_W / 2 - w / 2;
    drawPanel(ctx, left, top, w, h, 0.7);
    ctx.font = font(12, 600);
    const fromRight = left + w - 18;
    const fromW = Math.max(...owned.map((r) => ctx.measureText(r.from).width));
    const textX = left + 178;
    const textW = fromRight - fromW - 20 - textX;
    owned.forEach((r, i) => {
      const y = top + 22 + i * rowH;
      drawRelicBadge(ctx, r.id, left + 26, y - 4, r.color, true, null);
      ctx.font = font(13, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = r.color;
      ctx.fillText(r.name, left + 44, y);
      ctx.font = font(12, 600);
      ctx.fillStyle = '#aeb8dc';
      ctx.fillText(r.text, textX, y, textW);
      ctx.fillStyle = '#5f6a92';
      ctx.textAlign = 'right';
      ctx.fillText(r.from, fromRight, y);
      ctx.textAlign = 'left';
    });
  }

  /**
   * The dialogue box. One line at a time, because five lines dumped at once are
   * five lines skipped - and this is the only place in the game that says out
   * loud what is about to happen to the player.
   */
  private drawDialogue(ctx: CanvasRenderingContext2D): void {
    const d = this.dialogue;
    if (!d) return;
    ctx.fillStyle = 'rgba(4,8,18,0.62)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const w = 620;
    const h = 132;
    const x = (VIEW_W - w) / 2;
    const y = VIEW_H - h - 74;
    glow(ctx, VIEW_W / 2, y + h / 2, 300, 'rgba(140,230,255,0.12)');
    drawPanel(ctx, x, y, w, h, 0.86);

    drawTextCentered(ctx, d.speaker, VIEW_W / 2, y + 32, 13, '#8fe8ff', 700);
    ctx.fillStyle = 'rgba(143,232,255,0.28)';
    ctx.fillRect(x + 40, y + 44, w - 80, 1);

    // The line being read, with the one before it still faintly there, so the
    // sentence keeps its shape while it is spoken.
    const prev = d.lines[d.index - 1];
    if (prev) {
      ctx.globalAlpha = 0.35;
      drawTextCentered(ctx, prev, VIEW_W / 2, y + 74, 15, '#aeb8dc', 600);
      ctx.globalAlpha = 1;
    }
    drawTextCentered(ctx, d.lines[d.index] ?? '', VIEW_W / 2, y + 100, 17, '#f4f7ff', 600);

    const blink = 0.5 + Math.sin(this.titlePulse * 3.4) * 0.5;
    ctx.globalAlpha = 0.35 + blink * 0.55;
    drawTextCentered(
      ctx,
      `LEERTASTE — weiter   (${d.index + 1}/${d.lines.length})`,
      VIEW_W / 2,
      y + h + 26,
      13,
      '#ffffff',
      600,
    );
    ctx.globalAlpha = 1;
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    if (this.dialogue) {
      this.drawDialogue(ctx);
      return;
    }
    switch (this.state) {
      case 'title':
        this.drawTitle(ctx);
        break;
      case 'paused':
        ctx.fillStyle = 'rgba(4,6,12,0.78)';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        drawTextCentered(ctx, 'PAUSE', VIEW_W / 2, 92, 46, '#f4f7ff');
        drawTextCentered(ctx, 'P oder LEERTASTE zum Fortsetzen  ·  R für Neustart', VIEW_W / 2, 124, 14, '#94a0c8', 600);
        drawTextCentered(
          ctx,
          `M  Musik ${audio.musicOff ? 'aus' : 'an'}   ·   N  Ton ${audio.muted ? 'aus' : 'an'}   ·   B  Bildwackeln ${this.camera.motion > 0 ? 'an' : 'aus'}`,
          VIEW_W / 2,
          146,
          12,
          '#6f7ba3',
          600,
        );
        if (this.pausePage === 'relics') this.drawRelicList(ctx, 182);
        else this.drawSkillList(ctx, 182);
        drawTextCentered(
          ctx,
          this.pausePage === 'relics' ? '◀ ▶   RELIKTE   ·   angriffe' : '◀ ▶   relikte   ·   ANGRIFFE',
          VIEW_W / 2,
          172,
          12,
          '#8fe8ff',
          700,
        );
        break;
      case 'dead': {
        const a = clamp(1.1 - this.deathTimer, 0, 1) * 0.78;
        ctx.fillStyle = `rgba(40,4,10,${a.toFixed(3)})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        drawTextCentered(ctx, 'GEFALLEN', VIEW_W / 2, VIEW_H / 2 - 4, 52, '#ff6b78');
        if (this.deathTimer <= 0) {
          const blink = 0.55 + Math.sin(this.time * 5) * 0.45;
          ctx.globalAlpha = blink;
          drawTextCentered(ctx, 'LEERTASTE — zurück zum letzten Kontrollpunkt', VIEW_W / 2, VIEW_H / 2 + 34, 15, '#e8d7d7', 600);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'victory':
        this.drawVictory(ctx);
        break;
      default:
        break;
    }
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(4,6,14,0.68)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    glow(ctx, VIEW_W / 2, 170, 260, 'rgba(90,140,255,0.16)');

    drawTextCentered(ctx, 'SHADOWBLADE', VIEW_W / 2, 178, 68, '#f4f7ff');
    ctx.globalAlpha = 0.9;
    drawTextCentered(ctx, 'Die Klinge von Nachtfall', VIEW_W / 2, 212, 18, '#8fb4ff', 600);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(150,170,225,0.35)';
    ctx.fillRect(VIEW_W / 2 - 170, 232, 340, 1);

    // Which build this is. One cached index.html looks exactly like the new
    // one, and then a missing feature is indistinguishable from a bug.
    ctx.globalAlpha = 0.5;
    drawTextCentered(ctx, `Stand ${__BUILD__}`, VIEW_W / 2, VIEW_H - 12, 11, '#6f7ba0', 600);
    ctx.globalAlpha = 1;

    const rows: [string, string][] = [
      ['← →  /  A D', 'Laufen'],
      ['LEERTASTE / W', 'Springen · Doppelsprung'],
      ['J  /  K', 'Schwert (3er-Kombo)'],
      ['SHIFT  /  L', 'Ausweichrolle (unverwundbar)'],
      ['F  /  Q', 'Boss-Angriff  ·  wechseln'],
      ['↓ + Sprung', 'Durch Plattform fallen'],
      ['P  /  R', 'Pause  ·  Neustart'],
      ['M  /  N', 'Musik  ·  Ton an/aus'],
    ];
    drawPanel(ctx, VIEW_W / 2 - 220, 248, 440, 202, 0.6);
    ctx.font = font(13, 600);
    rows.forEach(([key, desc], i) => {
      const y = 272 + i * 23;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f2c14e';
      ctx.fillText(key, VIEW_W / 2 - 20, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#b9c3e4';
      ctx.fillText(desc, VIEW_W / 2 + 4, y);
    });
    ctx.textAlign = 'left';

    const blink = 0.5 + Math.sin(this.titlePulse * 3.4) * 0.5;
    ctx.globalAlpha = 0.35 + blink * 0.65;
    drawTextCentered(ctx, 'LEERTASTE ZUM STARTEN', VIEW_W / 2, 474, 20, '#ffffff');
    ctx.globalAlpha = 1;
    drawTextCentered(
      ctx,
      'Elf Bosse stehen zwischen dir und dem Tor nach Hause — keiner lässt sich umgehen.',
      VIEW_W / 2,
      502,
      12,
      '#6f7ba3',
      600,
    );
  }

  private drawVictory(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(6,8,16,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.trueEnding) {
      glow(ctx, VIEW_W / 2, 150, 300, 'rgba(140,230,255,0.2)');
      drawTextCentered(ctx, 'DAS WAHRE ENDE', VIEW_W / 2, 168, 60, '#8fe8ff');
      drawTextCentered(
        ctx,
        'Morvain gefallen, das Herz des Kristalls zersprungen.',
        VIEW_W / 2,
        208,
        17,
        '#e7ecff',
        600,
      );
    } else {
      glow(ctx, VIEW_W / 2, 150, 300, 'rgba(255,200,90,0.18)');
      drawTextCentered(ctx, 'SIEG!', VIEW_W / 2, 168, 74, '#ffd166');
      drawTextCentered(ctx, 'Morvain ist gefallen — Nachtfall ist frei.', VIEW_W / 2, 208, 17, '#e7ecff', 600);
    }

    const minutes = Math.floor(this.playTime / 60);
    const seconds = Math.floor(this.playTime % 60);
    const rows: [string, string][] = [
      ['Punkte', `${this.score}`],
      ['Edelsteine', `${this.gems} / ${this.totalGems}`],
      ['Zeit', `${minutes}:${seconds.toString().padStart(2, '0')}`],
      ['Tode', `${this.deaths}`],
    ];
    drawPanel(ctx, VIEW_W / 2 - 180, 236, 360, 150, 0.66);
    ctx.font = font(15, 600);
    rows.forEach(([label, value], i) => {
      const y = 268 + i * 32;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#939ec4';
      ctx.fillText(label, VIEW_W / 2 - 150, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f4f7ff';
      ctx.fillText(value, VIEW_W / 2 + 150, y);
    });
    ctx.textAlign = 'left';
    if (this.trueEnding) {
      drawTextCentered(ctx, 'Klingenwelle erworben.', VIEW_W / 2, 408, 14, '#8fe8ff', 600);
    } else {
      drawTextCentered(
        ctx,
        'Alle Edelsteine — und hinter der Welt wartet noch etwas.',
        VIEW_W / 2,
        408,
        14,
        '#7f8cb4',
        600,
      );
    }
    const blink = 0.5 + Math.sin(this.titlePulse * 3.4) * 0.5;
    ctx.globalAlpha = 0.4 + blink * 0.6;
    drawTextCentered(ctx, 'R — noch einmal', VIEW_W / 2, 440, 18, '#ffffff');
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ debug aid */

  /** Row index of the highest walkable floor in a column, if there is one. */
  private floorRowAt(tx: number): number | null {
    if (tx < 0 || tx >= this.level.width) return null;
    for (let ty = this.level.height - 1; ty >= 2; ty--) {
      if (
        this.level.solidAt(tx, ty) &&
        !this.level.solidAt(tx, ty - 1) &&
        !this.level.solidAt(tx, ty - 2) &&
        !this.level.hazardAt(tx, ty - 1)
      ) {
        return ty;
      }
    }
    return null;
  }

  /** Used by the screenshot tool to inspect any part of the level. */
  warpTo(tileX: number): void {
    // Find a column with real footing - the requested one may be over a pit.
    let column = tileX;
    let floorY: number | null = null;
    for (let offset = 0; offset <= 12 && floorY === null; offset++) {
      for (const candidate of offset === 0 ? [tileX] : [tileX + offset, tileX - offset]) {
        const found = this.floorRowAt(candidate);
        if (found !== null) {
          column = candidate;
          floorY = found;
          break;
        }
      }
    }
    const x = column * TILE;
    const y = floorY !== null ? floorY * TILE - this.player.h - 2 : (this.level.height - 4) * TILE;
    this.player.x = x;
    this.player.y = y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.checkpointX = x;
    this.checkpointY = y;
    this.camera.snapTo(this.player.cx, this.player.cy);
    for (const enemy of this.enemies) enemy.active = false;
  }
}
