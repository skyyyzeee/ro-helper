// «Проверить законы»: which laws changed on the forum since our snapshots, and their new texts — in a few minutes,
// instead of opening every thread by hand.
//
//   npm run laws:check        then open http://127.0.0.1:8788/check and follow it
//
// The forum lets a person's browser in and not a server, so the reading is done in the browser
// (scripts/laws-check-page.js): this helper gives it the list of threads with the checksums of our texts, and
// takes back the texts that differ. It writes them to data/<server>/sources/<doc>.txt, with the date of the edit
// and of the snapshot in the .meta.json beside, and stops. Then, as always: npm run import.
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const FORUM = 'https://forum.russia.online/';
const SERVERS = ['tverskoi', 'arbatskiy', 'kutuzovskiy'];

const fnv = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'n' + h;
};

const sourceDir = (server) => join(root, 'data', server, 'sources');

/** A text's lines as the page compares them: trimmed, no empty ones. */
const linesOf = (text) => text.split('\n').map((line) => line.trim()).filter((line) => line.length > 3);
/** At most this many lines of our text go to the page: enough to tell its post from a draft or a «было / стало». */
const SAMPLE = 300;

/**
 * Documents a person has looked at on the forum and found rewritten as a whole — a new edition, a thread laid out
 * anew — so that hardly a line of ours is left: their text is taken all the same, the author's post (or posts) as
 * the forum shows them. `npm run laws:check -- --accept tverskoi/fz12,arbatskiy/ch-fsb`
 */
const ACCEPT = new Set((process.argv[process.argv.indexOf('--accept') + 1] ?? '').split(',').filter((d) => process.argv.includes('--accept') && /^[a-z]+\/[a-z0-9-]+$/.test(d)));

/** Every document we keep a snapshot of: its thread and the checksum of our text. */
function snapshots() {
  const docs = [];
  for (const server of SERVERS) {
    for (const file of readdirSync(sourceDir(server)).filter((f) => f.endsWith('.meta.json'))) {
      const meta = JSON.parse(readFileSync(join(sourceDir(server), file), 'utf8'));
      if (!meta.thread) continue;
      const text = readFileSync(join(sourceDir(server), `${meta.id}.txt`), 'utf8').replace(/\r\n/g, '\n');
      const lines = linesOf(text);
      const step = Math.max(1, Math.floor(lines.length / SAMPLE));
      const sample = lines.filter((_, i) => i % step === 0).slice(0, SAMPLE).map(fnv);
      const accept = ACCEPT.has(`${server}/${meta.id}`);
      docs.push({ server, doc: meta.id, title: meta.title, thread: meta.thread, fnv: fnv(text), sample, ...(accept ? { accept } : {}) });
    }
  }
  return docs;
}

