// save.js — the localStorage save game.
//
// One JSON record under SAVE_KEY: story progress, cash and respect, the
// weapon locker, where Rio is standing (or which car he is in), the time of
// day and lifetime stats. Written at the safehouse, after every job and on
// pause; read by CONTINUE on the title screen. A corrupt or missing record
// simply means there is no save — the game never crashes on it.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return Boolean(window.localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function writeSave(G) {
  const p = G.player;
  const record = {
    version: 1,
    cash: G.cash,
    respect: G.respect,
    chapter: G.missions.chapterIndex,
    chapterDone: G.missions.chapterDone,
    hour: G.hour,
    day: G.day,
    weapons: {
      owned: [...p.weapons],
      ammo: { ...p.ammo },
      current: p.weapon,
    },
    health: p.health,
    armour: p.armour,
    player: { x: p.x, y: p.y },
    car: p.car ? { model: p.car.model, x: p.car.x, y: p.car.y, angle: p.car.angle, health: p.car.health } : null,
    stats: { ...G.stats },
    taxiDone: G.taxi.done,
    racesWon: G.races.won,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== 1) return null;
    return record;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable (private mode): nothing to clear.
  }
}
