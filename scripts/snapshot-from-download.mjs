// Helper for Claude sessions: turns a forum post saved from the browser into a snapshot.
//
// The forum sits behind a JS check and its pages cannot hand a long text back through the browser tool,
// so the page saves `document.querySelector('article.message .bbWrapper').innerText` as a file. This script
// checks the FNV-1a checksum computed on the page, writes data/<server>/sources/<doc>.txt and removes the
// downloaded copy.
//
// Usage: node scripts/snapshot-from-download.mjs <server> <doc> <fnv> [file]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const [server, doc, expected, given] = process.argv.slice(2);
if (!server || !doc || !expected) {
  console.error('Usage: node scripts/snapshot-from-download.mjs <server> <doc> <fnv> [file]');
  process.exit(2);
}
const file = given ?? join(homedir(), 'Downloads', `ro-${server}-${doc}.txt`);
const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

let h = 0x811c9dc5;
for (let i = 0; i < text.length; i++) {
  h ^= text.charCodeAt(i);
  h = Math.imul(h, 0x01000193) >>> 0;
}
const fnv = 'n' + h;
if (fnv !== expected) throw new Error(`Checksum mismatch: file says ${fnv}, page says ${expected}`);

const out = join(import.meta.dirname, '..', 'data', server, 'sources', `${doc}.txt`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text.endsWith('\n') ? text : text + '\n');
rmSync(file);
console.log(`${doc}: ${text.length} chars, checksum ${fnv} OK → ${out}`);
