/**
 * The whole reward chain in a single run, with nothing reset in between:
 *
 *   Gallert -> the Herzkern (six hearts become seven) -> Thalassa -> the
 *   Flutklinge -> every gem -> the crystal hall -> the Prismarch -> the
 *   Klingenwelle -> back into the world -> the knight, sized up for the blade
 *   and batting its crescents aside -> the seal -> the gate -> victory.
 *
 * Every one of those links is checked on its own by another tool. This one is
 * about the joints between them, which nothing else looks at: that the extra
 * heart survives a death, and a teleport out of the world and back; that the
 * blade keeps its tier across the same; that the boss who is already down stays
 * down while the run continues; that the hero comes back out of the hall where
 * he left it; and that the run can still be finished afterwards.
 *
 * Walking is not part of it - verify:level and verify:ending own that - so the
 * hero is put down where he needs to be. The fights are fought.
 *
 * Usage: node tools/verify-chain.mjs
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const fehler = [];
page.on('pageerror', (e) => fehler.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/?x=6`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => window.loop.stop());

const out = await page.evaluate(() => {
  const g = window.game, input = window.input, p = g.player;
  const ctx = document.querySelector('canvas').getContext('2d');
  const t = (a = {}) => {
    for (const [k, v] of Object.entries({ left: false, right: false, jump: false, attack: false, parry: false, confirm: false, ...a })) input.forceDown(k, v);
    g.update(1 / 60, input);
    g.render(ctx);
  };
  const schritte = [];
  const melde = (was, daten) => schritte.push({ was, ...daten });
  const spawnKachel = (kind) => g.level.spawns.find((s) => s.kind === kind)?.tx ?? null;

  /** Dialoge weglesen. */
  const lesen = (max = 60 * 10) => {
    let zeilen = 0;
    for (let f = 0; f < max && g.dialogue; f++) { zeilen = Math.max(zeilen, g.dialogue.lines.length); t({ confirm: f % 14 < 4 }); }
    return zeilen;
  };
  /** Den Helden hinsetzen, ohne zu laufen. */
  const hinsetzen = (tx, ty = 17) => {
    p.x = tx * 32; p.y = ty * 32 - p.h; p.vx = 0; p.vy = 0; p.dead = false;
    g.camera.snapTo(p.cx, p.cy);
    for (let i = 0; i < 6; i++) t();
  };
  /** Einen Gegner-Boss erledigen: hinlaufen, hauen, Held bleibt am Leben. */
  const erledigen = (kind, sekunden = 90) => {
    const finde = () => g.enemies.find((e) => e.kind === kind && !e.dead);
    if (!finde()) return { note: 'nicht da' };
    let f = 0;
    for (; f < 60 * sekunden; f++) {
      if (g.state !== 'playing') { t({ confirm: f % 12 < 4 }); continue; }
      if (g.dialogue) break;
      const b = finde();
      if (!b) break;
      b.engaged = true;
      p.hp = p.maxHp; p.dead = false; p.invuln = Math.max(p.invuln, 0.25);
      const d = b.cx - p.cx;
      t({ right: d > 52, left: d < -52, attack: f % 11 < 4 });
    }
    return { gefallen: !finde(), sekunden: +(f / 60).toFixed(1) };
  };

  g.state = 'playing';
  melde('start', { herzen: p.maxHp, stufe: p.beamTier, zone: g.currentZone });

  /* 1. Gallert */
  hinsetzen(spawnKachel('gallert') - 6);
  const gal = erledigen('gallert');
  const galZeilen = lesen();
  melde('Gallert', { ...gal, dialogzeilen: galZeilen, herzen: p.maxHp, hp: p.hp, stufe: p.beamTier });

  /* 2. Ein Tod dazwischen: Herzkern und toter Boss müssen bleiben */
  p.invuln = 0; p.hurt(99, 1, g, true);
  for (let f = 0; f < 60 * 6; f++) t({ confirm: f % 12 < 4 });
  melde('nach einem Tod', {
    herzen: p.maxHp, hp: p.hp, gallertWiederDa: g.enemies.some((e) => e.kind === 'gallert' && !e.dead), zustand: g.state,
  });

  /* 3. Thalassa */
  hinsetzen(spawnKachel('thalassa') - 6, 18);
  const tha = erledigen('thalassa', 120);
  const thaZeilen = lesen();
  melde('Thalassa', { ...tha, dialogzeilen: thaZeilen, herzen: p.maxHp, stufe: p.beamTier });

  /* 4. Alle Edelsteine -> Kristallhort */
  for (const q of g.pickups.filter((x) => x.kind === 'gem')) { q.dead = true; g.collected.add(q.id); }
  g.gems = g.totalGems;
  let angebot = 0;
  for (let f = 0; f < 60 * 4 && !g.dialogue; f++) t();
  angebot = g.dialogue ? g.dialogue.lines.length : 0;
  lesen();
  for (let i = 0; i < 30; i++) t();
  melde('Kristallhort', { angebotZeilen: angebot, zone: g.currentZone, drin: g.inCrystalWorld, herzen: p.maxHp, stufe: p.beamTier });

  /* 5. Prismarch */
  const pri = erledigen('prismarch', 150);
  const priZeilen = lesen();
  for (let i = 0; i < 40; i++) t();
  melde('Prismarch', { ...pri, dialogzeilen: priZeilen, zone: g.currentZone, drin: g.inCrystalWorld, herzen: p.maxHp, stufe: p.beamTier, kachel: Math.round(p.cx / 32) });

  /* 6. Der Ritter: skaliert, und pariert er die Sichel? */
  hinsetzen(spawnKachel('boss') - 20, 17);
  for (let f = 0; f < 60 * 20 && !g.boss.engaged; f++) { p.hp = p.maxHp; t({ right: true, jump: f % 90 < 12 }); }
  for (let f = 0; f < 60 * 4 && g.boss.state === 'intro'; f++) t();
  const ritterHp = g.boss.maxHp;
  // Sicheln aus der Ferne auf den offenen Ritter
  const heim = g.boss.x;
  let vorher = g.boss.hp, pariert = 0;
  for (let f = 0; f < 60 * 4; f++) {
    g.boss.state = 'idle'; g.boss.timer = 9; g.boss.x = heim; g.boss.vx = 0;
    p.x = heim - 210; p.vx = 0; p.facing = 1; p.invuln = 999; p.hp = p.maxHp;
    const l = g.boss.guardLock;
    t({ attack: f % 30 < 4 });
    if (g.boss.guardLock > l) pariert++;
  }
  melde('Ritter', { maxHp: ritterHp, sichelnPariert: pariert, schadenAusDerFerne: vorher - g.boss.hp, stufe: p.beamTier });

  /* 7. Ritter fällt, Siegel bricht */
  let f2 = 0;
  for (; f2 < 60 * 120 && !g.boss.dead; f2++) {
    if (g.state !== 'playing') { t({ confirm: true }); continue; }
    p.hp = p.maxHp; p.dead = false; p.invuln = Math.max(p.invuln, 0.3);
    const d = g.boss.cx - p.cx;
    if (Math.abs(d) > 400) { p.x = g.boss.x - 60; p.vx = 0; }
    t({ right: d > 46, left: d < -46, attack: f2 % 11 < 4 });
  }
  for (let i = 0; i < 60 * 5; i++) t();
  melde('Siegel', { ritterTot: g.boss.dead, siegelOffen: !g.level.exitSealed, sekunden: +(f2 / 60).toFixed(1), zustand: g.state });

  /* 8. Die Fünfkronige: sie hält das Tor zu, bis der letzte Kopf fällt */
  const hydraKachel = spawnKachel('hydra');
  hinsetzen(hydraKachel - 5, 17);
  for (let f = 0; f < 60 * 3; f++) { p.hp = p.maxHp; t(); }
  const hydra = () => g.enemies.find((e) => e.kind === 'hydra' && !e.dead);
  const geweckt = !!hydra()?.engaged;
  // Am Tor stehen, solange sie lebt: der Lauf darf hier nicht enden.
  const tor0 = spawnKachel('portal');
  hinsetzen(tor0 - 1, 17);
  for (let f = 0; f < 60 * 3 && g.state === 'playing'; f++) { p.hp = p.maxHp; t(); }
  const torZuBeiIhr = g.state === 'playing' && g.victoryTimer === 0;
  /*
   * Ihr Kampf steht in verify:hydra - Hälse abschlagen, die Stümpfe mit ihrem
   * eigenen Feuer ausbrennen. Hier zählt nur das Gelenk: dass ihr Fall das Tor
   * aufmacht. Also werden die vier brennbaren Hälse direkt auf "ausgebrannt"
   * gesetzt und das Feuer ausgeblasen - genau die Siegbedingung, ohne den
   * Kampf ein zweites Mal zu fahren.
   */
  hinsetzen(hydraKachel - 5, 17);
  const sie = hydra();
  for (let f = 0; f < 60 * 2; f++) { p.hp = p.maxHp; p.invuln = 999; t(); }
  const lebteVorDemLetzten = !!hydra();
  for (const hals of sie.necks) {
    if (hals.kind === 'flame') continue;
    hals.state = 'sealed';
    hals.hp = 0;
  }
  sie.struck = sie.necks.findIndex((n) => n.kind === 'flame');
  sie.hurt(999, 1, g);
  for (let f = 0; f < 60 * 3; f++) { p.hp = p.maxHp; p.invuln = 999; t(); }
  melde('Fünfkronige', {
    geweckt,
    torZuBeiIhr,
    lebteVorDemLetzten,
    gefallen: !hydra(),
    torWiederOffen: !g.level.lairClosed,
    herzen: p.maxHp,
    stufe: p.beamTier,
  });

  /* 9. Tor */
  const tor = spawnKachel('portal');
  hinsetzen(tor - 4, 17);
  for (let f = 0; f < 60 * 12 && g.state === 'playing'; f++) { p.hp = p.maxHp; t({ right: true }); }
  for (let i = 0; i < 60 * 8; i++) t({ confirm: i % 20 < 4 });
  melde('Tor', { zustand: g.state, wahresEnde: g.trueEnding, herzen: p.maxHp, stufe: p.beamTier });

  return schritte;
});

