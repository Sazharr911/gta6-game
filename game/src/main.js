// main.js — PALMSHADE HEAT boots here.
//
// Owns the game state object G that every system reads, runs the frame loop
// (input → player → traffic → crowd → police → combat → missions → HUD),
// the context interactions (steal, enter, repair, buy, save, race), the
// BUSTED / WASTED respawns, the title and pause flow, and the staged
// screenshot scenes. A small debug handle (window.__game) lets the automated
// playtest drive and inspect the real game.

import { START_HOUR, DAY_LENGTH, BUST_FINE_RATE, HOSPITAL_FEE, WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y } from './config.js';
import { buildCity, collideCircle, groundAt, pointInRect } from './city.js';
import { RNG } from './random.js';
import { bakeCity, render } from './render.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import {
  makePlayer, makeCar, spawnParkedCars, spawnPeds, stepPeds, stepTraffic,
  stepPlayerCar, stepCarContacts, damageCar, crossingPath,
} from './entities.js';
import { stepPlayerCombat, stepHostiles, stepBullets, stepPickups } from './combat.js';
import { makeWanted, reportCrime, stepWanted, clearWanted } from './wanted.js';
import {
  makeMissionState, startChapter, stepMissions, currentObjective, nextGiver,
  makeTaxiState, stepTaxi, makeRaceState, startRace, stepRaces,
} from './missions.js';
import { hasSave, readSave, writeSave } from './save.js';
import { shotFromUrl, stageShot } from './shots.js';
import { findPath } from './nav.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

const G = {
  rng: new RNG(20261117),
  city: null,
  layers: null,
  player: null,
  cars: [],
  peds: [],
  cops: [],
  hostiles: [],
  bullets: [],
  pickups: [],
  fx: [],
  wanted: makeWanted(),
  missions: makeMissionState(),
  taxi: makeTaxiState(),
  races: makeRaceState(),
  cash: 250,
  respect: 0,
  stats: { jobsDone: 0, busts: 0, wasted: 0 },
  day: 1,
  hour: START_HOUR,
  time: 0,
  mode: 'title',
  frozen: false,
  shake: 0,
  sirenLevel: 0,
  prompt: '',
  camera: { x: 0, y: 0 },
  objective: null,
  nextGiver: null,
  shotObjective: null,
  shotCam: null,
  respawnT: 0,
  bustedT: 0,
  sound: new SoundEngine(),
  hud: null,
  input: null,
};

G.toast = (msg) => G.hud.toast(msg);
G.saveGame = () => writeSave(G);
G.reportCrime = (kind, x, y, force) => reportCrime(G, kind, x, y, force);
G.damageCar = (car, amount) => damageCar(G, car, amount, 'shot');
G.cityCollide = (x, y, r) => collideCircle(G.city, x, y, r);
G.onWasted = () => {
  G.stats.wasted++;
  G.respawnT = 1.7;
  G.hud.showSplash('WASTED', 'Clínica Reyes patches you up · −$' + Math.min(G.cash, HOSPITAL_FEE), '#e2543e');
};
G.onBusted = () => {
  G.stats.busts++;
  G.bustedT = 1.7;
  const fine = Math.floor(G.cash * BUST_FINE_RATE);
  G.hud.showSplash('BUSTED', 'The PSPD take $' + fine + ' and your afternoon', '#3b82f6');
  G.pendingFine = fine;
};

function buildWorld() {
  G.city = buildCity(1);
  G.layers = bakeCity(G.city);
}

function resetWorld() {
  G.cars = [];
  G.peds = [];
  G.cops = [];
  G.hostiles = [];
  G.bullets = [];
  G.pickups = [];
  G.fx = [];
  G.wanted = makeWanted();
  G.missions = makeMissionState();
  G.taxi = makeTaxiState();
  G.races = makeRaceState();
  const garage = G.city.places.garage;
  G.player = makePlayer(garage.x + 6, garage.y + 10);
  spawnParkedCars(G);
  spawnPeds(G);
}

function newGame(save) {
  resetWorld();
  G.cash = 250;
  G.respect = 0;
  G.stats = { jobsDone: 0, busts: 0, wasted: 0 };
  G.day = 1;
  G.hour = START_HOUR;
  G.frozen = false;
  if (save) applySave(save);
  G.mode = 'playing';
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('howto-screen').classList.add('hidden');
  if (!save) {
    G.toast('PORT PALMSHADE · FIND SOL AT THE GARAGE');
  }
}

