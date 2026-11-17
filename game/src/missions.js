// missions.js — the story of Rio Calloway, plus the city's side work.
//
// Six chapters for fixer Marisol "Sol" Vega, built from step types: goto,
// steal, deliver, kill, holdout, escape. A small engine walks the current
// step, spawns its actors, watches for completion and pays out. Between and
// after chapters, Port Palmshade keeps earning: taxi fares hail when Rio
// drives a cab, and the marina runs checkpoint street races.

import { PITCH } from './config.js';
import { makeHostile } from './combat.js';
import { makeCar, makePed } from './entities.js';

export const CHAPTERS = [
  {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    giver: 'garage',
    pay: 400,
    respect: 1,
    intro: [
      ['SOL', 'Rio Calloway. You drive like the stories say?'],
      ['SOL', 'A Brisa roadster sits by the beach, keys in. Bring it to the Coral Docks office. Quietly.'],
    ],
    steps: [
      { type: 'goto', place: 'garage', label: 'Meet Sol at the garage', r: 40 },
      { type: 'steal', model: 'brisa', label: 'Steal the Brisa Roadster', spawnAt: { x: -60, y: 4 * PITCH + 60 } },
      { type: 'deliver', place: 'docks', label: 'Deliver the Brisa to Pier 9', r: 56 },
    ],
    outro: [['SOL', 'Clean work. The docks remember a quiet driver.']],
  },
  {
    id: 'cold-chain',
    title: 'COLD CHAIN',
    giver: 'garage',
    pay: 550,
    respect: 1,
    intro: [
      ['SOL', 'A Flete van at the docks is full of "frozen grouper" that cannot melt.'],
      ['SOL', 'Take it to Café Dorado. If the PSPD smell fish, keep driving.'],
    ],
    steps: [
      { type: 'goto', place: 'garage', label: 'Meet Sol at the garage', r: 40 },
      { type: 'steal', model: 'flete', label: 'Take the Flete van at the docks', spawnAt: { x: 2 * PITCH + 60, y: 7 * PITCH - 60 }, hot: true },
      { type: 'deliver', place: 'cafe', label: 'Deliver the van to Café Dorado', r: 56 },
    ],
    outro: [['SOL', 'The café sends its regards. And a smell that will not wash off.']],
  },
  {
    id: 'neon-debt',
    title: 'NEON DEBT',
    giver: 'club',
    pay: 700,
    respect: 2,
    intro: [
      ['SOL', 'Club Azahar owes me, and their collectors are collecting from the wrong people.'],
      ['SOL', 'Three of them, outside the club. Persuade them. The Palm-9 is yours now — use it like a professional.'],
    ],
    grant: 'palm9',
    steps: [
      { type: 'goto', place: 'club', label: 'Go to Club Azahar', r: 46 },
      { type: 'kill', label: 'Deal with the collectors', at: { x: 5 * PITCH + 60, y: 4 * PITCH - 52 }, count: 3, melee: 1 },
      { type: 'goto', place: 'club', label: 'Report back at the club door', r: 40 },
    ],
    outro: [['SOL', 'Azahar pays on Fridays now. Funny how that works.']],
  },
  {
    id: 'harbor-run',
    title: 'HARBOR RUN',
    giver: 'docks',
    pay: 900,
    respect: 2,
    intro: [
      ['SOL', 'Pier 9, by the crane. A package is waiting and every siren in Palmshade will wake for it.'],
      ['SOL', 'Lose them first. Then bring it home to the garage.'],
    ],
    steps: [
      { type: 'goto', place: 'docks', label: 'Collect the package at Pier 9', r: 46, arm: true },
      { type: 'escape', label: 'Lose the PSPD' },
      { type: 'deliver', place: 'garage', label: 'Bring the package to the garage', r: 56, anyCar: true },
    ],
    outro: [['SOL', 'Half the city heard that chase. The other half paid to.']],
  },
  {
    id: 'palmshade-job',
    title: 'THE PALMSHADE JOB',
    giver: 'garage',
    pay: 1600,
    respect: 3,
    intro: [
      ['SOL', 'Banco Palmera moves its vault cash on Fridays. Today is Friday, cariño.'],
      ['SOL', 'Hold the lobby while my people work. Then run — and do not stop at the marina for photos.'],
    ],
    steps: [
      { type: 'goto', place: 'bank', label: 'Go to Banco Palmera', r: 48 },
      { type: 'holdout', label: 'Hold the bank lobby', at: 'bank', dur: 26, waves: 2 },
      { type: 'escape', label: 'Lose the PSPD', arm: true },
      { type: 'deliver', place: 'yacht', label: 'Deliver the take to the Yacht Club', r: 58, anyCar: true },
    ],
    outro: [['SOL', 'The Palmshade Job. They will name a cocktail after us, or a cell.']],
  },
  {
    id: 'sunset-reckoning',
    title: 'SUNSET RECKONING',
    giver: 'yacht',
    pay: 2000,
    respect: 4,
    intro: [
      ['SOL', 'The crew from the mainland thinks Palmshade is theirs now. Marina plaza, sunset.'],
      ['SOL', 'Show them whose city this is, Rio. Then come watch the light with me.'],
    ],
    steps: [
      { type: 'goto', place: 'yacht', label: 'Meet Sol at the Yacht Club', r: 46 },
      { type: 'kill', label: 'Drive off the mainland crew', at: { x: 9 * PITCH + 120, y: 7 * PITCH + 120 }, count: 5, waves: 2 },
      { type: 'goto', place: 'motel', label: 'Meet Sol at the Motel Palmera pool', r: 48 },
    ],
    outro: [
      ['SOL', 'Port Palmshade is ours, wheelman. The city keeps spinning — fares, races, sunsets.'],
      ['SOL', 'You know where to find me.'],
    ],
  },
];

