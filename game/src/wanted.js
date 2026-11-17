// wanted.js — crime, witnesses and the Palmshade PD.
//
// Crimes only become heat when somebody sees them: a pedestrian within earshot
// with a clear view, or an officer. Points feed the 0–5 star level. The PSPD
// answers with interceptors that pathfind the street grid with A* toward an
// interception point; at three stars foot officers join, at four they shoot.
// Stay unseen and the heat bleeds away through SEARCHING to nothing.

import { CRIME_POINTS, STAR_THRESHOLDS, PITCH, GRID_COLS, GRID_ROWS } from './config.js';
import { lineOfSight, collideCircle } from './city.js';
import { findPath } from './nav.js';
import { makeCar, makePed, steerCar } from './entities.js';
import { fireBullet } from './combat.js';
import { WEAPONS } from './config.js';

export function makeWanted() {
  return {
    points: 0,
    stars: 0,
    seenT: 99, // seconds since anyone in authority saw the player
    bust: 0, // 0..1 arrest progress
    lastKnown: null,
    leaving: false,
  };
}

export function starsForPoints(points) {
  let stars = 0;
  for (let s = 1; s <= 5; s++) if (points >= STAR_THRESHOLDS[s]) stars = s;
  return stars;
}

// Did anyone see a crime at (x, y)? Pedestrians nearby with line of sight,
// or any police unit. Violent acts also panic the crowd either way.
export function crimeWitnessed(G, x, y) {
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'ride') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < 235 && lineOfSight(G.city, ped.x, ped.y, x, y)) return true;
  }
  for (const cop of G.cops) {
    if (Math.hypot(cop.x - x, cop.y - y) < 380) return true;
  }
  for (const car of G.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - x, car.y - y) < 380) return true;
  }
  return false;
}

// The one door through which every crime enters the ledger. `force` is for
// scripted mission beats the story insists the city noticed.
export function reportCrime(G, kind, x, y, force = false) {
  const w = G.wanted;
  if (G.mode !== 'playing') return;
  if (!force && !crimeWitnessed(G, x, y)) return;
  w.points += CRIME_POINTS[kind] || 8;
  w.stars = starsForPoints(w.points);
  if (w.stars > 0) w.leaving = false;
}

function spawnIntersectionNear(G, minD, maxD) {
  const p = G.player;
  let best = null;
  let bestScore = Infinity;
  for (let j = 0; j < GRID_ROWS; j++) {
    for (let i = 0; i < GRID_COLS; i++) {
      const x = i * PITCH;
      const y = j * PITCH;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < minD || d > maxD) continue;
      const score = Math.abs(d - (minD + maxD) / 2) + G.rng.float() * 60;
      if (score < bestScore) { bestScore = score; best = { x, y, i, j }; }
    }
  }
  if (!best) {
    const i = Math.max(0, Math.min(GRID_COLS - 1, Math.round(p.x / PITCH) + 3));
    const j = Math.max(0, Math.min(GRID_ROWS - 1, Math.round(p.y / PITCH)));
    best = { x: i * PITCH, y: j * PITCH, i, j };
  }
  return best;
}

function spawnInterceptor(G) {
  const spot = spawnIntersectionNear(G, 520, 860);
  const car = makeCar('interceptor', spot.x, spot.y, 0, 'police', G.rng);
  car.route = null;
  car.repathT = 0;
  car.recoverT = 0;
  car.fireCd = 2;
  G.cars.push(car);
  return car;
}

function spawnOfficer(G, nearX, nearY) {
  const spot = spawnIntersectionNear(G, 300, 620);
  const x = nearX !== undefined ? nearX : spot.x;
  const y = nearY !== undefined ? nearY : spot.y;
  const officer = makePed(G, x, y, { uniform: true });
  officer.fireCd = 1.4;
  officer.cop = true;
  G.cops.push(officer);
  G.peds.push(officer);
  return officer;
}

const CARS_BY_STARS = [0, 1, 2, 3, 4, 5];
const OFFICERS_BY_STARS = [0, 0, 0, 2, 3, 4];

