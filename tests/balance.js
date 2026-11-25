// The balance report: careful vs reckless management, with and without a lookout, over several nights and seeds.
// node tests/balance.js [nights] [seeds]   (prints a table; tests/sim.test.js asserts the conclusions)
const { campaign } = require('./bot.js');
const NIGHTS = Number(process.argv[2]) || 6, SEEDS = Number(process.argv[3]) || 4;

function run(profile, lookout) {
  const per = Array.from({ length: NIGHTS }, () => ({ blood: 0, lost: 0, hits: 0, calls: 0, lookoutCalls: 0, offArm: 0, storageFull: 0, suspicion: 0, hireSpend: 0, staff: 0 }));
  let growth = 0, lookoutNight = 0, lookoutSeeds = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { log } = campaign({ profile, lookout, nights: NIGHTS, seed });
    log.forEach((l, i) => { const p = per[i]; for (const k of ['blood', 'lost', 'hits', 'calls', 'lookoutCalls', 'offArm', 'storageFull', 'suspicion', 'hireSpend']) p[k] += l[k] / SEEDS; p.staff += l.staffEnd / SEEDS; });
    growth += (log[log.length - 1].staffEnd - log[0].staffStart) / SEEDS;
    const first = log.findIndex((l) => l.lookout > 0); if (first >= 0) { lookoutNight += first + 1; lookoutSeeds++; }
  }
  const sum = (k) => per.reduce((a, p) => a + p[k], 0);
  return { profile, lookout, per, blood: sum('blood'), lost: sum('lost'), hits: sum('hits'), calls: sum('calls'), lookoutCalls: sum('lookoutCalls'), offArm: sum('offArm'), storageFull: sum('storageFull'), hireSpend: sum('hireSpend'), growth, suspicion: per[NIGHTS - 1].suspicion, lookoutFrom: lookoutSeeds ? lookoutNight / lookoutSeeds : null };
}

function report() {
  const rows = [run('careful', false), run('careful', true), run('reckless', false), run('reckless', true)];
  return rows;
}
module.exports = { report, run, NIGHTS, SEEDS };

if (require.main === module) {
  const r = (n) => Math.round(n), rows = report();
  console.log(`Balance over ${NIGHTS} nights, averaged over ${SEEDS} seeds per row\n`);
  console.log('manager   lookout | blood   lost  net staff  hire spend  suspicion | hands  scatters (lookout)  off-arm s  storage-full s | lookout from night');
  for (const x of rows) console.log(`${x.profile.padEnd(9)} ${String(x.lookout ? 'yes' : 'no').padEnd(7)} | ${String(r(x.blood)).padStart(6)} ${String(r(x.lost)).padStart(5)} ${String(r(x.growth)).padStart(9)} ${String(r(x.hireSpend)).padStart(11)} ${String(r(x.suspicion)).padStart(9)}% | ${String(r(x.hits)).padStart(5)} ${String(r(x.calls)).padStart(9)} (${String(r(x.lookoutCalls)).padStart(3)}) ${String(r(x.offArm)).padStart(11)} ${String(r(x.storageFull)).padStart(15)} | ${x.lookoutFrom ? x.lookoutFrom.toFixed(1) : '-'}`);
  console.log('\nPer night (blood / lost):');
  for (const x of rows) console.log(`${x.profile.padEnd(9)} ${(x.lookout ? 'lookout' : 'none').padEnd(8)} ` + x.per.map((p, i) => `N${i + 1} ${r(p.blood)}/${r(p.lost)}`).join('  '));
}