export function makeMissionState() {
  return {
    chapterIndex: 0,
    stepIndex: 0,
    active: false,
    chapterDone: false,
    allDone: false,
    step: null, // runtime state of the current step
    missionCar: null, // the car a steal step handed to the following deliver
    marker: null,
    kills: 0,
    timer: 0,
    dialogue: [],
    dialogueT: 0,
  };
}

function placePoint(G, placeId) {
  const place = G.city.places[placeId];
  return { x: place.x, y: place.y };
}

function currentChapter(G) {
  return CHAPTERS[G.missions.chapterIndex] || null;
}

// Begin the next chapter: grant gear, play the intro, arm the first step.
export function startChapter(G) {
  const m = G.missions;
  const chapter = currentChapter(G);
  if (!chapter) { m.allDone = true; return; }
  m.active = true;
  m.chapterDone = false;
  m.stepIndex = 0;
  if (chapter.grant === 'palm9' && !G.player.weapons.includes('palm9')) {
    G.player.weapons.push('palm9');
    G.player.ammo.palm9 += 60;
    if (G.player.weapon === 'fists') G.player.weapon = 'palm9';
    G.toast('PALM-9 ACQUIRED');
  }
  queueDialogue(G, chapter.intro);
  armStep(G);
}

function queueDialogue(G, lines) {
  const m = G.missions;
  m.dialogue = lines.slice();
  m.dialogueT = 0;
}

export function currentLine(G) {
  const m = G.missions;
  if (!m.dialogue.length) return null;
  return m.dialogue[0];
}

export function stepDialogue(G, dt) {
  const m = G.missions;
  if (!m.dialogue.length) return;
  m.dialogueT += dt;
  if (m.dialogueT > 4.2) {
    m.dialogue.shift();
    m.dialogueT = 0;
  }
}

