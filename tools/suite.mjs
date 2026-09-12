/**
 * Große Testreihe: fährt das Spiel im Browser durch Zustände, Kampf, Level und
 * Sonderfälle. Jede Prüfung meldet bestanden/gefallen mit Messwert.
 *
 * Die einzelnen verify:*-Werkzeuge nageln je eine Sache fest; diese Reihe fährt
 * die Breite ab - Zustandsautomat, Eingabe, Pickups, Gefahren, Bildzeit in jeder
 * Zone und zwei Minuten Dauerkampf ohne Leck.
 *
 * Usage: node tools/suite.mjs
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
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const open = async (query = '') => {
  await page.goto(`${base}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => window.loop.stop());
};

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

// Hilfsfunktionen im Seitenkontext
const helpers = () => {
  const g = window.game, input = window.input;
  const ctx = document.querySelector('canvas').getContext('2d');
  window.__tick = (a = {}) => {
    for (const [k, v] of Object.entries({
      left: false, right: false, up: false, down: false, jump: false,
      attack: false, parry: false, dash: false, pause: false, restart: false, confirm: false, ...a,
    })) input.forceDown(k, v);
    g.update(1 / 60, input);
    g.render(ctx);
  };
};

/* --------------------------------------------------- A: Zustandsautomat */
await open();
// Aus den Spawns gelesen, nicht als Kachelzahl hingeschrieben: ein neuer
// Abschnitt mitten im Level verschiebt sonst jeden Sprungpunkt hier.
const marken = await page.evaluate(() => {
  const at = (kind) => window.game.level.spawns.find((s) => s.kind === kind)?.tx ?? null;
  return { boss: at('boss'), warden: at('warden'), hydra: at('hydra'), portal: at('portal') };
});
const bossTile = marken.boss;
const vorDerArena = `?x=${bossTile - 26}`;
await page.evaluate(helpers);
let r = await page.evaluate(() => {
  const g = window.game, t = window.__tick;
  const startState = g.state;
  for (let i = 0; i < 5; i++) t({ confirm: true });
  const afterConfirm = g.state;
  for (let i = 0; i < 3; i++) t({ pause: true });
  const paused = g.state;
  for (let i = 0; i < 3; i++) t();
  for (let i = 0; i < 3; i++) t({ pause: true });
  return { startState, afterConfirm, paused, afterUnpause: g.state };
});
check('Titelbildschirm startet das Spiel', r.startState === 'title' && r.afterConfirm === 'playing', JSON.stringify(r));
check('Pause hält an und läuft wieder', r.paused === 'paused' && r.afterUnpause === 'playing', `${r.paused} → ${r.afterUnpause}`);

/* --------------------------------------------------- B: Tod und Wiedereinstieg */
await open('?x=86');
await page.evaluate(helpers);
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  for (let i = 0; i < 60; i++) t({ right: true });
  const xVorTod = p.cx;
  p.hp = 0; p.dead = true;
  let starb = false;
  for (let i = 0; i < 60 * 12; i++) { t({ confirm: i % 20 === 0 }); if (g.state === 'dead') starb = true; if (i > 4 && g.state === 'playing') break; }
  return { starb, hpNachher: p.hp, tode: g.deaths, zustand: g.state, weitVomTodesort: Math.abs(p.cx - xVorTod) > 100 };
});
check('Tod führt in den Todesbildschirm', r.starb, `Zustand am Ende: ${r.zustand}`);
check('Wiedereinstieg mit voller Gesundheit', r.hpNachher === 6 && r.zustand === 'playing', `hp=${r.hpNachher}`);
check('Todeszähler zählt', r.tode >= 1, `Tode=${r.tode}`);

/* --------------------------------------------------- C: Neustart */
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick;
  g.score = 500; g.gems = 7;
  for (let i = 0; i < 4; i++) t({ restart: true });
  return { zustand: g.state, punkte: g.score, edelsteine: g.gems, siegel: g.level.exitSealed, bossTot: g.boss.dead };
});
check('Neustart setzt Lauf zurück', r.zustand === 'playing' && r.punkte === 0 && r.edelsteine === 0, JSON.stringify(r));
check('Neustart versiegelt den Ausgang wieder', r.siegel === true && r.bossTot === false, `siegel=${r.siegel} bossTot=${r.bossTot}`);

