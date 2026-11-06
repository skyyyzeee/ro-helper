import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLawText, type LawFormat } from './lawText';
import type { PointsOptions } from './points';

const root = join(import.meta.dirname, '..', '..');
// The project rules are kept once, in data/_shared; a server's own snapshot, when there is one, wins.
const source = (id: string) => {
  const own = join(root, 'data', 'tverskoi', 'sources', `${id}.txt`);
  return existsSync(own) ? own : join(root, 'data', '_shared', 'sources', `${id}.txt`);
};
const parse = (id: string, format: LawFormat = 'points', options: PointsOptions = {}) =>
  parseLawText(readFileSync(source(id), 'utf8'), id, format, options);
const point = (id: string, number: string, chapter?: string) => {
  const found = parse(id).articles.find((a) => a.number === number && (chapter === undefined || a.chapter === chapter));
  if (!found) throw new Error(`${id} п. ${number} not parsed`);
  return found;
};

/** Points of the charters, regulations and rules written in points, and articles of those written in articles. */
/**
 * The shape of Тверской's ГИБДД charter before 23 September (a new one replaced it): contents in «Глава I | …»,
 * chapters IV and V named only there, 4.2.1 written twice and a point numbered 8.2 inside chapter IV.
 */
const OLD_GIBDD = [
  'ОГЛАВЛЕНИЕ', 'Глава I | Общее положение', 'Глава II | Обязанности сотрудника', 'Глава III | Запреты для сотрудника',
  'ГЛАВА IV | Положение о правах, взысканиях и поощрениях сотрудников', 'Глава V | Положение об отделах',
  'Глава I | Общее положение', '1.1 | Настоящий устав — это внутренний нормативный акт.',
  'Глава II | Обязанности сотрудника', '2.1. Сотрудник обязан знать устав.',
  'Глава III | Запреты для сотрудника', '3.1. Сотруднику запрещено нарушать устав.',
  '4.1. Дисциплина труда — обязательное для всех сотрудников подчинение Уставу.',
  '4.2.1. За каждый совершённый проступок может быть назначено только одно дисциплинарное взыскание.',
  '4.2.1. В случае совершения нарушения заместителем начальника ГИБДД взыскания применяет Начальник ГИБДД.',
  '8.2. Отпуск предоставляется по рапорту.',
  '5.1. В ГИБДД есть отделы.',
].join('\n');

const COUNTS: [string, LawFormat, number][] = [
  ['ch-mvd', 'points', 247], ['ch-gibdd', 'points', 84], ['ch-fso', 'points', 97], ['ch-hospital', 'points', 225], ['ch-news', 'points', 90],
  ['sk-structure', 'points', 69], ['sk-service', 'points', 21], ['sk-ranks', 'points', 12],
  ['rules-main', 'points', 98], ['rules-gov', 'points', 120], ['rules-crime', 'points', 52],
  ['ch-army', 'law', 65], ['ch-army-discipline', 'law', 48], ['ch-army-guard', 'law', 45],
  ['sk-ethics', 'law', 10], ['sk-appeals', 'law', 17],
];