// Set up the current step's actors and marker.
function armStep(G) {
  const m = G.missions;
  const chapter = currentChapter(G);
  const def = chapter.steps[m.stepIndex];
  m.step = { def, spawned: false, timer: def.dur || 0, kills: 0, wave: 0, car: null };
  if (def.type === 'goto' || def.type === 'deliver') {
    const pt = def.place ? placePoint(G, def.place) : { x: def.x, y: def.y };
    m.marker = { x: pt.x, y: pt.y, label: def.label };
  }
  if (def.type === 'steal') {
    const car = makeCar(def.model, def.spawnAt.x, def.spawnAt.y, Math.PI / 2, 'mission', G.rng);
    G.cars.push(car);
    m.step.car = car;
    m.marker = { x: car.x, y: car.y, label: def.label };
  }
  if (def.type === 'kill') {
    spawnKillGroup(G, def, def.count);
    m.marker = { x: def.at.x, y: def.at.y, label: def.label };
  }
  if (def.type === 'holdout') {
    const pt = def.at ? placePoint(G, def.at) : { x: def.x, y: def.y };
    m.marker = { x: pt.x, y: pt.y, label: def.label };
    m.step.x = pt.x;
    m.step.y = pt.y;
  }
  if (def.type === 'escape') {
    m.marker = null;
    if (def.arm) armEscapeHeat(G);
  }
}

function armEscapeHeat(G) {
  // Scripted heat: the story needs sirens here (never lowers existing heat).
  G.wanted.points = Math.max(G.wanted.points, 85);
  if (G.wanted.stars < 3) G.wanted.stars = 3;
  G.wanted.seenT = 0;
}

function spawnKillGroup(G, def, count) {
  const m = G.missions;
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2;
    const h = makeHostile(def.at.x + Math.cos(a) * 34, def.at.y + Math.sin(a) * 34, {
      melee: def.melee ? i < def.melee : false,
      group: def,
      shirt: '#4a3436',
    });
    G.hostiles.push(h);
  }
  m.step.spawned = true;
}

// combat.js reports every hostile downed through here.
export function onHostileDown(G, h) {
  const m = G.missions;
  if (!m.active || !m.step) return;
  if (m.step.def.type === 'kill' && h.group === m.step.def) {
    m.step.kills++;
  }
  if (m.step.def.type === 'holdout') {
    m.step.kills++;
  }
}

function completeChapter(G) {
  const m = G.missions;
  const chapter = currentChapter(G);
  G.cash += chapter.pay;
  G.respect += chapter.respect;
  G.stats.jobsDone++;
  G.sound.blip('cash');
  G.toast('JOB COMPLETE · +$' + chapter.pay);
  queueDialogue(G, chapter.outro);
  m.active = false;
  m.marker = null;
  m.chapterIndex++;
  if (m.chapterIndex >= CHAPTERS.length) {
    m.allDone = true;
    G.toast('STORY COMPLETE — PORT PALMSHADE IS YOURS');
  } else {
    m.chapterDone = true;
  }
  G.saveGame();
}

function advanceStep(G) {
  const m = G.missions;
  m.stepIndex++;
  const chapter = currentChapter(G);
  if (m.stepIndex >= chapter.steps.length) completeChapter(G);
  else armStep(G);
}

// The per-frame mission engine.
export function stepMissions(G, dt) {
  const m = G.missions;
  stepDialogue(G, dt);
  if (!m.active || !m.step) return;
  const def = m.step.def;
  const p = G.player;

  if (def.type === 'goto') {
    const pt = def.place ? placePoint(G, def.place) : def;
    if (Math.hypot(p.x - pt.x, p.y - pt.y) < (def.r || 42)) {
      if (def.arm) armEscapeHeat(G); // the pickup wakes the sirens
      advanceStep(G);
    }
    return;
  }
  if (def.type === 'steal') {
    const car = m.step.car;
    if (car && car !== p.car) m.marker = { x: car.x, y: car.y, label: def.label };
    if (p.car && (p.car === car || p.car.modelId === def.model)) {
      m.missionCar = p.car;
      if (def.hot) G.reportCrime('missionCrime', p.x, p.y, true);
      advanceStep(G);
    }
    return;
  }
  if (def.type === 'deliver') {
    const pt = def.place ? placePoint(G, def.place) : def;
    const inCar = p.car && (def.anyCar || !m.missionCar || p.car === m.missionCar);
    if (inCar && Math.hypot(p.x - pt.x, p.y - pt.y) < (def.r || 56)) {
      m.missionCar = null;
      advanceStep(G);
    }
    return;
  }
  if (def.type === 'kill') {
    const remaining = G.hostiles.filter((h) => h.group === def && h.state !== 'down').length;
    if (remaining === 0) {
      if (def.waves && m.step.wave + 1 < def.waves) {
        m.step.wave++;
        spawnKillGroup(G, def, Math.max(2, def.count - 2));
        G.toast('MORE OF THEM — HOLD ON');
      } else {
        advanceStep(G);
      }
    }
    return;
  }
  if (def.type === 'holdout') {
    const inside = Math.hypot(p.x - m.step.x, p.y - m.step.y) < 92;
    if (inside && !p.car) {
      m.step.timer -= dt;
      const elapsed = def.dur - m.step.timer;
      const waveEvery = def.dur / ((def.waves || 1) + 1);
      if (m.step.wave < (def.waves || 1) && elapsed > waveEvery * (m.step.wave + 1)) {
        m.step.wave++;
        spawnKillGroup(G, { at: { x: m.step.x + 120, y: m.step.y + 40 }, count: 3, melee: 1 }, 3);
        G.toast('SECURITY WAVE INBOUND');
      }
      if (m.step.timer <= 0) {
        G.wanted.points = Math.max(G.wanted.points, 118); // the job goes loud: 4 stars
        G.wanted.stars = 4;
        advanceStep(G);
      }
    }
    return;
  }
  if (def.type === 'escape') {
    if (G.wanted.stars === 0 && G.wanted.seenT > 2) advanceStep(G);
    return;
  }
}

