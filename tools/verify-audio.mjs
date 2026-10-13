/**
 * The sound of the game, heard the only way a test run can hear it.
 *
 * Nobody listens to a verification run, so this renders every effect and every
 * piece of music offline and measures it (AudioBus.probe): a recipe that
 * builds nothing comes out as a peak of zero, and one that would clip comes out
 * above one. Then it plays the game with real key presses and checks the parts
 * that are wiring rather than sound:
 *
 *   - the first key press starts the audio at all (browsers only allow it
 *     after a gesture);
 *   - the title has its own piece, and starting the run hands over to the
 *     forest's;
 *   - walking into a boss arena changes the music to that boss's fight, and
 *     the fight's end hands it back to the zone;
 *   - every boss has a fight of its own - no two share one, except Gallert and
 *     the warden, the two short teaching fights;
 *   - M turns the music off and on and N the effects, each on its own - the
 *     music plays on without the effects, the effects without the music - and
 *     both are remembered across a reload; whoever had switched everything
 *     off with the old N finds both off.
 *
 * Usage: node tools/verify-audio.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST)) throw new Error('bad path');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.error('PAGE ERROR:', e.message);
});
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);

/* ----------------------------------------------------------- offline levels */

const probe = await page.evaluate(() => window.audio.constructor.probe());
const silentSfx = Object.entries(probe.sfx).filter(([, m]) => m.peak < 0.01).map(([n]) => n);
const clippingSfx = Object.entries(probe.sfx).filter(([, m]) => m.peak >= 1).map(([n]) => n);
const silentMusic = Object.entries(probe.music).filter(([, m]) => m.rms < 0.004).map(([n]) => n);
const loudMusic = Object.entries(probe.music).filter(([, m]) => m.peak >= 0.9).map(([n]) => n);

/* ----------------------------------------------------------------- wiring */

const before = await page.evaluate(() => ({ running: window.audio.running, track: window.audio.currentTrack }));
// A key the game does not use: the gesture that unlocks audio, and nothing else.
await page.keyboard.press('KeyQ');
await page.waitForTimeout(400);
const title = await page.evaluate(() => ({
  running: window.audio.running,
  track: window.audio.currentTrack,
  state: window.game.state,
}));

// The title's own confirm starts the run; the forest takes over from there.
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const started = await page.evaluate(() => ({ state: window.game.state, track: window.audio.currentTrack }));

const fights = await page.evaluate(() => {
  const g = window.game;
  const input = window.input;
  window.loop.stop();
  const ctx = document.querySelector('canvas').getContext('2d');
  const tick = (a = {}) => {
    for (const [k, v] of Object.entries({ left: false, right: false, jump: false, attack: false, confirm: false, ...a })) {
      input.forceDown(k, v);
    }
    g.update(1 / 60, input);
    g.render(ctx);
  };
  const out = {};
  for (const [i, arena] of g.level.arenas.entries()) {
    g.warpTo(arena.entryTx + 3);
    let zoneTrack = null;
    // In, and on towards the boss until it wakes: Gierschlund lies still
    // until the hero is close enough to bite.
    for (let f = 0; f < 60 * 6 && !arena.fighting; f++) {
      g.player.hp = g.player.maxHp;
      tick({ right: f < 30 || !g.enemies.some((e) => e.engaged && !e.dead && e.x + e.w > arena.left && e.x < arena.right) });
      if (f === 2) zoneTrack = window.audio.currentTrack;
    }
    for (let f = 0; f < 10; f++) tick();
    const boss = g.enemies.find((e) => e.engaged && !e.dead && e.x + e.w > arena.left && e.x < arena.right);
    const fightTrack = window.audio.currentTrack;
    if (boss) {
      if (typeof boss.beginDying === 'function') boss.beginDying(g);
      else {
        boss.overlaps({ x: -1e7, y: -1e7, w: 2e7, h: 2e7 });
        boss.hurt(9999, 1, g);
      }
    }
    for (let f = 0; f < 60 * 5; f++) {
      g.player.hp = g.player.maxHp;
      tick({ confirm: f % 2 === 0 });
    }
    out[boss?.kind ?? `arena${i}`] = { zoneTrack, fightTrack, after: window.audio.currentTrack, sealed: arena.cleared };
  }
  // The knight and the hydra keep doors of their own.
  const knight = g.boss;
  g.warpTo(Math.floor(g.level.arenaLeft / 32) + 4);
  for (let f = 0; f < 60 * 4 && !knight.engaged; f++) tick({ right: true });
  for (let f = 0; f < 10; f++) tick();
  out.knight = { fightTrack: window.audio.currentTrack };
  return out;
});

