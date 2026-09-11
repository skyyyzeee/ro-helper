import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLawText, type LawFormat } from './lawText';

const root = join(import.meta.dirname, '..', '..');
const parse = (id: string, format: LawFormat = 'points') =>
  parseLawText(readFileSync(join(root, 'data', 'tverskoi', 'sources', `${id}.txt`), 'utf8'), id, format);
const point = (id: string, number: string, chapter?: string) => {
  const found = parse(id).articles.find((a) => a.number === number && (chapter === undefined || a.chapter === chapter));
  if (!found) throw new Error(`${id} п. ${number} not parsed`);
  return found;
};

/** Points of the charters, regulations and rules written in points, and articles of those written in articles. */
const COUNTS: [string, LawFormat, number][] = [
  ['ch-mvd', 'points', 80], ['ch-gibdd', 'points', 126], ['ch-fso', 'points', 97], ['ch-hospital', 'points', 224], ['ch-news', 'points', 157],
  ['sk-main', 'points', 39], ['sk-gsu', 'points', 51], ['sk-inspections', 'points', 20], ['sk-ranks', 'points', 12],
  ['rules-main', 'points', 96], ['rules-gov', 'points', 117], ['rules-crime', 'points', 49],
  ['ch-army', 'law', 60], ['ch-army-discipline', 'law', 37], ['ch-army-guard', 'law', 44],
  ['sk-uniform', 'law', 11], ['sk-ethics', 'law', 10], ['sk-kso', 'law', 10], ['sk-appeals', 'law', 14],
];

describe('charters, regulations and project rules (real Тверской forum text)', () => {
  it('reads every point, with unique ids and nothing left unparsed', () => {
    for (const [id, format, count] of COUNTS) {
      const doc = parse(id, format);
      expect({ id, count: doc.articles.length, issues: doc.issues }).toEqual({ id, count, issues: [] });
      expect(new Set(doc.articles.map((a) => a.id)).size).toBe(count);
    }
  });

  it('a charter in chapters and points (МВД): the table of contents is not taken for chapters', () => {
    const mvd = parse('ch-mvd');
    expect(mvd.chapters).toHaveLength(13);
    expect(mvd.chapters[0]).toMatchObject({ number: 'I', title: 'ОБЩИЕ ПОЛОЖЕНИЯ' });
    const tasks = point('ch-mvd', '1.2');
    expect(tasks).toMatchObject({ chapter: 'I', title: '' });
    expect(tasks.parts.map((p) => p.text).slice(0, 3)).toEqual(['Основными задачами МВД являются:', '• охрана общественного порядка;', '• патрулирование;']);
    // Where points are «1.1», «1. Генерал» is an item of a list (the ranks), not a point.
    expect(mvd.articles.every((a) => a.number.includes('.'))).toBe(true);
  });

  it('a number written twice in one chapter keeps its place in the ids (ГИБДД 4.2.1)', () => {
    const repeated = parse('ch-gibdd').articles.filter((a) => a.number === '4.2.1').map((a) => a.id);
    expect(repeated).toEqual(['ch-gibdd-IV-4.2.1', 'ch-gibdd-IV-4.2.1~2']);
  });

  it('a date is no point («22.08.2026»)', () => {
    expect(parse('ch-hospital').articles.some((a) => /^\d{2}\.\d{2}\.\d{3,}/.test(a.number))).toBe(false);
  });

  it('«1.1 | текст» and chapters known only from the contents (ГИБДД)', () => {
    const gibdd = parse('ch-gibdd');
    expect(gibdd.chapters.map((c) => c.number)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
    expect(point('ch-gibdd', '1.1', 'I').parts[0].text.startsWith('Настоящий устав — это')).toBe(true);
    expect(point('ch-gibdd', '4.1').chapter).toBe('IV');
    // Points on leave numbered 8.x inside chapter IV stay where they stand.
    expect(point('ch-gibdd', '8.2', 'IV').chapter).toBe('IV');
    expect(point('ch-gibdd', '5.1').chapter).toBe('V');
  });

  it('a numbered heading in capitals, punishments after «|» and «➤ Исключение к п. …» (больница)', () => {
    expect(parse('ch-hospital').chapters[0]).toMatchObject({ number: '1', title: 'ОБЩИЕ ПОЛОЖЕНИЯ БОЛЬНИЦЫ' });
    expect(point('ch-hospital', '5.37').notes).toEqual([{ label: 'Наказание', text: 'Строгий выговор / Строгий выговор 2/3' }]);
    expect(point('ch-hospital', '5.42').notes.map((n) => n.label)).toEqual(['Наказание', 'Исключение', 'Исключение']);
  });

  it('regulations in sections and numbered paragraphs, signed at the end (Положение о СК)', () => {
    const sk = parse('sk-main');
    expect(sk.chapters.map((c) => [c.number, c.kind])).toEqual([['I', 'section'], ['II', 'section'], ['III', 'section'], ['IV', 'section']]);
    expect(point('sk-main', '1').chapter).toBe('I');
    expect(sk.footer[0]).toBe('Председатель');
    // «Раздел II» written twice (служебные проверки): the second is III by its points.
    expect(parse('sk-inspections').chapters.map((c) => c.number)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
    expect(point('sk-inspections', '3.1').chapter).toBe('III');
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

  it('Army charters and four СК regulations are written in articles', () => {
    expect(parse('ch-army', 'law').articles[0]).toMatchObject({ id: 'ch-army-1.1', title: 'Соблюдение Устава' });
    expect(parse('ch-army-guard', 'law').articles[0]).toMatchObject({ number: '1', title: '' });
    // A line under «РАЗДЕЛ II» before its first article is the section’s introduction.
    expect(parse('sk-uniform', 'law').chapters[1].preface).toEqual(['Для личного состава СК РО устанавливаются следующие образцы служебной формы одежды:']);
  });
});
