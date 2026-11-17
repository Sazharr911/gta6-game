// combat.js — fists, guns, bullets, hostiles and pickups.
//
// The player fights with fists, the Palm-9 and the Hornet SMG; mission
// hostiles answer with scrap pistols, and police sidearms join at four
// stars. Bullets are short-lived tracers tested against buildings, cars and
// bodies. Downed people and wrecked shooters drop pickups: cash, health,
// armour, ammo.

import { WEAPONS } from './config.js';
import { pointInRect, collideCircle } from './city.js';
import { scarePeds, damageCar } from './entities.js';

export function makeHostile(x, y, opts = {}) {
  return {
    id: 9000 + Math.floor(Math.random() * 100000),
    x, y, vx: 0, vy: 0,
    angle: 0,
    radius: 9,
    build: 1.05,
    hat: 'beanie',
    hatColor: '#26221f',
    bag: 'none',
    skin: '#c6885a',
    shirt: opts.shirt || '#3a3f45',
    pants: '#26262a',
    beach: false,
    uniform: false,
    hostile: true,
    melee: Boolean(opts.melee),
    health: opts.health || 60,
    weapon: opts.melee ? WEAPONS.fists : WEAPONS.scrap,
    fireCd: Math.random() * 0.8,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    strafeT: 0,
    walkPhase: 0,
    state: 'engage',
    group: opts.group || null,
    dead: false,
    fadeT: 0,
  };
}

export function fireBullet(G, x, y, angle, weapon, owner) {
  const spread = (Math.random() - 0.5) * 2 * weapon.spread;
  const a = angle + spread;
  G.bullets.push({
    x, y,
    vx: Math.cos(a) * weapon.speed,
    vy: Math.sin(a) * weapon.speed,
    life: weapon.range / weapon.speed,
    damage: weapon.damage,
    owner, // 'player' | 'hostile' | 'cop'
    color: owner === 'player' ? '#ffd76a' : '#ff9a5c',
  });
  G.fx.push({ kind: 'muzzle', x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14, t: 0 });
}

export function damagePlayer(G, amount) {
  const p = G.player;
  if (p.dead || G.mode !== 'playing') return;
  const absorbed = Math.min(p.armour, amount * 0.6);
  p.armour -= absorbed;
  p.health -= amount - absorbed;
  p.hurtCd = 0.25;
  G.shake = Math.min(9, G.shake + 2.5);
  G.sound.blip('hurt');
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    G.onWasted();
  }
}

export function damagePed(G, ped, amount, byPlayer) {
  if (ped.state === 'down') return;
  ped.health -= amount;
  if (ped.health <= 0) {
    ped.state = 'down';
    ped.fadeT = 0;
    if (byPlayer) {
      G.reportCrime('kill', ped.x, ped.y);
      dropPickup(G, ped.x, ped.y, 'cash', 10 + Math.floor(Math.random() * 30));
      if (Math.random() < 0.3) dropPickup(G, ped.x + 12, ped.y, 'health', 25);
    }
  } else {
    if (byPlayer) G.reportCrime('assault', ped.x, ped.y);
    if (!ped.uniform) {
      ped.state = 'flee';
      ped.fleeFrom = { x: G.player.x, y: G.player.y };
      ped.fleeT = 2.6;
      ped.path = [];
    }
  }
}

export function damageHostile(G, h, amount) {
  if (h.state === 'down') return;
  h.health -= amount;
  G.fx.push({ kind: 'hit', x: h.x, y: h.y, t: 0 });
  if (h.health <= 0) {
    h.state = 'down';
    h.fadeT = 0;
    G.reportCrime('kill', h.x, h.y);
    dropPickup(G, h.x, h.y, 'cash', 20 + Math.floor(Math.random() * 45));
    if (Math.random() < 0.45) dropPickup(G, h.x - 12, h.y + 6, 'ammo', 24);
    if (Math.random() < 0.25) dropPickup(G, h.x + 10, h.y - 8, 'armour', 30);
    G.missions.onHostileDown(h);
  }
}

export function dropPickup(G, x, y, kind, amount) {
  G.pickups.push({ x, y, kind, amount, t: Math.random() * 6, life: 40 });
}

// The player's own attacks: mouse aim, click or hold depending on the gun.
export function stepPlayerCombat(G, dt, input, aimX, aimY) {
  const p = G.player;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  if (p.car || p.dead || G.mode !== 'playing' || G.frozen) return;
  const weapon = WEAPONS[p.weapon];
  const wantFire = weapon.auto ? input.mouseDown : input.mouseClicked;
  p.angle = Math.atan2(aimY - p.y, aimX - p.x);
  if (!wantFire || p.fireCd > 0) return;
  if (p.weapon === 'fists') {
    if (p.punchCd > 0) return;
    p.punchCd = 1 / weapon.rate;
    G.sound.blip('punch');
    G.fx.push({ kind: 'swing', x: p.x + Math.cos(p.angle) * 18, y: p.y + Math.sin(p.angle) * 18, t: 0 });
    const tx = p.x + Math.cos(p.angle) * weapon.range;
    const ty = p.y + Math.sin(p.angle) * weapon.range;
    let hit = false;
    for (const ped of G.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - tx, ped.y - ty) < 17) { damagePed(G, ped, weapon.damage, true); hit = true; }
    }
    for (const h of G.hostiles) {
      if (h.state !== 'down' && Math.hypot(h.x - tx, h.y - ty) < 17) { damageHostile(G, h, weapon.damage); hit = true; }
    }
    if (hit) G.sound.blip('hit');
    return;
  }
  if (p.ammo[p.weapon] <= 0) {
    if (input.mouseClicked) G.sound.blip('ui');
    return;
  }
  p.ammo[p.weapon]--;
  p.fireCd = 1 / weapon.rate;
  fireBullet(G, p.x, p.y, p.angle, weapon, 'player');
  G.sound.blip(weapon.sound);
  G.shake = Math.min(6, G.shake + (p.weapon === 'hornet' ? 0.7 : 1.2));
  G.reportCrime('shoot', p.x, p.y);
  scarePeds(G, p.x, p.y, 210);
}

