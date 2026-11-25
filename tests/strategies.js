// Strategy simulations for Acquisitions: every strategy plays a full 14-night lease and the start of the next host,
// over several seeds. node tests/strategies.js [nights] [seeds]
const { campaign } = require('./bot.js');
const NIGHTS = Number(process.argv[2]) || 16, SEEDS = Number(process.argv[3]) || 4;
const STRATEGIES = {
  'never acquire': { profile: 'careful', lookout: true },
  'acquire, untrained GM': { profile: 'careful', lookout: true, acquire: true, gm: 'standard' },
  'acquire, trained GM': { profile: 'careful', lookout: true, acquire: true, gm: 'standard', train: 2 },
  'acquire, aggressive GM': { profile: 'careful', lookout: true, acquire: true, gm: 'aggressive' },
  'acquire, lie low when booked': { profile: 'careful', lookout: true, acquire: true, gm: (c) => (c.booking !== null ? 'lie' : 'standard'), train: 1, lieLow: true },
  'acquire, hands-on (no delegation)': { profile: 'careful', lookout: true, acquire: true, gm: 'standard', handsOn: true },
  'reckless expansion': { profile: 'reckless', lookout: true, acquire: true, gm: 'aggressive' },
};
function run(name, nights, seeds) {
  const st = STRATEGIES[name], rows = [];
  for (let seed = 1; seed <= seeds; seed++) rows.push(campaign(Object.assign({ nights, seed }, st)).log);
  const avg = (f) => rows.reduce((a, log) => a + f(log), 0) / seeds;
  const lease = (log) => log.filter((l) => l.host === 1 || l.night <= 14);
  return {
    name, rows,
    blood: avg((log) => lease(log).reduce((a, l) => a + l.blood, 0)),
    lost: avg((log) => lease(log).reduce((a, l) => a + l.lost, 0) + lease(log).reduce((a, l) => a + Math.max(0, l.fumigated), 0)),
    fumigations: avg((log) => log.filter((l) => l.fumigated >= 0).length), booked: avg((log) => log.reduce((a, l) => a + l.booked, 0)), cancelled: avg((log) => log.reduce((a, l) => a + l.cancelled, 0)),
    acquiredOn: avg((log) => { const i = log.findIndex((l) => l.divisions > 1); return i < 0 ? 0 : i + 1; }),
    actions: avg((log) => { const late = log.filter((l) => l.divisions > 1); return late.length ? late.reduce((a, l) => a + l.actions, 0) / late.length : log.slice(-4).reduce((a, l) => a + l.actions, 0) / 4; }),
    peakSus: avg((log) => Math.max(...log.map((l) => l.suspicion))), staffEnd: avg((log) => log[Math.min(13, log.length - 1)].staffEnd),
    hireSpend: avg((log) => lease(log).reduce((a, l) => a + l.hireSpend, 0)), spent: avg((log) => lease(log).reduce((a, l) => a + l.spent, 0)),
    perNight: Array.from({ length: nights }, (_, i) => avg((log) => (log[i] ? log[i].blood : 0))),
    susNight: Array.from({ length: nights }, (_, i) => avg((log) => (log[i] ? log[i].susAfter : 0))),
    relocated: rows.every((log) => log.some((l) => l.host === 2)),
    net: Array.from({ length: nights }, (_, i) => avg((log) => (log[i] ? log[i].blood - log[i].spent : 0))),
  };
}
module.exports = { STRATEGIES, run };
if (require.main === module) {
  const r = Math.round; console.log(`${NIGHTS} nights (a 14-night lease, then the next host), ${SEEDS} seeds per strategy\n`);
  console.log('strategy                            | lease blood  lost  fumig  booked  cancel | acquired  actions/night  peak sus | staff  hire spend  total spend');
  let base = null;
  for (const name of Object.keys(STRATEGIES)) { const x = run(name, NIGHTS, SEEDS); console.log(`${name.padEnd(35)} | ${String(r(x.blood)).padStart(11)} ${String(r(x.lost)).padStart(5)} ${x.fumigations.toFixed(1).padStart(6)} ${x.booked.toFixed(1).padStart(7)} ${x.cancelled.toFixed(1).padStart(7)} | ${(x.acquiredOn ? 'N' + x.acquiredOn.toFixed(1) : '-').padStart(8)} ${x.actions.toFixed(1).padStart(14)} ${String(r(x.peakSus)).padStart(9)} | ${String(r(x.staffEnd)).padStart(5)} ${String(r(x.hireSpend)).padStart(11)} ${String(r(x.spent)).padStart(12)}`); console.log('   blood/night ' + x.perNight.map(r).join(' ') + '\n   suspicion   ' + x.susNight.map(r).join(' ') + (x.relocated ? '   (relocated)' : ''));
    if (!base) base = x; else { let cum = 0, pay = null; x.net.forEach((v, i) => { cum += v - base.net[i]; if (pay === null && i >= 4 && cum > 0) pay = i + 1; }); let low = 0, c2 = 0; x.net.forEach((v, i) => { c2 += v - base.net[i]; low = Math.min(low, c2); }); console.log(`   vs never acquiring: blood after all spending ${cum >= 0 ? '+' : ''}${r(cum)} mL by night ${NIGHTS}; deepest hole ${r(low)} mL; back in the black by night ${pay || '-'}`); } }
}
