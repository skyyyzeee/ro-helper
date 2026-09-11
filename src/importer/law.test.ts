import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLawText } from './lawText';

const root = join(import.meta.dirname, '..', '..');
const parse = (id: string) => parseLawText(readFileSync(join(root, 'data', 'tverskoi', 'sources', `${id}.txt`), 'utf8'), id, 'law');
const article = (id: string, number: string, chapter?: string) => {
  const found = parse(id).articles.find((a) => a.number === number && (chapter === undefined || a.chapter === chapter));
  if (!found) throw new Error(`${id} ст. ${number} not parsed`);
  return found;
};

/** Articles in each thread of the Тверской legislative base, counted on the forum. */
const FORUM_COUNTS: Record<string, number> = {
  const: 117, upk: 165, tk: 40, ethics: 27,
  fkz1: 46, fkz2: 35, fkz3: 14, fkz4: 135,
  fz1: 42, fz2: 23, fz3: 37, fz4: 20, fz5: 26, fz6: 32, fz7: 31,
  fz8: 40, fz9: 20, fz10: 4, fz11: 18, fz12: 10, fz13: 65, fz14: 15, fz16: 13,
  'msk-charter': 21, 'msk-health': 17, 'msk-news': 26, 'msk-property': 51,
};

describe('laws without punishments (real Тверской forum text)', () => {
  it('reads as many articles as each thread has on the forum, with nothing left unparsed', () => {
    for (const [id, count] of Object.entries(FORUM_COUNTS)) {
      const law = parse(id);
      expect({ id, articles: law.articles.length, issues: law.issues }).toEqual({ id, articles: count, issues: [] });
      expect(new Set(law.articles.map((a) => a.id)).size).toBe(count);
    }
  });

  it('an ordinary law (6-ФЗ): numbered chapters, titled articles, numbered parts and lists', () => {
    const police = parse('fz6');
    expect(police.chapters.map((c) => c.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    const rights = article('fz6', '13');
    expect(rights).toMatchObject({ id: 'fz6-13', title: 'Права полиции', chapter: '3' });
    expect(rights.parts[0]).toMatchObject({ number: '1' });
    expect(rights.parts[0].points).toHaveLength(3);
    expect(police.footer).toEqual(['Одобрен Государственной Думой 21 августа 2026 года', 'Подписан Премьер Министром РО 21 августа 2026 года']);
  });

  it('articles numbered again in each chapter (8-ФЗ): ids carry the chapter', () => {
    const weapons = parse('fz8');
    expect(weapons.articles.slice(0, 3).map((a) => [a.id, a.number])).toEqual([
      ['fz8-I-1', '1'],
      ['fz8-I-2', '2'],
      ['fz8-II-1', '1'],
    ]);
    expect(article('fz8', '1', 'I').title).toBe('Основная цель настоящего Закона');
    expect(parse('fz10').articles.map((a) => a.id)).toEqual(['fz10-I-1', 'fz10-I-2', 'fz10-II-1', 'fz10-III-1']);
  });

  it('chapters in Roman numerals (8-ФЗ)', () => {
    expect(parse('fz8').chapters.map((c) => c.number)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
    expect(parse('fz10').chapters.map((c) => c.title)).toEqual(['Общее положение', 'Положение о статусе неприкосновенности', 'Расследование в отношении неприкосновенных лиц']);
  });

  it('a section without chapters stands in for one, and a new section closes the last chapter (3-ФЗ)', () => {
    const prosecutors = parse('fz3');
    expect(prosecutors.chapters.map((c) => [c.number, c.kind ?? 'chapter'])).toEqual([
      ['I', 'section'], ['II', 'section'], ['1', 'chapter'], ['2', 'chapter'], ['3', 'chapter'], ['IV', 'section'], ['V', 'section'],
    ]);
    expect(prosecutors.chapters[2].section).toBe('Раздел III. ПРОКУРОРСКИЙ НАДЗОР');
    expect(article('fz3', '1').chapter).toBe('I');
    expect(article('fz3', '27').chapter).toBe('IV'); // not left in chapter 3
  });

  it('«Раздел 1.» inside a chapter is a sub-heading of its articles (13-ФЗ)', () => {
    expect(article('fz13', '10')).toMatchObject({ chapter: '2', group: 'Раздел 1. Права и обязанности адвоката' });
    expect(article('fz13', '16').group).toBe('Раздел 2. Адвокатский запрос');
    expect(parse('fz13').chapters.every((c) => c.section === undefined)).toBe(true);
  });

  it('takes headings as the forum writes them', () => {
    // «Статья 1» without a full stop and without a title (Конституция).
    expect(article('const', '1')).toMatchObject({ title: '', chapter: '1' });
    // «Статья 20 . Сотрудники отделов ФСБ» (5-ФЗ) and «Статья 17.1 Порядок …» (13-ФЗ).
    expect(article('fz5', '20').title).toBe('Сотрудники отделов ФСБ');
    expect(article('fz13', '17.1').title).toBe('Порядок направления адвокатского запроса');
    // «ГЛАВА 1. ОСНОВЫ КОНСТИТУЦИОННОГО СТРОЯ» in capitals.
    expect(parse('const').chapters[0]).toMatchObject({ number: '1', title: 'ОСНОВЫ КОНСТИТУЦИОННОГО СТРОЯ' });
  });

  it('numbers the parts written «ч. 1.», «ч. 1» and «Часть 1.»', () => {
    expect(article('upk', '1').parts.map((p) => p.number)).toEqual(['1', '2']);
    expect(article('fkz4', '1').parts.map((p) => p.number)).toEqual(['1', '2']);
    // «Исключение: …» after ч. 1 stays where it is, as a paragraph of its own.
    expect(article('fz8', '1', 'VIII').parts.map((p) => p.number)).toEqual(['1', undefined, '2', '3', '4']);
  });

  it('leaves the adoption lines of the Moscow laws out of the last article', () => {
    expect(parse('msk-health').footer).toEqual([
      'Настоящий Закон принят Московской городской Думой.',
      'Вступает в юридическую силу после подписания Мэром города Москвы.',
      'Нормативно-правовой акт подписан Мэром города Москвы.',
    ]);
    expect(article('msk-health', '17').parts.map((p) => p.number)).toEqual(['1', '2', '3']);
    expect(parse('msk-property').footer).toEqual(['Закон принят Мосгордумой', 'Подписан Мэром г. Москвы']);
  });
});
