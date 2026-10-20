import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// The pictures of the Windows installer (src-tauri/windows): drawn as HTML in headless Edge, in the app's
// colours, font and icon, and saved as the 24-bit BMPs NSIS takes. Usage: node scripts/installer-images.mjs
const OUT = fileURLToPath(new URL('../src-tauri/windows', import.meta.url));
const at = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const dataUrl = (path, type) => `data:${type};base64,${readFileSync(at(path)).toString('base64')}`;
const icon = dataUrl('src-tauri/icons/icon.png', 'image/png');
const font = (weight) =>
  `@font-face { font-family: Onest; font-weight: ${weight}; src: url(${dataUrl(`node_modules/@fontsource/onest/files/onest-cyrillic-${weight}-normal.woff2`, 'font/woff2')}); }`;
const base = `${font(400)} ${font(600)} * { margin: 0; box-sizing: border-box; } body { font-family: Onest, sans-serif; overflow: hidden; }`;

const IMAGES = [
  {
    // The welcome and finish pages: a column on the left, the installer's own text on white to the right of it.
    file: 'sidebar.bmp',
    width: 164,
    height: 314,
    html: `<style>${base}
      body { width: 164px; height: 314px; background: linear-gradient(180deg, #24262d 0%, #121317 100%); color: #fff;
        display: flex; flex-direction: column; align-items: center; padding-top: 64px; text-align: center; }
      img { width: 88px; height: 88px; border-radius: 20px; box-shadow: 0 10px 28px rgba(0,0,0,.45); }
      b { margin-top: 22px; font-weight: 600; font-size: 17px; line-height: 1.2; }
      span { margin-top: 10px; font-size: 11px; line-height: 1.35; color: rgba(255,255,255,.58); padding: 0 14px; }
    </style><img src="${icon}"><b>Кремлёвский<br>Ассистент</b><span>Законы Russia Online поверх игры</span>`,
  },
  {
    // The other pages: the left of their white header, the page's title after it.
    file: 'header.bmp',
    width: 150,
    height: 57,
    html: `<style>${base}
      body { width: 150px; height: 57px; background: #fff; display: flex; align-items: center; gap: 8px; padding-left: 10px; }
      img { width: 38px; height: 38px; border-radius: 9px; }
      b { font-weight: 600; font-size: 12px; line-height: 1.2; color: #17181c; }
    </style><img src="${icon}"><b>Кремлёвский<br>Ассистент</b>`,
  },
];

/** A PNG as Edge writes it (8-bit RGB or RGBA, not interlaced) → rows of RGB. */
function decodePng(png) {
  let width = 0, height = 0, channels = 0;
  const data = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error('only 8-bit, not interlaced');
      channels = { 2: 3, 6: 4 }[body[9]];
      if (!channels) throw new Error(`colour type ${body[9]}`);
    }
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rows = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const corner = x >= channels ? previous[x - channels] : 0;
      const paeth = () => {
        const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      };
      line[x] = (line[x] + [0, left, up, (left + up) >> 1, filter === 4 ? paeth() : 0][filter]) & 255;
    }
    rows.push(line);
    previous = line;
  }
  return { width, height, channels, rows };
}

/** Rows of RGB(A) → a 24-bit BMP, bottom row first, each row padded to four bytes. */
function encodeBmp({ width, height, channels, rows }) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const bmp = Buffer.alloc(54 + rowSize * height);
  bmp.write('BM', 0, 'ascii');
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(rowSize * height, 34);
  bmp.writeInt32LE(2835, 38);
  bmp.writeInt32LE(2835, 42);
  rows.forEach((line, y) => {
    const to = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      bmp[to + x * 3] = line[x * channels + 2];
      bmp[to + x * 3 + 1] = line[x * channels + 1];
      bmp[to + x * 3 + 2] = line[x * channels];
    }
  });
  return bmp;
}

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'ro-installer-'));
const proc = spawn(edge, ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try { targets = await (await fetch('http://127.0.0.1:9334/json/list')).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
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

try {
  for (const image of IMAGES) {
    await send('Emulation.setDeviceMetricsOverride', { width: image.width, height: image.height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8">${image.html}`)}` });
    await sleep(800);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: image.width, height: image.height, scale: 1 } });
    const png = decodePng(Buffer.from(data, 'base64'));
    if (png.width !== image.width || png.height !== image.height) throw new Error(`${image.file}: ${png.width}×${png.height}`);
    writeFileSync(join(OUT, image.file), encodeBmp(png));
    console.log(`${image.file} ${image.width}×${image.height}`);
  }
} finally {
  ws.close();
  proc.kill();
}
