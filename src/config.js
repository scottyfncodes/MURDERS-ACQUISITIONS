// MURDERS & ACQUISITIONS: every tunable number and every line of company voice lives here.
(function (root) {
  const MA = (root.MA = root.MA || {});

  // art.palette from the approved direction (art-direction/target), plus the diorama's own materials
  const PALETTE = {
    background: '#141b33', surface: '#222b52', primary: '#ffc65c', accent: '#ee4455', text: '#eef0fa',
    floor: '#2c3560', under: '#0b0f22', wood: '#8a543b', mattress: '#cfd4ea', pillow: '#eef0fa', blanket: '#4466b4',
    skin: '#e6a98e', hair: '#3b2a2c', metal: '#5d6b9c', metalDark: '#1c2242', glow: '#ffc65c', blood: '#ee4455',
    hat: '#ffd23f', pipe: '#cf6f45', water: '#57bcd0', moon: '#b9c8ff', zzz: '#dfe5ff', steam: '#c9d1f5',
    egg: '#f6f0df', bug: '#141833', shirt: '#f4f1ea',
  };

  // play.feel from the approved direction: the numbers that make it feel right, in one place
  const FEEL = {
    shift_seconds: 300, quarter_seconds: 75, first_purchase_seconds: 8,
    extract_trip_seconds: 4.0, fly_seconds: 1.2, bite_seconds: 1.6, worker_speed_tiles_s: 3.2,
    swat_telegraph_ms: 1400, scratch_telegraph_ms: 1000, recall_cooldown_s: 10, recall_hold_s: 3,
    hit_stop_ms: 120, shake_px: 10, build_drop_ms: 260, counter_ease_ms: 300, irritation_decay_per_s: 1.2,
  };

  const ECON = {
    startBank: 50, startWorkers: 5, baseHousing: 8, loadMl: 6, refinePerStation: 2.0, hatchSeconds: 7,
    hireBase: 10, hirePerHead: 0.5, irritationPerBiter: 0.5, eventThreshold: 40, eventRelief: 28, eventCooldown: 7,
    scratchKill: 0.25, swatKill: 0.6, scratchSleepCost: 3, swatSleepCost: 6, stirSleepCost: 15, lateLightSleepAt: 225,
    quotas: [300, 1000, 2100, 3400], maxLevel: 3,
  };

  const PACE = [
    { id: 'cautious', label: 'Cautious', bite: 1.4, irritation: 0.5, morale: 0.10 },
    { id: 'standard', label: 'Standard', bite: 1.0, irritation: 1.0, morale: 0.02 },
    { id: 'aggressive', label: 'Aggressive', bite: 0.65, irritation: 2.0, morale: -0.15 },
  ];

  const BUILDINGS = {
    rig: { name: 'Extraction rig', short: 'Rig', cost: 60, growth: 1.8, blurb: 'Bite stations on the subject. More stations, more staff on skin at once.', effect: (l) => `${4 + 3 * (l - 1)} bite stations`, gain: '+3 bite spots', single: true, maxLevel: 6 },
    tank: { name: 'Storage tank', short: 'Tank', cost: 40, growth: 1.45, blurb: 'Holds raw blood until Refining gets to it.', effect: (l) => `Holds ${Math.round(120 * (1 + 0.75 * (l - 1)))} mL`, gain: '+120 mL held' },
    refinery: { name: 'Refinery', short: 'Refinery', cost: 90, growth: 1.6, blurb: 'Turns raw blood into banked product you can spend.', effect: (l) => `${3 * l} refining stations`, gain: '+3 refiners' },
    hatchery: { name: 'Hatchery', short: 'Hatchery', cost: 70, growth: 1.7, blurb: 'Nurses raise new hires here. Each hire costs banked blood.', effect: (l) => `${2 * l} nurse stations`, gain: '+2 nurses' },
    pool: { name: 'Breeding pool', short: 'Pool', cost: 50, growth: 1.5, blurb: 'Standing water. Staff housing, technically.', effect: (l) => `Houses ${10 * l} staff`, gain: '+10 housing' },
  };
  const BUILD_ORDER = ['tank', 'pool', 'hatchery', 'refinery', 'rig'];

  // pads on the bedroom floor, in the order they fill; [x, y] in diorama tiles
  const PADS = [[0.9, 8.6], [6.2, 7.6], [8.9, 7.4], [3.6, 8.9], [11.5, 7.8], [11.9, 0.5], [8.8, 9.7], [0.7, 6.4], [11.9, 5.3], [6.1, 9.9], [11.3, 9.8]];
  const SITES = { arm: { skin: [4.95, 6.55, 2.6], rig: [3.4, 6.8] }, foot: { skin: [10.55, 3.35, 2.6], rig: [10.7, 3.9] } };

  const POLICIES = [
    { id: 'overtime', name: 'Mandatory Overtime', text: 'Loads are 30% bigger. Morale drifts down. Pizza is implied.', apply: (S) => { S.mods.extract *= 1.3; S.mods.moraleDrift -= 0.08; } },
    { id: 'ergonomic', name: 'Ergonomic Proboscis', text: 'Bites take 25% less time. Results may vary by proboscis.', apply: (S) => { S.mods.bite *= 0.75; } },
    { id: 'webinar', name: 'Wellness Webinar', text: 'Morale +25. Attendance is mandatory and unpaid.', apply: (S) => { S.morale = Math.min(100, S.morale + 25); } },
    { id: 'lean', name: 'Lean Refining', text: 'Refining is 40% faster. Nobody knows what was removed.', apply: (S) => { S.mods.refine *= 1.4; } },
    { id: 'openplan', name: 'Open-Plan Hatchery', text: 'New hires arrive 35% sooner. Privacy has been deprecated.', apply: (S) => { S.mods.hatch *= 0.65; } },
    { id: 'hazard', rank: 1, name: 'Hazard Pay (Deferred)', text: 'Swats and scratches claim half as many staff.', apply: (S) => { S.mods.kill *= 0.5; } },
    { id: 'synergy', name: 'Cross-Functional Synergy', text: 'Everything is 10% better. Nobody can say why.', apply: (S) => { S.mods.extract *= 1.1; S.mods.refine *= 1.1; S.mods.hatch *= 0.9; } },
    { id: 'jit', name: 'Just-In-Time Storage', text: 'Tanks hold 60% more. The tanks were not consulted.', apply: (S) => { S.mods.cap *= 1.6; } },
    { id: 'quiet', name: 'Quiet Hours', text: 'The subject is 25% slower to irritate. Please whine softly.', apply: (S) => { S.mods.irritation *= 0.75; } },
    { id: 'interns', rank: 2, name: 'Unpaid Internship', text: 'Six interns start immediately. They are thrilled to be here.', apply: (S, sim) => { S.mods.housing += 6; for (let i = 0; i < 6; i++) sim.hire(S, true); } },
    { id: 'drill', rank: 3, name: 'Quarterly Safety Drill', text: 'All Hands Back is ready twice as often.', apply: (S) => { S.mods.recallCd *= 0.5; } },
    { id: 'buyback', rank: 4, name: 'Stock Buyback', text: '+200 mL banked, effective immediately. Do not ask from where.', apply: (S) => { S.bank += 200; } },
  ];

  const SLEEPERS = [
    { id: 'manager', label: 'Male, 34, middle manager', note: 'Fell asleep mid-email.', supply: 8000, irritation: 1, bite: 1, shift: 300 },
    { id: 'nurse', label: 'Night nurse, 41', note: 'Third double this week. Sleeps like a filing cabinet.', supply: 7400, irritation: 0.75, bite: 1, shift: 300 },
    { id: 'student', label: 'Grad student, 26', note: 'Three energy drinks. Twitchy, but well stocked.', supply: 9000, irritation: 1.3, bite: 0.9, shift: 300 },
    { id: 'trucker', label: 'Long-haul driver, 52', note: 'Thick skin. Fourteen hours on the road.', supply: 10200, irritation: 0.85, bite: 1.2, shift: 300 },
    { id: 'parent', label: 'New parent, 31', note: 'The baby monitor is on. The window is short.', supply: 7700, irritation: 0.8, bite: 1, shift: 250 },
  ];

  const FIRST = ['Denise', 'Carl', 'Marjorie', 'Dale', 'Linda', 'Earl', 'Brenda', 'Walt', 'Phyllis', 'Hank', 'Doreen', 'Stan', 'Gladys', 'Vern', 'Lorraine', 'Roy', 'Peggy', 'Norm', 'Bev', 'Gus', 'Arlene', 'Lyle', 'Trudy', 'Merle', 'Joyce', 'Floyd', 'Wanda', 'Chet', 'Dot', 'Irv', 'Marge', 'Buck', 'Opal', 'Ned', 'Fern', 'Otis', 'Ruthie', 'Clyde', 'June', 'Mort'];
  const LAST = ['Kowalski', 'Pruitt', 'Abernathy', 'Dombrowski', 'Tuttle', 'Vance', 'Hollis', 'McGraw', 'Ostrowski', 'Finch', 'Baxter', 'Lindqvist', 'Purdy', 'Zielinski', 'Hobbs', 'Tanaka', 'Okafor', 'Reyes', 'Whitlock', 'Mendoza'];
  const TRAITS = [
    ['Punctual', 'Has never once been late. Nobody has mentioned it.'],
    ['Saving for a puddle', 'Two more quarters and the down payment is there.'],
    ['Union curious', 'Asks a lot of questions at safety meetings.'],
    ['Third shift this week', 'Says they are fine. They are not fine.'],
    ['Employee of the Month, twice', 'The plaque fell behind a tank.'],
    ['New here', 'Still reads the handbook.'],
    ['Twelve nights from retirement', 'Has a countdown on their locker.'],
    ['Brings snacks', 'The break room would collapse without them.'],
    ['Night school', 'Studying accounting between loads.'],
    ['Team player', 'Has covered for everyone on this list.'],
    ['Quiet', 'Does the work. Goes home.'],
    ['Optimist', 'Believes the bonus is real this year.'],
  ];
  const JOB_NAMES = { extract: 'Extraction', refine: 'Refining', hatch: 'Hatchery' };

  const MEMOS = {
    start: (s) => `Tonight's subject: ${s.label}. ${s.note} Quotas are attached. Let's have a good shift.`,
    firstBuild: 'Good. Capital expenditure approved retroactively.',
    storageFull: 'Storage is full and Extraction is queuing. That is blood we are not counting.',
    noRefiners: 'Raw product is sitting in the tanks. Somebody has to refine it. I can\'t do everything.',
    scratch: 'Scratching incident at the site. Please file Form 7-B before end of shift.',
    swatWarn: 'Hand is moving. ALL HANDS BACK. This is not a drill.',
    nearMiss: 'Near miss logged. Zero lost. This is why we do the drills.',
    quotaMet: (q) => `Q${q} quota met. Corporate has sent a policy for you to pick. They call this a reward.`,
    quotaMissed: (q) => `Q${q} quota missed. Corporate is "not angry, just recalibrating expectations."`,
    roll: 'Subject is rolling over. The arm is gone. Relocating the rig to the foot. Mind the toes.',
    blanket: 'Blanket has shifted over the site. Extraction is paused. Use the time to reflect.',
    lightSleep: 'Subject is in light sleep. Every disturbance now costs us time. Ease off, or don\'t.',
    hiringFrozen: 'Hiring freeze in effect. The larvae will understand.',
    housingFull: 'We are out of housing. New hires need a pool to stand in.',
    wake: 'That\'s the alarm. Everybody out. Good work tonight. Reviews will be posted.',
    loss: (names) => names.length === 1
      ? `We lost ${names[0]} tonight. Their locker will be reassigned Monday. I'm sorry.`
      : `We lost ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}. I'll write to the families. Back to work, please.`,
    idle: [
      'Reminder: the break room kettle is for water only.',
      'HR reminder: bereavement leave is available in increments of one (1) wingbeat.',
      'Safety meeting: the hand is not a team-building exercise.',
      'Please stop calling the subject "the client." We do not have a contract.',
      'Performance reviews are a gift. You will each receive one.',
      'Whoever is whining near the ear: we have talked about this.',
      'Parking in the saucer is for nurses only.',
      'I know it\'s late. I\'m tired too. Thank you for being here.',
    ],
  };

  const RATINGS = [
    [85, 'Exceeds Expectations', 'Corporate has noticed. This is not always good.'],
    [65, 'Meets Expectations', 'A solid shift. Expectations will be raised accordingly.'],
    [45, 'Meets Some Expectations', 'Which ones is at corporate\'s discretion.'],
    [25, 'Needs Improvement', 'A development plan has been placed in your pigeonhole.'],
    [0, 'Performance Improvement Plan', 'Please bring your badge to the meeting.'],
  ];

  // career: review points add up across shifts; each promotion puts one more policy in corporate's drawer
  const RANKS = [[0, 'Acting Plant Manager'], [90, 'Plant Manager'], [220, 'Senior Plant Manager'], [400, 'Regional Manager'], [650, 'VP of Extraction']];

  const HANDBOOK = [
    ['Your job', 'Extract as much of the subject\'s blood as you can before the alarm. The subject cannot be harmed. Corporate checked.'],
    ['The line', 'Extraction bites and fills the tanks. Refining turns tank blood into banked product. Banked product pays for everything.'],
    ['Staffing', 'Set how many staff refine and how many nurse in the hatchery. Everyone else extracts. Watch for queues: they show you the bottleneck.'],
    ['The subject', 'Every bite raises irritation. Irritation becomes scratches and swats, which cost staff and sleep. Pace sets how hard you push.'],
    ['All Hands Back', 'When the hand twitches you have about a second. Pull the crew and nobody is lost.'],
    ['Quotas', 'Each quarter has a quota. Meet it and corporate sends a policy to choose. Miss it and they recalibrate.'],
    ['Your career', 'Every review adds to your file. Promotions put new policies in corporate\'s drawer for later shifts.'],
  ];

  MA.config = { PALETTE, FEEL, ECON, PACE, BUILDINGS, BUILD_ORDER, PADS, SITES, POLICIES, SLEEPERS, FIRST, LAST, TRAITS, JOB_NAMES, MEMOS, RATINGS, RANKS, HANDBOOK };
  if (typeof module !== 'undefined') module.exports = MA;
})(typeof window !== 'undefined' ? window : globalThis);
