// entities.js — the living things of Port Palmshade.
//
// Factories and per-frame steppers for the player, every car (parked,
// traffic, stolen, police) and the pedestrian crowd. Pedestrians are drawn
// large enough to read at city zoom and vary by build, hat, bag and dress;
// they stroll block sidewalks, cross streets inside the zebra bands, gather
// at hangout spots, and run from violence. Traffic follows right-hand lanes
// between intersections and brakes for anyone in the road.

import {
  PITCH, STREET_HALF, GRID_COLS, GRID_ROWS, LANE_OFFSET,
  VEHICLE_MODELS, WALK_SPEED, SPRINT_SPEED, PLAYER_RADIUS,
  WATER_EDGE, WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y,
} from './config.js';
import { collideCircle, groundAt } from './city.js';
import { RNG } from './random.js';

const MODEL_BY_ID = Object.fromEntries(VEHICLE_MODELS.map((m) => [m.id, m]));
export function vehicleModel(id) {
  return MODEL_BY_ID[id];
}

let nextId = 1;

export function makePlayer(x, y) {
  return {
    id: nextId++,
    x, y, vx: 0, vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER_RADIUS,
    health: 100,
    armour: 0,
    weapons: ['fists'],
    ammo: { palm9: 0, hornet: 0 },
    weapon: 'fists',
    car: null,
    walkPhase: 0,
    fireCd: 0,
    punchCd: 0,
    hurtCd: 0,
    dead: false,
  };
}

export function makeCar(modelId, x, y, angle, kind, rng) {
  const model = MODEL_BY_ID[modelId];
  return {
    id: nextId++,
    model,
    modelId,
    x, y, angle,
    speed: 0,
    health: model.durability,
    color: kind === 'police' ? '#1d2735' : rng.pick(model.colors),
    kind, // 'parked' | 'traffic' | 'police' | 'mission' | 'player'
    driver: null,
    // traffic state
    nodeI: 0, nodeJ: 0, fromI: 0, fromJ: 0, cruise: 0,
    // police state (wanted.js fills these in)
    route: null, routeWp: 0, repathT: 0, stuckT: 0, lastX: x, lastY: y,
    smokeT: 0,
    wrecked: false,
  };
}

// Fill the kerbs with parked cars from the city's bays.
export function spawnParkedCars(G) {
  const spots = G.rng.shuffled(G.city.parkedSpots).slice(0, 46);
  for (const spot of spots) {
    const model = G.rng.pick(['solano', 'solano', 'brisa', 'flete', 'ranchero', 'taxi']);
    const car = makeCar(model, spot.x, spot.y, spot.angle, 'parked', G.rng);
    G.cars.push(car);
  }
}

// --- traffic ---------------------------------------------------------------

function lanePoint(i, j, di, dj) {
  // The point on the target intersection, shifted onto the right-hand lane
  // for travel in direction (di, dj).
  const x = i * PITCH;
  const y = j * PITCH;
  if (di === 1) return { x, y: y + LANE_OFFSET };
  if (di === -1) return { x, y: y - LANE_OFFSET };
  if (dj === 1) return { x: x - LANE_OFFSET, y };
  return { x: x + LANE_OFFSET, y };
}

function sendToNextNode(G, car) {
  const options = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [di, dj] of dirs) {
    const ni = car.nodeI + di;
    const nj = car.nodeJ + dj;
    if (ni < 0 || nj < 0 || ni >= GRID_COLS || nj >= GRID_ROWS) continue;
    if (ni === car.fromI && nj === car.fromJ && options.length) continue; // no U-turns while choices exist
    const straight = di === Math.sign(car.nodeI - car.fromI) && dj === Math.sign(car.nodeJ - car.fromJ);
    options.push({ ni, nj, di, dj, weight: straight ? 3 : 1 });
  }
  if (!options.length) return;
  let total = 0;
  for (const o of options) total += o.weight;
  let roll = G.rng.float() * total;
  let chosen = options[0];
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) { chosen = o; break; }
  }
  car.fromI = car.nodeI;
  car.fromJ = car.nodeJ;
  car.nodeI = chosen.ni;
  car.nodeJ = chosen.nj;
  car.target = lanePoint(chosen.ni, chosen.nj, chosen.di, chosen.dj);
}

