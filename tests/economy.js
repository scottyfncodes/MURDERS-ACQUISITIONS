// Economy audit: five strategies over a 14-night lease, several seeds. node tests/economy.js [seeds] [label]
// Reports what the acceptance criteria ask about: net BU after every cost, early-game output, late-lease decisions
// (hazards, actions, blood in nights 11-14), veteran losses, fumigations and how saturated suspicion is.
const { campaign } = require('./bot.js');
const SEEDS = Number(process.argv[2]) || 3, LABEL = process.argv[3] || '', NIGHTS = Number(process.env.NIGHTS) || 14;
const STRATEGIES = {
  balanced: { profile: 'careful', lookout: true, dryEase: true },
  'full investment': { profile: 'careful', lookout: true, dryEase: true, acquire: true, gm: 'standard', train: 2, research: ['numbing', 'thinner'] },
  'lie low': { profile: 'careful', lookout: true, dryEase: true, acquire: true, gm: (c) => (c.booking !== null ? 'lie' : 'standard'), train: 1, lieLow: true },
  'lean workforce': { profile: 'careful', lookout: true, dryEase: true, maxStaff: 12 },
  'balanced + final harvest': { profile: 'careful', lookout: true, dryEase: true, harvestFrom: 14 },
  'aggressive extraction': { profile: 'careful', lookout: true, push: 'always', acquire: true, gm: 'aggressive', research: ['thinner'] },
};
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0), mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
function measure(name) {
  const runs = []; for (let seed = 1; seed <= SEEDS; seed++) runs.push(campaign(Object.assign({ nights: NIGHTS, seed }, STRATEGIES[name])).log);
  const per = (f) => mean(runs.map(f)), late = (log) => log.slice(10, 14);
  return {
    name,
    blood: per((l) => sum(l, (x) => x.blood)),
    net: per((l) => sum(l, (x) => x.blood - x.spent - (x.opCost || 0))), nets: runs.map((l) => sum(l, (x) => x.blood - x.spent - (x.opCost || 0))),
    opCost: per((l) => sum(l, (x) => x.opCost || 0)),
    early: per((l) => sum(l.slice(0, 5), (x) => x.blood)),
    lateBlood: per((l) => mean(late(l).map((x) => x.blood))),
    lateHaz: per((l) => mean(late(l).map((x) => x.hits))),
    lateAct: per((l) => mean(late(l).map((x) => x.actions))),
    lost: per((l) => sum(l, (x) => x.lost)),
    vetLost: per((l) => sum(l, (x) => x.deadRanks.filter((r) => r >= 2).length + x.fumRanks.filter((r) => r >= 2).length)),
    fum: per((l) => l.filter((x) => x.fumigated >= 0).length), fumLost: per((l) => sum(l, (x) => Math.max(0, x.fumigated))),
    booked: per((l) => sum(l, (x) => x.booked)), cancel: per((l) => sum(l, (x) => x.cancelled)),
    sat: per((l) => l.filter((x) => x.suspicion >= 95).length),
    idle: per((l) => l[l.length - 1].bank / Math.max(1, mean(late(l).map((x) => x.blood)))),
    vigor: per((l) => Math.min(...l.map((x) => x.vigor))),
    staff: per((l) => l[l.length - 1].staffEnd),
    nightly: Array.from({ length: NIGHTS }, (_, i) => per((l) => l[i].blood)),
  };
}
if (require.main === module) {
  const r = Math.round, f = (v, d) => v.toFixed(d);
  console.log(`Economy audit ${LABEL} — ${NIGHTS} nights, ${SEEDS} seeds per strategy (BU)\n`);
  console.log('strategy               |  lease   net*   costs  N1-5 | late: blood haz  act | lost vets | fum  cut book canc sat | idle  vigor staff');
  const all = [];
  for (const name of Object.keys(STRATEGIES)) {
    const x = measure(name); all.push(x);
    console.log(`${name.padEnd(22)} | ${String(r(x.blood)).padStart(6)} ${String(r(x.net)).padStart(6)} ${String(r(x.opCost)).padStart(6)} ${String(r(x.early)).padStart(5)} | ${String(r(x.lateBlood)).padStart(10)} ${f(x.lateHaz, 1).padStart(4)} ${f(x.lateAct, 0).padStart(4)} | ${f(x.lost, 0).padStart(4)} ${f(x.vetLost, 1).padStart(4)} | ${f(x.fum, 1).padStart(3)} ${f(x.fumLost, 0).padStart(4)} ${f(x.booked, 1).padStart(4)} ${f(x.cancel, 1).padStart(4)} ${f(x.sat, 0).padStart(3)} | ${f(x.idle, 1).padStart(4)} ${f(x.vigor, 2).padStart(6)} ${f(x.staff, 0).padStart(5)}`);
    console.log(`   nightly ${x.nightly.map((v) => r(v)).join(' ')}`);
  }
  // who wins each seed on net BU: no strategy should win them all
  const wins = {}; for (let i = 0; i < SEEDS; i++) { const best = all.reduce((a, b) => (b.nets[i] > a.nets[i] ? b : a)); wins[best.name] = (wins[best.name] || 0) + 1; }
  console.log(`\nbest net per seed: ${Object.entries(wins).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log('net by seed: ' + all.map((x) => `${x.name} [${x.nets.map((v) => Math.round(v / 100) / 10 + 'k').join(' ')}]`).join('; '));
  console.log('\n* net = blood taken minus everything spent (buildings, hires, acquisitions, research, payroll, upkeep).');
  console.log('late = nights 11-14. vets = Senior Associates and Partners lost (deaths and restructurings). sat = nights at 95%+ suspicion.');
  console.log('idle = bank at dawn after night 14, in nights of late income. vigor = the host\'s lowest condition over the lease (1 = fresh).');
}
module.exports = { STRATEGIES, measure };