/** A forum time («2026-09-26T16:01:28+0700») as the snapshots keep it, by Moscow: «2026-09-26T12:01:28+03:00». */
function moscow(time) {
  const ms = Date.parse(String(time).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return Number.isNaN(ms) ? null : `${new Date(ms + 3 * 3600_000).toISOString().slice(0, 19)}+03:00`;
}

const now = () => `${new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 19)}+03:00`;
const today = () => now().slice(0, 10);
/** A text as read, not as laid out: zero-width spaces and runs of spaces and empty lines make no change to a law. */
const words = (text) => text.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

/** The new text of a document, and its dates in the meta — changed in place, the rest of the file as it was. */
function save({ server, doc, text, edited }) {
  if (!SERVERS.includes(server) || !/^[a-z0-9-]+$/.test(doc) || typeof text !== 'string' || !text.trim()) throw new Error(`bad document ${server}/${doc}`);
  const dir = sourceDir(server);
  const metaFile = join(dir, `${doc}.meta.json`);
  // Only a document we already keep is rewritten: nothing new is made from what a page sent.
  if (!existsSync(metaFile)) throw new Error(`no such document ${server}/${doc}`);
  const changed = words(readFileSync(join(dir, `${doc}.txt`), 'utf8')) !== words(text);
  writeFileSync(join(dir, `${doc}.txt`), text);
  let meta = readFileSync(metaFile, 'utf8');
  let when = edited ? moscow(edited) : null;
  // The forum does not always date an edit (one by its staff, a law moved to a new thread): words changed with no
  // later date are dated by the check that found them — so «Что изменилось» tells of them, not only the parser.
  const before = Date.parse(JSON.parse(meta).lastEdited ?? '');
  if (changed && (!when || !(Date.parse(when) > before))) when = now();
  if (when) meta = meta.replace(/("lastEdited":\s*")[^"]*(")/, `$1${when}$2`);
  meta = meta.replace(/("snapshotAt":\s*")[^"]*(")/, `$1${today()}$2`);
  writeFileSync(metaFile, meta);
}

const page = (title, body) =>
  `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${title}</title><style>
  body{font:15px/1.5 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;background:#111215;color:#eee}
  a.bm{display:inline-block;padding:10px 16px;border-radius:10px;background:#f0a2a2;color:#111;font-weight:700;text-decoration:none}
  button{padding:10px 16px;border-radius:10px;border:0;background:#8fb3ff;color:#111;font-weight:700;cursor:pointer;font:inherit}
  li{margin:4px 0} code{background:#222;padding:1px 5px;border-radius:5px} .bad{color:#f6a}</style><body>${body}</body></html>`;

const bookmarklet = () => `javascript:${encodeURIComponent(readFileSync(join(import.meta.dirname, 'laws-check-page.js'), 'utf8'))}`;

createServer((request, response) => {
  const url = new URL(request.url ?? '/', BASE);
  const html = (body) => response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);

  if (request.method === 'GET' && url.pathname === '/check') {
    const docs = snapshots();
    const job = JSON.stringify({ kind: 'laws-check', back: `${BASE}/result`, docs });
    return html(
      page(
        'Проверить законы',
        `<h1>Проверить законы на форуме</h1>
        <p>Документов: <b>${docs.length}</b>, тем на форуме: <b>${new Set(docs.map((d) => d.thread)).size}</b>.</p>
        <ol>
          <li>Один раз перетащите эту кнопку на панель закладок: <a class="bm" href="${bookmarklet()}">Проверить законы</a></li>
          <li>Нажмите <button id="go">Перейти на форум</button> — откроется форум (если он попросит подтвердить, что вы не робот, подтвердите).</li>
          <li>На форуме нажмите закладку «Проверить законы». Внизу справа появится счётчик; через несколько минут браузер сам вернётся сюда с итогом.</li>
        </ol>
        <p>Если закладка не срабатывает: на форуме нажмите F12 → «Console», вставьте содержимое <code>scripts/laws-check-page.js</code> и Enter.</p>
        <script>document.getElementById('go').onclick = () => { window.name = ${JSON.stringify(job).replace(/</g, '\\u003c')}; location.href = ${JSON.stringify(FORUM)}; };</script>`,
      ),
    );
  }

  if (request.method === 'GET' && url.pathname === '/result') {
    return html(
      page(
        'Итог проверки',
        `<h1>Итог проверки</h1><div id="out">Сохраняю…</div><script>
        (async () => {
          const out = document.getElementById('out');
          const text = window.name; window.name = '';
          if (!text) { out.textContent = 'Пусто: начните с ${BASE}/check'; return; }
          const r = await fetch('/save', { method: 'POST', body: text });
          out.innerHTML = await r.text();
        })();
        </script>`,
      ),
    );
  }

  if (request.method === 'POST' && url.pathname === '/save') {
    // The texts of the laws are written from what is sent here, and they go on to every player: only this
    // helper's own page may send them — not some other site open in the browser while the check runs.
    if (request.headers.origin !== BASE) return response.writeHead(403).end('Только со страницы проверки.');
    const parts = [];
    request.on('data', (chunk) => parts.push(chunk));
    request.on('end', () => {
      let result;
      try {
        result = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (result?.kind !== 'laws-result') throw new Error('not a result');
        result.changed = Array.isArray(result.changed) ? result.changed : [];
        result.failed = Array.isArray(result.failed) ? result.failed : [];
      } catch {
        return response.writeHead(400).end('Это не итог проверки.');
      }
      const lines = [];
      for (const doc of result.changed) {
        try {
          save(doc);
        } catch (error) {
          result.failed = [...result.failed, { server: String(doc?.server), doc: String(doc?.doc), error: String(error.message ?? error) }];
          continue;
        }
        lines.push(`${doc.server} · ${doc.doc}${doc.kept !== undefined ? ` (прежних строк ${doc.kept}%)` : ""}`);
      }
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      console.log(`\nПроверено тем: ${result.checked}. Изменилось документов: ${lines.length}.`);
      for (const line of lines) console.log(`  изменён: ${line}`);
      for (const f of result.failed) console.log(`  не прочитан: ${f.server} · ${f.doc} — ${f.error}`);
      for (const u of result.unsure ?? []) console.log(`  проверить вручную: ${u.server} · ${u.doc} — ${u.why}`);
      console.log(lines.length ? '\nДальше: npm run import, затем npm run charters:check.' : '\nВсе законы совпадают с форумом.');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
        `<p>Проверено тем: <b>${result.checked}</b>. Изменилось документов: <b>${lines.length}</b>.</p>` +
          (lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p>Тексты сохранены. Дальше: <code>npm run import</code>, затем <code>npm run charters:check</code>.</p>` : '<p>Все законы совпадают с форумом — делать ничего не нужно.</p>') +
          ((result.unsure ?? []).length ? `<p class="bad">Не сохранены — тема сильно изменилась или в ней несколько похожих сообщений; откройте и проверьте вручную:</p><ul>${result.unsure.map((u) => `<li class="bad">${esc(`${u.server} · ${u.doc} — ${u.why}`)}</li>`).join('')}</ul>` : '') +
          (result.failed.length ? `<p class="bad">Не прочитаны (проверьте вручную):</p><ul>${result.failed.map((f) => `<li class="bad">${esc(`${f.server} · ${f.doc} — ${f.error}`)}</li>`).join('')}</ul>` : '') +
          '<p>Окно можно закрыть.</p>',
      );
      setTimeout(() => process.exit(0), 500);
    });
    return;
  }

  response.writeHead(302, { Location: '/check' }).end();
}).listen(PORT, '127.0.0.1', () => console.log(`Откройте ${BASE}/check — там пошагово.`));