export function stepWanted(G, dt) {
  const w = G.wanted;
  const p = G.player;

  // Who can see the player right now?
  let seen = false;
  if (!p.dead) {
    for (const car of G.cars) {
      if (car.kind !== 'police') continue;
      if (Math.hypot(car.x - p.x, car.y - p.y) < 430 && lineOfSight(G.city, car.x, car.y, p.x, p.y)) { seen = true; break; }
    }
    if (!seen) {
      for (const cop of G.cops) {
        if (Math.hypot(cop.x - p.x, cop.y - p.y) < 330 && lineOfSight(G.city, cop.x, cop.y, p.x, p.y)) { seen = true; break; }
      }
    }
  }
  if (seen) {
    w.seenT = 0;
    w.lastKnown = { x: p.x, y: p.y };
  } else {
    w.seenT += dt;
  }

  // Heat decays while unseen; at zero the response stands down.
  if (w.stars > 0 && w.seenT > 6) {
    w.points = Math.max(0, w.points - 7 * dt);
    w.stars = starsForPoints(w.points);
    if (w.stars === 0) {
      w.leaving = true;
      G.toast('YOU LOST THE PSPD');
    }
  }

  // Maintain the response strength for the current star level.
  const wantCars = w.leaving ? 0 : CARS_BY_STARS[w.stars];
  const wantOfficers = w.leaving ? 0 : OFFICERS_BY_STARS[w.stars];
  const liveCars = G.cars.filter((c) => c.kind === 'police' && !c.wrecked);
  if (liveCars.length < wantCars && !p.dead) spawnInterceptor(G);
  const liveOfficers = G.cops.filter((c) => c.state !== 'down');
  if (liveOfficers.length < wantOfficers && !p.dead && w.seenT < 3) {
    const anchor = liveCars[0];
    if (anchor) spawnOfficer(G, anchor.x + G.rng.range(-24, 24), anchor.y + G.rng.range(-24, 24));
    else spawnOfficer(G);
  }

  stepInterceptors(G, dt, seen);
  stepOfficers(G, dt, seen);
  stepBust(G, dt);
  updateSiren(G);
}

function stepInterceptors(G, dt, seen) {
  const w = G.wanted;
  const p = G.player;
  for (const car of G.cars) {
    if (car.kind !== 'police') continue;
    if (car.wrecked) continue;
    const distP = Math.hypot(p.x - car.x, p.y - car.y);

    if (w.leaving || p.dead) {
      // Stand down: drive off and despawn far away.
      if (!car.route) car.route = findPath(car.x, car.y, car.x + 900, car.y - 300);
      followRoute(G, car, dt, 150);
      if (distP > 1000) car.dead = true;
      continue;
    }

    // Stuck recovery: if the car wants to move but is not moving, back out.
    const moved = Math.hypot(car.x - car.lastX, car.y - car.lastY);
    car.lastX = car.x;
    car.lastY = car.y;
    if (car.recoverT > 0) {
      car.recoverT -= dt;
      steerCar(car, car.x - Math.cos(car.angle) * 60, car.y - Math.sin(car.angle) * 60, -120, dt, 2.4);
      continue;
    }
    if (Math.abs(car.speed) > 26 && moved < 1.2) car.stuckT += dt; else car.stuckT = 0;
    if (car.stuckT > 1.1) {
      car.stuckT = 0;
      car.recoverT = 0.55;
      car.route = null;
      continue;
    }

    // Repath on a timer toward an interception point ahead of the suspect.
    car.repathT -= dt;
    const target = seen || w.seenT < 2.5
      ? { x: p.x + (p.car ? Math.cos(p.car.angle) * p.car.speed * 0.55 : 0), y: p.y + (p.car ? Math.sin(p.car.angle) * p.car.speed * 0.55 : 0) }
      : w.lastKnown || { x: p.x, y: p.y };
    if (car.repathT <= 0 || !car.route) {
      car.repathT = 0.8;
      car.route = findPath(car.x, car.y, target.x, target.y);
      car.routeWp = 1;
    }

    const aligned = Math.abs(p.x - car.x) < 46 || Math.abs(p.y - car.y) < 46;
    const direct = distP < 165 || (aligned && lineOfSight(G.city, car.x, car.y, p.x, p.y));
    let want = car.model.topSpeed * (distP > 700 ? 0.94 : 0.8);
    if (!p.car && distP < 110) {
      // Arrest braking: roll up to an on-foot suspect and stop, never run
      // them down — the bust is made by proximity, not by impact.
      want = Math.max(0, Math.min(want, (distP - 26) * 2.4));
    }
    if (direct) {
      steerCar(car, target.x, target.y, want, dt, 3.1);
    } else {
      followRoute(G, car, dt, want);
    }

    // At four stars a passenger leans out and shoots.
    car.fireCd -= dt;
    if (w.stars >= 4 && car.fireCd <= 0 && distP < 290 && !p.dead && lineOfSight(G.city, car.x, car.y, p.x, p.y)) {
      car.fireCd = 2.1 + G.rng.float() * 0.9;
      fireBullet(G, car.x, car.y, Math.atan2(p.y - car.y, p.x - car.x), WEAPONS.cop9, 'cop');
      G.sound.blip('pistol');
    }
  }
  G.cars = G.cars.filter((c) => !c.dead);
}

