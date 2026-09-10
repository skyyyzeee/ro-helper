// Builds the prototype artboards from src/: one app, opened on a different screen per artboard.
// Usage: node design/mockup/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(here, 'src', f), 'utf8');

const svg = (size, inner) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
const icons = {
  SEARCH: svg(20, '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path>'),
  CLOSE: svg(18, '<path d="M6 6l12 12M18 6L6 18"></path>'),
  CLOSE_S: svg(14, '<path d="M6 6l12 12M18 6L6 18"></path>'),
  CLOSE_XS: svg(12, '<path d="M6 6l12 12M18 6L6 18"></path>'),
  PLUS: svg(18, '<path d="M12 5v14M5 12h14"></path>'),
  CHECK: svg(18, '<path d="M5 12.5l4.5 4.5L19 7.5"></path>'),
  COPY: svg(17, '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path>'),
  PIN: svg(18, '<path d="M9 3h6l-1 6.5 3.5 3.5h-11L10 9.5z"></path><path d="M12 13v8"></path>'),
  PIN_S: svg(14, '<path d="M9 3h6l-1 6.5 3.5 3.5h-11L10 9.5z"></path><path d="M12 13v8"></path>'),
  WARN: svg(17, '<path d="M12 3.5l9 16H3z"></path><path d="M12 10v4.5"></path><path d="M12 17.6v.4"></path>'),
  STAR: `<svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="${STAR_PATH}"></path></svg>`,
  STAR_O: svg(20, `<path d="${STAR_PATH}"></path>`),
  MENU: svg(20, '<path d="M4 6h16M4 12h16M4 18h10"></path>'),
  GEAR: svg(19, '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path><circle cx="15" cy="7" r="2"></circle><circle cx="9" cy="17" r="2"></circle>'),
  BACK: svg(18, '<path d="M15 5l-7 7 7 7"></path>'),
  EXT: svg(13, '<path d="M7 17L17 7M9 7h8v8"></path>'),
  GRIP: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"></circle><circle cx="15" cy="6" r="1.6"></circle><circle cx="9" cy="12" r="1.6"></circle><circle cx="15" cy="12" r="1.6"></circle><circle cx="9" cy="18" r="1.6"></circle><circle cx="15" cy="18" r="1.6"></circle></svg>`,
  CHEV_L: svg(16, '<path d="M15 5l-7 7 7 7"></path>'),
  CHEV_R: svg(16, '<path d="M9 5l7 7-7 7"></path>'),
};

const ROW = `<div class="{{ r.cls }}">
  <div class="row-main" onClick="{{ r.open }}">
    <div class="r1"><span class="{{ r.badgeCls }}">{{ r.badge }}</span><span class="num">{{ r.num }}</span><span class="ttl">{{ r.title }}</span><span class="sp"></span><sc-if value="{{ r.hasJur }}"><span class="jur">{{ r.jur }}</span></sc-if><span class="stars"><sc-for list="{{ r.stars }}" as="s">%STAR%</sc-for></span></div>
    <div class="r2"><span class="pen">{{ r.penMain }}</span><sc-if value="{{ r.hasOr }}"><span class="or">либо</span><span class="pen">{{ r.penAlt }}</span></sc-if></div>
  </div>
  <sc-if value="{{ r.canAdd }}"><button class="{{ r.addCls }}" onClick="{{ r.add }}" title="{{ r.addTitle }}"><sc-if value="{{ r.added }}">%CHECK%</sc-if><sc-if value="{{ r.notAdded }}">%PLUS%</sc-if></button></sc-if>
</div>`;

// Deterministic night skyline for the game placeholder.
function skyline() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = ['<svg class="city" viewBox="0 0 1920 620" preserveAspectRatio="none">',
    '<defs><pattern id="win" width="16" height="20" patternUnits="userSpaceOnUse"><rect x="5" y="6" width="5" height="7" fill="#ffcf8a"></rect></pattern>',
    '<pattern id="win2" width="22" height="26" patternUnits="userSpaceOnUse"><rect x="8" y="8" width="6" height="8" fill="#a9c6ff"></rect></pattern>',
    '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"></feGaussianBlur></filter></defs>'];
  for (let x = -20; x < 1940;) {
    const w = 60 + Math.round(rnd() * 90), h = 260 + Math.round(rnd() * 240);
    out.push(`<rect x="${x}" y="${620 - h}" width="${w}" height="${h}" fill="#1a1e2b"></rect>`);
    out.push(`<rect x="${x + 6}" y="${626 - h}" width="${w - 12}" height="${h - 90}" fill="url(#win2)" opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"></rect>`);
    x += w + Math.round(rnd() * 8);
  }
  for (let x = -30; x < 1950;) {
    const w = 70 + Math.round(rnd() * 110), h = 130 + Math.round(rnd() * 240);
    out.push(`<rect x="${x}" y="${620 - h}" width="${w}" height="${h}" fill="#0b0d13"></rect>`);
    out.push(`<rect x="${x + 6}" y="${626 - h}" width="${w - 12}" height="${h - 70}" fill="url(#win)" opacity="${(0.2 + rnd() * 0.5).toFixed(2)}"></rect>`);
    x += w + Math.round(rnd() * 14);
  }
  out.push('<rect x="0" y="560" width="1920" height="60" fill="#07080b"></rect>');
  for (let i = 0; i < 14; i++) {
    const cx = 60 + i * 140 + Math.round(rnd() * 40), color = i % 3 === 0 ? '#ff6b6b' : i % 3 === 1 ? '#ffc07a' : '#ffe2b0';
    out.push(`<circle cx="${cx}" cy="${562 + Math.round(rnd() * 10)}" r="${9 + Math.round(rnd() * 6)}" fill="${color}" opacity=".75" filter="url(#glow)"></circle>`);
  }
  out.push('</svg>');
  return out.join('');
}

let body = src('app.html').split('%ROW%').join(ROW).replace('%SKYLINE%', skyline());
for (const [k, v] of Object.entries(icons)) body = body.split(`%${k}%`).join(v);
body = body
  .replace(/<sc-if value="([^"]+)">/g, '<sc-if value="$1" hint-placeholder-val="{{ false }}">')
  .replace(/<sc-for list="([^"]+)" as="([^"]+)">/g, '<sc-for list="$1" as="$2" hint-placeholder-count="1">');
const leftover = body.match(/%[A-Z_]+%/);
if (leftover) throw new Error('Unreplaced placeholder ' + leftover[0]);

const css = src('app.css');
const logic = src('logic.js');
const options = ['Первый запуск', 'Поиск', 'Статья', 'Калькулятор', 'Закреплено', 'Меню'];
const boards = [
  ['Onboarding.dc.html', 'Первый запуск'],
  ['Main.dc.html', 'Поиск'],
  ['Article.dc.html', 'Статья'],
  ['Calculator.dc.html', 'Калькулятор'],
  ['Pinned.dc.html', 'Закреплено'],
  ['Menu.dc.html', 'Меню'],
];

for (const [file, start] of boards) {
  const props = JSON.stringify({
    screen: { editor: 'enum', options, default: start, section: 'Прототип' },
    $preview: { width: 1920, height: 1080 },
  });
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap">
  <style>
${css}  </style>
</helmet>
${body}</x-dc>
<script data-dc-script data-props='${props}'>
${logic}</script>
</body>
</html>
`;
  writeFileSync(join(here, file), html);
  console.log('wrote', file, Math.round(html.length / 1024) + ' KB');
}
