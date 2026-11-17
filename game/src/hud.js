// hud.js — the four-sided DOM HUD, the circular minimap and the speedometer.
//
// Canvas draws the world; everything the player reads lives in DOM panels
// around the edges: district plate top-left, mission banner top-centre, cash
// and wanted stars top-right, minimap and vitals bottom-left, dialogue and
// radio bottom-centre, speedometer bottom-right. Writes are cached so the
// DOM only changes when a value does.

import { WORLD_W, WORLD_H } from './render.js';
import { PITCH, GRID_COLS, GRID_ROWS, WATER_EDGE, SAND_EDGE, WEAPONS, WORLD_MIN_X, WORLD_MIN_Y } from './config.js';
import { currentLine } from './missions.js';

function el(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.district = el('plate-district');
    this.tag = el('plate-tag');
    this.clock = el('plate-clock');
    this.bannerTitle = el('banner-title');
    this.bannerSub = el('banner-sub');
    this.cash = el('hud-cash');
    this.stars = el('hud-stars');
    this.weapon = el('hud-weapon');
    this.healthFill = el('bar-health-fill');
    this.armourFill = el('bar-armour-fill');
    this.respect = el('hud-respect');
    this.dialogue = el('dialogue');
    this.dialogueWho = el('dialogue-who');
    this.dialogueText = el('dialogue-text');
    this.radio = el('radio-line');
    this.prompt = el('prompt');
    this.toastBox = el('toast');
    this.bustWrap = el('bust-wrap');
    this.bustFill = el('bust-fill');
    this.splash = el('splash');
    this.splashTitle = el('splash-title');
    this.splashSub = el('splash-sub');
    this.minimap = el('minimap').getContext('2d');
    this.speedo = el('speedo').getContext('2d');
    this.speedoWrap = el('speedo-wrap');
    this.cache = new Map();
    this.toastT = 0;
    this.splashT = 0;
  }

  set(elm, key, value) {
    if (this.cache.get(key) !== value) {
      this.cache.set(key, value);
      elm.textContent = value;
    }
  }

  toast(message) {
    this.toastBox.textContent = message;
    this.toastBox.classList.add('show');
    this.toastT = 3.2;
  }

  showSplash(title, sub, color) {
    this.splashTitle.textContent = title;
    this.splashTitle.style.color = color || '#ffd23e';
    this.splashSub.textContent = sub || '';
    this.splash.classList.add('show');
    this.splashT = 2.6;
  }

  update(G, dt) {
    const p = G.player;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastBox.classList.remove('show');
    }
    if (this.splashT > 0) {
      this.splashT -= dt;
      if (this.splashT <= 0) this.splash.classList.remove('show');
    }

    // Top-left: where are we, what time is it.
    const district = G.city.districtAt(p.x, p.y);
    this.set(this.district, 'district', district.name);
    this.set(this.tag, 'tag', district.tag);
    const hh = Math.floor(G.hour);
    const mm = Math.floor((G.hour - hh) * 60);
    const phase = G.hour < 5.5 ? 'NIGHT' : G.hour < 11 ? 'MORNING' : G.hour < 16.5 ? 'CLEAR & HOT' : G.hour < 19.5 ? 'GOLDEN HOUR' : 'NIGHT';
    this.set(this.clock, 'clock', 'DAY ' + G.day + ' · ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ' · ' + phase);

    // Top-centre: the mission banner.
    const obj = G.objective;
    if (obj) {
      this.set(this.bannerTitle, 'banner', obj.label || '');
      this.set(this.bannerSub, 'bannersub', obj.sub || '');
    }

    // Top-right: money, heat, iron.
    this.set(this.cash, 'cash', '$' + G.cash);
    const w = G.wanted;
    let stars = '';
    for (let s = 1; s <= 5; s++) stars += s <= w.stars ? '★' : '☆';
    const searching = w.stars > 0 && w.seenT > 2.5;
    this.set(this.stars, 'stars', stars);
    this.stars.style.opacity = searching ? (Math.sin(G.time * 6) > 0 ? 1 : 0.3) : 1;
    const weapon = WEAPONS[p.weapon];
    const ammo = p.weapon === 'fists' ? '∞' : p.ammo[p.weapon];
    this.set(this.weapon, 'weapon', weapon.name + ' ' + ammo);
    const searchLabel = el('hud-searching');
    if (searchLabel) searchLabel.textContent = w.stars === 0 ? '' : searching ? 'PSPD SEARCHING' : 'PSPD IN PURSUIT';

    // Bottom-left: vitals under the minimap.
    this.healthFill.style.width = Math.max(0, p.health) + '%';
    this.armourFill.style.width = Math.max(0, p.armour) + '%';
    this.set(this.respect, 'respect', 'RESPECT · LV ' + (1 + Math.floor(G.respect / 4)) + ' · ' + G.stats.jobsDone + ' JOBS DONE');

    // Bottom-centre: dialogue and radio.
    const line = currentLine(G);
    if (line) {
      this.dialogue.classList.add('show');
      this.set(this.dialogueWho, 'who', line[0] + ':');
      this.set(this.dialogueText, 'what', line[1]);
    } else {
      this.dialogue.classList.remove('show');
    }
    if (p.car) {
      const st = G.sound.station();
      this.radio.classList.add('show');
      this.set(this.radio, 'radio', st.name + ' · ' + st.flavour);
    } else {
      this.radio.classList.remove('show');
    }

    // Context prompt and the bust meter.
    if (G.prompt) {
      this.prompt.classList.add('show');
      this.set(this.prompt, 'prompt', G.prompt);
    } else {
      this.prompt.classList.remove('show');
    }
    if (w.bust > 0.02) {
      this.bustWrap.classList.add('show');
      this.bustFill.style.width = Math.round(w.bust * 100) + '%';
    } else {
      this.bustWrap.classList.remove('show');
    }

    this.drawMinimap(G);
    this.drawSpeedo(G);
  }

  drawMinimap(G) {
    const ctx = this.minimap;
    const S = 168;
    const scale = S / 1150; // ~1150 world px across the map disc
    const p = G.player;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#275d75';
    ctx.fillRect(0, 0, S, S);
    const toMap = (x, y) => [S / 2 + (x - p.x) * scale, S / 2 + (y - p.y) * scale];
    // Sand + land.
    const [sx0, sy0] = toMap(SAND_EDGE, WORLD_MIN_Y);
    ctx.fillStyle = '#d9c48f';
    ctx.fillRect(sx0, sy0, (WORLD_W) * scale, WORLD_H * scale);
    const [wx1] = toMap(WATER_EDGE, 0);
    ctx.fillStyle = '#eed9a4';
    ctx.fillRect(wx1, sy0, (SAND_EDGE - WATER_EDGE) * scale, WORLD_H * scale);
    // Blocks as faint parcels.
    ctx.fillStyle = 'rgba(120,100,70,0.35)';
    for (const block of G.city.blocks) {
      const [bx, by] = toMap(block.x, block.y);
      ctx.fillRect(bx, by, block.w * scale, block.h * scale);
    }
    // Roads.
    ctx.strokeStyle = 'rgba(52,50,56,0.9)';
    ctx.lineWidth = 68 * scale;
    ctx.beginPath();
    for (let i = 0; i < GRID_COLS; i++) {
      const [x0, y0] = toMap(i * PITCH, WORLD_MIN_Y);
      const [x1, y1] = toMap(i * PITCH, WORLD_MIN_Y + WORLD_H);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    for (let j = 0; j < GRID_ROWS; j++) {
      const [x0, y0] = toMap(WORLD_MIN_X, j * PITCH);
      const [x1, y1] = toMap(WORLD_MIN_X + WORLD_W, j * PITCH);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    // Route line to the objective.
    const obj = G.objective;
    if (obj && obj.x !== undefined) {
      const [ox, oy] = toMap(obj.x, obj.y);
      ctx.strokeStyle = 'rgba(255,210,62,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2);
      ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police blips flash red/blue.
    const phase = Math.floor(G.time * 3) % 2 === 0;
    for (const car of G.cars) {
      if (car.kind !== 'police') continue;
      const [cx, cy] = toMap(car.x, car.y);
      ctx.fillStyle = phase ? '#ff3b30' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of G.cops) {
      const [cx, cy] = toMap(cop.x, cop.y);
      ctx.fillStyle = phase ? '#3b82f6' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player arrow, centre stage.
    ctx.translate(S / 2, S / 2);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(10,10,10,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // The brass ring.
    ctx.strokeStyle = 'rgba(20,18,14,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawSpeedo(G) {
    const p = G.player;
    const ctx = this.speedo;
    const S = 150;
    ctx.clearRect(0, 0, S, S);
    if (!p.car) {
      this.speedoWrap.classList.remove('show');
      return;
    }
    this.speedoWrap.classList.add('show');
    const speed = Math.abs(p.car.speed);
    const kmh = Math.round(speed * 0.36);
    const frac = Math.min(1, speed / p.car.model.topSpeed);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = 'rgba(12,14,18,0.82)';
    ctx.beginPath();
    ctx.arc(0, 0, S / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,62,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, S / 2 - 3, Math.PI * 0.75, Math.PI * 0.75 + frac * Math.PI * 1.5);
    ctx.stroke();
    // Needle.
    const a = Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (S / 2 - 14), Math.sin(a) * (S / 2 - 14));
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(kmh), 0, 16);
    ctx.font = '600 8.5px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(p.car.model.name.toUpperCase(), 0, 34);
    ctx.restore();
  }
}
