// shots.js — staged scenes for the entry's screenshots.
//
// tools/shots.mjs opens the game with ?shot=<name>; main.js builds a fresh
// world and calls stageShot, which arranges a frozen tableau out of the
// game's real systems: real cars, real pedestrians, real police, the real
// HUD. Only the clock, the camera and the water keep moving. The scenes are
// the game's own locations — the beachfront chase, the club debt, the
// Heights escape, the docks pickup.

import { PITCH } from './config.js';
import { makeCar, makePed } from './entities.js';
import { makeHostile } from './combat.js';

export function shotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('shot');
}

function setBanner(G, title, sub, x, y) {
  G.shotObjective = { label: title, sub, x, y };
  G.objective = G.shotObjective;
}

function setDialogue(G, who, text) {
  G.missions.dialogue = [[who, text]];
  G.missions.dialogueT = 0;
}

function addCopCar(G, x, y, angle) {
  const car = makeCar('interceptor', x, y, angle, 'police', G.rng);
  G.cars.push(car);
  return car;
}

function addPed(G, x, y, opts = {}) {
  const ped = makePed(G, x, y, opts);
  ped.state = 'hangout';
  ped.walkPhase = G.rng.range(0, 6);
  G.peds.push(ped);
  return ped;
}

// The cover: a three-star chase up the Palmline beachfront at golden hour,
// pedestrians mid-crossing, the sea on the left, a job on the banner.
function stageCover(G) {
  G.hour = 17.9;
  G.cash = 250;
  const roadY = 4 * PITCH;
  const brisa = makeCar('brisa', 11, roadY + 96, -Math.PI / 2, 'mission', G.rng);
  brisa.color = '#e2543e';
  brisa.speed = 150;
  G.cars.push(brisa);
  G.player.car = brisa;
  G.player.x = brisa.x;
  G.player.y = brisa.y;
  addCopCar(G, 12, roadY + 218, -Math.PI / 2);
  addCopCar(G, -13, roadY + 300, -Math.PI / 2);
  // Crossing pedestrians on the zebra at the intersection just ahead.
  addPed(G, 22, roadY - 44, { hat: 'sunhat' });
  addPed(G, -16, roadY - 40, { hat: 'cap' });
  addPed(G, 40, roadY - 48, { hat: 'bare' });
  addPed(G, -44, roadY - 36, { hat: 'beanie' });
  // Beach life to the west, café crowd to the east.
  addPed(G, -96, roadY + 30, { beach: true });
  addPed(G, -120, roadY + 120, { beach: true });
  addPed(G, 120, roadY + 130, {});
  addPed(G, 138, roadY + 118, {});
  G.wanted.points = 80;
  G.wanted.stars = 3;
  G.wanted.seenT = 0; // the HUD reads IN PURSUIT, not SEARCHING
  setBanner(G, 'MISSION 4/6 · HARBOR RUN', 'Collect the package at the Coral Docks', G.city.places.docks.x, G.city.places.docks.y);
  setDialogue(G, 'SOL', 'A package is waiting at Pier 9. The moment you touch it, every siren in Palmshade wakes up. Lose them, then come home.');
  return { x: brisa.x - 210, y: brisa.y + 150 };
}