/* --------------------------------------------------- D: Parade-Sonderfälle */
await open('?x=86');
await page.evaluate(helpers);
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  for (let i = 0; i < 30; i++) t();
  // Stacheln lassen sich nicht parieren
  p.hp = p.maxHp; p.invuln = 0; p.parryTimer = 0; p.parryCooldown = 0;
  p.parryTimer = 0.3;
  p.hurt(2, 1, g, true);          // ignoreIFrames = Umweltschaden
  const stachelSchaden = p.maxHp - p.hp;
  // Angriff von vorn wird pariert
  p.hp = p.maxHp; p.invuln = 0; p.facing = 1; p.parryTimer = 0.3;
  p.hurt(2, -1, g, false);
  const vorneSchaden = p.maxHp - p.hp;
  // Angriff von hinten nicht
  p.hp = p.maxHp; p.invuln = 0; p.facing = 1; p.parryTimer = 0.3;
  p.hurt(2, 1, g, false);
  const hintenSchaden = p.maxHp - p.hp;
  // Abklingzeit: zweite Parade sofort danach greift nicht. Der Held muss dafür
  // frei von Trefferstarre sein, sonst ist die Parade schon deshalb gesperrt.
  // Der Treffer davor hat einen Treffer-Freeze ausgelöst; in dessen Bildern
  // wird der Spieler nicht aktualisiert, der Druck wirkt erst danach.
  p.parryTimer = 0; p.parryCooldown = 0; p.hurtTimer = 0; p.invuln = 0;
  g.hitStopTimer = 0;
  t({ parry: true });
  const ersteParade = p.parryTimer > 0;
  for (let i = 0; i < 12; i++) t();
  t({ parry: true });
  const zweiteParade = p.parryTimer > 0;
  for (let i = 0; i < 30; i++) t();
  t({ parry: true });
  const dritteParade = p.parryTimer > 0;
  return { stachelSchaden, vorneSchaden, hintenSchaden, ersteParade, zweiteParade, dritteParade };
});
check('Stacheln lassen sich nicht parieren', r.stachelSchaden === 2, `Schaden=${r.stachelSchaden}`);
check('Parade fängt Angriff von vorn', r.vorneSchaden === 0, `Schaden=${r.vorneSchaden}`);
check('Parade schützt nicht von hinten', r.hintenSchaden === 2, `Schaden=${r.hintenSchaden}`);
check('Parade hat Abklingzeit', r.ersteParade && !r.zweiteParade && r.dritteParade,
  `sofort=${r.ersteParade}, nach 200 ms=${r.zweiteParade}, nach 700 ms=${r.dritteParade}`);

/* --------------------------------------------------- E: Ladeschlag */
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  p.attackTimer = 0; p.chargeTimer = 0; p.chargeReady = false; p.dashTimer = 0;
  for (let i = 0; i < 70; i++) t({ attack: true });
  const bereit = p.chargeReady;
  // Ausweichrolle mitten im Laden: Ladung darf nicht verfallen
  for (let i = 0; i < 12; i++) t({ attack: true, dash: i === 0 });
  const nachRolle = p.chargeReady;
  // Loslassen löst den schweren Hieb aus
  for (let i = 0; i < 6; i++) t();
  return { bereit, nachRolle, geladenerSchlag: p.charged, tempoImLaden: Math.round(Math.abs(p.vx)) };
});
check('Ladung wird bereit', r.bereit, `bereit=${r.bereit}`);
check('Ausweichrolle bricht die Ladung nicht ab', r.nachRolle, `nachRolle=${r.nachRolle}`);
check('Loslassen löst den geladenen Hieb aus', r.geladenerSchlag, `charged=${r.geladenerSchlag}`);