export function spawnTrafficCar(G) {
  const i = G.rng.int(1, GRID_COLS - 2);
  const j = G.rng.int(1, GRID_ROWS - 2);
  const model = G.rng.pick(['solano', 'solano', 'brisa', 'flete', 'ranchero', 'taxi', 'taxi']);
  const car = makeCar(model, i * PITCH, j * PITCH, 0, 'traffic', G.rng);
  car.nodeI = i;
  car.nodeJ = j;
  car.fromI = i;
  car.fromJ = j;
  car.cruise = Math.min(168, car.model.topSpeed * 0.46) * G.rng.range(0.8, 1.05);
  sendToNextNode(G, car);
  // Start halfway along the first segment, already on the correct lane.
  const di = Math.sign(car.nodeI - car.fromI);
  const dj = Math.sign(car.nodeJ - car.fromJ);
  const start = lanePoint(car.fromI, car.fromJ, di, dj);
  car.x = (start.x + car.target.x) / 2;
  car.y = (start.y + car.target.y) / 2;
  car.angle = Math.atan2(car.target.y - car.y, car.target.x - car.x);
  G.cars.push(car);
  return car;
}

// Steer a car toward a point with a speed cap; shared by traffic, police and
// (indirectly, through physics) nobody else. Returns the distance left.
export function steerCar(car, tx, ty, wantSpeed, dt, turnRate = 2.6) {
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = turnRate * dt;
  car.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
  const accel = car.model.accel;
  if (car.speed < wantSpeed) car.speed = Math.min(wantSpeed, car.speed + accel * dt);
  else car.speed = Math.max(wantSpeed, car.speed - accel * 1.6 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return dist;
}

function obstacleAhead(G, car, lookDist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of G.cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 4 || ahead > lookDist) continue;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side < 17) return true;
  }
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'ride') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 2 || ahead > lookDist + 8) continue;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side < 15 && groundAt(G.city, ped.x, ped.y) === 'road') return true;
  }
  const p = G.player;
  if (!p.car && !p.dead) {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 2 && ahead < lookDist + 8 && Math.abs(dx * -fy + dy * fx) < 15) return true;
  }
  return false;
}

export function stepTraffic(G, dt) {
  // Keep a living stream of traffic near the player.
  const near = G.cars.filter((c) => c.kind === 'traffic' && Math.hypot(c.x - G.player.x, c.y - G.player.y) < 1500);
  if (near.length < 13 && G.rng.chance(0.02)) {
    const car = spawnTrafficCar(G);
    if (Math.hypot(car.x - G.player.x, car.y - G.player.y) < 320) {
      G.cars.splice(G.cars.indexOf(car), 1);
    }
  }
  for (const car of G.cars) {
    if (car.kind !== 'traffic' || car.wrecked) continue;
    const far = Math.hypot(car.x - G.player.x, car.y - G.player.y) > 1750;
    if (far) { car.dead = true; continue; }
    const blocked = obstacleAhead(G, car, 46);
    const want = blocked ? 0 : car.cruise;
    const dist = steerCar(car, car.target.x, car.target.y, want, dt, 2.2);
    if (dist < 26) sendToNextNode(G, car);
    const pos = collideCircle(G.city, car.x, car.y, 13);
    car.x = pos.x;
    car.y = pos.y;
  }
  G.cars = G.cars.filter((c) => !c.dead);
}

// --- cars: shared physics for the player's car ------------------------------

export function stepPlayerCar(G, dt, input) {
  const car = G.player.car;
  if (!car) return;
  const model = car.model;
  const ground = groundAt(G.city, car.x, car.y);
  const surface = ground === 'sand' ? 0.52 : ground === 'water' ? 0.2 : 1;
  const throttle = input.down('w', 'arrowup') ? 1 : input.down('s', 'arrowdown') ? -0.55 : 0;
  const steer = (input.down('a', 'arrowleft') ? -1 : 0) + (input.down('d', 'arrowright') ? 1 : 0);
  const handbrake = input.down('shift');
  if (throttle > 0) car.speed += model.accel * surface * dt;
  else if (throttle < 0) car.speed += model.accel * throttle * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 60 * dt);
  const drag = handbrake ? 1.9 : 0.24;
  car.speed -= car.speed * drag * dt;
  const maxF = model.topSpeed * surface;
  const maxR = -model.topSpeed * 0.32;
  car.speed = Math.max(maxR, Math.min(maxF, car.speed));
  if (Math.abs(car.speed) > 2) {
    const turn = steer * (handbrake ? 2.5 : 1.85) * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 130);
    car.angle += turn;
  }
  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;
  if (car.x < WATER_EDGE + 14) { car.x = WATER_EDGE + 14; if (car.speed > 0) car.speed *= 0.4; }
  car.x = Math.max(WORLD_MIN_X + 16, Math.min(WORLD_MAX_X - 16, car.x));
  car.y = Math.max(WORLD_MIN_Y + 16, Math.min(WORLD_MAX_Y - 16, car.y));
  const pos = collideCircle(G.city, car.x, car.y, 14);
  const hitWall = pos.x !== car.x || pos.y !== car.y;
  car.x = pos.x;
  car.y = pos.y;
  if (hitWall) {
    // A real impact bites; a gentle scrape just bleeds speed.
    if (Math.abs(car.speed) > 90) {
      damageCar(G, car, Math.abs(car.speed) * 0.05, 'crash');
      car.speed *= -0.25;
    } else {
      car.speed *= 0.92;
    }
  }
  G.player.x = car.x;
  G.player.y = car.y;
  G.player.angle = car.angle;
}