// What the HUD banner and minimap should point at right now.
export function currentObjective(G) {
  const m = G.missions;
  if (G.taxi.state === 'pickup' && G.taxi.ped) {
    return { label: 'TAXI · PICK UP THE FARE', x: G.taxi.ped.x, y: G.taxi.ped.y, sub: 'Stop beside them' };
  }
  if (G.taxi.state === 'dropoff' && G.taxi.dest) {
    return { label: 'TAXI · DROP OFF', x: G.taxi.dest.x, y: G.taxi.dest.y, sub: '$' + G.taxi.fare + ' on the meter' };
  }
  if (G.races.state === 'running') {
    const cp = G.races.checkpoints[G.races.idx];
    if (cp) return { label: 'RACE · CHECKPOINT ' + (G.races.idx + 1) + '/' + G.races.checkpoints.length, x: cp.x, y: cp.y, sub: G.races.time.toFixed(1) + 's' };
  }
  if (m.active && m.step) {
    const def = m.step.def;
    let sub = '';
    if (def.type === 'kill') {
      const remaining = G.hostiles.filter((h) => h.group === def && h.state !== 'down').length;
      sub = remaining + ' still standing';
    }
    if (def.type === 'holdout') sub = Math.max(0, m.step.timer).toFixed(0) + 's · stay in the lobby';
    if (def.type === 'escape') sub = G.wanted.stars > 0 ? 'Break line of sight and let it cool' : 'Nearly clean…';
    return { label: currentChapter(G).title + ' · ' + def.label.toUpperCase(), x: m.marker?.x, y: m.marker?.y, sub };
  }
  if (!m.allDone) {
    const chapter = currentChapter(G);
    const giver = G.city.places[chapter.giver];
    return { label: 'NEXT JOB · ' + chapter.title, x: giver.x, y: giver.y, sub: 'Press E at ' + giver.name };
  }
  return { label: 'FREE ROAM · PORT PALMSHADE', x: undefined, y: undefined, sub: 'Taxi fares hail cab drivers · races start at the marina' };
}

// Where the next chapter starts (for the E prompt in main.js).
export function nextGiver(G) {
  const m = G.missions;
  if (m.active || m.allDone) return null;
  const chapter = currentChapter(G);
  return { chapter, place: G.city.places[chapter.giver] };
}

// --- taxi fares --------------------------------------------------------------

export function makeTaxiState() {
  return { state: 'idle', ped: null, dest: null, fare: 0, timer: 0, offerCd: 12, done: 0 };
}

