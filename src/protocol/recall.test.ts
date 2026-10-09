import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findForSituation } from '../core';
import { PACKS } from '../data/bundled';
import { hintTerms } from './hints';
import { SOURCES } from './pipeline';
import { packInScope } from './sources';

interface Case {
  server?: string;
  situation: string;
  expect?: string[];
  category?: string;
  followUp?: unknown;
}

const { cases } = JSON.parse(readFileSync(join(import.meta.dirname, '../../eval/cases.json'), 'utf8')) as { cases: Case[] };

/**
 * The exam's situations searched with no AI at all — the player's words and the hints: what the search alone brings
 * to the AI. A miss here is the AI's phrases to make up, so it should stay rare.
 */
function missed(withHints: boolean): string[] {
  return cases
    .filter((c) => c.expect?.length && !c.followUp && c.category !== 'MIXED')
    .filter((c) => {
      const pack = PACKS[c.server ?? 'tverskoi'];
      const scope = c.category === 'SERVER_RULE' ? 'server_rule' : 'law';
      const hits = findForSituation(packInScope(pack, scope), c.situation, { limit: SOURCES, lawTerms: withHints ? hintTerms(c.situation) : [] });
      const refs = hits.map((h) => `${h.document.short} ${h.article.number}`);
      return !c.expect!.every((e) => e.split('|').some((alt) => refs.includes(alt.trim())));
    })
    .map((c) => c.situation);
}

describe('the search alone, before the AI', () => {
  it('brings the right article for nearly every situation of the exam, the hints helping', () => {
    const before = missed(false).length;
    const after = missed(true);
    expect(after.length).toBeLessThan(before);
    expect(after.length).toBeLessThanOrEqual(2);
  });
});

describe('the hints: the law\'s words for everyday ones', () => {
  it.each([
    ['Инспектор ДПС взял 20 000, чтобы не выписывать штраф', 'взятка'],
    ['Задержанный предложил сотруднику 50к, чтобы тот его отпустил', 'дача взятки'],
    ['Водитель ехал 140 км/ч по городу', 'превышение скорости'],
    ['Мужчина пообещал убить бывшую жену', 'угроза убийством'],
    ['Мент избил задержанного дубинкой', 'превышение должностных полномочий'],
    ['У него нашли пистолет, лицензии на оружие нет', 'незаконное хранение оружия'],
    ['Поставил машину на пешеходном переходе', 'стоянка'],
    ['Спалил инфу из дискорда в игре', 'OOC информации'],
    ['Обматерил сотрудника полиции', 'оскорбление представителя власти'],
    ['При задержании хочу зачитать миранду — что зачитывать?', 'разъяснение прав задержанному'],
    ['Сотрудник не разъяснил мне права', 'права задержанного'],
    ['Машина проехала перекрёсток на красный сигнал светофора', 'проезд на запрещающий сигнал'],
    ['Что дадут по правилам сервера за оскорбление родных в войсе?', 'оскорбление родственников'],
    ['Обматерил его мамку в голосовом чате', 'оскорбление родственников'],
  ])('«%s» → %s', (text, term) => {
    expect(hintTerms(text)).toContain(term);
  });

  it('says nothing of what it does not know, and does not take a word inside another for a whole one', () => {
    expect(hintTerms('Игрок незаметно вытащил у прохожего телефон')).toEqual([]);
    // «документ» holds «мент», «копия» holds «коп»: no officer in them.
    expect(hintTerms('Он показал документ и ударил по столу')).toEqual([]);
  });
});
