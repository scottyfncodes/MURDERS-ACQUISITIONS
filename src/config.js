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
    irritationPerBiter: 0.5, eventThreshold: 40, eventRelief: 28, eventCooldown: 9.5,
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
    // he forgets some of it each day: a fixed amount plus a share of what there is (so suspicion settles instead of only climbing)
    suspicionForgetBase: 10, suspicionForgetShare: 0.28,
    // the exterminator: booked when he reaches 100%, comes after this many nights unless that morning's suspicion is below cancelBelow
    bookAt: 100, warningNights: 3, cancelBelow: 80,
    // fumigation ("restructuring"): share of non-executive staff lost, suspicion afterwards, nights before he can book again,
    // nights of discounted rehiring and the discount
    fumigationStaffShare: 0.4, fumigatedSuspicion: 40, fumigationGrace: 3, rehireNights: 2, rehireDiscount: 0.5,
    // the host lifecycle: nights per lease
    leaseNights: 14,
    // countermeasures, in the order he buys them, and the suspicion that sets each one off
    counters: [{ id: 'fan', at: 40, answer: 'windbreak' }, { id: 'repellent', at: 75, answer: 'masks' }],
    fanFlightFactor: 1.5, repellentBiteFactor: 1.6,
    // HR: pools only hatch up to the bite spots on the arm plus a couple of spares (and the lookout's seat)
    reserveStaff: 2,
    // the lookout: how fast they call a swat, and the paperwork after every call (Form 7-B), by level. Swats only: scratches stay the player's
    lookoutReaction: 0.45, lookoutReport: [24, 15],
    // acquisitions: the foot is offered once the arm's rig reaches this level
    acquireAtRig: 4, labFromNight: 4, drainNights: 8, premiumFrom: 3, premiumGrowth: 1.6, acquiredSupply: 0.5, dryFrom: 0.7, drySlope: 1.5, dryFloor: 0.15, dryCap: 1.6,
    // the acquired site's processing plant, per level
    plantCap: 200, plantRefine: 2,
    // General Managers read his sleep this many seconds late (untrained, after one seminar, after two), and push above this depth
    gmLag: [9, 4, 1.5], gmPushAbove: 0.55,
  };
  const PACE = [
    { id: 'cautious', label: 'Ease off', bite: 1.25, fly: 1.1, irritation: 0.4, notice: 0.4, morale: 0.10 },
    { id: 'standard', label: 'Standard', bite: 1.0, irritation: 1.0, notice: 1, morale: 0.02 },
    { id: 'aggressive', label: 'Aggressive', bite: 0.5, fly: 0.8, irritation: 2.0, notice: 1.6, morale: -0.05 },
  ];

  // `unlock` is when a card first appears: never on a timer, always because the operation hit a wall
  const BUILDINGS = {
    nest: { name: 'Bottle cap', short: 'HQ', cost: Infinity, growth: 1, blurb: 'Where it all began. Holds 30 mL. Rhonda calls it HQ.', effect: () => 'Holds 30 mL', gain: '', maxLevel: 1 },
    tank: { name: 'Storage tank', short: 'Tank', cost: 25, growth: 1.7, blurb: 'Holds blood until it is spent. Crews unload at the nearest storage.', effect: (l) => `Holds ${Math.round(120 * (1 + 0.75 * (l - 1)))} mL`, gain: '+120 mL storage', place: true, maxLevel: 6 },
    pool: { name: 'Breeding pool', short: 'Pool', cost: 20, growth: 2.1, blurb: 'Standing water. Hatches staff and houses them, technically.', effect: (l) => `Houses ${3 * l} staff`, gain: '+3 staff', place: true },
    rig: { name: 'Extraction rig', short: 'Rig', cost: 80, growth: 1.8, blurb: 'Bite stations on the subject. More staff on skin at once.', effect: (l) => `${3 + 3 * l} bite spots`, gain: '+3 bite spots', single: true, maxLevel: 5 },
    refinery: { name: 'Refinery', short: 'Refinery', cost: 70, growth: 1.9, blurb: 'Refines stored blood so it keeps overnight. Raw blood clots by morning.', effect: (l) => `Refines ${(1.6 * l).toFixed(1)} mL/s`, gain: 'Stops clotting', place: true, maxLevel: 6 },
    drip: { name: 'Drip line', short: 'Drip', cost: 110, growth: 1, blurb: 'A funnel at the bite, piped straight to storage. Staff unload right where they drink.', effect: () => 'Unloads at the bite', gain: 'Shortest trips', single: true, maxLevel: 1 },
    windbreak: { name: 'Windbreak', short: 'Windbreak', cost: 90, growth: 1, blurb: 'A cereal box, flattened, between the fan and the bite. Flights are back to normal.', effect: () => 'Cancels the fan', gain: 'Cancels the fan', single: true, maxLevel: 1 },
    masks: { name: 'Gas masks', short: 'Masks', cost: 140, growth: 1, blurb: 'Tiny masks for every employee. Bites are back to normal speed. Morale is complicated.', effect: () => 'Cancels the repellent', gain: 'Cancels the repellent', single: true, maxLevel: 1 },
    lookout: { name: 'Lookout', short: 'Lookout', cost: 60, growth: 2.5, blurb: 'Occupational Health & Safety. One employee in hi-vis on a perch above the bite, with a whistle. Calls swats, then files Form 7-B.', effect: (l) => l >= 2 ? 'Safety Officer · calls swats · 15 s of paperwork' : 'Calls swats · 24 s of paperwork', gain: 'Calls swats for you', upgradeGain: 'Faster paperwork', single: true, maxLevel: 2 },
    acquire: { name: 'Acquire the foot', short: 'Acquisition', cost: 5000, growth: 1, blurb: 'Lower Extremities: one ankle, sticking out from under the blanket. Slower bites, bigger loads, kicks instead of swats. Arrives with no staff and no infrastructure.', effect: () => 'A second division', gain: 'A second division', single: true, maxLevel: 1, acquire: 'foot' },
    plant: { name: 'Processing plant', short: 'Plant', cost: 200, growth: 2, blurb: 'A vertically integrated subsidiary at the acquired site: its own storage and its own refining. Staff there unload into it.', effect: (l) => `Holds ${200 * l} mL · refines ${(2 * l).toFixed(0)} mL/s`, gain: '+200 mL storage, +2 mL/s refining', upgradeGain: 'Expand the plant', single: true, maxLevel: 3, acquiredOnly: true },
    lab: { name: 'Saliva R&D', short: 'R&D', cost: 900, growth: 1, blurb: 'A research lab under the bed. Mosquito saliva numbs the skin and thins the blood. We intend to monetise both.', effect: () => 'Unlocks research', gain: 'Opens research', single: true, maxLevel: 1 },
    numbing: { name: 'Numbing agent', short: 'Numbing', cost: 600, growth: 2.4, blurb: 'R&D: a stronger anaesthetic in the saliva. He feels less of every bite, so the itch builds slower.', effect: (l) => `${Math.round((1 - C_RESEARCH.numbing.itch[l]) * 100)}% less itch`, gain: '15% less itch', upgradeGain: (l) => `${Math.round((1 - C_RESEARCH.numbing.itch[l + 1]) * 100)}% less itch`, single: true, maxLevel: 3, requires: 'lab' },
    thinner: { name: 'Blood thinner', short: 'Thinner', cost: 500, growth: 2.4, blurb: 'R&D: an anticoagulant in the saliva. Blood flows faster, so every bite is quicker and fuller. The welts are bigger, so he notices more of them.', effect: (l) => `Bites ${Math.round((1 - C_RESEARCH.thinner.bite[l]) * 100)}% faster and ${Math.round((C_RESEARCH.thinner.load[l] - 1) * 100)}% fuller; welts ${Math.round((C_RESEARCH.thinner.notice[l] - 1) * 100)}% bigger`, gain: 'Faster, but noticed', upgradeGain: (l) => `Bites ${Math.round((1 - C_RESEARCH.thinner.bite[l + 1]) * 100)}% faster`, single: true, maxLevel: 3, requires: 'lab' },
    seminar: { name: 'Leadership Seminar', short: 'Seminar', cost: 120, growth: 2.2, blurb: 'A weekend retreat for this division\'s General Manager. Trust falls. Reading the room. Reading his sleep, mostly.', effect: (l) => l >= 2 ? 'GM reads his sleep 1.5 s late' : 'GM reads his sleep 4 s late', gain: 'Your GM reads his sleep faster', upgradeGain: 'Advanced course', single: true, maxLevel: 2 },
    floor: { name: 'Floor space', short: 'Floor', cost: 60, growth: 1, blurb: 'The window side of the room, unclaimed. Four more places to build.', effect: () => '+4 build spots', gain: '+4 build spots', single: true, maxLevel: 1, expand: true },
    hatchery: { name: 'Hatchery', short: 'Hatchery', cost: 70, growth: 1.7, blurb: 'Nurses raise new hires here. Each hire costs banked blood.', effect: (l) => `${2 * l} nurse stations`, gain: '+2 nurses' },
  };
  // the cards a player can see, in order; refinery and hatchery return with the day phase
  const BUILD_ORDER = ['windbreak', 'masks', 'acquire', 'lookout', 'lab', 'numbing', 'thinner', 'plant', 'seminar', 'tank', 'pool', 'refinery', 'rig', 'drip', 'floor'];
  // where Rhonda founded the company: a bottle cap under the bed, a short hop from the arm
  const NEST = [8.1, 3.3];
  // the floor opens in zones: the near floor first, the window side when it runs out (indices into PADS)
  const ZONES = [[0, 1, 2, 3, 6, 7, 9], [4, 5, 8, 10]];

  // pads on the bedroom floor, in the order they fill; [x, y] in diorama tiles
  const PADS = [[0.9, 8.6], [6.2, 7.6], [8.9, 7.4], [3.6, 8.9], [11.5, 7.8], [11.9, 0.5], [8.8, 9.7], [0.7, 6.4], [11.9, 5.3], [6.1, 9.9], [11.3, 9.8]];
  const SITES = { arm: { skin: [4.95, 6.55, 2.6], rig: [3.4, 6.8] }, foot: { skin: [10.55, 3.4, 5.0], rig: [10.7, 3.9] } };
  // operating divisions: each runs its own crew, irritation, hand and infrastructure at a bite site.
  // The arm is the original division; acquisitions add more. `site` is where the division starts the night
  // bite: bite time; load: mL per bite; itch: irritation per biter; minor/major: its hazards (the lookout calls the major one);
  // socks: times a night the site goes under the covers
  // R&D: what each level of research does (index = level)
  const C_RESEARCH = {
    numbing: { itch: [1, 0.85, 0.72, 0.6] },
    thinner: { bite: [1, 0.86, 0.75, 0.66], load: [1, 1.1, 1.2, 1.3], notice: [1, 1.12, 1.24, 1.36] },
  };
  // seniority: nights survived make a career. Each rank bites faster and carries more than the last
  const CAREER = [
    { name: 'Intern', at: 0, bite: 1, load: 1 },
    { name: 'Associate', at: 2, bite: 0.9, load: 1.08 },
    { name: 'Senior Associate', at: 5, bite: 0.8, load: 1.16 },
    { name: 'Partner', at: 9, bite: 0.7, load: 1.25 },
  ];
  const DIVISIONS = {
    arm: { name: 'Upper Extremities', short: 'Arm', site: 'arm', bite: 1, load: 1, itch: 1, minor: 'scratch', major: 'swat', socks: 0 },
    foot: { name: 'Lower Extremities', short: 'Foot', site: 'foot', bite: 1.35, load: 1.4, itch: 0.7, minor: 'rub', major: 'kick', socks: 3 },
  };
  // a division defined with only a name and a site (a future host archetype) behaves like the arm
  const DIVISION_DEFAULTS = { bite: 1, load: 1, itch: 1, minor: 'scratch', major: 'swat', socks: 0 };
  for (const k of Object.keys(DIVISIONS)) DIVISIONS[k] = Object.assign({}, DIVISION_DEFAULTS, DIVISIONS[k]);
  const DIVISION_ORDER = ['arm', 'foot'];
  const DIVISION_BUILDINGS = ['rig', 'drip', 'lookout', 'seminar', 'plant'];
  // every hazard: warning (s), how long it lasts, share of the crew on the skin it kills, how long the site is shut, sleep it costs, suspicion it adds
  const HAZARDS = {
    scratch: { telegraph: 1.0, hold: 0.9, kill: 0.25, block: 2.5, sleep: 3, suspicion: 2 },
    swat: { telegraph: 1.4, hold: 1.2, kill: 0.6, block: 3.5, sleep: 6, suspicion: 4, minOne: true },
    rub: { telegraph: 1.0, hold: 1.0, kill: 0.3, block: 2.5, sleep: 2, suspicion: 2 },
    kick: { telegraph: 0.9, hold: 0.8, kill: 0.15, block: 5, sleep: 3, suspicion: 3 },
  };

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
    ohsFounded: (name) => `We lost ${name}. Effective immediately I am founding an Occupational Health & Safety department. It is one employee with a whistle. — R.`,
    lookoutHired: (name) => `${name} is our Lookout. Title: Head of Occupational Health & Safety. Headcount: one. Budget: a whistle. — R.`,
    lookoutCalled: (name) => `${name} called it. Nobody hurt. ${name.split(' ')[0]} is now filling in Form 7-B, which takes twenty-four seconds. — R.`,
    lookoutBusy: 'The hand came back while the lookout was filing paperwork. Scatter is still your job. — R.',
    lookoutScratch: 'The lookout does not do scratches, or rubs. It is not in the job description. — R.',
    lookoutPromoted: (name) => `${name} is now our Safety Officer. Paperwork is faster. Scratches are still not in the job description. Morale in the department: one. — R.`,
    hrPause: (slots) => `HR has paused hiring. The arm has ${slots} spots and we have people waiting for them. A rig, not a pool. — R.`,
    acquirePitch: 'The arm is running at capacity. The board (me) has identified an acquisition target: the left foot. He sleeps with it out of the blanket. So do 61% of men. We checked. — R.',
    acquired: (name) => `We have acquired ${name}. It comes with no staff, no infrastructure and one ankle. Synergies are expected. — R.`,
    gmAppointed: (name, div) => `${name} is now General Manager, ${div}. ${name.split(' ')[0]} no longer bites. ${name.split(' ')[0]} has meetings. — R.`,
    labPitch: 'Proposal: an R&D department. Our saliva already numbs him and thins his blood. Imagine what it could do with funding. — R.',
    labBuilt: 'R&D is open. Two lines of research: numbing agent (less itch) and blood thinner (faster bites, bigger welts). Pick your poison. Literally. — R.',
    researched: (name, l) => `R&D: ${name}, phase ${l}. The lab coats were worth it. — R.`,
    pale: ['He looks tired this morning. Productivity is up. — R.', 'He has gone a sort of beige. HR has asked us to stop calling him "the raisin". — R.', 'He is running on fumes. So are we, technically. Push on. — R.'],
    seminar: (div) => `The ${div} GM is back from the Leadership Seminar. Reads his sleep faster. Uses the word "bandwidth" now. — R.`,
    rollAcquired: 'He rolled onto the arm. Upper Extremities is dark for the night. Their staff are on loan to the foot. — R.',
    sock: 'The foot went under the covers. Lower Extremities is on an unscheduled break. — R.',
    policyName: { lie: 'Lie low', standard: 'Standard', aggressive: 'Aggressive' },
    policyHint: { lie: 'GM eases off all night. Quiet, slower.', standard: 'GM pushes when he seems deep asleep.', aggressive: 'GM pushes all night. Fast. Itchy.' },
    focusCoach: 'Two divisions. Tap the staff plate to change floors; the GM runs the other one.',
    relocated: (n) => `We have relocated. Host #${n}: male, 34, middle manager. Again. The mattress is firmer. He has never seen a mosquito in his life. — R.`,
    leaseOver: 'His lease is up. He is moving. So are we. The annual report is on your desk. — R.',
    annual: (t, leaseN) => ({
      title: t.lost > 40 ? 'A record year' : 'A disciplined year',
      note: `Host #${leaseN}: ${t.extracted.toLocaleString('en-US')} mL over the lease. ${t.lost} colleagues lost${t.fumigations ? `, ${t.fumigations} restructuring${t.fumigations === 1 ? '' : 's'}` : ''}. Executive compensation has been adjusted accordingly (upward). His lease is up, and so is ours: corporate has found a new address. — R.`,
      grid: [['Collected', `${t.extracted.toLocaleString('en-US')} mL`], ['Best night', `${t.best.toLocaleString('en-US')} mL`], ['Hired', String(t.hired)], ['Lost', String(t.lost)], ['Restructurings', String(t.fumigations)], ['Cancelled', String(t.cancelled)]],
    }),
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
    headline: (r) => r.extracted === 0 && r.storageFullSec > 4 ? 'Storage was full. All night.' : r.storageFullSec > 4 && r.lostToStorage > r.extracted * 0.3 ? 'We ran out of places to put it.' : r.night === 1 ? `${r.extracted} mL. Not bad for one mosquito.` : r.lost.length ? 'We lost people last night.' : `${r.extracted} mL. ${r.staff} employees. One vision.`,
    suspicion: (s, gain, next) => `Suspicion ${Math.round(s)}% (${gain >= 0 ? '+' : ''}${Math.round(gain)} last night, less what he forgets today).${next ? ` At ${next.at}% he ${next.id === 'fan' ? 'buys something' : 'buys something else'}.` : ''}`,
    bought: (s, id) => `Suspicion ${Math.round(s)}%. He has had enough: he is buying a ${id === 'fan' ? 'fan' : 'mosquito repellent'} today.`,
    // what held us back: each line is a cause, roughly what it cost, and what would fix it. Most expensive first
    held: (r) => {
      const t = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`, out = [];
      if (r.storageFullSec > 4) out.push({ ml: r.lostToStorage, text: `Storage was full for ${t(r.storageFullSec)}. About ${r.lostToStorage} mL had nowhere to go.`, fix: 'Build or upgrade a tank.' });
      if (r.lost.length) {
        const by = r.deadBy, parts = [['swat', 'swats'], ['scratch', 'scratches'], ['kick', 'kicks'], ['rub', 'rubs']].filter(([k]) => by[k]).map(([k, w]) => `${by[k]} to ${w}`).join(', '), minor = (by.scratch || 0) + (by.rub || 0), major = (by.swat || 0) + (by.kick || 0);
        const late = r.deadWhileCooling ? ` ${r.deadWhileCooling} died with Scatter still recharging.` : r.deadOnReport ? ` ${r.deadOnReport} died while the lookout filed paperwork.` : '';
        out.push({ ml: r.replaceCost, text: `We lost ${r.lost.length}${parts ? ` (${parts})` : ''}.${late} Replacing them costs about ${r.replaceCost} mL.`, fix: !r.lookout ? 'A lookout calls swats for you. Ease off in light sleep.' : minor >= major ? (by.rub ? 'Scratches and rubs are yours: lookouts only call swats and kicks. Scatter early.' : 'Scratches are yours: the lookout only does swats. Scatter early.') : r.lookout < 2 && r.deadOnReport ? 'Promote the lookout: Safety Officers file faster.' : 'Ease off in light sleep. Scatter early.' });
      }
      if (r.offArmSec > 10) out.push({ ml: r.lostToInterruptions, text: `The line stopped ${r.hits + r.calls} times (${r.hits} ${r.deadBy && (r.deadBy.rub !== undefined) && r.divisions && r.divisions.length > 1 ? 'hands and feet' : 'hands'}, ${r.calls} Scatters). ${t(r.offArmSec)} off the arm, about ${r.lostToInterruptions} mL.`, fix: r.lookout ? 'Ease off when he goes light.' : 'Ease off when he goes light, and push when he is deep.' });
      if (r.lostToCrowd > 20) out.push({ ml: r.lostToCrowd, text: `Staff queued for a spot on the arm. About ${r.lostToCrowd} mL of standing around.`, fix: r.rigMaxed ? 'The rig is as big as it gets.' : 'An extraction rig fits more on.' });
      if (r.clotted > 0) out.push({ ml: r.clotted, text: `${r.clotted} mL clotted by morning.`, fix: r.refineries ? 'More refining, or spend it before dawn.' : 'A refinery keeps it.' });
      if (r.fanLoss) out.push({ ml: r.fanLoss, text: 'The fan slowed every flight.', fix: 'A windbreak cancels it.' });
      if (r.repellentLoss) out.push({ ml: r.repellentLoss, text: 'The repellent slowed every bite.', fix: 'Gas masks cancel it.' });
      if (r.hrCapped && !out.length) out.push({ ml: 0, text: `HR stopped hiring at ${r.crewCap}: the arm only has ${r.slots} spots.`, fix: 'An extraction rig, not a pool.' });
      out.sort((a, b) => b.ml - a.ml);
      return out.slice(0, 3);
    },
    heldNone: 'Nothing held us back. Corporate will find something. — R.',
    // the suspicion breakdown: one line per source, then what he forgets, then where it stands
    susLabel: (p) => ({ bites: `Bites at the ${p.div === 'foot' ? 'foot' : 'arm'} (${p.count})`, scratch: `Scratches (${p.count})`, swat: `Swats (${p.count})`, rub: `Rubs (${p.count})`, kick: `Kicks (${p.count})`, stir: `He woke up (${p.count})`, lost: `Bodies found (${p.count})` }[p.key] || p.key),
    susForget: 'He forgets some of it today',
    susStatus: (n) => n.booking ? `He has booked an exterminator. It comes in ${n.nightsLeft} night${n.nightsLeft === 1 ? '' : 's'} unless his suspicion is under ${n.cancelBelow}% that morning. Ease off; lie low.` : n.next ? `At ${n.next.at}% he buys something. At 100% he calls an exterminator.` : 'At 100% he calls an exterminator.',
    booked: 'He googled "mosquitoes bedroom". Then "how many mosquitoes is too many". Then "exterminator near me". — R.',
    cancelled: 'He cancelled the exterminator. Something came up. We will not be finding out what. — R.',
    restructure: (f) => `${f.lost.length} colleague${f.lost.length === 1 ? ' was' : 's were'} let go, most recent hires first${f.byDiv.length > 1 ? ` (${f.byDiv.map((d) => `${d.lost} from ${d.id === 'foot' ? 'Lower' : 'Upper'} Extremities`).join(', ')})` : ''}. Raw inventory written off: ${f.raw} mL. ${f.pools ? `${f.pools} pool${f.pools === 1 ? '' : 's'} downsized. ` : ''}Executive leadership (${f.executives + 1}) was in a meeting and is unharmed.`,
    fumigatedNote: 'He had someone in at nine. Leadership was offsite. — R.',
    restructureHead: 'A leaner, more agile organisation.',
    restructureNote: 'This was a difficult decision for leadership. Rehiring is half price for two nights. Thoughts and prayers have been issued. Targets are unchanged. — R.',
    divisionLine: (d) => `${d.extracted} mL · ${d.staff} staff${d.lost ? ` · ${d.lost} lost` : ''}${d.offline ? ` · dark ${Math.round(d.offline)}s` : ''}`,
    lease: (k, n) => `Night ${k} of ${n}`,
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
    ['The lookout', 'After the first loss, Rhonda founds Occupational Health & Safety: one employee in hi-vis who calls swats and Scatters for you, then spends a while on paperwork. Scratches, and any swat that lands during the paperwork, are still yours.'],
    ['HR', 'Pools only hatch up to the spots on the arm plus a couple of spares. More bite spots (a rig) means more staff.'],
    ['Days', 'While he is at work there is no clock and no hand. Build, then call nightfall.'],
    ['His sleep', 'From the second night he sleeps in waves. Bites itch far less in deep sleep. Push while he is deep under and ease off when he goes light.'],
    ['Suspicion', 'Every bite and every scratch makes him a little more suspicious. Past a point he buys things: a fan, then worse. Each has one answer.'],
    ['The exterminator', 'At 100% suspicion he books one, three nights out. Ease off and he may cancel. If he comes, it is a workforce restructuring: the newest staff go, the raw blood goes, the pools shrink. Leadership is unaffected.'],
    ['Acquisitions', 'Once the arm is running at capacity, the board will offer you the foot. It is expensive. It starts with nothing. It kicks.'],
    ['Management', 'With two divisions, each gets a General Manager who runs it to policy while you are on the other floor. Tap the staff plate to change floors. Leadership seminars help GMs read his sleep. Scatter covers both.'],
    ['The lease', 'Fourteen nights per host, then the annual report and a new address. The company keeps everything. The new host has never heard of us.'],
    ['Careers', 'Every night survived counts. Interns become Associates, then Senior Associates, then Partners. Each rank bites faster and carries more. Losing a Partner is a real loss.'],
    ['R&D', 'From the fourth day: a lab, then two lines of research. Numbing agent means less itch. Blood thinner means faster, fuller bites, but he notices more of them.'],
    ['His limit', 'He only has so much to give a night. Past it every bite brings up less. Watch him: he gets paler as the lease goes on.'],
    ['Zoom', 'Pinch, scroll or press + and - to zoom.'],
    ['Mornings', 'The colony keeps. Every night starts where the last one ended.'],
  ];

  MA.config = { RESEARCH: C_RESEARCH, CAREER, PALETTE, FEEL, ECON, PACE, BUILDINGS, BUILD_ORDER, NEST, ZONES, PADS, SITES, DIVISIONS, DIVISION_ORDER, DIVISION_BUILDINGS, HAZARDS, POLICIES, SLEEPERS, HOST, FOUNDER, OPENING, NOTES, MORNING, FIRST, LAST, TRAITS, JOB_NAMES, MEMOS, RATINGS, RANKS, HANDBOOK, HANDBOOK_CORP };
  if (typeof module !== 'undefined') module.exports = MA;
})(typeof window !== 'undefined' ? window : globalThis);