describe('charters, regulations and project rules (real Тверской forum text)', () => {
  it('reads every point, with unique ids and nothing left unparsed', () => {
    for (const [id, format, count] of COUNTS) {
      const doc = parse(id, format);
      expect({ id, count: doc.articles.length, issues: doc.issues }).toEqual({ id, count, issues: [] });
      expect(new Set(doc.articles.map((a) => a.id)).size).toBe(count);
    }
  });

  it('a charter in chapters and «Статья 1.1.» (МВД): the table of contents is not taken for chapters', () => {
    const mvd = parse('ch-mvd', 'points', { subheadings: 'titles' });
    expect(mvd.chapters).toHaveLength(17);
    expect(mvd.chapters[0]).toMatchObject({ number: 'I', title: 'ОБЩИЕ ПОЛОЖЕНИЯ' });
    const tasks = mvd.articles.find((a) => a.number === '1.2')!;
    expect(tasks).toMatchObject({ chapter: 'I', title: '' });
    expect(tasks.parts.map((p) => p.text).slice(0, 3)).toEqual(['Основными задачами МВД являются:', '- охрана общественного порядка;', '- патрулирование;']);
    // Where points are «1.1», «1. Рядовой» is an item of a list (the ranks), not a point.
    expect(mvd.articles.every((a) => a.number.includes('.'))).toBe(true);
  });

  it('sub-headings inside a chapter group the points under them (МВД)', () => {
    const mvd = parse('ch-mvd', 'points', { subheadings: 'titles' });
    const at = (number: string) => mvd.articles.find((a) => a.number === number)!;
    // The title right under a chapter's heading, one after a finished sentence, after a numbered line, and «Часть 1. …».
    expect(at('2.1').group).toBe('Обязанности сотрудника');
    expect(at('6.5').group).toBe('Отделы МВД');
    expect(at('6.4').parts.map((p) => p.text)).toEqual(['Старший состав МВД образуют:', '- Полковник полиции МВД;', '- Подполковник полиции МВД;']);
    expect(at('15.2').group).toBe('Субординация');
    expect(at('7.4').group).toBe('Часть 1. Отдел собственной безопасности (ОСБ)');
    expect(mvd.chapters.every((c) => !c.preface.length)).toBe(true);
    // A row of a table reads as a line (the cells come tab-separated since the 20 October snapshot, so a space joins them).
    expect(at('6.8.2').parts.map((p) => p.text).slice(1, 3)).toEqual(['Специальное звание Должность', 'Генерал-майор Начальник отдела']);
  });

  it('without the option a title after a sentence stays the point’s own (больница: «Строгий выговор 2/3»)', () => {
    // The shape of the hospital charter's п. 5.12 before 8 October: the punishment broken onto a line of its own.
    const old = parseLawText(['5. ЗАПРЕЩЕНО', '5.12. Сотруднику запрещено играть в азартные игры. | Строгий выговор /', 'Строгий выговор 2/3'].join('\n'), 'ch-hospital', 'points');
    expect(old.articles.find((a) => a.number === '5.12')!.parts.at(-1)!.text).toBe('Строгий выговор 2/3');
  });

  it('a number written twice in one chapter keeps its place in the ids (the old ГИБДД charter: 4.2.1)', () => {
    const repeated = parseLawText(OLD_GIBDD, 'ch-gibdd', 'points').articles.filter((a) => a.number === '4.2.1').map((a) => a.id);
    expect(repeated).toEqual(['ch-gibdd-IV-4.2.1', 'ch-gibdd-IV-4.2.1~2']);
  });

  it('a date is no point («22.08.2026»)', () => {
    expect(parse('ch-hospital').articles.some((a) => /^\d{2}\.\d{2}\.\d{3,}/.test(a.number))).toBe(false);
  });

  it('«1.1 | текст» and chapters known only from the contents (the old ГИБДД charter)', () => {
    const gibdd = parseLawText(OLD_GIBDD, 'ch-gibdd', 'points');
    const at = (number: string) => gibdd.articles.find((a) => a.number === number)!;
    expect(gibdd.chapters.map((c) => c.number)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(at('1.1').parts[0].text.startsWith('Настоящий устав — это')).toBe(true);
    expect(at('4.1').chapter).toBe('IV');
    // A point on leave numbered 8.x inside chapter IV stays where it stands.
    expect(at('8.2').chapter).toBe('IV');
    expect(at('5.1').chapter).toBe('V');
  });

  it('a numbered heading in capitals, punishments after «|» and «➤ Исключение к п. …» (больница)', () => {
    expect(parse('ch-hospital').chapters[0]).toMatchObject({ number: '1', title: 'ОБЩИЕ ПОЛОЖЕНИЯ БОЛЬНИЦЫ' });
    expect(point('ch-hospital', '5.36').notes).toEqual([{ label: 'Наказание', text: 'Строгий выговор / Строгий выговор 2/3' }]);
    expect(point('ch-hospital', '5.41').notes.map((n) => n.label)).toEqual(['Наказание', 'Исключение', 'Исключение']);
  });

  it('regulations in chapters and numbered paragraphs (Положение о структуре СК)', () => {
    const sk = parse('sk-structure');
    expect(sk.chapters.map((c) => c.number)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(sk.chapters[0].title).toBe('Общие положения');
    expect(point('sk-structure', '1.1').chapter).toBe('1');
    expect(point('sk-structure', '1.1').parts[0].text.startsWith('Настоящее Положение определяет организационную структуру')).toBe(true);
  });

  it('project rules: sections by the points’ first number, titled by the line before them', () => {
    expect(parse('rules-main').chapters.map((c) => c.title)).toEqual([
      'Общее положение', 'Положение об аккаунте и персонаже', 'Модерация платформ', 'Игровые чаты', 'Role Play процесс', 'Запрещено', 'Регламент жалоб-обращений',
    ]);
    expect(point('rules-main', '1.1').notes).toEqual([
      { label: 'Наказание', text: 'Mute 60-240 минут.' },
      { label: 'Исключение', text: 'отдельные слова и фразы для отыгровки роли своего персонажа.' },
    ]);
    // A «…:» line before a point is its sub-heading.
    expect(point('rules-main', '2.1').group).toBe('Положение об аккаунте');
    expect(point('rules-main', '4.1').group).toBe('Запрещено нарушение общих положений игрового чата');
    // A section's introduction after its title (правила криминальных организаций).
    const crime = parse('rules-crime').chapters[2];
    expect(crime.title).toBe('Методы расправы');
    expect(crime.preface[0].startsWith('Захват территории - способ')).toBe(true);
  });

  it('Army charters and two СК regulations are written in articles', () => {
    expect(parse('ch-army', 'law').articles[0]).toMatchObject({ id: 'ch-army-1.1', title: 'Соблюдение Устава' });
    expect(parse('ch-army-guard', 'law').articles[0]).toMatchObject({ number: '1', title: '' });
    // «РАЗДЕЛ I» and on are sections, their articles numbered through the document.
    const appeals = parse('sk-appeals', 'law');
    expect(appeals.chapters.map((c) => [c.number, c.kind])).toEqual([['I', 'section'], ['II', 'section'], ['III', 'section'], ['IV', 'section'], ['V', 'section'], ['VI', 'section']]);
    expect(appeals.articles[0]).toMatchObject({ id: 'sk-appeals-1', title: 'Предмет регулирования', chapter: 'I' });
  });
});

describe('sub-points as a list of their point (ФСО regulation)', () => {
  const fso = parseLawText(readFileSync(join(root, 'data', 'tverskoi', 'sources', 'ch-fso.txt'), 'utf8'), 'ch-fso', 'points', { subpoints: 'list' });
  const at = (number: string) => fso.articles.find((a) => a.number === number)!;

  it('keeps 5.1.1–5.1.6 inside point 5.1 as its list, each with its lines on one line', () => {
    expect(fso.issues).toEqual([]);
    expect(at('5.1.1')).toBeUndefined();
    const [part] = at('5.1').parts;
    expect(part.text).toMatch(/^За нарушение положений настоящего Устава/);
    expect(part.points.map((p) => p.marker)).toEqual(['5.1.1', '5.1.2', '5.1.3', '5.1.4', '5.1.5', '5.1.6']);
    expect(part.points[0].text).toBe('Замечание (устное). Основания: Мелкое нарушение, совершённое впервые. Выносит: Командир подразделения.');
  });

  it("joins a sub-point's dashed list into its line", () => {
    expect(at('6.1').parts[0].points[1]).toEqual({
      marker: '6.1.2',
      text: expect.stringMatching(/^К кандидатам предъявляются следующие требования: — отсутствие неснятой судимости .*; — успешное прохождение собеседования/),
    });
  });

  it('leaves points without sub-points as they were: 47 points in all', () => {
    expect(fso.articles).toHaveLength(47);
    expect(['2.1', '2.2', '3.3', '4.1', '5.1', '5.2', '6.1', '6.2', '8.1', '8.2', '9.1', '10.2'].map((n) => at(n).parts[0].points.length)).toEqual([
      4, 4, 2, 6, 6, 7, 3, 2, 4, 4, 4, 4,
    ]);
    expect(at('7.2').parts[0].points).toEqual([]);
  });
});

/** The charters of the other servers, read from their own snapshots. */
const parseOn = (server: string, id: string, format: LawFormat, options: PointsOptions = {}) =>
  parseLawText(readFileSync(join(root, 'data', server, 'sources', `${id}.txt`), 'utf8'), id, format, options);

describe('charters of Арбатский and Кутузовский (real forum text)', () => {
  const CHARTERS: [string, string, LawFormat, number][] = [
    ['arbatskiy', 'ch-mvd', 'law', 111], ['arbatskiy', 'ch-gibdd', 'law', 33],
    ['arbatskiy', 'ch-army', 'points', 238], ['arbatskiy', 'sk-charter', 'law', 88],
    ['arbatskiy', 'ch-army-discipline', 'points', 123], ['arbatskiy', 'ch-army-guard', 'points', 71],
    ['arbatskiy', 'ch-hospital', 'points', 143], ['arbatskiy', 'ch-news', 'points', 221],
    ['kutuzovskiy', 'ch-mvd', 'points', 331], ['kutuzovskiy', 'ch-gibdd', 'law', 33], ['kutuzovskiy', 'ch-army-discipline', 'points', 103],
    ['kutuzovskiy', 'ch-hospital', 'points', 166], ['kutuzovskiy', 'ch-news', 'points', 138], ['kutuzovskiy', 'sk-appeals', 'law', 29],
  ];

  it('reads every point and article, with nothing left unparsed', () => {
    for (const [server, id, format, count] of CHARTERS) {
      const doc = parseOn(server, id, format);
      expect({ server, id, count: doc.articles.length, issues: doc.issues }).toEqual({ server, id, count, issues: [] });
    }
  });

  it('a charter numbering its points «1.», «5.1» anew in each chapter, «- 3.1.» with a dash, a chapter heading lost on the forum (ФСБ Арбатского)', () => {
    const fsb = parseOn('arbatskiy', 'ch-fsb', 'points', { points: 'numbered' });
    expect({ count: fsb.articles.length, issues: fsb.issues }).toEqual({ count: 212, issues: [] });
    expect(fsb.articles[0]).toMatchObject({ number: '1', chapter: 'I' });
    // «ГЛАВА» alone: the chapter after VIII, with the points of its own 1.1, not VIII's again.
    expect(fsb.chapters.map((c) => c.number)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
    expect(fsb.articles.find((a) => a.chapter === 'IX' && a.number === '1.1')!.parts[0].text).toMatch(/^Уклонение от службы/);
  });

  it('takes «Наказание: …» on the line under a point as its punishment', () => {
    const discipline = parseOn('kutuzovskiy', 'ch-army-discipline', 'points');
    const ethics = discipline.articles.find((a) => a.number === '4.1')!;
    expect(ethics.parts[0].text).toBe('Несоблюдение военной этики.');
    expect(ethics.notes).toEqual([{ label: 'Наказание', text: 'Выговор/Переаттестация' }]);
    expect(discipline.articles.filter((a) => a.notes.some((n) => n.label === 'Наказание'))).toHaveLength(51);

    const hospital = parseOn('arbatskiy', 'ch-hospital', 'points');
    expect(hospital.articles.find((a) => a.number === '2.4')!.notes).toEqual([{ label: 'Наказание', text: 'Строгий выговор' }]);
  });
});

describe('the other rules of the project (real forum text, the same on every server)', () => {
  const RULES: [string, number, number][] = [
    ['rules-leaders', 41, 27], ['rules-martial', 20, 11], ['rules-supply', 63, 52], ['rules-robbery', 52, 40], ['rules-business', 14, 11],
    ['rules-bank', 19, 14], ['rules-workshops', 15, 14], ['rules-fort', 35, 30], ['rules-software', 14, 6], ['rules-forum', 37, 26],
  ];

  it('reads every point, and every punishment after «|»', () => {
    for (const [id, count, punished] of RULES) {
      const doc = parse(id);
      const penalties = doc.articles.filter((a) => a.notes.some((n) => n.label === 'Наказание')).length;
      expect({ id, count: doc.articles.length, penalties, issues: doc.issues }).toEqual({ id, count, penalties: punished, issues: [] });
    }
  });

  it('takes «2. Обязанности лидера» for the title of section 2, not for a line of the point before it', () => {
    const leaders = parse('rules-leaders');
    expect(leaders.chapters.map((c) => c.title)).toEqual(['Общее положение', 'Обязанности лидера', 'Лидерам запрещено', 'Повышения/Увольнения']);
    expect(leaders.articles.flatMap((a) => a.parts).some((p) => /^\d\.\s/.test(p.text))).toBe(false);
  });
});

describe('sections that hold chapters (Положение о структуре ВС и ФСВНГ, Тверской)', () => {
  // Bare «1.» points beside «2.1» ones, grouped by the chapters (meta: points: 'numbered').
  const structure = parse('ch-army-structure', 'points', { points: 'numbered' });

  it('makes «ГЛАВА» the chapters and «РАЗДЕЛ» their section', () => {
    expect(structure.chapters.slice(0, 3).map((c) => [c.number, c.title, c.section])).toEqual([
      ['I', 'ОБЩИЕ ПОЛОЖЕНИЯ', 'Раздел I. ОБЩИЕ ПОЛОЖЕНИЯ И ШТАБ'],
      ['II', 'ШТАБ АРМИИ', 'Раздел I. ОБЩИЕ ПОЛОЖЕНИЯ И ШТАБ'],
      ['III', 'ГАРНИЗОННАЯ КОМЕНДАТУРА', 'Раздел II. ПОДРАЗДЕЛЕНИЯ ВООРУЖЁННЫХ СИЛ'],
    ]);
  });

  it('keeps a chapter of text alone, with no points, in its place', () => {
    expect(structure.chapters[0].preface.length).toBeGreaterThan(0);
    expect(structure.chapters.map((c) => c.number)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']);
  });

  it('reads the bare «1.» points of every chapter beside the «2.1» ones of chapter III', () => {
    expect(structure.articles).toHaveLength(60);
    expect(structure.issues).toEqual([]);
    const staff = structure.articles.find((a) => a.chapter === 'II' && a.number === '2')!;
    expect(staff.parts[0].text).toBe('Состав и подчинённость');
    expect(staff.parts.map((p) => p.text).join(' ')).toMatch(/генерал армии \(ГА\)/);
    expect(structure.articles.filter((a) => a.chapter === 'III').map((a) => a.number)).toEqual([
      '1', '2', '2.1', '2.2', '2.3', '3', '4', '4.1', '4.2', '4.3', '5', '6', '7', '8', '9',
    ]);
  });
});

describe('a section titled «1.Название.» with no space after the number (ch-news Тверского, backlog 02)', () => {
  it('titles the sections and leaves the points under them', () => {
    const doc = parseLawText(
      [
        '1.Общее положение.',
        '1.1. Вести Москвы – это ведущая новостная организация штата.',
        '1.2. Устав — это свод правил.',
        '2.Основные обязанности сотрудника Вестей Москвы.',
        '2.1. Каждый сотрудник обязан ознакомиться с Законом «О Средствах Массовой Информации».',
        '2.14 Каждый сотрудник обязан оставить отчет в разделе своего отдела.',
        '3. Сотрудникам запрещено',
        '3.1. Нарушать действующее законодательство города.',
      ].join('\n'),
      'ch-news',
      'points',
    );
    expect(doc.chapters.map((c) => [c.number, c.title])).toEqual([
      ['1', 'Общее положение'],
      ['2', 'Основные обязанности сотрудника Вестей Москвы'],
      ['3', 'Сотрудникам запрещено'],
    ]);
    // «2.14 Каждый…» is a point, not the title of section 2 written again.
    expect(doc.articles.map((a) => a.number)).toEqual(['1.1', '1.2', '2.1', '2.14', '3.1']);
  });
});

describe('a title-like point repeated with the same number (ch-mvd Кутузовского, backlog 08)', () => {
  it('reads the first as the sub-heading of the second, not as a point of its own', () => {
    const doc = parseLawText(
      [
        'Глава IX. Служебная проверка',
        '9.7. По вызову УСБ сотрудник обязан явиться.',
        '9.8. Понятие и цели служебной проверки',
        '9.8. Служебная проверка — это внутреннее разбирательство, проводимое в целях установления факта НВС.',
        '9.9. Служебная проверка проводится по решению уполномоченного руководителя.',
      ].join('\n'),
      'ch-mvd',
      'points',
    );
    expect(doc.articles.map((a) => a.number)).toEqual(['9.7', '9.8', '9.9']);
    const point = doc.articles.find((a) => a.number === '9.8')!;
    expect(point.id).toBe('ch-mvd-9.8');
    expect(point.group).toBe('Понятие и цели служебной проверки');
    expect(point.parts[0].text).toMatch(/^Служебная проверка — это/);
  });

  it('leaves two full-text points with one number (a forum typo) side by side', () => {
    const doc = parseLawText(
      [
        '4. Личный состав — совокупность всех сотрудников, стажеров и иных лиц, состоящих в штате подразделения.',
        '4. Управление — структурное подразделение, осуществляющее руководство определенным направлением деятельности.',
      ].join('\n'),
      'ch-fsb',
      'points',
    );
    expect(doc.articles).toHaveLength(2);
    expect(new Set(doc.articles.map((a) => a.id)).size).toBe(2);
  });
});
