/**
 * Takes a still of the page, in headless Chrome, on the real GPU.
 *
 *   node scripts/shoot.mjs <name> <path> [width height] [options]
 *
 *   node scripts/shoot.mjs shelf "/?t=30"                     the Shelf, settled
 *   node scripts/shoot.mjs strike "/?t=0.4"                   the lamps mid-strike
 *   node scripts/shoot.mjs desk "/writing?t=30" 1280 720
 *   node scripts/shoot.mjs phone "/?t=30" 390 844
 *   node scripts/shoot.mjs held "/" --key Enter --wait 3000   a Book in the hand
 *   node scripts/shoot.mjs live "/" --fps                     and the frame rate
 *
 * Writes build/shots/<name>.png and prints one line of JSON: how long the
 * canvas took to come up, the frame rate if asked, the GPU, and any errors
 * the page threw. Read the picture. This is how the room is judged: see
 * docs/adr/0006, and `?t=` in src/components/shelf/clock.ts.
 *
 * Options:
 *   --base <url>      default http://localhost:4321 (npm run dev)
 *   --wait <ms>       how long to let the page run before the still (3500)
 *   --mouse <x,y>     move the pointer there first
 *   --click <x,y>     click there, then wait 2.5s
 *   --key <a,b>       press these keys in turn, 1.8s apart
 *   --keywait <ms>    or this far apart, to catch something mid-move
 *   --fps             measure frames a second over three seconds
 *
 * No dependencies: it starts the Chrome already on this Mac and talks to it
 * over the DevTools protocol, with the WebSocket and fetch that Node has built
 * in. Playwright would be less code and one more thing to install.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const argv = process.argv.slice(2);
const VALUED = ['base', 'wait', 'mouse', 'click', 'key', 'keywait'];
const options = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (!arg.startsWith('--')) positional.push(arg);
  else if (VALUED.includes(arg.slice(2))) options[arg.slice(2)] = argv[++i];
  else options[arg.slice(2)] = true;
}
const [name, path = '/', width = '1920', height = '1080'] = positional;
if (!name) {
  console.error('usage: node scripts/shoot.mjs <name> <path> [width height] [options]');
  process.exit(1);
}
const base = options.base ?? 'http://localhost:4321';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- Chrome

const profile = mkdtempSync(join(tmpdir(), 'shoot-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    // The real GPU, not SwiftShader: a frame rate measured on a software
    // renderer says nothing about anyone's laptop.
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    // Headless Chrome throttles a page it thinks nobody is looking at.
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

const cleanUp = () => {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome is still letting go of it. A temp directory; the OS will.
  }
};
process.on('exit', cleanUp);

const port = await new Promise((resolve, reject) => {
  let seen = '';
  const timer = setTimeout(() => reject(new Error('Chrome did not start')), 15000);
  chrome.stderr.on('data', (chunk) => {
    seen += chunk;
    const found = seen.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
    if (found) {
      clearTimeout(timer);
      resolve(found[1]);
    }
  });
  chrome.on('error', reject);
});

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});

let lastId = 0;
const waiting = new Map();
const errors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && waiting.has(message.id)) {
    const { resolve, reject } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params.exceptionDetails;
    errors.push(`exception: ${detail.exception?.description ?? detail.text}`.split('\n')[0]);
  } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(`console: ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++lastId;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return result.value;
};

// ---------------------------------------------------------------- the still

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 1,
  mobile: false,
});

const started = Date.now();
await send('Page.navigate', { url: base + path });

// The canvas is 300x150 until react-three-fiber has measured its container
// and begun drawing. Its growing is the room coming up.
let canvasUp = null;
while (Date.now() - started < 20000) {
  const ready = await evaluate(
    `(() => { const c = document.querySelector('canvas'); return !!c && c.width > 300; })()`
  ).catch(() => false);
  if (ready) {
    canvasUp = Date.now() - started;
    break;
  }
  await sleep(100);
}
if (canvasUp === null) errors.push('the canvas never came up');

// The dev toolbar sits over the bottom of the page in `npm run dev`.
await evaluate(
  `(() => { const s = document.createElement('style'); s.textContent = 'astro-dev-toolbar{display:none!important}'; document.head.appendChild(s); })()`
);

const point = (value) => value.split(',').map(Number);
if (options.mouse) {
  const [x, y] = point(options.mouse);
  // In steps, as a hand does it. One jump is not always seen as a move.
  for (let i = 1; i <= 8; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (x * i) / 8, y: (y * i) / 8 });
    await sleep(16);
  }
}
await sleep(Number(options.wait ?? 3500));

if (options.click) {
  const [x, y] = point(options.click);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(2500);
}

const KEYS = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Escape: { code: 'Escape', keyCode: 27 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
};
if (options.key) {
  for (const key of options.key.split(',')) {
    const spec = KEYS[key];
    if (!spec) {
      errors.push(`no such key: ${key}`);
      continue;
    }
    const event = { key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...event, text: spec.text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    await sleep(Number(options.keywait ?? 1800));
  }
}

let fps = null;
if (options.fps) {
  fps = await evaluate(`new Promise((resolve) => {
    let frames = 0;
    const from = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - from < 3000) requestAnimationFrame(tick);
      else resolve(Math.round(frames / 3));
    };
    requestAnimationFrame(tick);
  })`);
}

const gpu = await evaluate(`(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
mkdirSync('build/shots', { recursive: true });
const file = `build/shots/${name}.png`;
writeFileSync(file, Buffer.from(shot.data, 'base64'));

console.log(JSON.stringify({ file, canvasUp, fps, gpu, errors }));
socket.close();
cleanUp();
process.exit(0);