const step = (name) => out.find((s) => s.was === name) ?? {};
const start = step('start');
const gallert = step('Gallert');
const afterDeath = step('nach einem Tod');
const thalassa = step('Thalassa');
const hall = step('Kristallhort');
const prismarch = step('Prismarch');
const knight = step('Ritter');
const seal = step('Siegel');
const hydra = step('Fünfkronige');
const gate = step('Tor');

const ok =
  start.herzen === 6 &&
  start.stufe === 0 &&
  // The bog: a heart more, and the bar filled on the spot.
  gallert.gefallen === true &&
  gallert.dialogzeilen >= 3 &&
  gallert.herzen === 7 &&
  gallert.hp === 7 &&
  // A death costs neither the heart nor the boss that is already down.
  afterDeath.herzen === 7 &&
  afterDeath.gallertWiederDa === false &&
  afterDeath.zustand === 'playing' &&
  // The drowned hall: the first tier of the blade, heart intact.
  thalassa.gefallen === true &&
  thalassa.dialogzeilen >= 3 &&
  thalassa.stufe === 1 &&
  thalassa.herzen === 7 &&
  // Every gem opens the way, and the teleport carries both rewards along.
  hall.angebotZeilen >= 4 &&
  hall.drin === true &&
  hall.zone === 'Der Kristallhort' &&
  hall.herzen === 7 &&
  hall.stufe === 1 &&
  // The heart of the crystal sharpens the blade and puts him back.
  prismarch.gefallen === true &&
  prismarch.drin === false &&
  prismarch.stufe === 2 &&
  prismarch.herzen === 7 &&
  // The knight sizes up the sharpened blade, and answers its crescents.
  knight.maxHp === 92 &&
  knight.sichelnPariert >= 4 &&
  knight.schadenAusDerFerne === 0 &&
  // And the run can still be finished.
  seal.ritterTot === true &&
  seal.siegelOffen === true &&
  // Und das Tor gehört ihr, bis der fünfte Kopf fällt.
  hydra.geweckt === true &&
  hydra.torZuBeiIhr === true &&
  hydra.lebteVorDemLetzten === true &&
  hydra.gefallen === true &&
  hydra.torWiederOffen === true &&
  hydra.herzen === 7 &&
  hydra.stufe === 2 &&
  gate.zustand === 'victory' &&
  gate.wahresEnde === true &&
  gate.herzen === 7 &&
  gate.stufe === 2 &&
  fehler.length === 0;

console.log(JSON.stringify({ ok, steps: out, pageErrors: fehler }, null, 2));
await browser.close();
server.close();

if (!ok) {
  console.error(
    'FAIL: the reward chain broke somewhere - a reward was lost across a death or a teleport, a ' +
      'boss came back, the knight was not sized up for the blade, or the run can no longer be ' +
      'finished.',
  );
  process.exit(1);
}
console.log(
  'OK: the bog leaves a seventh heart, the drowned crown a blade that throws, the crystal heart ' +
    'sharpens it, everything survives a death and a teleport, the knight answers the crescent, ' +
    'and the gate still ends the run.',
);
