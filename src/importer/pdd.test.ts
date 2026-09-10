import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLawText } from './lawText';

const root = join(import.meta.dirname, '..', '..');
const text = readFileSync(join(root, 'data', 'tverskoi', 'sources', 'pdd.txt'), 'utf8');
const pdd = parseLawText(text, 'pdd', 'traffic-rules');
const article = (number: string) => {
  const found = pdd.articles.find((a) => a.number === number);
  if (!found) throw new Error(`п. ${number} not parsed`);
  return found;
};

describe('ПДД Тверского (real forum text)', () => {
  it('reads 15 chapters in Roman numerals and 116 untitled articles, without sanctions', () => {
    expect(pdd.chapters.map((c) => c.number)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']);
    expect(pdd.articles).toHaveLength(116);
    expect(pdd.articles[0].number).toBe('1.1');
    expect(pdd.articles.at(-1)?.number).toBe('15.19');
    expect(pdd.articles.every((a) => a.title === '')).toBe(true);
    expect(pdd.articles.some((a) => a.parts.some((p) => p.punishment))).toBe(false);
    expect(pdd.issues).toEqual([]);
  });

  it('puts articles under the sub-headings that precede them', () => {
    expect(article('3.1').group).toBe('Специальные сигналы');
    expect(article('3.7').group).toBe('Аварийные сигналы');
    expect(article('11.4').group).toBe('Регулируемые перекрестки');
    expect(article('11.7').group).toBe('Нерегулируемые перекрестки');
    expect(article('12.1').group).toBeUndefined();
    // A long last line without a full stop is still article text, not a heading.
    expect(article('4.8').parts[0].text.startsWith('При приближении транспортных средств')).toBe(true);
  });

  it('keeps lists, sub-numbered parts and notes', () => {
    expect(article('1.2').parts[0].points).toHaveLength(24);
    expect(article('1.2').parts[0].points[0]).toEqual({ marker: '1', text: 'велосипедист - лицо, управляющее велосипедом;' });
    expect(article('15.5').parts.map((p) => p.number)).toEqual(['15.5.1', '15.5.2']);
    expect(article('3.6').parts[0].points.map((p) => p.marker)).toEqual(['а', 'б', 'в', 'г', 'д']);
    expect(article('3.6').notes).toHaveLength(1);
  });

  it('leaves the appendix reference and adoption lines out of the last article', () => {
    expect(pdd.footer).toEqual([
      'Приложение к ПДД - дорожные знаки, разметка и пр.',
      'Принят Государственной Думой 27 августа 2026 года',
      'Подписан Премьер-Министром РО 27 августа 2026 года',
    ]);
    expect(article('15.19').parts).toHaveLength(1);
  });
});