export function stepTaxi(G, dt) {
  const t = G.taxi;
  const p = G.player;
  if (t.state === 'idle') {
    t.offerCd -= dt;
    if (t.offerCd <= 0 && p.car && p.car.modelId === 'taxi') {
      // A fare hails from a sidewalk within a few blocks.
      const block = G.rng.pick(G.city.blocks);
      const ped = makePed(G, block.x + 8, block.y + G.rng.range(14, block.h - 14));
      ped.state = 'fare';
      ped.fare = true;
      G.peds.push(ped);
      t.ped = ped;
      t.state = 'pickup';
      G.toast('A FARE IS HAILING — GOLD MARKER');
      G.sound.blip('ui');
    }
    return;
  }
  if (t.state === 'pickup') {
    if (!t.ped || t.ped.dead) { resetTaxi(G); return; }
    if (p.car && Math.abs(p.car.speed) < 12 && Math.hypot(p.x - t.ped.x, p.y - t.ped.y) < 42) {
      t.ped.state = 'ride';
      const destBlock = G.rng.pick(G.city.blocks);
      t.dest = { x: destBlock.x + destBlock.w / 2, y: destBlock.y - 20 };
      const dist = Math.hypot(t.dest.x - p.x, t.dest.y - p.y);
      t.fare = Math.round(30 + dist * 0.055);
      t.timer = 25 + dist / 14;
      t.state = 'dropoff';
      G.toast('FARE ABOARD · $' + t.fare + ' ON THE METER');
      G.sound.blip('door');
    }
    return;
  }
  if (t.state === 'dropoff') {
    if (t.ped) { t.ped.x = p.x; t.ped.y = p.y; }
    t.timer -= dt;
    if (!p.car) { resetTaxi(G); G.toast('THE FARE BAILED'); return; }
    if (Math.hypot(p.x - t.dest.x, p.y - t.dest.y) < 52 && Math.abs(p.car.speed) < 16) {
      const tip = t.timer > 0 ? Math.round(t.fare * 0.35) : 0;
      G.cash += t.fare + tip;
      t.done++;
      G.stats.jobsDone++;
      G.toast('FARE PAID · $' + (t.fare + tip) + (tip ? ' (TIP $' + tip + ')' : ''));
      G.sound.blip('cash');
      if (t.ped) {
        t.ped.state = 'roam';
        t.ped.x = p.x + 26;
        t.ped.y = p.y + 10;
        t.ped.fare = false;
        t.ped.block = G.city.blockAt(t.ped.x, t.ped.y);
      }
      resetTaxi(G);
      t.offerCd = 16;
      G.saveGame();
    }
  }
}

function resetTaxi(G) {
  const t = G.taxi;
  if (t.ped && t.state !== 'dropoff') t.ped.fare = false;
  t.state = 'idle';
  t.ped = null;
  t.dest = null;
  t.offerCd = 14;
}

// --- marina street races -------------------------------------------------------

const RACE_COURSE = [
  [9, 6], [10, 6], [11, 7], [10, 8], [8, 8], [7, 7], [8, 6], [9, 5],
];

export function makeRaceState() {
  return { state: 'idle', checkpoints: [], idx: 0, time: 0, best: null, won: 0 };
}

export function startRace(G) {
  const r = G.races;
  r.checkpoints = RACE_COURSE.map(([i, j]) => ({ x: i * PITCH, y: j * PITCH }));
  r.idx = 0;
  r.time = 0;
  r.state = 'running';
  G.toast('RACE ON — FOLLOW THE GOLD RINGS');
  G.sound.blip('cash');
}

export function stepRaces(G, dt) {
  const r = G.races;
  if (r.state !== 'running') return;
  r.time += dt;
  const cp = r.checkpoints[r.idx];
  if (!cp) return;
  const p = G.player;
  if (p.car && Math.hypot(p.x - cp.x, p.y - cp.y) < 64) {
    r.idx++;
    G.sound.blip('pickup');
    if (r.idx >= r.checkpoints.length) {
      const par = 95;
      const pay = Math.max(120, Math.round(700 - (r.time - par) * 6));
      G.cash += pay;
      r.won++;
      G.stats.jobsDone++;
      G.toast('FINISH · ' + r.time.toFixed(1) + 's · +$' + pay);
      if (!r.best || r.time < r.best) r.best = r.time;
      r.state = 'idle';
      G.saveGame();
    }
  }
  if (r.time > 240) {
    r.state = 'idle';
    G.toast('RACE ABANDONED');
  }
}
