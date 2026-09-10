// Helper for Claude sessions: rebuilds a forum snapshot from chunked browser-tool outputs.
//
// The first post's text is read in the user's browser and returned in ~50k-char chunks shaped
// { doc, from, to, total, parts: string[] }. The tool saves each chunk as a JSON file; this script
// joins them, checks they cover the text without gaps, verifies an FNV-1a checksum computed on the
// page, and writes data/<server>/sources/<doc>.txt.
//
// Usage: node scripts/snapshot-from-chunks.mjs <server> <doc> <fnv> <chunk.json>...
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [server, doc, expectedFnv, ...files] = process.argv.slice(2);
if (!server || !doc || !expectedFnv || !files.length) {
  console.error('Usage: node scripts/snapshot-from-chunks.mjs <server> <doc> <fnv> <chunk.json>...');
  process.exit(2);
}

function readChunk(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const text = Array.isArray(raw) ? raw.map((item) => item.text ?? '').join('') : String(raw);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('\n}');
  return JSON.parse(text.slice(start, end + 2));
}

const chunks = files.map(readChunk).filter((c) => c.doc === doc).sort((a, b) => a.from - b.from);
let text = '';
for (const chunk of chunks) {
  if (chunk.from !== text.length) throw new Error(`Gap or overlap at ${text.length}: next chunk starts at ${chunk.from}`);
  const body = chunk.parts.join('');
  if (body.length !== chunk.to - chunk.from) throw new Error(`Chunk ${chunk.from}–${chunk.to} holds ${body.length} chars`);
  text += body;
}
const total = chunks[0]?.total;
if (text.length !== total) throw new Error(`Assembled ${text.length} of ${total} chars`);

let h = 0x811c9dc5;
for (let i = 0; i < text.length; i++) {
  h ^= text.charCodeAt(i);
  h = Math.imul(h, 0x01000193) >>> 0;
}
const fnv = 'n' + h;
if (fnv !== expectedFnv) throw new Error(`Checksum mismatch: got ${fnv}, page says ${expectedFnv}`);

const out = join(import.meta.dirname, '..', 'data', server, 'sources', `${doc}.txt`);
writeFileSync(out, text.endsWith('\n') ? text : text + '\n');
console.log(`${doc}: ${text.length} chars, checksum ${fnv} OK → ${out}`);
