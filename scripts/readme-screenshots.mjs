import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// README screenshots from the browser preview (`npm run dev` must be running): headless Edge driven over
// the DevTools protocol, each shot cropped to the overlay. Usage: node scripts/readme-screenshots.mjs
const OUT = fileURLToPath(new URL('../docs/screenshots', import.meta.url));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'ro-shots-'));
const proc = spawn(edge, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try { targets = await (await fetch('http://127.0.0.1:9333/json/list')).json(); } catch { await sleep(200); }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const key = async (k, code = k) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27 }[k] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27 }[k] });
};
const type = async (text) => {
  await js(`document.querySelector('.search__input').focus()`);
  await send('Input.insertText', { text });
  await sleep(400);
};
const clear = async () => {
  await js(`(() => { const i = document.querySelector('.search__input'); i.focus(); i.select(); })()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await sleep(300);
};
const shot = async (name) => {
  await sleep(500);
  const r = await js(`(() => { const b = document.querySelector('.shell').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  const m = 18;
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x - m, y: r.y - m, width: r.w + 2 * m, height: r.h + 2 * m, scale: 1 } });
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  console.log('saved', name, Math.round(r.w), Math.round(r.h));
};

await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1.5, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:1420/' });
await sleep(1500);
await js(`localStorage.clear(); localStorage.setItem('profile', JSON.stringify({ server: 'tverskoi', organization: 'mvd', hotkey: 'Alt+Q' })); localStorage.setItem('laws.seen:tverskoi', JSON.stringify('9999')); location.reload()`);
await sleep(2500);

// Search.
await type('кража');
await shot('search.png');

// Article.
await clear();
await type('ук 88');
await key('ArrowRight');
await shot('article.png');

// Documents menu.
await key('Escape');
await clear();
await js(`document.querySelector('[aria-label="Все документы"]').click()`);
await shot('menu.png');
await key('Escape');

// Calculator: three charges.
await clear();
for (const q of ['ук 65 ч 2', 'ук 104', 'коап 8.6']) {
  await clear();
  await type(q);
  await key('Enter');
  await sleep(400);
}
await clear();
await type('кража');
await shot('calculator.png');


ws.close();
proc.kill();
process.exit(0);