export function damageCar(G, car, amount, cause) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 30 && car.health + amount > 30) {
    G.fx.push({ kind: 'smoke', x: car.x, y: car.y, t: 0 });
  }
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
    G.fx.push({ kind: 'burst', x: car.x, y: car.y, t: 0, color: '#e2543e' });
    if (cause !== 'silent') G.sound.blip('crash');
  }
}

// Car-on-car contact: a soft push apart plus damage at speed.
export function stepCarContacts(G, dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 30;
      if (d === 0 || d >= min) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      const aMovable = a.kind !== 'parked';
      const bMovable = b.kind !== 'parked';
      if (aMovable) { a.x -= nx * push; a.y -= ny * push; }
      if (bMovable) { b.x += nx * push; b.y += ny * push; }
      const relSpeed = Math.abs(a.speed - b.speed);
      if (relSpeed > 120) {
        damageCar(G, a, relSpeed * 0.04, 'crash');
        damageCar(G, b, relSpeed * 0.04, 'crash');
        if (a === G.player.car || b === G.player.car) {
          G.sound.blip('crash');
          G.reportCrime('hitCar', a === G.player.car ? b.x : a.x, a === G.player.car ? b.y : a.y);
        }
      }
    }
  }
}

// --- pedestrians -------------------------------------------------------------

const SKIN_TONES = ['#f2c79b', '#e0ac7e', '#c6885a', '#9c6642', '#7a4b2a'];
const SHIRTS = ['#e2543e', '#37a6a0', '#f2a03d', '#e8e3d5', '#5d7fa6', '#b04df0', '#6aa84f', '#d96b8b'];
const PANTS = ['#31435c', '#5c4632', '#3c3c40', '#715c8c', '#2f5245', '#8c8578'];
const BEACH_WEAR = ['#ff6b4a', '#ffd23e', '#3ec6b8', '#ff8fab', '#e8e3d5'];

export function makePed(G, x, y, opts = {}) {
  const rng = G.rng;
  const beach = opts.beach ?? (x < STREET_HALF + PITCH * 0.5 && rng.chance(0.55));
  const ped = {
    id: nextId++,
    x, y, vx: 0, vy: 0,
    angle: rng.range(0, Math.PI * 2),
    radius: 9,
    build: rng.pick([0.92, 1, 1, 1.1]),
    hat: opts.hat ?? rng.pick(['cap', 'sunhat', 'beanie', 'bare', 'bare']),
    hatColor: rng.pick(SHIRTS),
    bag: rng.pick(['none', 'none', 'tote', 'shoulder']),
    skin: rng.pick(SKIN_TONES),
    shirt: beach ? rng.pick(BEACH_WEAR) : rng.pick(SHIRTS),
    pants: beach ? rng.pick(BEACH_WEAR) : rng.pick(PANTS),
    beach,
    uniform: Boolean(opts.uniform),
    state: opts.state || 'roam',
    path: [],
    wp: 0,
    idleT: rng.range(0, 2),
    walkPhase: rng.range(0, 6),
    speed: rng.range(52, 74),
    health: 40,
    hangout: opts.hangout || null,
    block: null,
    fleeFrom: null,
    fleeT: 0,
    dead: false,
    fadeT: 0,
    partner: null,
  };
  if (ped.uniform) {
    ped.shirt = '#22314a';
    ped.pants = '#1a2436';
    ped.hat = 'cap';
    ped.hatColor = '#16233a';
  }
  return ped;
}