function applySave(save) {
  const p = G.player;
  G.cash = save.cash;
  G.respect = save.respect;
  G.day = save.day;
  G.hour = save.hour;
  G.missions.chapterIndex = save.chapter;
  G.missions.chapterDone = save.chapter > 0;
  G.missions.allDone = save.chapter >= 6;
  p.weapons = save.weapons.owned.slice();
  p.ammo = { ...save.weapons.ammo };
  p.weapon = save.weapons.current;
  p.health = save.health;
  p.armour = save.armour;
  p.x = save.player.x;
  p.y = save.player.y;
  G.stats = { ...save.stats };
  G.taxi.done = save.taxiDone || 0;
  G.races.won = save.racesWon || 0;
  if (save.car) {
    const car = makeCar(save.car.model, save.car.x, save.car.y, save.car.angle, 'parked', G.rng);
    car.health = save.car.health;
    G.cars.push(car);
  }
}

// --- interactions --------------------------------------------------------------

function nearestCar(maxDist) {
  let best = null;
  let bd = maxDist;
  for (const car of G.cars) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const p = G.player;
  const wasParked = car.kind === 'parked' || car.kind === 'mission';
  p.car = car;
  car.kind = 'player';
  car.speed = 0;
  G.sound.blip('door');
  if (wasParked) G.reportCrime('stealCar', car.x, car.y);
  else if (car.wasPolice) G.reportCrime('stealCar', car.x, car.y, true);
  else G.reportCrime('carjackMoving', car.x, car.y);
  G.toast(car.model.name.toUpperCase() + ' · ' + (wasParked ? 'HOT-WIRED' : 'YOURS NOW'));
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  p.car = null;
  car.kind = car.wasPolice ? 'police' : 'parked';
  car.speed = 0;
  // Step out on the driver's side, clear of the bodywork.
  p.x = car.x + Math.cos(car.angle - Math.PI / 2) * 24;
  p.y = car.y + Math.sin(car.angle - Math.PI / 2) * 24;
  const pos = collideCircle(G.city, p.x, p.y, p.radius);
  p.x = pos.x;
  p.y = pos.y;
  G.sound.blip('door');
}

function computePrompt() {
  const p = G.player;
  const places = G.city.places;
  G.prompt = '';
  if (p.dead || G.mode !== 'playing') return;
  if (p.car) {
    const garage = places.garage;
    if (Math.hypot(p.x - garage.x, p.y - garage.y) < 110 && p.car.health < p.car.model.durability && G.cash >= 100) {
      G.prompt = 'E · REPAIR AT SOL\'S GARAGE · $100';
    } else {
      G.prompt = 'E · EXIT · R · RADIO';
    }
    return;
  }
  const giver = G.nextGiver;
  if (giver && Math.hypot(p.x - giver.place.x, p.y - giver.place.y) < 48) {
    G.prompt = 'E · TAKE THE JOB · ' + giver.chapter.title;
    return;
  }
  const car = nearestCar(46);
  if (car) {
    G.prompt = 'E · ' + (car.kind === 'parked' ? 'STEAL' : 'TAKE') + ' THE ' + car.model.name.toUpperCase();
    return;
  }
  const garage = places.garage;
  if (Math.hypot(p.x - garage.x, p.y - garage.y) < 52) {
    if (!p.weapons.includes('hornet')) G.prompt = 'E · SUPPLIES $200 · F · HORNET SMG $600';
    else G.prompt = 'E · SUPPLIES $200 · M · SAVE AT THE SAFEHOUSE';
    return;
  }
  const clinica = places.clinica;
  if (Math.hypot(p.x - clinica.x, p.y - clinica.y) < 52 && p.health < 100) {
    G.prompt = 'E · PATCH UP · $60';
    return;
  }
  const yacht = places.yacht;
  if (Math.hypot(p.x - yacht.x, p.y - yacht.y) < 56 && G.races.state === 'idle') {
    G.prompt = 'F · MARINA STREET RACE';
  }
}

