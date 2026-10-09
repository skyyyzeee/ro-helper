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

/** «2026-09-27T22:40:05+03:00»: the time on this machine, written like the forum's edit dates. */
function localTime(date: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}${offset < 0 ? '-' : '+'}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
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
    // Laws edited before the version already out (found late, next to a later edit) would join its entry, and whoever
    // has seen that version would never see them: they get an entry and a version of their own, the import's time.
    if (report.laws.length && previous && Date.parse(pack.version) <= Date.parse(previous.version)) pack.version = localTime(new Date());
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
  // What the app needs of every server before its laws are loaded (the server picker, the factions, the account):
  // the server and its organisations, a few kilobytes — the packs themselves are loaded one at a time, when used.
  const servers: Record<string, Pick<ServerPack, 'server' | 'organizations'>> = {};
  for (const server of SERVERS) {
    const file = join(root, 'src', 'data', `${server.id}.json`);
    if (!existsSync(file)) continue;
    const pack = JSON.parse(readFileSync(file, 'utf8')) as ServerPack;
    packs[server.id] = { built: pack.built, version: pack.version };
    servers[server.id] = { server: pack.server, organizations: pack.organizations };
  }
  writeFileSync(join(root, 'src', 'data', 'manifest.json'), JSON.stringify({ format: PACK_FORMAT, packs }, null, 2) + '\n');
  writeFileSync(join(root, 'src', 'data', 'servers.json'), JSON.stringify(servers, null, 2) + '\n');
}
