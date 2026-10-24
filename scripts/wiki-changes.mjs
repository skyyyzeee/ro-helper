// What a fresh `npm run wiki:import` brought, against the catalogs in the last commit — the time each was taken left
// out, as it changes every time. Writes the summary in Markdown to the file given (the body of the wiki pull request)
// and `changed=true|false` to $GITHUB_OUTPUT when there is one.
//
//   node scripts/wiki-changes.mjs summary.md
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'data', 'wiki');
const NAMES = {
  updates: 'Сборки (обновления игры)',
  posts: 'Статьи',
  vehicles: 'Транспорт',
  'clothes-male': 'Мужская одежда',
  'clothes-female': 'Женская одежда',
  'haircuts-male': 'Мужские причёски',
  'haircuts-female': 'Женские причёски',
  'tattoos-male': 'Мужские татуировки',
  'tattoos-female': 'Женские татуировки',
  animations: 'Анимации',
  items: 'Предметы',
  businesses: 'Бизнесы',
  realties: 'Недвижимость',
  wheels: 'Диски',
  modkits: 'Обвесы',
  recipes: 'Рецепты',
  crafts: 'Крафт фракций',
  skins: 'Скины',
  messages: 'Сообщения',
};

const withoutTime = (text) => {
  const { takenAt: _, ...rest } = JSON.parse(text);
  return JSON.stringify(rest);
};
const before = (file) => {
  try {
    return execFileSync('git', ['show', `HEAD:data/wiki/${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch {
    return null;
  }
};

const rows = [];
let builds = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const now = readFileSync(join(dir, file), 'utf8');
  const was = before(file);
  if (was && withoutTime(was) === withoutTime(now)) continue;
  const name = file.replace(/\.json$/, '');
  const fresh = JSON.parse(now).items ?? [];
  const old = was ? (JSON.parse(was).items ?? []) : [];
  rows.push(`| ${NAMES[name] ?? name} | ${old.length} | ${fresh.length} |`);
  if (name === 'updates') {
    const known = new Set(old.map((u) => u.id));
    builds = fresh.filter((u) => !known.has(u.id)).map((u) => `- ${u.title} (${new Date(u.createdAt).toLocaleDateString('ru-RU')})`);
  }
}

const changed = rows.length > 0;
const summary = changed
  ? [
      'Свежие данные вики (wiki.russia.online), скачанные по расписанию: `npm run wiki:import` и `npm run wiki:build`.',
      '',
      '| Раздел | Было | Стало |',
      '|---|---|---|',
      ...rows,
      ...(builds.length ? ['', '**Новые сборки:**', ...builds] : []),
      '',
      'Игроки получат их без релиза, как только они попадут в main.',
    ].join('\n')
  : 'На вики ничего нового.';
if (process.argv[2]) writeFileSync(process.argv[2], `${summary}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(summary);