// N, then M, each on its own; then a reload: both switches remembered.
await page.evaluate(() => window.loop.start());
const state = () => ({
  sfxOff: window.audio.sfxOff,
  musicOff: window.audio.musicOff,
  track: window.audio.currentTrack,
  banner: window.game.zoneBanner.text,
});
await page.keyboard.press('KeyN');
await page.waitForTimeout(150);
const soundOff = await page.evaluate(state);
await page.keyboard.press('KeyM');
await page.waitForTimeout(150);
const musicOff = await page.evaluate(state);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
const remembered = await page.evaluate(state);
await page.keyboard.press('KeyN');
await page.waitForTimeout(150);
const sfxBack = await page.evaluate(state);
await page.keyboard.press('KeyM');
await page.waitForTimeout(150);
const back = await page.evaluate(state);
// The old N switched everything off, music too: that choice carries over.
await page.evaluate(() => {
  localStorage.setItem('shadowblade.sound', '0');
  localStorage.removeItem('shadowblade.sfx');
  localStorage.removeItem('shadowblade.music');
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
const legacy = await page.evaluate(() => ({
  sfxOff: window.audio.sfxOff,
  musicOff: window.audio.musicOff,
  gone: localStorage.getItem('shadowblade.sound') === null,
}));
await page.evaluate(() => {
  localStorage.removeItem('shadowblade.sfx');
  localStorage.removeItem('shadowblade.music');
});

const report = {
  sfx: Object.keys(probe.sfx).length,
  music: Object.keys(probe.music).length,
  silentSfx,
  clippingSfx,
  silentMusic,
  loudMusic,
  levels: probe,
  before,
  title,
  started,
  fights,
  musicOff,
  soundOff,
  remembered,
  sfxBack,
  back,
  legacy,
  errors,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();

const bossTracks = Object.entries(fights).map(([k, v]) => [k, v.fightTrack]);
const tracksOf = (kinds) => bossTracks.filter(([k]) => kinds.includes(k)).map(([, t]) => t);
const FIGHTS = ['gallert', 'boar', 'mimic', 'jester', 'colossus', 'gloom', 'spider', 'wyrm', 'twins', 'thalassa', 'gargoyle', 'clock', 'vesper', 'shadow', 'knight'];
const distinct = new Set(tracksOf(FIGHTS));
const checks = [
  ['every effect makes a sound', silentSfx.length === 0],
  ['no effect clips on its own', clippingSfx.length === 0],
  ['every piece of music plays', silentMusic.length === 0],
  ['no piece is louder than the effects over it', loudMusic.length === 0],
  ['nothing runs before the first key press', !before.running],
  ['the first key press starts the audio', title.running],
  ['the title has its own piece', title.track === 'title'],
  ['the run starts in the forest, to the forest', started.state === 'playing' && started.track === 'forest'],
  [
    'every boss arena plays a fight, and hands back to the zone after',
    Object.keys(fights).length === 16 &&
      Object.entries(fights)
        .filter(([k]) => k !== 'knight')
        .every(([, v]) => v.fightTrack && v.fightTrack.startsWith('boss') && v.after && !v.after.startsWith('boss')),
  ],
  [`${FIGHTS.length} bosses, ${FIGHTS.length} different fights`, distinct.size === FIGHTS.length],
  ['the knight has his own', fights.knight.fightTrack === 'bossKnight'],
  ['N turns the effects off, says so, and the music plays on', soundOff.sfxOff && !soundOff.musicOff && soundOff.track !== null && /EFFEKTE AUS/.test(soundOff.banner)],
  ['M turns the music off and says so, the effects switch untouched', musicOff.musicOff && musicOff.track === null && musicOff.sfxOff && /MUSIK AUS/.test(musicOff.banner)],
  ['both are remembered across a reload', remembered.musicOff && remembered.sfxOff],
  ['N brings the effects back and leaves the music off', !sfxBack.sfxOff && sfxBack.musicOff],
  ['and M the music', !back.musicOff && !back.sfxOff],
  ['the old all-off switch carries over as both off', legacy.sfxOff && legacy.musicOff && legacy.gone],
  ['no page errors', errors.length === 0],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}`);
}
if (failed) {
  console.error(`FAIL: ${failed} of ${checks.length} checks.`);
  process.exit(1);
}
console.log(
  `OK: ${report.sfx} effects and ${report.music} pieces render, none silent and none clipping, the music follows the zone and every boss fight, and M and N switch music and effects, each on its own, and are remembered.`,
);
