/**
 * Every boss on the road, measured the same way: is it a fight, and is it a
 * fair one?
 *
 * See balance/harness.mjs for the bench. Each boss is met with the relics the
 * road has handed the hero by then, and fought twice over, by two heroes who
 * are both kept alive while every heart they lose is counted:
 *
 *   reader - sees the fight 0.3 s late, swings only from the floor, jumps only
 *            to get out of the way. The question is whether a person who reads
 *            the boss gets through it: in reasonable time, at a cost well short
 *            of his hearts. More than that, and the boss is too strong.
 *   masher - walks up and swings, and reads nothing. The question is whether
 *            the boss is a fight at all: he must pay a good deal more than the
 *            reader. Less than that, and the boss is too weak.
 *
 * Usage:
 *   node tools/verify-balance.mjs                  every boss, three fights each
 *   node tools/verify-balance.mjs --boss wyrm      one boss (comma list for more)
 *   node tools/verify-balance.mjs --runs 5         more fights per boss
 *   node tools/verify-balance.mjs --style reader   only the reader (or masher)
 *   node tools/verify-balance.mjs --dist dir       another build than dist/
 */
import path from 'node:path';
import { ROAD, fight, open, readerFor, relicsBefore, stage, useReader } from './balance/harness.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const only = arg('boss', null)?.split(',');
const RUNS = Number(arg('runs', 3));
const STYLE = arg('style', 'both');
const dist = arg('dist', null);

/**
 * What "a fight, and a fair one" means, in numbers, by where on the road the
 * boss stands. The reader is a bot: he never misjudges a tell he has seen, so
 * what he loses is the floor of what a person loses, not the average.
 *
 *   seconds     - how long the reader may take, at most (his median)
 *   hearts      - how many hearts the reader may lose, at most (his median),
 *                 always short of the hearts the hero has
 *   masher      - how many hearts the masher has to lose at least (his
 *                 median) - or not get the boss down at all. Comparing rates
 *                 alone let a masher through who lost one heart where the
 *                 reader lost none: that is a boss that does not need reading.
 */
const BAND = {
  early: { seconds: 60, hearts: 2, masher: 3 },
  middle: { seconds: 75, hearts: 3, masher: 5 },
  late: { seconds: 90, hearts: 4, masher: 7 },
};

const bench = await open(dist ? path.resolve(dist) : undefined);
const median = (xs) => {
  const s = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : +((s[m - 1] + s[m]) / 2).toFixed(1);
};

const rows = [];
for (const boss of ROAD) {
  if (only && !only.includes(boss.kind)) continue;
  const reader = await readerFor(boss.kind);
  const row = { ...boss, relics: relicsBefore(boss.kind).length, reader: [], masher: [] };
  const styles = STYLE === 'both' ? ['reader', 'masher'] : [STYLE];
  for (const style of styles) {
    if (style === 'reader' && !reader) continue;
    for (let r = 0; r < RUNS; r++) {
      await stage(bench, boss.kind);
      if (style === 'reader') await useReader(bench.page, reader);
      const cap = style === 'reader' ? 180 : 120;
      const res = await fight(bench.page, style, cap);
      if (!res) {
        console.log(`  ${boss.name}: never woke`);
        break;
      }
      row[style].push(res);
      row.maxHp = res.maxHp;
      row.heroHearts = res.heroHearts;
      const what = res.felled ? `${res.seconds} s` : `not felled in ${cap} s (${Math.round(res.left * 100)} % left)`;
      console.log(`  ${boss.name.padEnd(16)} ${style.padEnd(6)} ${what.padEnd(28)} ${String(res.hearts).padStart(3)} hearts   ${JSON.stringify(res.why)}`);
    }
  }
  rows.push(row);
}
await bench.close();

/* ------------------------------------------------------------- the table */

const fmt = (runs, key) => {
  const xs = runs.map((r) => (key === 'seconds' ? (r.felled ? r.seconds : null) : r[key]));
  if (!runs.length) return '-';
  const fell = runs.filter((r) => r.felled).length;
  if (key === 'seconds' && fell < runs.length) return `${median(xs) ?? '-'} (${fell}/${runs.length})`;
  return `${median(xs)}`;
};
console.log('');
console.log('Boss               Relikte  Leben  Herzen | Leser: Sekunden  Herzen | Draufhauer: Sekunden  Herzen');
for (const row of rows) {
  console.log(
    `${row.name.padEnd(18)} ${String(row.relics).padStart(7)}  ${String(row.maxHp ?? '-').padStart(5)}  ${String(row.heroHearts ?? '-').padStart(6)} | ` +
      `${fmt(row.reader, 'seconds').padStart(15)}  ${fmt(row.reader, 'hearts').padStart(6)} | ` +
      `${fmt(row.masher, 'seconds').padStart(20)}  ${fmt(row.masher, 'hearts').padStart(6)}`,
  );
}

/* ------------------------------------------------------------ the checks */

const checks = [];
for (const row of rows) {
  const band = BAND[row.band];
  if (row.reader.length) {
    const fell = row.reader.every((r) => r.felled);
    const secs = median(row.reader.map((r) => r.seconds));
    const hearts = median(row.reader.map((r) => r.hearts));
    checks.push([
      `${row.name}: a hero who reads it fells it every time, in ${secs} s (at most ${band.seconds})`,
      fell && secs !== null && secs <= band.seconds,
    ]);
    checks.push([
      `${row.name}: reading it costs ${hearts} hearts (at most ${band.hearts}, of ${row.heroHearts})`,
      hearts !== null && hearts <= band.hearts && hearts < row.heroHearts,
    ]);
    if (row.masher.length) {
      const mash = median(row.masher.map((r) => r.hearts));
      const mashSecs = median(row.masher.map((r) => (r.felled ? r.seconds : 120)));
      const readRate = hearts / Math.max(1, secs ?? 1);
      const mashRate = mash / Math.max(1, mashSecs ?? 1);
      const mashFell = row.masher.filter((r) => r.felled).length;
      checks.push([
        `${row.name}: mashing does not work - ${mash} hearts in ${mashSecs} s (at least ${band.masher}, or no fall), against ${hearts} in ${secs} s reading`,
        (mash >= band.masher || mashFell * 2 < row.masher.length) && mashRate >= readRate * 2,
      ]);
    }
  } else {
    checks.push([`${row.name}: has a reader`, false]);
  }
}
checks.push(['no page errors', bench.errors.length === 0]);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}`);
}
if (failed) {
  console.error(`FAIL: ${failed} of ${checks.length} checks.`);
  process.exit(1);
}
console.log(`OK: all ${checks.length} checks - every boss measured is a fight, and none of them is a wall.`);