export function spawnPeds(G) {
  const { city } = G;
  // A crowd gathered at the hangouts.
  for (const spot of city.hangouts) {
    if (G.rng.chance(0.62)) {
      const ped = makePed(G, spot.x + G.rng.range(-7, 7), spot.y + G.rng.range(-7, 7), { hangout: spot, state: 'hangout', beach: spot.kind === 'beach' });
      G.peds.push(ped);
    }
  }
  // Roamers on sidewalks and the sand.
  for (let k = 0; k < 30; k++) {
    if (G.rng.chance(0.3)) {
      const ped = makePed(G, G.rng.range(WATER_EDGE + 24, -STREET_HALF - 14), G.rng.range(0, (GRID_ROWS - 1) * PITCH), { beach: true });
      G.peds.push(ped);
    } else {
      const block = G.rng.pick(city.blocks);
      const ped = makePed(G, block.x + 8, block.y + G.rng.range(10, block.h - 10));
      ped.block = block;
      G.peds.push(ped);
    }
  }
}

// The four sidewalk corners of a block, inset onto the pavement.
function blockCorners(block) {
  const i = 8;
  return [
    { x: block.x + i, y: block.y + i },
    { x: block.x + block.w - i, y: block.y + i },
    { x: block.x + block.w - i, y: block.y + block.h - i },
    { x: block.x + i, y: block.y + block.h - i },
  ];
}

// A crossing path over one road at the intersection nearest a block corner:
// walk to the zebra band's row (or column), straight across inside the band,
// then to the far corner. maxDeviation from the band centre is 0 by design.
export function crossingPath(corner, axis) {
  const off = STREET_HALF + 10;
  if (axis === 'v') {
    // Cross the vertical road: the corner sits beside intersection (i, j).
    const ix = Math.round(corner.x / PITCH) * PITCH;
    const ij = Math.round(corner.y / PITCH) * PITCH;
    const bandY = ij + (corner.y > ij ? off : -off);
    const mirrorX = 2 * ix - corner.x;
    return [
      { x: corner.x, y: bandY },
      { x: mirrorX, y: bandY },
      { x: mirrorX, y: corner.y },
    ];
  }
  const ij = Math.round(corner.y / PITCH) * PITCH;
  const ix = Math.round(corner.x / PITCH) * PITCH;
  const bandX = ix + (corner.x > ix ? off : -off);
  const mirrorY = 2 * ij - corner.y;
  return [
    { x: bandX, y: corner.y },
    { x: bandX, y: mirrorY },
    { x: corner.x, y: mirrorY },
  ];
}

function nearestCornerIndex(corners, x, y) {
  let best = 0;
  let bd = Infinity;
  corners.forEach((c, idx) => {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = idx; }
  });
  return best;
}

// Decide a roamer's next waypoints: around the block, across a street, or
// over to a hangout on the same block.
function planRoam(G, ped) {
  const { city } = G;
  if (!ped.block) {
    // Beach walkers stroll the sand north or south.
    const dir = G.rng.chance(0.5) ? 1 : -1;
    ped.path = [{ x: ped.x + G.rng.range(-8, 8), y: ped.y + dir * G.rng.range(120, 320) }];
    ped.wp = 0;
    return;
  }
  const corners = blockCorners(ped.block);
  const ci = nearestCornerIndex(corners, ped.x, ped.y);
  const roll = G.rng.float();
  if (roll < 0.34) {
    // Cross a street at this corner to the neighbouring block.
    const corner = corners[ci];
    const axis = G.rng.chance(0.5) ? 'v' : 'h';
    const path = crossingPath(corner, axis);
    const far = path[path.length - 1];
    const farBlock = city.blocks.find((b) => far.x >= b.x - 20 && far.x <= b.x + b.w + 20 && far.y >= b.y - 20 && far.y <= b.y + b.h + 20);
    ped.path = [{ x: corner.x, y: corner.y }, ...path];
    ped.wp = 0;
    if (farBlock) ped.nextBlock = farBlock;
    return;
  }
  if (roll < 0.48) {
    const spots = city.hangouts.filter((h) => h.x >= ped.block.x && h.x <= ped.block.x + ped.block.w && h.y >= ped.block.y && h.y <= ped.block.y + ped.block.h);
    if (spots.length) {
      const spot = G.rng.pick(spots);
      ped.path = [{ x: spot.x, y: spot.y }];
      ped.wp = 0;
      ped.goHangout = spot;
      return;
    }
  }
  // Otherwise: walk the perimeter to another corner.
  const target = corners[(ci + G.rng.pick([1, 2, 3])) % 4];
  ped.path = [target];
  ped.wp = 0;
}