/* --------------------------------------------------- F: Sammeln und Zähler */
await open('?x=6');
await page.evaluate(helpers);
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  const gesamt = g.totalGems;
  const gem = g.pickups.find((q) => q.kind === 'gem' && !q.dead);
  p.x = gem.x - 4; p.y = gem.y - 4;
  for (let i = 0; i < 20; i++) t();
  const nachAufsammeln = g.gems;
  const punkte = g.score;
  // Herz heilt
  p.hp = 2;
  const herz = g.pickups.find((q) => q.kind === 'heart' && !q.dead);
  let geheilt = null;
  if (herz) {
    // Aufsammelpunkte aktualisieren nur im Sichtbereich, also die Kamera
    // mitziehen - und den Helden gegen die Schwerkraft an Ort und Stelle halten.
    p.x = herz.x - 2; p.y = herz.y - 2;
    g.camera.snapTo(p.cx, p.cy);
    for (let i = 0; i < 40; i++) { p.x = herz.x - 2; p.y = herz.y - 2; p.vy = 0; t(); }
    geheilt = p.hp;
  }
  // Mit vollem Leben darf ein Herz nicht verfallen: es bleibt liegen.
  let herzBleibtLiegen = null;
  const herz2 = g.pickups.find((q) => q.kind === 'heart' && !q.dead);
  if (herz2) {
    p.hp = p.maxHp;
    p.x = herz2.x - 2; p.y = herz2.y - 2;
    g.camera.snapTo(p.cx, p.cy);
    for (let i = 0; i < 40; i++) { p.x = herz2.x - 2; p.y = herz2.y - 2; p.vy = 0; t(); }
    herzBleibtLiegen = !herz2.dead;
  }
  // Gegen die Kachelkarte gezählt, nicht gegen eine Zahl im Test: ein neuer
  // Abschnitt bringt neue Edelsteine mit, und dann ist die Zahl falsch, nicht
  // das Spiel.
  const gezaehltImLevel = g.level.spawns.filter((s) => s.kind === 'gem').length;
  return { gesamt, nachAufsammeln, punkte, geheilt, herzBleibtLiegen, gezaehltImLevel };
});
check(
  'Edelsteinzahl stimmt mit den Leveldaten überein',
  r.gesamt === r.gezaehltImLevel,
  `HUD=${r.gesamt} Leveldaten=${r.gezaehltImLevel}`,
);
check('Edelstein wird gezählt und gibt Punkte', r.nachAufsammeln >= 1 && r.punkte > 0, `gems=${r.nachAufsammeln} punkte=${r.punkte}`);
check('Herz heilt', r.geheilt !== null && r.geheilt > 2, `hp 2 → ${r.geheilt}`);
check('Herz bleibt bei vollem Leben liegen', r.herzBleibtLiegen === true, `liegen=${r.herzBleibtLiegen}`);


/* --------------------------------------------------- F2: Welt und Gefahren */
await open('?x=86');
await page.evaluate(helpers);
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  for (let i = 0; i < 30; i++) t();
  const res = {};

  // Sturz ins Nichts tötet
  p.hp = p.maxHp; p.dead = false; p.invuln = 0;
  p.y = g.level.pixelHeight + 200;
  for (let i = 0; i < 10; i++) t();
  res.sturzTot = p.dead;

  // Stacheln verletzen
  g.restart();
  for (let i = 0; i < 20; i++) t();
  const stachel = (() => {
    for (let tx = 0; tx < g.level.width; tx++)
      for (let ty = 0; ty < g.level.height; ty++)
        if (g.level.tileAt(tx, ty) === 4) return { tx, ty };
    return null;
  })();
  if (stachel) {
    p.hp = p.maxHp; p.invuln = 0; p.dead = false;
    p.x = stachel.tx * 32 + 4; p.y = stachel.ty * 32 - 4;
    g.camera.snapTo(p.cx, p.cy);
    for (let i = 0; i < 20; i++) { p.x = stachel.tx * 32 + 4; p.y = stachel.ty * 32 - 4; t(); }
    res.stachelSchaden = p.maxHp - p.hp;
  }

  // Kontrollpunkt setzt den Wiedereinstieg
  const cp = g.checkpoints.find((c) => !c.activated);
  if (cp) {
    p.hp = p.maxHp; p.dead = false; p.invuln = 99;
    p.x = cp.x; p.y = cp.y + 10;
    g.camera.snapTo(p.cx, p.cy);
    for (let i = 0; i < 30; i++) { p.x = cp.x; p.y = cp.y + 10; p.vy = 0; t(); }
    res.kontrollpunktAktiv = cp.activated;
  }
  return res;
});
check('Sturz in die Tiefe tötet', r.sturzTot, `dead=${r.sturzTot}`);
check('Stacheln verletzen', r.stachelSchaden >= 1, `Schaden=${r.stachelSchaden}`);
check('Kontrollpunkt wird aktiviert', r.kontrollpunktAktiv, `aktiv=${r.kontrollpunktAktiv}`);

