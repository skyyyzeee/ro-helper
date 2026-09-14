// Rebuilds the bundled server packs from the saved forum snapshots and reports what changed.
// Usage: npm run import                  — report, then save the packs and the changelogs
//        npm run import -- --check       — report only
//        npm run import -- arbatskiy     — one server instead of all
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACK_FORMAT, type DocumentChange, type ServerPack } from '../core/model';
import { buildPack } from './buildPack';
import { compareImports, nextChangelog } from './changelog';
import { SERVERS } from './servers';

const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.filter((a) => !a.startsWith('--'));
const root = join(import.meta.dirname, '..', '..');
const servers = only.length ? SERVERS.filter((s) => only.includes(s.id)) : SERVERS;
if (!servers.length) {
  console.error(`Неизвестный сервер. Есть: ${SERVERS.map((s) => s.id).join(', ')}`);
  process.exit(2);
}

const describe = (changes: DocumentChange[]) => {
  for (const d of changes) {
    if (d.kind !== 'changed') {
      console.log(`  ${d.kind === 'added' ? '+ добавлен' : '− удалён'} документ ${d.short} «${d.title}»`);
      continue;
    }
    const count = (kind: string) => d.articles.filter((a) => a.kind === kind).length;
    console.log(`  ${d.short} «${d.title}»: изменено ${count('changed')}, добавлено ${count('added')}, удалено ${count('removed')}`);
    for (const a of d.articles.slice(0, 12)) {
      const number = (a.after ?? a.before)!.number;
      console.log(`    ${a.kind === 'added' ? '+' : a.kind === 'removed' ? '−' : '~'} ${number}`);
    }
    if (d.articles.length > 12) console.log(`    … ещё ${d.articles.length - 12}`);
  }
};

for (const server of servers) {
  const serverDir = join(root, 'data', server.id);
  const out = join(root, 'src', 'data', `${server.id}.json`);
  const previous = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as ServerPack) : undefined;
  const { pack, issues } = buildPack(serverDir, server);

  console.log(`\n══ ${server.name} ══`);
  for (const doc of pack.documents) {
    const penal = doc.articles.filter((a) => a.parts.some((p) => p.punishment)).length;
    console.log(`${doc.short}: ${doc.chapters.length} глав, ${doc.articles.length} статей, с наказаниями ${penal}`);
  }

  const report = compareImports(previous, pack);
  console.log(`\nИзменения законов (в «Что изменилось»): ${report.laws.length ? '' : 'нет'}`);
  describe(report.laws);
  if (report.parser.length) {
    console.log('\nИзменения разборщика (законы на форуме не менялись, в «Что изменилось» не попадут):');
    describe(report.parser);
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

  if (check) {
    console.log(`\nПроверка: пакет ${pack.server.name}, версия ${pack.version}, не сохранён.`);
  } else {
    pack.changes = nextChangelog(pack.changes, pack.version, report.laws);
    writeFileSync(join(serverDir, 'changelog.json'), JSON.stringify(pack.changes, null, 2) + '\n');
    // «Built» moves only when the content does, so installed copies fetch a pack only when it is new to them.
    const { built: previousBuilt, ...before } = previous ?? ({} as Partial<ServerPack>);
    const same = previous !== undefined && JSON.stringify(before) === JSON.stringify(pack);
    pack.built = same && previousBuilt ? previousBuilt : new Date().toISOString();
    writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
    console.log(`\nПакет ${pack.server.name}, версия ${pack.version} → ${out}`);
  }
}

// What installed copies look at first: each server's pack and when it was built. They download a pack only
// when it is newer than theirs and written in a shape they read.
if (!check) {
  const packs: Record<string, { built?: string; version: string }> = {};
  for (const server of SERVERS) {
    const file = join(root, 'src', 'data', `${server.id}.json`);
    if (!existsSync(file)) continue;
    const pack = JSON.parse(readFileSync(file, 'utf8')) as ServerPack;
    packs[server.id] = { built: pack.built, version: pack.version };
  }
  writeFileSync(join(root, 'src', 'data', 'manifest.json'), JSON.stringify({ format: PACK_FORMAT, packs }, null, 2) + '\n');
}