// Hostile muscle: close to range, strafe, fire scrap pistols; thugs run in
// and swing. They fight the player only — the city is not their target.
export function stepHostiles(G, dt) {
  const p = G.player;
  for (const h of G.hostiles) {
    if (h.state === 'down') {
      h.fadeT += dt;
      if (h.fadeT > 12) h.dead = true;
      continue;
    }
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const dist = Math.hypot(dx, dy) || 1;
    h.angle = Math.atan2(dy, dx);
    h.fireCd -= dt;
    h.strafeT -= dt;
    if (h.strafeT <= 0) {
      h.strafeT = 1 + Math.random() * 1.6;
      h.strafeDir = Math.random() < 0.5 ? 1 : -1;
    }
    let mx = 0;
    let my = 0;
    if (h.melee) {
      if (dist > 24) { mx = (dx / dist) * 118; my = (dy / dist) * 118; }
      else if (h.fireCd <= 0 && !p.car) {
        h.fireCd = 0.9;
        G.sound.blip('punch');
        damagePlayer(G, 8);
      }
    } else {
      if (dist > 190) { mx = (dx / dist) * 96; my = (dy / dist) * 96; }
      else if (dist < 110) { mx = (-dx / dist) * 60; my = (-dy / dist) * 60; }
      else { mx = (-dy / dist) * 44 * h.strafeDir; my = (dx / dist) * 44 * h.strafeDir; }
      if (h.fireCd <= 0 && dist < 300 && !p.car) {
        h.fireCd = 1 / h.weapon.rate * (0.8 + Math.random() * 0.5);
        fireBullet(G, h.x, h.y, h.angle, h.weapon, 'hostile');
        G.sound.blip('pistol');
      }
    }
    h.x += mx * dt;
    h.y += my * dt;
    h.walkPhase += dt * Math.hypot(mx, my) * 0.09;
    const pos = collideCircle(G.city, h.x, h.y, h.radius);
    h.x = pos.x;
    h.y = pos.y;
  }
  G.hostiles = G.hostiles.filter((h) => !h.dead);
}

export function stepBullets(G, dt) {
  const p = G.player;
  const alive = [];
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let spent = b.life <= 0;
    if (!spent) {
      for (const c of G.city.colliders) {
        if (pointInRect(b.x, b.y, c)) { spent = true; break; }
      }
    }
    if (!spent && b.owner !== 'player') {
      if (!p.car && !p.dead && Math.hypot(p.x - b.x, p.y - b.y) < p.radius + 3) {
        damagePlayer(G, b.damage);
        spent = true;
      }
      if (p.car && Math.hypot(p.car.x - b.x, p.car.y - b.y) < 21) {
        damageCar(G, p.car, b.damage * 0.4, 'shot');
        spent = true;
      }
    }
    if (!spent && b.owner === 'player') {
      for (const h of G.hostiles) {
        if (h.state !== 'down' && Math.hypot(h.x - b.x, h.y - b.y) < h.radius + 3) {
          damageHostile(G, h, b.damage);
          spent = true;
          break;
        }
      }
      if (!spent) {
        for (const ped of G.peds) {
          if (ped.state !== 'down' && Math.hypot(ped.x - b.x, ped.y - b.y) < ped.radius + 3) {
            damagePed(G, ped, b.damage, true);
            spent = true;
            break;
          }
        }
      }
      if (!spent) {
        for (const car of G.cars) {
          if (car !== p.car && Math.hypot(car.x - b.x, car.y - b.y) < 21) {
            damageCar(G, car, b.damage * 0.5, 'shot');
            if (car.kind === 'police') G.reportCrime('hitCop', car.x, car.y, true);
            spent = true;
            break;
          }
        }
      }
    }
    if (spent) G.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0 });
    else alive.push(b);
  }
  G.bullets = alive;
}

export function stepPickups(G, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    pk.t += dt;
    pk.life -= dt;
    if (p.car || p.dead) continue;
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < 20) {
      pk.life = 0;
      pk.taken = true;
      if (pk.kind === 'cash') { G.cash += pk.amount; G.toast('+$' + pk.amount); }
      if (pk.kind === 'health') { p.health = Math.min(100, p.health + pk.amount); G.toast('+HEALTH'); }
      if (pk.kind === 'armour') { p.armour = Math.min(100, p.armour + pk.amount); G.toast('+ARMOUR'); }
      if (pk.kind === 'ammo') {
        if (!p.weapons.includes('palm9')) p.weapons.push('palm9');
        p.ammo.palm9 = Math.min(WEAPONS.palm9.ammoMax, p.ammo.palm9 + pk.amount);
        G.toast('+PALM-9 AMMO');
      }
      G.sound.blip(pk.kind === 'cash' ? 'cash' : 'pickup');
    }
  }
  G.pickups = G.pickups.filter((pk) => pk.life > 0);
}
