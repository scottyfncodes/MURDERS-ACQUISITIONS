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
    // the campaign: night 1 is short and every night after it a little longer
    night1_seconds: 160, night_grow_seconds: 30, night_max_seconds: 300,
    // travel: a flight costs a fixed take-off plus time per tile, so where you build is how fast you are
    fly_base_s: 0.3, fly_per_tile_s: 0.2, founder_speed: 1.25,
    opening_seconds: 17, tutorial_scratch_telegraph_ms: 2400,
  };

  const ECON = {
    startBank: 0, baseHousing: 0, loadMl: 6, refinePerStation: 2.0,
    hireBase: 10, hirePerHead: 6, hatchSeconds: 7.5, firstHatchSeconds: 4.5,
    irritationPerBiter: 0.5, eventThreshold: 40, eventRelief: 28, eventCooldown: 7,
    scratchKill: 0.25, swatKill: 0.6, scratchSleepCost: 3, swatSleepCost: 6, stirSleepCost: 15, lateLightSleepAt: 225,
    quotas: [300, 1000, 2100, 3400], maxLevel: 3,
    // the founder bites by hand: she holds 5 mL, drinks it in about 1.4 s, and itches him if she keeps going
    nestCap: 30, bellyMl: 5, drinkMlPerS: 3.6, greedIrritationPerS: 24, slotsBase: 3,
    // raw blood does not keep: at dawn this share of whatever is unrefined has clotted; refined blood keeps
    clotShare: 0.4, refineMlPerS: 1.6,
    // the drip line unlocks once the round trip from the bite to storage runs past this many seconds
    longTripSeconds: 2.8,
    // his sleep comes in waves from night 2: irritation per bite runs from x0.45 in deep sleep to x1.6 in light sleep (about x1 over a cycle)
    sleepCycleSeconds: 40, deepIrritation: 0.45, lightIrritation: 1.6,
    // suspicion: what he notices. Bites add a little (with diminishing returns), disturbances more, and a squashed employee most; he forgets some each day
    suspicionPerSqrtLoad: 0.6, suspicionScratch: 2, suspicionSwat: 4, suspicionStir: 10, suspicionPerLoss: 3, suspicionDailyForget: 20,
    // countermeasures, in the order he buys them, and the suspicion that sets each one off
    counters: [{ id: 'fan', at: 40, answer: 'windbreak' }, { id: 'repellent', at: 75, answer: 'masks' }],
    fanFlightFactor: 1.5, repellentBiteFactor: 1.6,
  };
  const PACE = [
    { id: 'cautious', label: 'Ease off', bite: 1.25, fly: 1.1, irritation: 0.4, morale: 0.10 },
    { id: 'standard', label: 'Standard', bite: 1.0, irritation: 1.0, morale: 0.02 },
    { id: 'aggressive', label: 'Aggressive', bite: 0.5, fly: 0.8, irritation: 2.0, morale: -0.05 },
  ];

  // `unlock` is when a card first appears: never on a timer, always because the operation hit a wall
  const BUILDINGS = {
    nest: { name: 'Bottle cap', short: 'HQ', cost: Infinity, growth: 1, blurb: 'Where it all began. Holds 30 mL. Rhonda calls it HQ.', effect: () => 'Holds 30 mL', gain: '', maxLevel: 1 },
    tank: { name: 'Storage tank', short: 'Tank', cost: 25, growth: 1.7, blurb: 'Holds blood until it is spent. Crews unload at the nearest storage.', effect: (l) => `Holds ${Math.round(120 * (1 + 0.75 * (l - 1)))} mL`, gain: '+120 mL storage', place: true },
    pool: { name: 'Breeding pool', short: 'Pool', cost: 20, growth: 2.1, blurb: 'Standing water. Hatches staff and houses them, technically.', effect: (l) => `Houses ${3 * l} staff`, gain: '+3 staff', place: true },
    rig: { name: 'Extraction rig', short: 'Rig', cost: 80, growth: 1.8, blurb: 'Bite stations on the subject. More staff on skin at once.', effect: (l) => `${3 + 3 * l} bite spots`, gain: '+3 bite spots', single: true, maxLevel: 5 },
    refinery: { name: 'Refinery', short: 'Refinery', cost: 70, growth: 1.9, blurb: 'Refines stored blood so it keeps overnight. Raw blood clots by morning.', effect: (l) => `Refines ${(1.6 * l).toFixed(1)} mL/s`, gain: 'Stops clotting', place: true },
    drip: { name: 'Drip line', short: 'Drip', cost: 110, growth: 1, blurb: 'A funnel at the bite, piped straight to storage. Staff unload right where they drink.', effect: () => 'Unloads at the bite', gain: 'Shortest trips', single: true, maxLevel: 1 },
    windbreak: { name: 'Windbreak', short: 'Windbreak', cost: 90, growth: 1, blurb: 'A cereal box, flattened, between the fan and the bite. Flights are back to normal.', effect: () => 'Cancels the fan', gain: 'Cancels the fan', single: true, maxLevel: 1 },
    masks: { name: 'Gas masks', short: 'Masks', cost: 140, growth: 1, blurb: 'Tiny masks for every employee. Bites are back to normal speed. Morale is complicated.', effect: () => 'Cancels the repellent', gain: 'Cancels the repellent', single: true, maxLevel: 1 },
    floor: { name: 'Floor space', short: 'Floor', cost: 60, growth: 1, blurb: 'The window side of the room, unclaimed. Four more places to build.', effect: () => '+4 build spots', gain: '+4 build spots', single: true, maxLevel: 1, expand: true },
    hatchery: { name: 'Hatchery', short: 'Hatchery', cost: 70, growth: 1.7, blurb: 'Nurses raise new hires here. Each hire costs banked blood.', effect: (l) => `${2 * l} nurse stations`, gain: '+2 nurses' },
  };
  // the cards a player can see, in order; refinery and hatchery return with the day phase
  const BUILD_ORDER = ['windbreak', 'masks', 'tank', 'pool', 'refinery', 'rig', 'drip', 'floor'];
  // where Rhonda founded the company: a bottle cap under the bed, a short hop from the arm
  const NEST = [8.1, 3.3];
  // the floor opens in zones: the near floor first, the window side when it runs out (indices into PADS)
  const ZONES = [[0, 1, 2, 3, 6, 7, 9], [4, 5, 8, 10]];

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
    { id: 'manager', label: 'Male, 34, middle manager', note: 'Fell asleep mid-email. The phone is still on his chest.', supply: 8000, irritation: 1, bite: 1, shift: 300 },
    { id: 'nurse', label: 'Night nurse, 41', note: 'Third double this week. Sleeps like a filing cabinet.', supply: 7400, irritation: 0.75, bite: 1, shift: 300 },
    { id: 'student', label: 'Grad student, 26', note: 'Three energy drinks. Twitchy, but well stocked.', supply: 9000, irritation: 1.3, bite: 0.9, shift: 300 },
    { id: 'trucker', label: 'Long-haul driver, 52', note: 'Thick skin. Fourteen hours on the road.', supply: 10200, irritation: 0.85, bite: 1.2, shift: 300 },
    { id: 'parent', label: 'New parent, 31', note: 'The baby monitor is on. The window is short.', supply: 7700, irritation: 0.8, bite: 1, shift: 250 },
  ];

  // the one sleeper the colony is built on; the rest of SLEEPERS are for Acquisitions, later
  const HOST = SLEEPERS[0];

  const FOUNDER = { name: 'Rhonda', title: 'Founder & CEO', bio: 'Has read every business book in the airport. Says "we" when it is just her.' };

  // the opening: four captions over about 17 seconds, then the first bite
  const OPENING = [
    { at: 0, time: '11:41 PM', line: 'One more email. Then sleep.' },
    { at: 4.5, time: '11:42 PM', line: 'He did not finish the email.' },
    { at: 8.5, time: '11:43 PM', line: 'Through the window: one mosquito, looking for a better life.' },
    { at: 13, time: 'Rhonda', line: 'Founder. CEO. Only employee.' },
  ];

  // Rhonda's sticky notes: earnest at first; the company voice creeps in as the colony grows
  const NOTES = {
    firstBite: 'First deposit. Night one of the empire. — R.',
    greedy: 'Too greedy. He felt that. Let go!',
    nestFull: 'The bottle cap is full. That is not a problem. That is a growth opportunity. — R.',
    tankBuilt: 'Our first real asset. Now: nobody builds an empire alone. I read that in an airport. — R.',
    eggs: 'Eggs laid in the saucer. Hatching shortly. I am proud, and already slightly exploitative. — R.',
    firstHire: (name) => `Meet ${name}. ${name.split(' ')[0]} does what I did, all night, forever. That is called scale. — R.`,
    scratchTut: 'The hand is moving. Everybody off the arm: SCATTER!',
    tutSaved: 'Nobody hurt. I am calling that a culture of safety. — R.',
    tutLucky: 'We got lucky. Next time the hand moves, press SCATTER. — R.',
    founderHit: 'Rhonda got clipped. She is fine. She is putting it in her memoir.',
    storageFull: 'Storage is full and the crew is queuing. Another tank, somewhere close to the bite.',
    housingFull: 'Every pool is full. More pools, more staff.',
    rigNeed: 'The arm is crowded. Staff are waiting their turn. A rig fits more of us on.',
    alarmSoon: 'Twenty seconds to the alarm. Last call on the arm.',
    dayStart: (n) => n === 1 ? 'He is at work until six. No clock, no hand. Build what we need, then call nightfall. — R.' : `Day ${n}. He left at 8:04. The building is ours until six. — R.`,
    dayBite: 'He is at work. Nothing to bite until tonight.',
    clotted: (ml) => `Overnight, ${ml} mL clotted in the tanks. Raw blood does not keep. A refinery would fix that. — R.`,
    refineryBuilt: 'The refinery is running. Refined blood keeps. I am calling it "shelf-stable". — R.',
    dripNeed: 'Staff are flying the long way to storage. A drip line at the bite would pipe it home.',
    floorNeed: 'We are out of floor. The window side is unclaimed. For now.',
    floorBought: 'The window side is ours. Nobody was using it. — R.',
    rhythm: 'He sleeps in waves. Push while he is deep under; ease off when he goes light. — R.',
    lightWarn: 'He is in light sleep. Ease off before he notices.',
    counter: {
      fan: 'He bought a fan. Twenty-nine dollars. It blows right across the room. Every flight takes longer. He is escalating. — R.',
      repellent: 'There is a plug-in by the bed now. It smells like a pine forest and litigation. Bites take longer. — R.',
    },
    answered: { windbreak: 'Windbreak up. The fan is now cooling a cereal box. — R.', masks: 'Masks on. Everyone looks very professional. — R.' },
    nightStart: (n, staff) => n === 2 ? `Night 2. ${staff ? `${staff} on payroll. ` : ''}Same arm, bigger plans. — R.` : `Night ${n}. ${staff} on payroll. Let's circle back to the arm. — R.`,
    idle: [
      'I have started calling the arm "the pipeline". — R.',
      'Working on a mission statement. Something with "synergy" in it.',
      'Reminder: we are a family here. Families do unpaid overtime.',
      'If anyone asks, we are pre-revenue.',
      'I have ordered business cards. They are very small.',
      'Whoever is whining near the ear: we have talked about this.',
      'Please stop calling him "the client". We do not have a contract.',
    ],
  };

  // the first morning, and every morning after: what happened, and what tonight could be
  const MORNING = {
    headline: (r) => r.night === 1 ? `${r.extracted} mL. Not bad for one mosquito.` : r.lost.length ? 'We lost people last night.' : `${r.extracted} mL. ${r.staff} employees. One vision.`,
    suspicion: (s, gain, next) => `Suspicion ${Math.round(s)}% (${gain >= 0 ? '+' : ''}${Math.round(gain)} last night, less what he forgets today).${next ? ` At ${next.at}% he ${next.id === 'fan' ? 'buys something' : 'buys something else'}.` : ''}`,
    bought: (s, id) => `Suspicion ${Math.round(s)}%. He has had enough: he is buying a ${id === 'fan' ? 'fan' : 'mosquito repellent'} today.`,
    clot: (r) => r.clotted > 0 ? `${r.clotted} mL clotted overnight${r.refined ? `; ${r.refined} mL was refined and kept` : ''}.` : r.refined ? `${r.refined} mL refined. Nothing clotted.` : '',
    note: (r) => r.night === 1 ? (r.staff ? 'Last night it was just me. This morning we are a company. — R.' : 'Tonight we hire. Nobody builds an empire alone. — R.') : r.lost.length ? 'We keep going. It is what they would have wanted. Probably. — R.' : 'He has no idea. Let\'s keep it that way. — R.',
  };

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

  const HANDBOOK_CORP = [
    ['Your job', 'Extract as much of the subject\'s blood as you can before the alarm. The subject cannot be harmed. Corporate checked.'],
    ['The line', 'Extraction bites and fills the tanks. Refining turns tank blood into banked product. Banked product pays for everything.'],
    ['Staffing', 'Set how many staff refine and how many nurse in the hatchery. Everyone else extracts. Watch for queues: they show you the bottleneck.'],
    ['The subject', 'Every bite raises irritation. Irritation becomes scratches and swats, which cost staff and sleep. Pace sets how hard you push.'],
    ['All Hands Back', 'When the hand twitches you have about a second. Pull the crew and nobody is lost.'],
    ['Quotas', 'Each quarter has a quota. Meet it and corporate sends a policy to choose. Miss it and they recalibrate.'],
    ['Your career', 'Every review adds to your file. Promotions put new policies in corporate\'s drawer for later shifts.'],
  ];

  const HANDBOOK = [
    ['The bite', 'Press and hold anywhere in the room. Rhonda flies to the arm and drinks. Let go and she flies the blood home.'],
    ['Do not get greedy', 'Drinking past full makes him itch. When the hand starts to move, let go.'],
    ['Storage', 'Blood is kept in the bottle cap and your tanks. When storage is full, nobody can unload.'],
    ['Staff', 'Breeding pools hatch employees. They bite and carry on their own, all night.'],
    ['Placement', 'You choose where things go. Storage close to the bite means shorter trips.'],
    ['Scatter', 'When the hand twitches, Scatter pulls everyone off the skin.'],
    ['Clotting', 'Raw blood clots by morning. Refineries turn stored blood into blood that keeps.'],
    ['Days', 'While he is at work there is no clock and no hand. Build, then call nightfall.'],
    ['His sleep', 'From the second night he sleeps in waves. Bites itch far less in deep sleep. Push while he is deep under and ease off when he goes light.'],
    ['Suspicion', 'Every bite and every scratch makes him a little more suspicious. Past a point he buys things: a fan, then worse. Each has one answer.'],
    ['Mornings', 'The colony keeps. Every night starts where the last one ended.'],
  ];

  MA.config = { PALETTE, FEEL, ECON, PACE, BUILDINGS, BUILD_ORDER, NEST, ZONES, PADS, SITES, POLICIES, SLEEPERS, HOST, FOUNDER, OPENING, NOTES, MORNING, FIRST, LAST, TRAITS, JOB_NAMES, MEMOS, RATINGS, RANKS, HANDBOOK, HANDBOOK_CORP };
  if (typeof module !== 'undefined') module.exports = MA;
})(typeof window !== 'undefined' ? window : globalThis);
