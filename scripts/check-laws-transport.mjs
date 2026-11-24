import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('./laws-check-page.js', import.meta.url), 'utf8');
const fnv = (text) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return 'n' + hash;
};

test('embedded job survives an empty window.name and exports changed text without cross-site navigation', async () => {
  const dom = new JSDOM('<body></body>', { url: 'https://forum.russia.online/', runScripts: 'outside-only' });
  const win = dom.window;
  let downloaded;
  let requested;
  Object.defineProperty(win.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  win.name = '';
  win.alert = (message) => { throw new Error(message); };
  win.fetch = async (url) => {
    requested = url;
    return { ok: true, text: async () => '<article class="message" data-author="author"><div class="bbWrapper">Действующая норма</div></article>' };
  };
  win.Blob = Blob;
  win.URL.createObjectURL = (blob) => { downloaded = blob; return 'blob:local-result'; };
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = () => {};
  win.setTimeout = (fn) => { fn(); return 0; };
  const job = { kind: 'laws-check', back: 'http://127.0.0.1:8788/result', docs: [
    { server: 'tverskoi', doc: 'example', thread: 1177, fnv: 'old', sample: [fnv('Действующая норма')] },
  ] };
  await win.eval(source.replace('/* LAWS_CHECK_JOB */ null', JSON.stringify(job)));
  const result = JSON.parse(await downloaded.text());
  assert.equal(requested, '/threads/1177/');
  assert.equal(win.location.href, 'https://forum.russia.online/');
  assert.equal(result.checked, 1);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.unsure, []);
  assert.equal(result.changed[0].text, 'Действующая норма\n');
  assert.equal(result.changed[0].fnv, fnv('Действующая норма\n'));
  dom.window.close();
});
