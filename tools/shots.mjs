// shots.mjs — captures the entry's four screenshots from the running game.
//
// Each scene in game/src/shots.js is opened with ?shot=<name>, left to settle
// for a breath (water, light and HUD all live), and photographed through
// CDP's Page.captureScreenshot at 1280×800. If a capture comes back over the
// 256 KiB gate cap it is retaken at a lower JPEG quality until it fits.
//
//   node tools/shots.mjs

import { writeFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, Cdp, openPage, waitFor } from './cdp.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CDP_PORT = 9419;
const BASE = 'file://' + join(ROOT, 'game', 'index.html');

const SCENES = [
  { name: 'cover', file: '1-cover.jpg' },
  { name: 'onfoot', file: '2-onfoot.jpg' },
  { name: 'chase', file: '3-chase.jpg' },
  { name: 'docks', file: '4-docks.jpg' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = await launchChrome(CDP_PORT);
  const cdp = new Cdp(chrome.webSocketUrl);
  await cdp.ready();
  const errors = [];
  let session = null;
  cdp.onEvent((msg) => {
    if (session && msg.sessionId === session && msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description || 'exception');
    }
  });
  try {
    mkdirSync(join(ROOT, 'screenshots'), { recursive: true });
    session = await openPage(cdp, BASE + '?shot=' + SCENES[0].name);
    for (const scene of SCENES) {
      if (scene !== SCENES[0]) {
        const loaded = new Promise((resolve) => {
          cdp.onEvent((msg) => {
            if (msg.sessionId === session && msg.method === 'Page.loadEventFired') resolve();
          });
        });
        await cdp.send('Page.navigate', { url: BASE + '?shot=' + scene.name }, session);
        await loaded;
      }
      await waitFor(cdp, session, 'window.__game && __game.G.mode === "playing"', 9000, 'shot scene live');
      await sleep(1100); // let the tableau breathe: foam, glow, HUD
      let quality = 84;
      let size = Infinity;
      while (size > 256 * 1024 && quality >= 40) {
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg', quality, captureBeyondViewport: false,
        }, session);
        const path = join(ROOT, 'screenshots', scene.file);
        writeFileSync(path, Buffer.from(shot.data, 'base64'));
        size = statSync(path).size;
        if (size > 256 * 1024) quality -= 12;
      }
      console.log(scene.file + ' · ' + size + ' bytes · quality ' + quality);
    }
    if (errors.length) throw new Error('page exceptions during capture: ' + errors.join(' | '));
    console.log('screenshots done');
  } finally {
    cdp.close();
    chrome.proc.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('shots failed:', err.message);
  process.exit(1);
});