// On foot outside Club Azahar at night: the collectors, the crowd, the neon.
function stageOnFoot(G) {
  G.hour = 21.4;
  G.cash = 1150;
  const club = G.city.places.club;
  G.player.x = club.x + 6;
  G.player.y = club.y + 42;
  G.player.angle = -Math.PI / 2;
  G.player.weapons.push('palm9');
  G.player.ammo.palm9 = 48;
  G.player.weapon = 'palm9';
  const spots = [
    { x: club.x - 44, y: club.y + 66 },
    { x: club.x + 52, y: club.y + 74 },
    { x: club.x + 4, y: club.y + 96 },
  ];
  for (const s of spots) {
    const h = makeHostile(s.x, s.y, { shirt: '#4a3436' });
    h.angle = Math.atan2(G.player.y - h.y, G.player.x - h.x);
    G.hostiles.push(h);
  }
  addPed(G, club.x - 90, club.y + 30, { hat: 'cap' });
  addPed(G, club.x + 96, club.y + 22, { hat: 'bare' });
  addPed(G, club.x - 60, club.y + 110, { hat: 'sunhat' });
  addPed(G, club.x + 120, club.y + 120, { hat: 'beanie' });
  const parked = makeCar('tiburon', club.x + 130, club.y + 44, Math.PI, 'parked', G.rng);
  G.cars.push(parked);
  setBanner(G, 'MISSION 3/6 · NEON DEBT', 'Deal with the collectors · 3 still standing', club.x, club.y);
  setDialogue(G, 'SOL', 'Three of them, outside the club. Persuade them — professionally.');
  return { x: G.player.x, y: G.player.y + 30 };
}

// Four stars in a Tiburón GT through Azure Heights, mid-afternoon.
function stageChase(G) {
  G.hour = 15.2;
  G.cash = 2740;
  const gt = makeCar('tiburon', 9 * PITCH, 1 * PITCH + 11, 0, 'mission', G.rng);
  gt.color = '#7a1f2b';
  gt.speed = 320;
  G.cars.push(gt);
  G.player.car = gt;
  G.player.x = gt.x;
  G.player.y = gt.y;
  addCopCar(G, 9 * PITCH - 190, 1 * PITCH + 12, 0);
  addCopCar(G, 9 * PITCH - 300, 1 * PITCH - 12, 0.1);
  addCopCar(G, 9 * PITCH - 130, 2 * PITCH - 130, -Math.PI / 2);
  addPed(G, 9 * PITCH + 180, 1 * PITCH + 46, { hat: 'cap' });
  addPed(G, 9 * PITCH + 260, 1 * PITCH - 44, { hat: 'bare' });
  G.wanted.points = 118;
  G.wanted.stars = 4;
  G.wanted.seenT = 0;
  setBanner(G, 'MISSION 5/6 · THE PALMSHADE JOB', 'Lose the PSPD', undefined, undefined);
  setDialogue(G, 'SOL', 'Do not stop, cariño. The marina can wait — the sirens cannot.');
  return { x: gt.x + 130, y: gt.y };
}

// Morning at the Coral Docks: Rio out on Pier 9 itself, cranes above the
// water, the getaway Brisa waiting at the pier head.
function stageDocks(G) {
  G.hour = 8.4;
  G.cash = 1650;
  const docks = G.city.places.docks;
  G.player.x = -128;
  G.player.y = 7 * PITCH + 38;
  G.player.angle = 0.5;
  const brisa = makeCar('brisa', 11, 7 * PITCH + 128, -Math.PI / 2, 'parked', G.rng);
  brisa.color = '#37a6a0';
  G.cars.push(brisa);
  const flete = makeCar('flete', 150, 7 * PITCH - 40, 0, 'parked', G.rng);
  G.cars.push(flete);
  addPed(G, -90, 7 * PITCH + 90, { hat: 'cap', shirt: '#c96a2d' });
  addPed(G, 60, 7 * PITCH + 150, { hat: 'beanie', shirt: '#c96a2d' });
  addPed(G, docks.x + 30, docks.y + 20, { hat: 'bare' });
  setBanner(G, 'MISSION 4/6 · HARBOR RUN', 'Collect the package at Pier 9', docks.x, docks.y);
  setDialogue(G, 'SOL', 'Pier 9, by the crane. Take the package and run the shoreline home.');
  return { x: -10, y: 7 * PITCH + 70 };
}

const SCENES = {
  cover: stageCover,
  onfoot: stageOnFoot,
  chase: stageChase,
  docks: stageDocks,
};

export function stageShot(G, name) {
  const scene = SCENES[name] || stageCover;
  G.frozen = true;
  G.mode = 'playing';
  return scene(G);
}
