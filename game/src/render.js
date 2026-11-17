// render.js — Port Palmshade on canvas.
//
// The static city is baked once into two full-world layers: the daylight
// base (roads, zebra crossings, sidewalks, roofs with their window dialects
// and clutter, storefront signs, parks, the beach, the docks) and a night
// layer holding only light — lit windows, glowing signs, street lamps. Each
// frame composites the base, animated water, the day/night wash, actors,
// effects and objective markers.

import {
  PITCH, STREET, STREET_HALF, GRID_COLS, GRID_ROWS,
  WATER_EDGE, SAND_EDGE, WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y,
} from './config.js';

export const WORLD_W = WORLD_MAX_X - WORLD_MIN_X;
export const WORLD_H = WORLD_MAX_Y - WORLD_MIN_Y;

// How dark / how golden the light is at an in-game hour (0..24).
export function daylight(hour) {
  let dark = 0;
  if (hour >= 19.5 || hour < 4.5) dark = 1;
  else if (hour > 17.5) dark = (hour - 17.5) / 2;
  else if (hour >= 4.5 && hour < 7) dark = 1 - (hour - 4.5) / 2.5;
  let golden = 0;
  if (hour > 6.5 && hour < 9) golden = 1 - Math.abs(hour - 7.75) / 1.25;
  if (hour > 17 && hour < 19.75) golden = 1 - Math.abs(hour - 18.4) / 1.4;
  return { dark: Math.max(0, Math.min(1, dark)), golden: Math.max(0, Math.min(1, golden)) };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function makeLayer() {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  return c;
}

// --- the baked base layer -----------------------------------------------------

export function bakeCity(city) {
  const base = makeLayer();
  const lights = makeLayer();
  const b = base.getContext('2d');
  const l = lights.getContext('2d');
  b.translate(-WORLD_MIN_X, -WORLD_MIN_Y);
  l.translate(-WORLD_MIN_X, -WORLD_MIN_Y);

  // Sea and sand.
  const sea = b.createLinearGradient(WORLD_MIN_X, 0, WATER_EDGE, 0);
  sea.addColorStop(0, '#1d5f7a');
  sea.addColorStop(1, '#2e7d99');
  b.fillStyle = sea;
  b.fillRect(WORLD_MIN_X, WORLD_MIN_Y, WATER_EDGE - WORLD_MIN_X, WORLD_H);
  b.fillStyle = '#eed9a4';
  b.fillRect(WATER_EDGE, WORLD_MIN_Y, SAND_EDGE - WATER_EDGE, WORLD_H);
  b.fillStyle = 'rgba(190,160,100,0.35)';
  for (let i = 0; i < 40; i++) {
    const x = WATER_EDGE + ((i * 53) % (SAND_EDGE - WATER_EDGE));
    const y = WORLD_MIN_Y + ((i * 211) % WORLD_H);
    b.fillRect(x, y, 14, 3);
  }

  // Docks piers over the water.
  b.fillStyle = '#8a6b48';
  for (const pier of city.piers) {
    if (!pier.w) continue;
    b.fillRect(pier.x, pier.y, pier.w, pier.h);
    b.fillStyle = 'rgba(0,0,0,0.18)';
    for (let px = pier.x + 8; px < pier.x + pier.w; px += 16) b.fillRect(px, pier.y, 2, pier.h);
    b.fillStyle = '#8a6b48';
  }
  // Cranes: base block + jib.
  b.strokeStyle = '#c9532f';
  b.lineWidth = 5;
  for (const pier of city.piers) {
    if (!pier.crane) continue;
    const c = pier.crane;
    b.fillStyle = '#5d6468';
    b.fillRect(c.x, c.y, c.w, c.h);
    b.beginPath();
    b.moveTo(c.x + 9, c.y + 9);
    b.lineTo(c.x - 52, c.y - 30);
    b.stroke();
  }

  // Roads: asphalt along every grid line, then markings.
  b.fillStyle = '#3d3a40';
  for (let i = 0; i < GRID_COLS; i++) b.fillRect(i * PITCH - STREET_HALF, WORLD_MIN_Y, STREET, WORLD_H);
  for (let j = 0; j < GRID_ROWS; j++) b.fillRect(WORLD_MIN_X, j * PITCH - STREET_HALF, WORLD_W, STREET);
  // Lane dashes.
  b.strokeStyle = 'rgba(240,220,150,0.75)';
  b.lineWidth = 2;
  b.setLineDash([16, 14]);
  for (let i = 0; i < GRID_COLS; i++) {
    b.beginPath(); b.moveTo(i * PITCH, WORLD_MIN_Y); b.lineTo(i * PITCH, WORLD_MAX_Y); b.stroke();
  }
  for (let j = 0; j < GRID_ROWS; j++) {
    b.beginPath(); b.moveTo(WORLD_MIN_X, j * PITCH); b.lineTo(WORLD_MAX_X, j * PITCH); b.stroke();
  }
  b.setLineDash([]);
  // Zebra crossings + stop bars.
  for (const z of city.crossings) {
    b.fillStyle = 'rgba(238,238,232,0.85)';
    if (z.axis === 'v') {
      for (let s = -2; s <= 2; s++) b.fillRect(z.x + s * 12 - 4, z.y - z.h / 2, 8, z.h);
      b.fillRect(z.x - STREET_HALF + 4, z.y + (z.y % (2 * PITCH) < PITCH ? 12 : -16), STREET - 8, 4);
    } else {
      for (let s = -2; s <= 2; s++) b.fillRect(z.x - z.w / 2, z.y + s * 12 - 4, z.w, 8);
    }
  }
  // Lane arrows on a few approaches.
  b.fillStyle = 'rgba(238,238,232,0.6)';
  for (let i = 0; i < GRID_COLS; i += 2) {
    for (let j = 1; j < GRID_ROWS; j += 2) {
      drawArrow(b, i * PITCH + 12, j * PITCH - 60, 0);
      drawArrow(b, i * PITCH - 60, j * PITCH - 12, Math.PI / 2);
    }
  }

  // Blocks: pavement rim, then the ground of each kind.
  for (const block of city.blocks) {
    b.fillStyle = '#b3a68d';
    b.fillRect(block.x - 3, block.y - 3, block.w + 6, block.h + 6);
    if (block.kind === 'park') {
      b.fillStyle = '#79b657';
      b.fillRect(block.x, block.y, block.w, block.h);
      b.strokeStyle = '#cbb98d';
      b.lineWidth = 7;
      b.beginPath();
      b.moveTo(block.x, block.y + block.h / 2); b.lineTo(block.x + block.w, block.y + block.h / 2);
      b.moveTo(block.x + block.w / 2, block.y); b.lineTo(block.x + block.w / 2, block.y + block.h);
      b.stroke();
      b.fillStyle = '#d96b8b';
      b.fillRect(block.x + 14, block.y + 14, 22, 10);
      b.fillRect(block.x + block.w - 36, block.y + block.h - 24, 22, 10);
    } else if (block.kind === 'plaza') {
      b.fillStyle = block.district === 'marina' ? '#ccd8ce' : '#d3ba8a';
      b.fillRect(block.x, block.y, block.w, block.h);
      b.strokeStyle = 'rgba(120,100,70,0.35)';
      b.lineWidth = 1;
      for (let gLine = 1; gLine < 6; gLine++) {
        b.beginPath(); b.moveTo(block.x + (block.w / 6) * gLine, block.y); b.lineTo(block.x + (block.w / 6) * gLine, block.y + block.h); b.stroke();
      }
      if (block.fountain) {
        const f = block.fountain;
        b.fillStyle = '#9db8c4';
        b.beginPath(); b.arc(f.x, f.y, f.r, 0, Math.PI * 2); b.fill();
        b.fillStyle = '#3f8fae';
        b.beginPath(); b.arc(f.x, f.y, f.r - 7, 0, Math.PI * 2); b.fill();
      } else {
        // Market stalls.
        b.fillStyle = '#c4452f';
        for (let s = 0; s < 4; s++) {
          const sx = block.x + 22 + (s % 2) * 76;
          const sy = block.y + 26 + Math.floor(s / 2) * 76;
          b.fillRect(sx, sy, 34, 22);
          b.fillStyle = s % 2 ? '#e8e3d5' : '#2d7f7a';
          b.fillRect(sx, sy + 22, 34, 5);
          b.fillStyle = '#c4452f';
        }
      }
    } else if (block.kind === 'parking') {
      b.fillStyle = '#4a474e';
      b.fillRect(block.x, block.y, block.w, block.h);
      b.strokeStyle = 'rgba(238,238,232,0.55)';
      b.lineWidth = 2;
      for (let bay = 0; bay < 5; bay++) {
        b.strokeRect(block.x + 12 + bay * 31, block.y + 14, 24, 44);
        b.strokeRect(block.x + 12 + bay * 31, block.y + block.h - 58, 24, 44);
      }
    } else {
      b.fillStyle = '#c9bb9c';
      b.fillRect(block.x, block.y, block.w, block.h);
    }
    if (block.pool) {
      const pool = block.pool;
      b.fillStyle = '#e8e3d5';
      b.fillRect(pool.x - 5, pool.y - 5, pool.w + 10, pool.h + 10);
      b.fillStyle = '#39a7c9';
      b.fillRect(pool.x, pool.y, pool.w, pool.h);
      b.strokeStyle = 'rgba(255,255,255,0.5)';
      b.lineWidth = 2;
      b.beginPath(); b.moveTo(pool.x + pool.w / 2, pool.y + 4); b.lineTo(pool.x + pool.w / 2, pool.y + pool.h - 4); b.stroke();
    }
  }

  // Buildings: shadow, roof, windows by dialect, clutter, storefront.
  for (const bd of city.buildings) {
    b.fillStyle = 'rgba(40,30,20,0.28)';
    b.fillRect(bd.x + 5, bd.y + 7, bd.w, bd.h);
    b.fillStyle = shade(bd.roof, bd.shade);
    b.fillRect(bd.x, bd.y, bd.w, bd.h);
    b.strokeStyle = 'rgba(60,45,30,0.5)';
    b.lineWidth = 2;
    b.strokeRect(bd.x + 1, bd.y + 1, bd.w - 2, bd.h - 2);
    drawRoofWindows(b, bd);
    for (const d of bd.deco) drawRoofDeco(b, d);
    if (bd.awning) {
      b.fillStyle = bd.awning;
      b.fillRect(bd.x - 3, bd.y + bd.h - 2, bd.w + 6, 8);
      b.fillStyle = 'rgba(255,255,255,0.35)';
      for (let s = 0; s < bd.w; s += 10) b.fillRect(bd.x - 3 + s, bd.y + bd.h - 2, 5, 8);
    }
    if (bd.sign) {
      const sw = Math.min(bd.w - 8, bd.sign.text.length * 6.4 + 12);
      b.fillStyle = bd.sign.color;
      b.fillRect(bd.x + (bd.w - sw) / 2, bd.y + bd.h - 15, sw, 12);
      b.fillStyle = '#ffffff';
      b.font = 'bold 8px system-ui, sans-serif';
      b.textAlign = 'center';
      b.fillText(bd.sign.text, bd.x + bd.w / 2, bd.y + bd.h - 6);
      // The same sign joins the night layer as a glow.
      const glow = l.createRadialGradient(bd.x + bd.w / 2, bd.y + bd.h - 9, 2, bd.x + bd.w / 2, bd.y + bd.h - 9, 30);
      glow.addColorStop(0, bd.sign.color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      l.globalAlpha = 0.5;
      l.fillStyle = glow;
      l.fillRect(bd.x + bd.w / 2 - 30, bd.y + bd.h - 39, 60, 60);
      l.globalAlpha = 1;
    }
    // Lit windows for the night layer.
    l.fillStyle = 'rgba(255,196,92,0.9)';
    const step = bd.dialect === 'ribbon' ? 15 : 11;
    for (let wx = bd.x + 7; wx < bd.x + bd.w - 6; wx += step) {
      for (let wy = bd.y + 7; wy < bd.y + bd.h - 6; wy += step) {
        if ((wx * 7 + wy * 13) % 5 === 0) l.fillRect(wx, wy, 5, 4);
      }
    }
  }

  // Trees, beach props, lighthouse, lamps.
  for (const t of city.trees) {
    b.fillStyle = 'rgba(40,60,30,0.3)';
    b.beginPath(); b.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#4e8f3e';
    b.beginPath(); b.arc(t.x, t.y, t.r, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#63a84f';
    b.beginPath(); b.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); b.fill();
  }
  for (const prop of city.beachProps) drawBeachProp(b, prop);
  const lh = city.lighthouse;
  b.fillStyle = '#e8e3d5';
  b.beginPath(); b.arc(lh.x, lh.y, lh.r, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#c4452f';
  b.beginPath(); b.arc(lh.x, lh.y, lh.r * 0.55, 0, Math.PI * 2); b.fill();
  const beam = l.createRadialGradient(lh.x, lh.y, 2, lh.x, lh.y, 60);
  beam.addColorStop(0, 'rgba(255,240,180,0.95)');
  beam.addColorStop(1, 'rgba(255,240,180,0)');
  l.fillStyle = beam;
  l.fillRect(lh.x - 60, lh.y - 60, 120, 120);
  for (const lamp of city.lamps) {
    b.fillStyle = '#5d6468';
    b.fillRect(lamp.x - 1, lamp.y - 1, 3, 3);
    const g = l.createRadialGradient(lamp.x, lamp.y, 1, lamp.x, lamp.y, 21);
    g.addColorStop(0, 'rgba(255,214,130,0.85)');
    g.addColorStop(1, 'rgba(255,214,130,0)');
    l.fillStyle = g;
    l.fillRect(lamp.x - 21, lamp.y - 21, 42, 42);
  }
  // Café tables at hangouts.
  for (const spot of city.hangouts) {
    if (spot.kind === 'cafe') {
      b.fillStyle = '#e8e3d5';
      b.beginPath(); b.arc(spot.x, spot.y, 5, 0, Math.PI * 2); b.fill();
      b.strokeStyle = '#8a6b48';
      b.stroke();
    }
    if (spot.kind === 'bench') {
      b.fillStyle = '#8a6b48';
      b.fillRect(spot.x - 7, spot.y - 2, 14, 4);
    }
  }
  return { base, lights };
}

function drawArrow(b, x, y, rot) {
  b.save();
  b.translate(x, y);
  b.rotate(rot);
  b.beginPath();
  b.moveTo(0, -11);
  b.lineTo(5, 2);
  b.lineTo(2, 2);
  b.lineTo(2, 11);
  b.lineTo(-2, 11);
  b.lineTo(-2, 2);
  b.lineTo(-5, 2);
  b.closePath();
  b.fill();
  b.restore();
}

function drawRoofWindows(b, bd) {
  b.fillStyle = 'rgba(50,60,75,0.35)';
  if (bd.dialect === 'ribbon') {
    for (let wy = bd.y + 8; wy < bd.y + bd.h - 10; wy += 16) b.fillRect(bd.x + 6, wy, bd.w - 12, 5);
  } else if (bd.dialect === 'panes') {
    for (let wx = bd.x + 8; wx < bd.x + bd.w - 8; wx += 15) {
      for (let wy = bd.y + 8; wy < bd.y + bd.h - 8; wy += 15) b.fillRect(wx, wy, 8, 8);
    }
  } else {
    for (let wx = bd.x + 7; wx < bd.x + bd.w - 6; wx += 11) {
      for (let wy = bd.y + 7; wy < bd.y + bd.h - 6; wy += 11) b.fillRect(wx, wy, 5, 4);
    }
  }
}

function drawRoofDeco(b, d) {
  if (d.kind === 'vent') { b.fillStyle = '#8b9296'; b.fillRect(d.x, d.y, d.w, d.h); }
  else if (d.kind === 'hut') { b.fillStyle = 'rgba(90,75,55,0.8)'; b.fillRect(d.x, d.y, d.w, d.h); }
  else if (d.kind === 'solar') { b.fillStyle = '#274b8f'; b.fillRect(d.x, d.y, d.w, d.h); b.strokeStyle = 'rgba(255,255,255,0.4)'; b.strokeRect(d.x, d.y, d.w, d.h); }
  else if (d.kind === 'garden') { b.fillStyle = '#5f9e4e'; b.fillRect(d.x, d.y, d.w, d.h); }
  else if (d.kind === 'tank') { b.fillStyle = '#a89a80'; b.beginPath(); b.arc(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, 0, Math.PI * 2); b.fill(); }
  else if (d.kind === 'billboard') {
    b.fillStyle = '#2c2c30';
    b.fillRect(d.x - 2, d.y - 2, d.w + 4, d.h + 4);
    b.fillStyle = d.color;
    b.fillRect(d.x, d.y, d.w, d.h);
    b.fillStyle = 'rgba(255,255,255,0.75)';
    b.fillRect(d.x + 5, d.y + 4, d.w - 10, 2);
    b.fillRect(d.x + 5, d.y + 8, d.w - 18, 2);
  }
}

function drawBeachProp(b, prop) {
  if (prop.kind === 'umbrella') {
    b.fillStyle = 'rgba(120,90,40,0.3)';
    b.beginPath(); b.arc(prop.x + 2, prop.y + 3, 10, 0, Math.PI * 2); b.fill();
    b.fillStyle = prop.color;
    b.beginPath(); b.arc(prop.x, prop.y, 10, 0, Math.PI * 2); b.fill();
    b.fillStyle = 'rgba(255,255,255,0.5)';
    b.beginPath(); b.arc(prop.x, prop.y, 4, 0, Math.PI * 2); b.fill();
  } else if (prop.kind === 'towel') {
    b.fillStyle = prop.color;
    b.fillRect(prop.x - 7, prop.y - 4, 14, 8);
  } else if (prop.kind === 'ball') {
    b.fillStyle = prop.color;
    b.beginPath(); b.arc(prop.x, prop.y, 4, 0, Math.PI * 2); b.fill();
  } else if (prop.kind === 'lifeguard') {
    b.fillStyle = '#e8e3d5';
    b.fillRect(prop.x - 7, prop.y - 9, 14, 18);
    b.fillStyle = '#c4452f';
    b.fillRect(prop.x - 8, prop.y - 11, 16, 5);
  } else if (prop.kind === 'volleyball') {
    b.strokeStyle = 'rgba(255,255,255,0.8)';
    b.lineWidth = 2;
    b.beginPath(); b.moveTo(prop.x, prop.y - 22); b.lineTo(prop.x, prop.y + 22); b.stroke();
  }
}

// --- the per-frame render -------------------------------------------------------

export function render(ctx, G, view) {
  const { camX, camY, w, h } = view;
  const { dark, golden } = daylight(G.hour);
  ctx.fillStyle = '#1d5f7a';
  ctx.fillRect(0, 0, w, h);
  const sx = camX - WORLD_MIN_X;
  const sy = camY - WORLD_MIN_Y;
  ctx.drawImage(G.layers.base, sx, sy, w, h, 0, 0, w, h);

  ctx.save();
  ctx.translate(-camX, -camY);

  // Animated water: two foam lines crawling along the shore + sparkle.
  const t = G.time;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (const [off, amp, speed] of [[-6, 3, 1.1], [-22, 5, 0.7]]) {
    ctx.beginPath();
    for (let y = camY - 10; y < camY + h + 10; y += 22) {
      const x = WATER_EDGE + off + Math.sin(y * 0.05 + t * speed) * amp;
      if (y === camY - 10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 12; i++) {
    const fx = WATER_EDGE - 30 - ((i * 67) % 90);
    const fy = camY + ((i * 131 + Math.floor(t * 12)) % Math.max(1, Math.floor(h)));
    ctx.fillRect(fx, fy, 5, 1.6);
  }

  // Race checkpoints: gold rings on the road.
  if (G.races.state === 'running') {
    G.races.checkpoints.forEach((cp, idx) => {
      if (idx < G.races.idx) return;
      const active = idx === G.races.idx;
      ctx.strokeStyle = active ? '#ffd23e' : 'rgba(255,210,62,0.35)';
      ctx.lineWidth = active ? 5 : 3;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 30 + (active ? Math.sin(t * 5) * 3 : 0), 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  // Objective marker: a light column and a pulsing diamond.
  const obj = G.objective;
  if (obj && obj.x !== undefined && G.mode === 'playing') {
    const pulse = 1 + Math.sin(t * 4) * 0.12;
    const grad = ctx.createLinearGradient(0, obj.y - 130, 0, obj.y);
    grad.addColorStop(0, 'rgba(255,210,62,0)');
    grad.addColorStop(1, 'rgba(255,210,62,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(obj.x - 7, obj.y - 130, 14, 130);
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 20 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    drawDiamond(ctx, obj.x, obj.y - 34 - Math.sin(t * 3) * 4, 8, '#ffd23e');
  }

  // Pickups.
  for (const pk of G.pickups) {
    const bob = Math.sin(pk.t * 4) * 2.5;
    const colors = { cash: '#6aa84f', health: '#e8e3d5', armour: '#5d7fa6', ammo: '#f2a03d' };
    ctx.fillStyle = colors[pk.kind];
    ctx.strokeStyle = 'rgba(30,25,15,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pk.kind === 'health' ? '#c4452f' : '#20301c';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'cash' ? '$' : pk.kind === 'health' ? '+' : pk.kind === 'armour' ? 'A' : '≡', pk.x, pk.y + bob + 3);
  }

  // Cars first (people walk over their shadows fine), then people.
  for (const car of G.cars) drawCar(ctx, G, car, dark);
  for (const ped of G.peds) drawPerson(ctx, ped, t);
  for (const hostile of G.hostiles) drawPerson(ctx, hostile, t);
  if (!G.player.car) drawPerson(ctx, G.player, t, true);

  // Fare and giver markers.
  for (const ped of G.peds) {
    if (ped.fare && ped.state === 'fare') drawDiamond(ctx, ped.x, ped.y - 30 - Math.sin(t * 3.2) * 4, 7, '#ffd23e');
  }
  const giver = G.nextGiver;
  if (giver && G.mode === 'playing') {
    drawDiamond(ctx, giver.place.x, giver.place.y - 30 - Math.sin(t * 3.2) * 4, 7, '#ffd23e');
  }

  // Bullets as tracers.
  for (const blt of G.bullets) {
    ctx.strokeStyle = blt.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(blt.x - blt.vx * 0.016, blt.y - blt.vy * 0.016);
    ctx.lineTo(blt.x, blt.y);
    ctx.stroke();
  }

  // Effects.
  for (const fx of G.fx) drawFx(ctx, fx);
  ctx.restore();

  // Light: golden wash, then night, then the lamps layer.
  if (golden > 0.02) {
    ctx.fillStyle = 'rgba(255,150,60,' + (golden * 0.13).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }
  if (dark > 0.02) {
    ctx.fillStyle = 'rgba(9,13,40,' + (dark * 0.52).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = dark * 0.9;
    ctx.translate(-camX, -camY);
    ctx.drawImage(G.layers.lights, sx, sy, w, h, camX, camY, w, h);
    ctx.restore();
  }
  if (G.player.hurtCd > 0) {
    ctx.fillStyle = 'rgba(200,30,20,' + (G.player.hurtCd * 0.55).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }
}

function drawDiamond(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(40,30,5,0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawCar(ctx, G, car, dark) {
  const m = car.model;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(25,20,15,0.35)';
  ctx.fillRect(-m.h / 2 + 3, -m.w / 2 + 4, m.h, m.w);
  // Body.
  ctx.fillStyle = car.wrecked ? '#3a3a3d' : car.color;
  ctx.strokeStyle = 'rgba(15,12,10,0.65)';
  ctx.lineWidth = 1.6;
  roundRect(ctx, -m.h / 2, -m.w / 2, m.h, m.w, 5);
  ctx.fill();
  ctx.stroke();
  if (car.kind === 'police') {
    ctx.fillStyle = '#e8ecf0';
    ctx.fillRect(-m.h * 0.16, -m.w / 2 + 1, m.h * 0.32, m.w - 2);
    // Light bar, flashing with the game clock.
    const phase = Math.floor(G.time * 4) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#7a1610';
    ctx.fillRect(-4, -m.w / 2 + 2, 8, m.w / 2 - 2);
    ctx.fillStyle = phase ? '#1c6fe8' : '#0d2f5e';
    ctx.fillRect(-4, 0, 8, m.w / 2 - 2);
  }
  if (m.kind === 'taxi') {
    ctx.fillStyle = '#20301c';
    ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
    ctx.fillStyle = 'rgba(20,20,20,0.8)';
    for (let s = -m.h / 2 + 3; s < m.h / 2 - 3; s += 6) {
      ctx.fillRect(s, -m.w / 2 + 1, 3, 2);
      ctx.fillRect(s, m.w / 2 - 3, 3, 2);
    }
  }
  if (m.kind === 'convertible') {
    ctx.fillStyle = '#5d4632';
    ctx.fillRect(-m.h * 0.28, -m.w / 2 + 3, m.h * 0.5, m.w - 6);
    ctx.fillStyle = '#8a6b48';
    ctx.fillRect(-m.h * 0.05, -m.w / 2 + 4, m.h * 0.16, m.w - 8);
  } else if (m.kind === 'van') {
    ctx.fillStyle = 'rgba(240,244,248,0.5)';
    ctx.fillRect(m.h * 0.28, -m.w / 2 + 3, m.h * 0.14, m.w - 6);
    ctx.strokeStyle = 'rgba(20,20,20,0.4)';
    ctx.strokeRect(-m.h * 0.42, -m.w / 2 + 3, m.h * 0.3, m.w - 6);
  } else if (m.kind === 'pickup') {
    ctx.fillStyle = 'rgba(30,25,20,0.55)';
    ctx.fillRect(-m.h * 0.45, -m.w / 2 + 3, m.h * 0.38, m.w - 6);
    ctx.fillStyle = 'rgba(200,205,210,0.65)';
    ctx.fillRect(m.h * 0.1, -m.w / 2 + 3, m.h * 0.2, m.w - 6);
  } else {
    // Cabin + glass.
    ctx.fillStyle = 'rgba(24,32,44,0.85)';
    roundRect(ctx, -m.h * 0.22, -m.w / 2 + 3, m.h * 0.42, m.w - 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(170,210,235,0.5)';
    ctx.fillRect(m.h * 0.12, -m.w / 2 + 4, m.h * 0.07, m.w - 8);
  }
  // Headlights at night.
  if (dark > 0.25 && !car.wrecked) {
    ctx.fillStyle = 'rgba(255,240,180,0.9)';
    ctx.fillRect(m.h / 2 - 2, -m.w / 2 + 2, 2.4, 3.4);
    ctx.fillRect(m.h / 2 - 2, m.w / 2 - 5.4, 2.4, 3.4);
  }
  ctx.restore();
  // Damage smoke, drawn unrotated.
  if (!car.wrecked && car.health < 34) {
    const flicker = Math.sin(G.time * 9 + car.id) * 2;
    ctx.fillStyle = 'rgba(60,60,60,0.4)';
    ctx.beginPath();
    ctx.arc(car.x + flicker, car.y - 8 - (G.time * 14 % 9), 5 + (G.time * 3 % 4), 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.wrecked) {
    ctx.fillStyle = 'rgba(40,40,40,0.5)';
    ctx.beginPath();
    ctx.arc(car.x, car.y - 10 - (G.time * 10 % 12), 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A top-down person: swinging legs, an outlined torso big enough to read at
// city zoom, a skinned head, and a hat that says who they are.
export function drawPerson(ctx, a, t, isPlayer = false) {
  const down = a.state === 'down';
  ctx.save();
  ctx.translate(a.x, a.y);
  // Shadow.
  ctx.fillStyle = 'rgba(25,20,15,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10 * a.build, 6 * a.build, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(a.angle + Math.PI / 2);
  if (down) ctx.globalAlpha = 0.75;
  const swing = down ? 0 : Math.sin(a.walkPhase) * 4.2;
  // Legs (trousers or shorts over shins).
  ctx.fillStyle = a.beach && !a.uniform ? a.skin : a.pants;
  ctx.fillRect(-5.4 * a.build, 3.4 + Math.max(0, swing), 4.4 * a.build, 6.4);
  ctx.fillRect(1 * a.build, 3.4 + Math.max(0, -swing), 4.4 * a.build, 6.4);
  // Torso.
  ctx.fillStyle = a.shirt;
  ctx.strokeStyle = 'rgba(18,14,10,0.85)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(0, 0, 9.4 * a.build, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Arms swinging opposite the legs.
  ctx.fillStyle = a.shirt;
  ctx.beginPath();
  ctx.arc(-10.6 * a.build, 1 + Math.max(0, -swing) * 0.7, 3 * a.build, 0, Math.PI * 2);
  ctx.arc(10.6 * a.build, 1 + Math.max(0, swing) * 0.7, 3 * a.build, 0, Math.PI * 2);
  ctx.fill();
  // Bag at the side.
  if (a.bag === 'tote') {
    ctx.fillStyle = '#c9b458';
    ctx.fillRect(9 * a.build, 3, 5, 6);
  } else if (a.bag === 'shoulder') {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(-14 * a.build, 2, 5, 6);
  }
  // Head.
  ctx.fillStyle = a.skin;
  ctx.strokeStyle = 'rgba(18,14,10,0.6)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, -0.5, 4.7 * a.build, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Hat.
  if (a.hat === 'cap') {
    ctx.fillStyle = a.hatColor;
    ctx.beginPath();
    ctx.arc(0, -0.5, 4.7 * a.build, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1.5, -9.5 * a.build, 3, 4.6);
  } else if (a.hat === 'sunhat') {
    ctx.fillStyle = a.hatColor;
    ctx.beginPath();
    ctx.arc(0, -0.5, 6.8 * a.build, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -0.5, 3.6 * a.build, 0, Math.PI * 2);
    ctx.fillStyle = shade(a.hatColor, -18);
    ctx.fill();
  } else if (a.hat === 'beanie') {
    ctx.fillStyle = a.hatColor;
    ctx.beginPath();
    ctx.arc(0, -0.5, 4.8 * a.build, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  }
  // A police badge glints on the chest.
  if (a.uniform) {
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(3.6 * a.build, -3.4 * a.build, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 15 + Math.sin(t * 3) * 1.4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawFx(ctx, fx) {
  const life = { muzzle: 0.07, spark: 0.16, hit: 0.22, swing: 0.14, smoke: 1.4, burst: 0.5 }[fx.kind] || 0.3;
  const k = 1 - fx.t / life;
  if (k <= 0) return;
  if (fx.kind === 'muzzle') {
    ctx.fillStyle = 'rgba(255,205,80,' + (0.85 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 6 * k + 2, 0, Math.PI * 2); ctx.fill();
  } else if (fx.kind === 'spark') {
    ctx.fillStyle = 'rgba(255,220,130,' + (0.9 * k).toFixed(3) + ')';
    ctx.fillRect(fx.x - 2, fx.y - 2, 4, 4);
  } else if (fx.kind === 'hit') {
    ctx.fillStyle = 'rgba(220,60,40,' + (0.55 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 8 * (1 - k) + 3, 0, Math.PI * 2); ctx.fill();
  } else if (fx.kind === 'swing') {
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * k).toFixed(3) + ')';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 7, 0, Math.PI * 2); ctx.stroke();
  } else if (fx.kind === 'smoke') {
    ctx.fillStyle = 'rgba(70,70,70,' + (0.3 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(fx.x, fx.y - fx.t * 16, 6 + fx.t * 9, 0, Math.PI * 2); ctx.fill();
  } else if (fx.kind === 'burst') {
    ctx.fillStyle = 'rgba(255,120,40,' + (0.7 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 20 * (1 - k) + 4, 0, Math.PI * 2); ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