function handleInteractions() {
  const p = G.player;
  const input = G.input;
  const places = G.city.places;
  if (input.justPressed('r') && p.car) {
    const st = G.sound.cycleStation();
    G.toast(st.name);
  }
  if (input.justPressed('1')) p.weapon = 'fists';
  if (input.justPressed('2') && p.weapons.includes('palm9')) p.weapon = 'palm9';
  if (input.justPressed('3') && p.weapons.includes('hornet')) p.weapon = 'hornet';
  if (input.justPressed('m')) {
    const garage = places.garage;
    if (!p.car && Math.hypot(p.x - garage.x, p.y - garage.y) < 70) {
      if (writeSave(G)) G.toast('SAVED AT THE SAFEHOUSE');
    }
  }
  if (input.justPressed('f')) {
    const garage = places.garage;
    const yacht = places.yacht;
    if (!p.car && Math.hypot(p.x - garage.x, p.y - garage.y) < 52 && !p.weapons.includes('hornet')) {
      if (G.cash >= 600) {
        G.cash -= 600;
        p.weapons.push('hornet');
        p.ammo.hornet += 160;
        p.weapon = 'hornet';
        G.toast('HORNET SMG · SHE IS YOURS');
        G.sound.blip('cash');
      } else G.toast('THE HORNET COSTS $600');
    } else if (Math.hypot(p.x - places.yacht.x, p.y - places.yacht.y) < 60 && G.races.state === 'idle') {
      startRace(G);
    }
  }
  if (!input.justPressed('e')) return;
  if (p.car) {
    // At the garage with a hurt car, E repairs instead of exiting.
    const garage = places.garage;
    const nearGarage = Math.hypot(p.x - garage.x, p.y - garage.y) < 110;
    if (nearGarage && p.car.health < p.car.model.durability && G.cash >= 100 && Math.abs(p.car.speed) < 8) {
      G.cash -= 100;
      p.car.health = p.car.model.durability;
      p.car.wrecked = false;
      G.toast('REPAIRED · $100 · SOL\'S GARAGE');
      G.sound.blip('cash');
      return;
    }
    exitCar();
    return;
  }
  const giver = G.nextGiver;
  if (giver && Math.hypot(p.x - giver.place.x, p.y - giver.place.y) < 48) {
    startChapter(G);
    return;
  }
  const car = nearestCar(46);
  if (car) {
    if (car.kind === 'police') car.wasPolice = true;
    enterCar(car);
    return;
  }
  const garage = places.garage;
  if (Math.hypot(p.x - garage.x, p.y - garage.y) < 52) {
    // Repair the car you arrived in is handled from the seat; on foot the
    // garage sells supplies.
    if (G.cash >= 200) {
      G.cash -= 200;
      p.health = Math.min(100, p.health + 40);
      p.armour = Math.min(100, p.armour + 50);
      if (p.weapons.includes('palm9')) p.ammo.palm9 = Math.min(240, p.ammo.palm9 + 60);
      if (p.weapons.includes('hornet')) p.ammo.hornet = Math.min(480, p.ammo.hornet + 120);
      G.toast('SUPPLIES · PATCHED, PLATED, LOADED');
      G.sound.blip('cash');
    } else G.toast('SUPPLIES COST $200');
    return;
  }
  const clinica = places.clinica;
  if (Math.hypot(p.x - clinica.x, p.y - clinica.y) < 52 && p.health < 100 && G.cash >= 60) {
    G.cash -= 60;
    p.health = 100;
    G.toast('PATCHED UP · CLÍNICA REYES');
    G.sound.blip('cash');
  }
}

// --- player stepping -------------------------------------------------------------

function onPier(x, y) {
  for (const pier of G.city.piers) {
    if (pier.w && x >= pier.x && x <= pier.x + pier.w && y >= pier.y - 4 && y <= pier.y + pier.h + 4) return true;
  }
  return false;
}

function stepPlayer(dt) {
  const p = G.player;
  if (p.car) {
    stepPlayerCar(G, dt, G.input);
    p.vx = Math.cos(p.car.angle) * p.car.speed;
    p.vy = Math.sin(p.car.angle) * p.car.speed;
    return;
  }
  const axes = G.input.axes();
  const sprint = G.input.down('shift');
  const ground = groundAt(G.city, p.x, p.y);
  let speed = sprint ? 196 : 128;
  if (ground === 'sand') speed *= 0.78;
  const tx = axes.x * speed;
  const ty = axes.y * speed;
  p.vx += (tx - p.vx) * Math.min(1, dt * 11);
  p.vy += (ty - p.vy) * Math.min(1, dt * 11);
  let nx = p.x + p.vx * dt;
  let ny = p.y + p.vy * dt;
  // The sea is not a road: wading stops at the waterline unless a pier helps.
  if (groundAt(G.city, nx, ny) === 'water' && !onPier(nx, ny)) {
    if (groundAt(G.city, nx, p.y) !== 'water' || onPier(nx, p.y)) ny = p.y;
    else if (groundAt(G.city, p.x, ny) !== 'water' || onPier(p.x, ny)) nx = p.x;
    else { nx = p.x; ny = p.y; }
  }
  const pos = collideCircle(G.city, nx, ny, p.radius);
  p.x = pos.x;
  p.y = pos.y;
  const moving = Math.hypot(p.vx, p.vy);
  if (moving > 12) {
    p.walkPhase += dt * moving * 0.085;
    if (G.input.mouseDown || p.weapon === 'fists') p.angle = Math.atan2(p.vy, p.vx);
  }
}