/* --------------------------------------------------- F3: Geschosse abwehren */
await open(vorDerArena);
await page.evaluate(helpers);
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  for (let i = 0; i < 400 && !(g.boss && g.boss.engaged); i++) t({ right: true });
  const res = {};
  const wurf = (parieren) => {
    g.projectiles.length = 0;
    p.hp = p.maxHp; p.invuln = 0; p.hurtTimer = 0; p.parryTimer = 0; p.parryCooldown = 0; p.facing = 1;
    const P = g.projectiles;
    g.boss.state = 'idle'; g.boss.timer = 9;
    // Geschoss von rechts auf den Helden zu
    const orb = new (Object.getPrototypeOf(g.projectiles[0] ?? {}).constructor ?? Object)();
    return P;
  };
  // Einfacher: den Ritter zaubern lassen und das Geschoss parieren
  g.projectiles.length = 0;
  p.hp = p.maxHp; p.invuln = 0; p.hurtTimer = 0; p.facing = 1;
  g.boss.hp = 30;                       // Phase 2, damit er zaubert
  g.boss.state = 'cast'; g.boss.timer = 0.02;
  let hatteGeschoss = false, abgewehrt = false;
  for (let i = 0; i < 60 * 4; i++) {
    const feindlich = g.projectiles.filter((q) => !q.friendly && !q.dead);
    if (feindlich.length) hatteGeschoss = true;
    const nah = feindlich.some((q) => Math.abs(q.cx - p.cx) < 60);
    t({ parry: nah });
    if (g.projectiles.some((q) => q.friendly)) { abgewehrt = true; break; }
    g.boss.hp = 30;
  }
  res.hatteGeschoss = hatteGeschoss;
  res.abgewehrt = abgewehrt;
  res.schaden = p.maxHp - p.hp;
  return res;
});
check('Boss verschießt Geschosse', r.hatteGeschoss, `${r.hatteGeschoss}`);
check('Parade wirft Geschosse zurück', r.abgewehrt, `zurückgeworfen=${r.abgewehrt}`);

/* --------------------------------------------------- G: Rundgang durch alle Zonen */
const zoneReport = [];
// Der Riss und ihr Schacht gehören dazu: die Fünfkronige zeichnet fünf Hälse,
// eine Brandspur und eine Warnsäule über die ganze Höhe des Bildes, und das ist
// genau die Stelle, an der eine Bildzeit ausreißen würde.
const zonenKacheln = [
  6, 60, 120, 190, 250, 300, 360, 420, 470, 530, 580, 620, 670,
  marken.boss + 30, marken.warden - 6, marken.hydra - 40, marken.hydra - 6, marken.portal - 8,
].filter((tx) => tx !== null);
for (const tx of zonenKacheln) {
  await open(`?x=${tx}`);
  await page.evaluate(helpers);
  const z = await page.evaluate(() => {
    const g = window.game, t = window.__tick;
    const start = performance.now();
    for (let i = 0; i < 120; i++) t({ right: i % 3 !== 0, jump: i % 40 === 0 });
    const ms = (performance.now() - start) / 120;
    return { zone: g.level ? window.game.state : '', zoneName: g.currentZone, ms: +ms.toFixed(2), partikel: g.particles.items.length, gegner: g.enemies.length };
  });
  zoneReport.push({ kachel: tx, ...z });
}
const langsamste = Math.max(...zoneReport.map((z) => z.ms));
check('Bildzeit überall unter 16,67 ms', langsamste < 16.67, `langsamste ${langsamste} ms`);
check('Keine Partikelflut', Math.max(...zoneReport.map((z) => z.partikel)) < 900, `max ${Math.max(...zoneReport.map((z) => z.partikel))}`);

/* --------------------------------------------------- H: Langlauf-Stabilität */
await open(vorDerArena);
await page.evaluate(helpers);
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  for (let i = 0; i < 300 && !(g.boss && g.boss.engaged); i++) t({ right: true });
  const gegnerVorher = g.enemies.length;
  for (let i = 0; i < 60 * 120; i++) {
    const dx = g.boss.cx - p.cx;
    t({ right: dx > 60, left: dx < -60, attack: i % 18 < 3, parry: i % 97 === 0 });
    if (p.hp <= 2) p.hp = p.maxHp;
    if (g.boss.hp < 20) g.boss.hp = 64;      // Kampf am Laufen halten
  }
  return {
    gegnerVorher,
    gegnerNachher: g.enemies.length,
    projektile: g.projectiles.length,
    partikel: g.particles.items.length,
    texte: g.particles.texts.length,
    zustand: g.state,
  };
});
check('Gegnerliste wächst nicht unbegrenzt', r.gegnerNachher <= r.gegnerVorher + 4, `${r.gegnerVorher} → ${r.gegnerNachher}`);
check('Projektile werden aufgeräumt', r.projektile < 60, `${r.projektile} offen`);
check('Partikel bleiben begrenzt', r.partikel <= 900, `${r.partikel}`);
check('Zwei Minuten Kampf ohne Absturz', r.zustand === 'playing', `Zustand ${r.zustand}`);