function followRoute(G, car, dt, want) {
  if (!car.route || !car.route.length) return;
  if (car.routeWp >= car.route.length) car.routeWp = car.route.length - 1;
  let wp = car.route[car.routeWp];
  let guard = 0;
  while (wp && Math.hypot(wp.x - car.x, wp.y - car.y) < 30 && guard++ < 8) {
    car.routeWp++;
    wp = car.route[car.routeWp];
  }
  if (!wp) return;
  steerCar(car, wp.x, wp.y, want, dt, 2.7);
}

function stepOfficers(G, dt, seen) {
  const w = G.wanted;
  const p = G.player;
  for (const cop of G.cops) {
    if (cop.state === 'down') continue;
    const goal = seen || w.seenT < 2.5 ? p : w.lastKnown;
    if (!goal) continue;
    const dx = goal.x - cop.x;
    const dy = goal.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    let speed = 0;
    if (w.leaving || p.dead) {
      speed = 0;
      if (Math.hypot(p.x - cop.x, p.y - cop.y) > 950) cop.dead = true;
      continue;
    }
    if (dist > 30) speed = dist > 260 ? 148 : 108;
    if (speed) {
      cop.x += (dx / dist) * speed * dt;
      cop.y += (dy / dist) * speed * dt;
      cop.walkPhase += dt * speed * 0.09;
      const pos = collideCircle(G.city, cop.x, cop.y, cop.radius);
      cop.x = pos.x;
      cop.y = pos.y;
    }
    cop.fireCd -= dt;
    if (w.stars >= 4 && cop.fireCd <= 0 && !p.car && !p.dead) {
      const distP = Math.hypot(p.x - cop.x, p.y - cop.y);
      if (distP < 320 && lineOfSight(G.city, cop.x, cop.y, p.x, p.y)) {
        cop.fireCd = 1 / WEAPONS.cop9.rate * (0.85 + G.rng.float() * 0.6);
        fireBullet(G, cop.x, cop.y, Math.atan2(p.y - cop.y, p.x - cop.x), WEAPONS.cop9, 'cop');
        G.sound.blip('pistol');
      }
    }
  }
  // Officers who went down fade with the crowd (stepPeds ages them); once
  // faded they leave the force roster too.
  for (const cop of G.cops) {
    if (cop.state === 'down' && cop.fadeT > 13) cop.dead = true;
  }
  G.cops = G.cops.filter((c) => !c.dead);
}

function stepBust(G, dt) {
  const w = G.wanted;
  const p = G.player;
  if (w.stars === 0 || p.dead || G.mode !== 'playing') {
    w.bust = Math.max(0, w.bust - dt);
    return;
  }
  let pressure = 0;
  if (!p.car) {
    const pSpeed = Math.hypot(p.vx, p.vy);
    for (const cop of G.cops) {
      if (cop.state !== 'down' && Math.hypot(cop.x - p.x, cop.y - p.y) < 30) pressure = Math.max(pressure, 0.85);
    }
    if (pSpeed < 34) {
      for (const car of G.cars) {
        if (car.kind === 'police' && !car.wrecked && Math.hypot(car.x - p.x, car.y - p.y) < 44) pressure = Math.max(pressure, 0.55);
      }
    }
  } else if (Math.abs(p.car.speed) < 14) {
    for (const car of G.cars) {
      if (car.kind === 'police' && !car.wrecked && Math.hypot(car.x - p.x, car.y - p.y) < 52) pressure = Math.max(pressure, 0.6);
    }
  }
  if (pressure > 0) w.bust = Math.min(1, w.bust + pressure * dt);
  else w.bust = Math.max(0, w.bust - 0.65 * dt);
  if (w.bust >= 1) {
    w.bust = 0;
    G.onBusted();
  }
}

function updateSiren(G) {
  let nearest = Infinity;
  for (const car of G.cars) {
    if (car.kind === 'police') nearest = Math.min(nearest, Math.hypot(car.x - G.player.x, car.y - G.player.y));
  }
  G.sirenLevel = nearest === Infinity ? 0 : Math.max(0, 0.11 * (1 - nearest / 620));
}

export function clearWanted(G) {
  G.wanted.points = 0;
  G.wanted.stars = 0;
  G.wanted.bust = 0;
  G.wanted.leaving = true;
}