// --- respawns ----------------------------------------------------------------------

function respawnAt(placeId, health) {
  const p = G.player;
  const place = G.city.places[placeId];
  if (p.car) {
    p.car.kind = p.car.wasPolice ? 'police' : 'parked';
    p.car = null;
  }
  p.x = place.x;
  p.y = place.y + 14;
  p.vx = 0;
  p.vy = 0;
  p.health = health;
  p.dead = false;
  clearWanted(G);
  G.saveGame();
}

function stepRespawns(dt) {
  const p = G.player;
  if (G.respawnT > 0) {
    G.respawnT -= dt;
    if (G.respawnT <= 0) {
      G.cash = Math.max(0, G.cash - HOSPITAL_FEE);
      respawnAt('clinica', 65);
      G.toast('CLÍNICA REYES · BACK ON YOUR FEET');
    }
  }
  if (G.bustedT > 0) {
    G.bustedT -= dt;
    if (G.bustedT <= 0) {
      G.cash = Math.max(0, G.cash - (G.pendingFine || 0));
      G.pendingFine = 0;
      respawnAt('pspd', 100);
      G.toast('RELEASED · PSPD HQ · WALK IT OFF');
    }
  }
}

// --- the frame loop ------------------------------------------------------------------

const FX_LIVES = { muzzle: 0.07, spark: 0.16, hit: 0.22, swing: 0.14, smoke: 1.4, burst: 0.5 };

function stepFx(dt) {
  for (const fx of G.fx) fx.t += dt;
  G.fx = G.fx.filter((fx) => fx.t < (FX_LIVES[fx.kind] || 0.3));
  for (const car of G.cars) {
    if (!car.wrecked && car.health < 30 && Math.random() < dt * 6) {
      G.fx.push({ kind: 'smoke', x: car.x, y: car.y - 6, t: 0 });
    }
  }
}

function cameraFor() {
  if (G.shotCam) return { x: G.shotCam.x, y: G.shotCam.y };
  if (G.mode === 'title') {
    // A slow drift along the beachfront behind the menu.
    return { x: -40 + Math.sin(G.time * 0.05) * 120, y: 4 * 240 + Math.cos(G.time * 0.037) * 160 };
  }
  const p = G.player;
  let tx = p.x;
  let ty = p.y;
  if (p.car) {
    tx += Math.cos(p.car.angle) * p.car.speed * 0.34;
    ty += Math.sin(p.car.angle) * p.car.speed * 0.34;
  }
  return { x: tx, y: ty };
}

