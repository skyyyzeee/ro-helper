import { describe, expect, it } from 'vitest';
import { calculateDetention, searchArticles, type Charge } from '../core';
import { TVERSKOI_PACK } from '../data/bundled';
import { reportText } from './report';

const pack = TVERSKOI_PACK;
const charge = (query: string): Charge => {
  const [hit] = searchArticles(pack, query);
  return { article: hit.article, document: hit.document, part: hit.part ?? hit.article.parts[0], stage: 'done' } as Charge;
};
const NOW = new Date('2026-10-06T18:40:00Z');

describe('a report out of the calculator (issue #40)', () => {
  it('fills in the charges and what the calculator counted, and leaves the rest to the officer', () => {
    const result = calculateDetention([charge('ук 65 ч 1')], { mode: 'custody', offender: 'citizen' }, pack.calculator!);
    const text = reportText({ result, server: 'Тверской', organization: 'МВД', player: { gameName: 'Ivan_Petrov', position: 'Сержант' }, now: NOW });
    expect(text.split('\n')).toEqual([
      'РАПОРТ',
      '06.10.2026, 21:40 (МСК) · Тверской · МВД',
      '',
      'Составил: Сержант Ivan_Petrov',
      'Задержанный: ____________________',
      '',
      `Обвинение: ${result.charge}`,
      'Наказание: лишение свободы на 30 мес · розыск ★★★ · залог 75 000 ₽',
      '',
      'Обстоятельства (что произошло):',
      '____________________',
      '',
      'Подпись: Сержант Ivan_Petrov',
    ]);
  });

  it('leaves the officer a blank where the profile has no name', () => {
    const result = calculateDetention([charge('ук 65 ч 1')], { mode: 'custody', offender: 'citizen' }, pack.calculator!);
    const text = reportText({ result, server: 'Тверской', organization: 'МВД', now: NOW });
    expect(text).toContain('Составил: ____________________');
  });
});
