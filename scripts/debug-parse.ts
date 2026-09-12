// Helper for Claude sessions: prints how a snapshot parses.
// Usage: npx tsx scripts/debug-parse.ts <server> <doc> [article…]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLawText, type LawFormat } from '../src/importer/lawText';

const [server, doc, ...numbers] = process.argv.slice(2);
const root = join(import.meta.dirname, '..');
const meta = JSON.parse(readFileSync(join(root, 'data', server, 'sources', `${doc}.meta.json`), 'utf8'));
const text = readFileSync(join(root, 'data', server, 'sources', `${doc}.txt`), 'utf8');
const parsed = parseLawText(text, doc, meta.format as LawFormat, { subpoints: meta.subpoints });
console.log(`${doc}: ${parsed.chapters.length} глав, ${parsed.articles.length} статей, не разобрано ${parsed.issues.length}`);
for (const number of numbers) {
  const article = parsed.articles.find((a) => a.number === number);
  console.log(`\n== ${number}\n` + JSON.stringify(article, null, 1));
}
