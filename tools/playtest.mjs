// playtest.mjs — the full-loop automated playtest for PALMSHADE HEAT.
//
// Serves the real game, opens it in headless Chrome over CDP, and plays it
// with genuine keyboard and mouse events: title → new game → walk → steal →
// drive → missions → combat → race → save/continue → police pursuit →
// WASTED. State is read (and occasionally arranged) through the game's own
// window.__game handle; nothing in the game is stubbed. Any console error
// from the page fails the run.
//
//   node tools/playtest.mjs

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, Cdp, openPage, evaluate, waitFor,
  tapKey, keyDown, keyUp, mouseMove, mouseClick,
} from './cdp.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CDP_PORT = 9417;
const BASE = 'file://' + join(ROOT, 'game', 'index.html');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickButton(cdp, session, id) {
  const rect = await evaluate(cdp, session, `(() => {
    const r = document.getElementById('${id}').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await mouseClick(cdp, session, rect.x, rect.y);
}

async function main() {
  const chrome = await launchChrome(CDP_PORT);
  const cdp = new Cdp(chrome.webSocketUrl);
  await cdp.ready();
  const consoleErrors = [];
  let session = null;
  cdp.onEvent((msg) => {
    if (!session || msg.sessionId !== session) return;
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  });

  try {
    session = await openPage(cdp, BASE);
    const ev = (expr) => evaluate(cdp, session, expr);
    const wait = (expr, ms, label) => waitFor(cdp, session, expr, ms, label);

    // 1–2. Boot and title → new game.
    await wait('window.__game && __game.G.mode === "title"', 9000, 'title mode');
    check('game boots to the title screen', true);
    await clickButton(cdp, session, 'btn-new');
    await wait('__game.G.mode === "playing"', 6000, 'playing mode');
    check('NEW GAME starts play', true);

    // 3. The opening marker points at Sol's garage.
    const marker = await ev('(() => { const o = __game.G.objective; const g = __game.G.city.places.garage; return o && Math.hypot(o.x - g.x, o.y - g.y) < 4; })()');
    check('opening marker points at Sol’s garage', marker === true);

    // 4. Walking.
    const y0 = await ev('__game.G.player.y');
    await keyDown(cdp, session, 'w');
    await sleep(650);
    await keyUp(cdp, session, 'w');
    const y1 = await ev('__game.G.player.y');
    check('Rio walks on foot (WASD)', y0 - y1 > 25, 'moved ' + Math.round(y0 - y1) + 'px north');

    // 5–7. Steal a parked car, drive it, get out.
    const carPos = await ev('(() => { const c = __game.G.cars.find((k) => k.kind === "parked"); return c ? { x: c.x, y: c.y } : null; })()');
    await ev(`__game.debug.teleport(${carPos.x + 28}, ${carPos.y})`);
    await tapKey(cdp, session, 'e');
    await wait('Boolean(__game.G.player.car)', 5000, 'in a car');
    check('E steals a parked car', true);
    const driveFrom = await ev('(() => ({ x: __game.G.player.x, y: __game.G.player.y }))()');
    await keyDown(cdp, session, 'w');
    await sleep(850);
    await keyUp(cdp, session, 'w');
    const driveTo = await ev('(() => ({ x: __game.G.player.x, y: __game.G.player.y }))()');
    const driven = Math.hypot(driveTo.x - driveFrom.x, driveTo.y - driveFrom.y);
    check('the stolen car drives', driven > 60, 'drove ' + Math.round(driven) + 'px');
    await tapKey(cdp, session, 'e');
    await wait('!__game.G.player.car', 5000, 'out of the car');
    check('E gets back out', true);
    await ev('__game.G.wanted.points = 0; __game.G.wanted.stars = 0; __game.G.wanted.leaving = true;');

    // 8. A* routes stay on street centrelines (endpoints on intersections,
    // so even the first and last hops run along a road).
    const astar = await ev('(() => { const r = __game.debug.findPath(240, 240, 2400, 1920); let ok = r.length > 6; for (let i = 1; i < r.length; i++) { const dx = Math.abs(r[i].x - r[i-1].x); const dy = Math.abs(r[i].y - r[i-1].y); if (dx > 0.01 && dy > 0.01) ok = false; } return { ok, n: r.length }; })()');
    check('A* route stays on centrelines', astar.ok, astar.n + ' waypoints, all axis-aligned');

    // 9. A crossing path runs straight down the zebra band (deviation 0).
    const cross = await ev('(() => { const p = __game.debug.crossingPath({ x: 282, y: 282 }, "v"); const band = __game.G.city.crossings.find((c) => c.axis === "v" && c.x === 240 && c.y === 284); return { straight: p[0].y === p[1].y, dev: band ? Math.abs(p[0].y - band.y) : -1 }; })()');
    check('pedestrian crossing stays in the zebra band', cross.straight && cross.dev === 0, 'max deviation ' + cross.dev + 'px');

    // 10–11. The crowd varies and gathers.
    const crowd = await ev('(() => { const peds = __game.G.peds; const hats = new Set(peds.map((p) => p.hat)); const combos = new Set(peds.map((p) => p.build + "|" + p.hat + "|" + p.bag)); const hanging = peds.filter((p) => p.state === "hangout").length; return { hats: hats.size, combos: combos.size, hanging }; })()');
    check('crowd variety = several hat kinds and build/bag combos', crowd.hats >= 3 && crowd.combos >= 8, crowd.hats + ' hats, ' + crowd.combos + ' combos');
    check('pedestrians gather at hangout spots', crowd.hanging >= 5, crowd.hanging + ' gathered');

    // 12. Mission 1 end-to-end: Sol → steal the Brisa → deliver to the docks.
    const garage = await ev('(() => { const g = __game.G.city.places.garage; return { x: g.x, y: g.y }; })()');
    await ev(`__game.debug.teleport(${garage.x + 6}, ${garage.y + 10})`);
    await tapKey(cdp, session, 'e');
    await wait('__game.G.missions.active && __game.G.missions.stepIndex === 1', 6000, 'steal step armed');
    check('mission 1 step 1: reached Sol', true);
    const missionCar = await ev('(() => { const c = __game.G.missions.step.car; return c ? { id: c.id, x: c.x, y: c.y } : null; })()');
    await ev(`__game.debug.teleport(${missionCar.x + 28}, ${missionCar.y})`);
    await tapKey(cdp, session, 'e');
    await wait(`__game.G.player.car && __game.G.player.car.id === ${missionCar.id}`, 5000, 'in the Brisa');
    check('mission 1 step 2: the Brisa is stolen', true);
    const docks = await ev('(() => { const d = __game.G.city.places.docks; return { x: d.x, y: d.y }; })()');
    await ev(`__game.debug.teleport(${docks.x}, ${docks.y})`);
    await wait('__game.G.missions.chapterDone === true', 6000, 'chapter 1 complete');
    const cashAfterM1 = await ev('__game.G.cash');
    check('mission 1 completes and pays', cashAfterM1 === 650, 'cash $250 → $' + cashAfterM1);

    // 13. Mission 3 grants the Palm-9 and it lands hits on the collectors.
    await ev('__game.G.missions.chapterIndex = 2; __game.G.wanted.points = 0; __game.G.wanted.stars = 0; __game.G.wanted.leaving = true;');
    const club = await ev('(() => { const c = __game.G.city.places.club; return { x: c.x, y: c.y }; })()');
    await ev(`__game.debug.teleport(${club.x}, ${club.y + 10})`);
    if (await ev('Boolean(__game.G.player.car)')) {
      await tapKey(cdp, session, 'e'); // step out of the delivery car first
      await wait('!__game.G.player.car', 4000, 'out of the car at the club');
    }
    await tapKey(cdp, session, 'e');
    await wait('__game.G.player.weapons.includes("palm9")', 5000, 'Palm-9 granted');
    await wait('__game.G.hostiles.length >= 3', 6000, 'collectors spawned');
    check('mission 3 reaches the collectors', true);
    await ev('__game.G.player.armour = 100; __game.debug.teleport(1260 - 130, 908)');
    let hitSeen = false;
    for (let shot = 0; shot < 10 && !hitSeen; shot++) {
      const aim = await ev('(() => { const h = __game.G.hostiles.find((k) => k.state !== "down"); if (!h) return null; return { sx: h.x - __game.G.camera.x, sy: h.y - __game.G.camera.y, hp: h.health }; })()');
      if (!aim) { hitSeen = true; break; }
      await mouseMove(cdp, session, aim.sx, aim.sy);
      await mouseClick(cdp, session, aim.sx, aim.sy);
      await sleep(360);
      const after = await ev('(() => { const hs = __game.G.hostiles; return hs.some((k) => k.state === "down") || hs.some((k) => k.health < 60); })()');
      hitSeen = after === true;
    }
    const ammo = await ev('__game.G.player.ammo.palm9');
    check('the Palm-9 fires and lands hits', hitSeen && ammo < 60, 'ammo left ' + ammo);
    await ev('__game.G.wanted.points = 0; __game.G.wanted.stars = 0; __game.G.wanted.leaving = true; __game.G.hostiles.length = 0;');

    // 14. A marina race runs its checkpoints and pays.
    const yacht = await ev('(() => { const y = __game.G.city.places.yacht; return { x: y.x, y: y.y }; })()');
    if (await ev('Boolean(__game.G.player.car)')) await tapKey(cdp, session, 'e');
    await ev(`__game.debug.teleport(${yacht.x}, ${yacht.y})`);
    await tapKey(cdp, session, 'f');
    await wait('__game.G.races.state === "running"', 5000, 'race running');
    const raceCar = await ev('(() => { const p = __game.G.player; let best = null; let bd = 1e9; for (const c of __game.G.cars) { if (c.wrecked || c.kind === "police") continue; const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } } return best ? { x: best.x, y: best.y } : null; })()');
    await ev(`__game.debug.teleport(${raceCar.x + 28}, ${raceCar.y})`);
    await tapKey(cdp, session, 'e');
    await wait('Boolean(__game.G.player.car)', 5000, 'in a race car');
    const cashBeforeRace = await ev('__game.G.cash');
    const checkpoints = await ev('__game.G.races.checkpoints.map((c) => ({ x: c.x, y: c.y }))');
    for (const cp of checkpoints) {
      await ev(`__game.debug.teleport(${cp.x}, ${cp.y})`);
      await sleep(220);
    }
    await wait('__game.G.races.state === "idle" && __game.G.races.won === 1', 6000, 'race finished');
    const cashAfterRace = await ev('__game.G.cash');
    check('marina race completes and pays', cashAfterRace > cashBeforeRace, '+$' + (cashAfterRace - cashBeforeRace));

    // 15. Save round-trips through localStorage and CONTINUE.
    if (await ev('Boolean(__game.G.player.car)')) await tapKey(cdp, session, 'e');
    await ev(`__game.debug.teleport(${garage.x + 6}, ${garage.y + 10})`);
    await tapKey(cdp, session, 'm');
    await sleep(300);
    const savedCash = await ev('(() => { const raw = localStorage.getItem("palmshade-heat-save-v1"); return raw ? JSON.parse(raw).cash : null; })()');
    check('save writes story progress', savedCash === cashAfterRace, 'saved cash $' + savedCash);
    const reloaded = new Promise((resolve) => {
      cdp.onEvent((msg) => { if (msg.sessionId === session && msg.method === 'Page.loadEventFired') resolve(); });
    });
    await cdp.send('Page.reload', {}, session);
    await reloaded;
    await wait('window.__game && __game.G.mode === "title"', 9000, 'title after reload');
    await clickButton(cdp, session, 'btn-continue');
    await wait('__game.G.mode === "playing"', 6000, 'continued');
    const continuedCash = await ev('__game.G.cash');
    check('CONTINUE restores the save', continuedCash === savedCash, 'cash $' + continuedCash);

    // 16–17. Police respond at three stars, and an interceptor pathfinds
    // across six blocks to a stationary suspect.
    await ev('__game.debug.teleport(720, 720)');
    await ev('__game.debug.giveStars(3)');
    await wait('__game.G.cars.some((c) => c.kind === "police")', 7000, 'interceptor spawned');
    check('police respond at three stars', true);
    await ev('(() => { const p = __game.G.player; const cop = __game.G.cars.find((c) => c.kind === "police"); cop.x = Math.min(p.x + 1440, 2580); cop.y = p.y; cop.speed = 0; cop.route = null; })()');
    let closest = Infinity;
    const chaseDeadline = Date.now() + 16000;
    while (Date.now() < chaseDeadline && closest > 62) {
      closest = await ev('(() => { const p = __game.G.player; let m = Infinity; for (const c of __game.G.cars) if (c.kind === "police") m = Math.min(m, Math.hypot(c.x - p.x, c.y - p.y)); return m; })()');
      if (closest <= 62) break;
      await sleep(200);
    }
    check('interceptor pathfinds to a stationary suspect', closest <= 62, 'closest ' + Math.round(closest) + 'px');
    await ev('__game.G.wanted.points = 0; __game.G.wanted.stars = 0; __game.G.wanted.leaving = true;');

    // 18. WASTED → Clínica Reyes recovery → play resumes.
    await ev('__game.debug.hurtPlayer(999)');
    await wait('__game.G.player.dead === true', 4000, 'player down');
    check('WASTED splash shows', true);
    await wait('__game.G.player.dead === false && __game.G.player.health > 0', 7000, 'recovered');
    const clinica = await ev('(() => { const c = __game.G.city.places.clinica; const p = __game.G.player; return Math.hypot(p.x - c.x, p.y - c.y); })()');
    check('Rio recovers and play resumes', clinica < 110, 'respawned ' + Math.round(clinica) + 'px from the clinic');

    // 19. Clean console, start to finish.
    check('zero console errors across the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  } catch (err) {
    check('playtest ran to completion', false, err.message);
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' checks PASS');
    cdp.close();
    chrome.proc.kill('SIGKILL');
    process.exitCode = failed ? 1 : 0;
  }
}

main().catch((err) => {
  console.error('playtest crashed:', err.message);
  process.exit(2);
});