export function stepPeds(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.state === 'down') {
      ped.fadeT += dt;
      if (ped.fadeT > 14) ped.dead = true;
      continue;
    }
    if (ped.cop) continue; // foot officers are driven by wanted.js
    if (ped.state === 'ride') continue; // sitting in a car (taxi fare)
    if (ped.state === 'hangout') {
      ped.idleT -= dt;
      ped.walkPhase += dt * 0.6;
      if (ped.partner) ped.angle = Math.atan2(ped.partner.y - ped.y, ped.partner.x - ped.x);
      if (ped.idleT < -G.rng.range(6, 14)) {
        ped.state = 'roam';
        ped.idleT = 0;
        if (!ped.block) ped.block = G.city.blockAt(ped.x, ped.y);
        planRoam(G, ped);
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - ped.fleeFrom.x;
      const dy = ped.y - ped.fleeFrom.y;
      const d = Math.hypot(dx, dy) || 1;
      movePed(G, ped, (dx / d) * 168, (dy / d) * 168, dt);
      if (ped.fleeT <= 0) {
        ped.state = 'roam';
        ped.path = [];
        if (!ped.block) ped.block = G.city.blockAt(ped.x, ped.y);
      }
      continue;
    }
    // roam / cross / fare-wait
    if (ped.state === 'fare') {
      ped.walkPhase += dt * 0.5;
      continue;
    }
    if (!ped.path.length) planRoam(G, ped);
    const target = ped.path[ped.wp];
    if (!target) { ped.path = []; continue; }
    const dx = target.x - ped.x;
    const dy = target.y - ped.y;
    const dist = Math.hypot(dx, dy);
    const arrive = ped.wp === ped.path.length - 1 ? 13 : 5;
    if (dist < arrive) {
      ped.wp++;
      if (ped.wp >= ped.path.length) {
        ped.path = [];
        if (ped.nextBlock) { ped.block = ped.nextBlock; ped.nextBlock = null; }
        if (ped.goHangout) {
          ped.state = 'hangout';
          ped.hangout = ped.goHangout;
          ped.goHangout = null;
          ped.idleT = 0;
        }
      }
      continue;
    }
    const hurry = groundAt(G.city, ped.x, ped.y) === 'road' ? 1.5 : 1;
    movePed(G, ped, (dx / dist) * ped.speed * hurry, (dy / dist) * ped.speed * hurry, dt);
  }
  // Pair up hangout neighbours so crowds face each other and chat.
  for (const ped of G.peds) {
    if (ped.state !== 'hangout') continue;
    if (!ped.partner || ped.partner.state !== 'hangout') {
      ped.partner = G.peds.find((o) => o !== ped && o.state === 'hangout' && Math.hypot(o.x - ped.x, o.y - ped.y) < 30) || null;
    }
  }
  G.peds = G.peds.filter((ped) => !ped.dead);
}

function movePed(G, ped, vx, vy, dt) {
  ped.vx = vx;
  ped.vy = vy;
  ped.x += vx * dt;
  ped.y += vy * dt;
  if (vx || vy) ped.angle = Math.atan2(vy, vx);
  ped.walkPhase += dt * Math.hypot(vx, vy) * 0.09;
  const pos = collideCircle(G.city, ped.x, ped.y, ped.radius);
  // A waypoint hidden behind a collider would grind forever: if the ped was
  // pushed sideways hard, drop the current waypoint and re-plan shortly.
  if (Math.abs(pos.x - ped.x) > 6 || Math.abs(pos.y - ped.y) > 6) {
    ped.stuckT = (ped.stuckT || 0) + dt;
    if (ped.stuckT > 0.7) {
      ped.path = [];
      ped.stuckT = 0;
    }
  } else {
    ped.stuckT = 0;
  }
  ped.x = pos.x;
  ped.y = pos.y;
  ped.x = Math.max(WORLD_MIN_X + 6, Math.min(WORLD_MAX_X - 6, ped.x));
  ped.y = Math.max(WORLD_MIN_Y + 6, Math.min(WORLD_MAX_Y - 6, ped.y));
}

// Send every pedestrian near a violent point running, and return whether any
// of them actually saw it (the wanted system's witness test leans on this).
export function scarePeds(G, x, y, radius) {
  let witnessed = false;
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'ride') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      witnessed = true;
      if (d < radius * 0.62 && !ped.uniform) {
        ped.state = 'flee';
        ped.fleeFrom = { x, y };
        ped.fleeT = G.rng.range(2.4, 4.2);
        ped.path = [];
      }
    }
  }
  return witnessed;
}
