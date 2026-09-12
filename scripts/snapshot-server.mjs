// Helper for Claude sessions: receives a forum post's text from the browser and saves the snapshot.
//
// The forum sits behind a JS check, so its threads are read in the user's own browser. The page cannot
// hand a long text back through the browser tool (it is cut short), so it posts the text here instead:
//
//   node scripts/snapshot-server.mjs            # listens on 127.0.0.1:8787
//
// The forum's own CSP forbids it to call this server, so the text travels in `window.name`, which survives
// navigation: on the thread page `window.name = text`, then the tab goes to
// http://127.0.0.1:8787/paste?server=arbatskiy&doc=uk, whose page saves what it finds in `window.name`.
//
// The text is written to data/<server>/sources/<doc>.txt and the checksum is printed, so it can be
// compared with the one computed on the page. With `&next=<thread url>` the page goes on to the next
// thread once the text is saved, so a batch of threads needs one step per thread, not two.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const PORT = 8787;

const fnv1a = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'n' + h;
};

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  // Chrome asks before a public page may reach a server on the local network.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/paste') {
    const server = url.searchParams.get('server') ?? '';
    const doc = url.searchParams.get('doc') ?? '';
    const next = url.searchParams.get('next') ?? '';
    // Only on to the forum: the page must not be made to go anywhere else.
    const onward = next.startsWith('https://forum.russia.online/') ? JSON.stringify(next) : 'null';
    return res
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end(`<!doctype html><meta charset="utf-8"><body>Сохраняю…<script>
        (async () => {
          const text = window.name;
          window.name = '';
          if (!text) { document.body.textContent = 'ПУСТО: в window.name ничего нет'; return; }
          const r = await fetch('/save/${server}/${doc}', { method: 'POST', body: text });
          document.body.textContent = (r.ok ? 'OK ' : 'ОШИБКА ') + (await r.text());
          const next = ${onward};
          if (r.ok && next) location.href = next;
        })();
      </script></body>`);
  }
  const match = /^\/save\/([a-z0-9-]+)\/([a-z0-9.-]+)$/i.exec(url.pathname);
  if (req.method !== 'POST' || !match) return res.writeHead(404).end('use POST /save/<server>/<doc>');

  const [, server, doc] = match;
  const parts = [];
  req.on('data', (chunk) => parts.push(chunk));
  req.on('end', () => {
    const text = Buffer.concat(parts).toString('utf8');
    const file = join(root, 'data', server, 'sources', `${doc}.txt`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text.endsWith('\n') ? text : text + '\n');
    console.log(`${server}/${doc}: ${text.length} chars, checksum ${fnv1a(text)} → ${file}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`${text.length} ${fnv1a(text)}`);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Ожидаю снимки на http://127.0.0.1:${PORT}`));
