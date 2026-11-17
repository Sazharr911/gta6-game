// cdp.mjs — a minimal Chrome DevTools Protocol driver for the playtest and
// screenshot tools. Launches headless Chrome with a remote debugging port,
// speaks CDP over the browser WebSocket with flattened target sessions, and
// offers the small vocabulary the tests need: evaluate, real key/mouse input,
// console collection and screenshots. Plain --screenshot does not work with
// this Chrome build, hence the protocol route.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const CHROME = '/opt/meta-chromium/chrome';

// This Chrome build refuses to start without a WebGL domain policy: a file
// whose first line is the policy marker followed by the allowed domains in
// sorted order, passed with its own sha256. The domains must be registrable
// (a placeholder domain satisfies the check; the game itself is loaded from
// file://, because this build's local-network-access checks refuse every
// loopback page — file:// with --allow-file-access-from-files is the route
// that runs, ES modules included).
function webglPolicyArgs() {
  const content = 'hatch-webgl-allowed-domains-v1\npalmshadeheat.com\n';
  const path = '/tmp/palmshade-webgl-policy.txt';
  writeFileSync(path, content);
  const sha = createHash('sha256').update(content).digest('hex');
  return ['--hatch-webgl-allowed-domains-file=' + path, '--hatch-webgl-allowed-domains-sha256=' + sha];
}

export async function launchChrome(port) {
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--mute-audio',
    '--hide-scrollbars',
    '--window-size=1280,800',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=' + port,
    '--user-data-dir=/tmp/palmshade-cdp-' + port,
    '--no-proxy-server',
    '--allow-file-access-from-files',
    ...webglPolicyArgs(),
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (res.ok) {
        const info = await res.json();
        return { proc, webSocketUrl: info.webSocketDebuggerUrl };
      }
    } catch {
      // Chrome is still starting.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome did not open its debugging port. stderr: ' + stderr.slice(-500));
}

export class Cdp {
  constructor(webSocketUrl) {
    this.ws = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = [];
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.eventHandlers) fn(msg);
      }
    });
  }

  ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === 1) return resolve();
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  onEvent(fn) {
    this.eventHandlers.push(fn);
  }

  close() {
    try { this.ws.close(); } catch { /* already gone */ }
  }
}

// Open a page in the browser, enable the domains the tools use, navigate,
// and wait for the load event. Returns the page session id.
export async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  const loaded = new Promise((resolve) => {
    cdp.onEvent((msg) => {
      if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') resolve();
    });
  });
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  return sessionId;
}

export async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error('page evaluation failed: ' + text);
  }
  return result.result.value;
}

// Poll an expression until it returns truthy (or time out and say so).
export async function waitFor(cdp, sessionId, expression, timeoutMs = 8000, label = expression) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(cdp, sessionId, expression);
    if (last) return last;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('timed out waiting for: ' + label + ' (last: ' + JSON.stringify(last) + ')');
}

const KEY_CODES = {
  w: ['KeyW', 87], a: ['KeyA', 65], s: ['KeyS', 83], d: ['KeyD', 68],
  e: ['KeyE', 69], f: ['KeyF', 70], m: ['KeyM', 77], r: ['KeyR', 82],
  p: ['KeyP', 80], q: ['KeyQ', 81],
  shift: ['ShiftLeft', 16], ' ': ['Space', 32],
  arrowup: ['ArrowUp', 38], arrowdown: ['ArrowDown', 40],
  arrowleft: ['ArrowLeft', 37], arrowright: ['ArrowRight', 39],
  1: ['Digit1', 49], 2: ['Digit2', 50], 3: ['Digit3', 51],
};

export async function keyDown(cdp, sessionId, key) {
  const [code, vk] = KEY_CODES[key.toLowerCase()] || [key, 0];
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  }, sessionId);
}

export async function keyUp(cdp, sessionId, key) {
  const [code, vk] = KEY_CODES[key.toLowerCase()] || [key, 0];
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  }, sessionId);
}

export async function tapKey(cdp, sessionId, key, holdMs = 90) {
  await keyDown(cdp, sessionId, key);
  await new Promise((r) => setTimeout(r, holdMs));
  await keyUp(cdp, sessionId, key);
}

export async function mouseMove(cdp, sessionId, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
}

export async function mouseClick(cdp, sessionId, x, y) {
  await mouseMove(cdp, sessionId, x, y);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
  await new Promise((r) => setTimeout(r, 60));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
}

export async function mouseDown(cdp, sessionId, x, y) {
  await mouseMove(cdp, sessionId, x, y);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
}

export async function mouseUp(cdp, sessionId, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
}