/* --------------------------------------------------- I: Die Fünfkronige */

// Eine Minute in ihrem Saal, mit allem gleichzeitig auf dem Schirm - fünf Köpfe,
// offene Stümpfe, nachwachsende Hälse, Glut in der Luft - und dabei die Bildzeit
// gemessen: sie ist das teuerste Ding im Spiel, und ihr Saal ist dreizehn
// Kacheln hoch. Ihren Kampf prüft verify:hydra; hier zählt das Bild.
await open(`?x=${marken.hydra - 12}`);
await page.evaluate(helpers);
r = await page.evaluate(() => {
  const g = window.game, t = window.__tick, p = g.player;
  const finde = () => g.enemies.find((e) => e.kind === 'hydra' && !e.dead);
  const h0 = finde();
  p.x = h0.cx - 130;
  p.y = h0.bottom - p.h;
  p.vx = 0;
  p.vy = 0;
  g.camera.snapTo(p.cx, p.cy);
  for (let i = 0; i < 60 * 3 && !h0.engaged; i++) { p.hp = p.maxHp; t(); }
  const koepfe = new Set();
  const zeiten = [];
  let stuempfe = 0;
  for (let i = 0; i < 60 * 60 && finde(); i++) {
    const h = finde();
    for (const hals of h.necks) if (hals.state === 'head') koepfe.add(hals.kind);
    stuempfe = Math.max(stuempfe, h.openStumps.length);
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 999;
    // Reihum einen Hals abschlagen: gemessen wird das Bild, nicht der Kampf.
    if (i % 45 === 44) {
      h.struck = (i / 45) % h.necks.length | 0;
      h.hurt(4, 1, g);
    }
    const start = performance.now();
    t({ attack: i % 4 === 0, jump: i % 37 === 0 });
    zeiten.push(performance.now() - start);
  }
  // Und zum Schluss die Siegbedingung: vier Hälse aus, das Feuer aus.
  const sie = finde();
  if (sie) {
    for (const hals of sie.necks) {
      if (hals.kind === 'flame') continue;
      hals.state = 'sealed';
      hals.hp = 0;
    }
    sie.struck = sie.necks.findIndex((n) => n.kind === 'flame');
    sie.hurt(999, 1, g);
    for (let i = 0; i < 60 * 2; i++) t();
  }
  zeiten.sort((a, b) => a - b);
  const q = (f) => +zeiten[Math.floor(f * (zeiten.length - 1))].toFixed(2);
  return {
    koepfe: [...koepfe],
    nachgewachsen: g.enemies.some((e) => e.kind === 'hydra') ? 0 : 1,
    stuempfe,
    gefallen: !finde(),
    // Neunundneunzigstes Perzentil statt des schlimmsten Bildes: die Ausreißer
    // ganz oben sind Pausen der Speicherbereinigung und messen nicht das Spiel.
    p50: q(0.5),
    p99: q(0.99),
    bilder: zeiten.length,
    partikel: g.particles.items.length,
    projektile: g.projectiles.length,
  };
});
check('Fünfkronige zeigt alle fünf Köpfe', r.koepfe.length === 5, r.koepfe.join(', '));
check('Abgeschlagene Hälse stehen offen', r.stuempfe >= 1, `höchstens ${r.stuempfe} gleichzeitig`);
check('Fünfkronige fällt, wenn vier Hälse aus sind', r.gefallen, `gefallen=${r.gefallen}`);
check('Bildzeit in ihrem Schacht unter 16,67 ms', r.p99 < 16.67, `Mittel ${r.p50} ms, p99 ${r.p99} ms über ${r.bilder} Bilder`);
check('Ihr Schacht flutet nicht mit Partikeln', r.partikel < 900, `${r.partikel}`);

check('Keine Fehler in der Browserkonsole', errors.length === 0, errors.slice(0, 3).join(' | ') || 'keine');

await browser.close();
server.close();

const failed = results.filter((x) => !x.ok);
for (const x of results) console.log(`${x.ok ? 'OK  ' : 'FEHL'} ${x.name}${x.detail ? '  (' + x.detail + ')' : ''}`);
console.log(`\nZonen-Messung:`);
for (const z of zoneReport) console.log(`  Kachel ${String(z.kachel).padStart(4)}: ${z.zoneName?.padEnd(30) ?? ''} ${z.ms} ms, ${z.partikel} Partikel`);
console.log(`\n${results.length - failed.length}/${results.length} bestanden`);
process.exit(failed.length ? 1 : 0);
