// Rebuilds the bundled server pack from the saved forum snapshots.
// Usage: npm run import
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPack } from './buildPack';
import { TVERSKOI } from './servers';

const root = join(import.meta.dirname, '..', '..');
const { pack, issues } = buildPack(join(root, 'data', 'tverskoi'), TVERSKOI);
const out = join(root, 'src', 'data', 'tverskoi.json');
writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');

for (const doc of pack.documents) {
  const penal = doc.articles.filter((a) => a.parts.some((p) => p.punishment)).length;
  console.log(`${doc.short}: ${doc.chapters.length} глав, ${doc.articles.length} статей, с наказаниями ${penal}`);
}
if (issues.length) {
  console.log(`\nНе разобрано: ${issues.length}`);
  for (const issue of issues) {
    const where = [issue.document, issue.article, issue.part ? `ч. ${issue.part}` : issue.partIndex ? `#${issue.partIndex}` : '']
      .filter(Boolean)
      .join(' ');
    console.log(`- [${where}] ${issue.reason}\n  ${issue.line}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nВсё разобрано.');
}
console.log(`\nПакет ${pack.server.name}, версия ${pack.version} → ${out}`);