let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  G.time += dt;
  const input = G.input;

  if (G.mode === 'playing' && !G.frozen) {
    G.hour += (dt * 24) / DAY_LENGTH;
    if (G.hour >= 24) { G.hour -= 24; G.day++; }
    stepRespawns(dt);
    const incapacitated = G.player.dead || G.respawnT > 0 || G.bustedT > 0;
    if (!incapacitated) {
      G.nextGiver = nextGiver(G);
      computePrompt();
      handleInteractions();
      stepPlayer(dt);
      const aimX = G.camera.x + input.mouseX;
      const aimY = G.camera.y + input.mouseY;
      stepPlayerCombat(G, dt, input, aimX, aimY);
    }
    stepTraffic(G, dt);
    stepPeds(G, dt);
    stepCarContacts(G, dt);
    stepHostiles(G, dt);
    stepBullets(G, dt);
    stepPickups(G, dt);
    stepWanted(G, dt);
    stepMissions(G, dt);
    stepTaxi(G, dt);
    stepRaces(G, dt);
    G.objective = currentObjective(G);
  } else if (G.mode === 'title') {
    stepPeds(G, dt);
    stepTraffic(G, dt);
  }

  if (G.frozen && G.shotObjective) G.objective = G.shotObjective;

  // Camera with a little trauma shake, clamped to the baked world's edge:
  // any further and the view would show the unpainted void beyond it.
  const cam = cameraFor();
  G.shake = Math.max(0, G.shake - dt * 14);
  const shX = (Math.random() - 0.5) * G.shake;
  const shY = (Math.random() - 0.5) * G.shake;
  G.camera = {
    x: Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X - VIEW_W, cam.x - VIEW_W / 2)) + shX,
    y: Math.max(WORLD_MIN_Y, Math.min(WORLD_MAX_Y - VIEW_H, cam.y - VIEW_H / 2)) + shY,
  };

  stepFx(dt);
  render(ctx, G, { camX: G.camera.x, camY: G.camera.y, w: VIEW_W, h: VIEW_H });
  if (G.mode !== 'title') G.hud.update(G, dt);
  G.sound.update(dt, Boolean(G.player.car), G.player.car ? Math.abs(G.player.car.speed) / G.player.car.model.topSpeed : 0, G.sirenLevel);
  input.endFrame();
}

// --- boot ------------------------------------------------------------------------------

function wireUi() {
  const byId = (id) => document.getElementById(id);
  byId('btn-new').addEventListener('click', () => { G.sound.init(); G.sound.blip('ui'); newGame(null); });
  byId('btn-continue').addEventListener('click', () => {
    G.sound.init();
    const save = readSave();
    if (save) newGame(save);
  });
  byId('btn-how').addEventListener('click', () => {
    byId('title-screen').classList.add('hidden');
    byId('howto-screen').classList.remove('hidden');
  });
  byId('btn-back').addEventListener('click', () => {
    byId('howto-screen').classList.add('hidden');
    byId('title-screen').classList.remove('hidden');
  });
  byId('btn-resume').addEventListener('click', () => setPaused(false));
  byId('btn-quit').addEventListener('click', () => {
    setPaused(false);
    G.mode = 'title';
    byId('title-screen').classList.remove('hidden');
    byId('btn-continue').disabled = !hasSave();
  });
  window.addEventListener('keydown', (e) => {
    G.sound.init();
    if ((e.key === 'p' || e.key === 'Escape') && (G.mode === 'playing' || G.mode === 'paused')) {
      setPaused(G.mode === 'playing');
    }
    if (e.key === 's' && G.mode === 'paused') {
      if (writeSave(G)) G.toast('SAVED');
    }
    if (e.key === 'q' && G.mode === 'paused') {
      setPaused(false);
      G.mode = 'title';
      document.getElementById('title-screen').classList.remove('hidden');
      document.getElementById('btn-continue').disabled = !hasSave();
    }
  });
  canvas.addEventListener('mousedown', () => G.sound.init());
}

function setPaused(on) {
  G.mode = on ? 'paused' : 'playing';
  document.getElementById('pause-menu').classList.toggle('hidden', !on);
  if (!on) return;
}

function boot() {
  buildWorld();
  resetWorld();
  G.hud = new Hud();
  G.input = new Input(canvas);
  wireUi();
  document.getElementById('btn-continue').disabled = !hasSave();
  const shot = shotFromUrl();
  if (shot) {
    G.shotCam = stageShot(G, shot);
    document.getElementById('title-screen').classList.add('hidden');
  }
  requestAnimationFrame(frame);
}

boot();

// The playtest's handle on the real game.
window.__game = {
  G,
  newGame,
  debug: {
    findPath: (ax, ay, bx, by) => findPath(ax, ay, bx, by),
    crossingPath: (corner, axis) => crossingPath(corner, axis),
    giveStars(n) {
      const thresholds = [0, 1, 22, 48, 80, 118, 160];
      G.wanted.points = thresholds[n + 1] || 160;
      G.wanted.stars = n;
      G.wanted.seenT = 0;
    },
    teleport(x, y) {
      G.player.x = x;
      G.player.y = y;
      if (G.player.car) { G.player.car.x = x; G.player.car.y = y; }
    },
    startChapter: () => startChapter(G),
    hurtPlayer: (n) => { G.player.health -= n; if (G.player.health <= 0) { G.player.health = 0; G.player.dead = true; G.onWasted(); } },
  },
};
