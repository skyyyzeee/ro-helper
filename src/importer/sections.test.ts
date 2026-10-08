import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLawText } from './lawText';

const root = join(import.meta.dirname, '..', '..');
const parse = (server: string) =>
  parseLawText(readFileSync(join(root, 'data', server, 'sources', 'rules-server.txt'), 'utf8'), 'rules-server', 'sections');

describe('the additional rules of a server: titled sections (real forum text)', () => {
  it('takes each section marked on the forum for an article of its own, titled and numbered by its place', () => {
    expect(parse('tverskoi').articles.map((a) => [a.number, a.title])).toEqual([['1', 'AirDrop'], ['2', 'Нападение на Форт']]);
    expect(parse('arbatskiy').articles.map((a) => a.title)).toEqual(['Нападение на военную базу', 'Правила перехвата поставок', 'Правила войны за AirDrop']);
    expect(parse('kutuzovskiy').articles.map((a) => a.title)).toEqual(['Нападение на военную базу', 'Правила войны за AirDrop']);
  });

  it('keeps the lines of a section as its paragraphs, and what follows «|» as its punishment, told once', () => {
    const fort = parse('tverskoi').articles[1];
    expect(fort.parts.map((p) => p.text).slice(0, 2)).toEqual(['График нападения:', 'Дни: Понедельник, Среда, Пятница, Суббота.']);
    const supply = parse('arbatskiy').articles[1];
    expect(supply.parts.map((p) => p.text).at(-1)).toBe('Максимальное количество участников со стороны государственных организаций - 70 человек.');
    expect(supply.notes).toEqual([
      { label: 'Наказание', text: 'Demorgan 45 минут / Выговор лидеру(-ам) при превышении лимита.' },
      { label: 'Примечание', text: 'включая Армию.' },
    ]);
  });
});

describe('sections named by a pattern where the forum lost its list numbers (real forum text)', () => {
  const parseWith = (server: string, id: string) => {
    const meta = JSON.parse(readFileSync(join(root, 'data', server, 'sources', `${id}.meta.json`), 'utf8'));
    return parseLawText(readFileSync(join(root, 'data', server, 'sources', `${id}.txt`), 'utf8'), id, 'sections', { headings: meta.headings });
  };

  it('numbers a section by its own number, and keeps a number written twice apart (УСБ ФСБ: «XI»)', () => {
    const usb = parseWith('arbatskiy', 'ch-fsb-usb');
    expect(usb.articles.slice(0, 2).map((a) => [a.number, a.title])).toEqual([['I', 'Общие положения'], ['II', 'Основные задачи УСБ ФСБ России']]);
    expect(usb.articles.filter((a) => a.number === 'XI').map((a) => a.title)).toEqual(['Порядок взаимодействия', 'Заключительные положения']);
    expect(new Set(usb.articles.map((a) => a.id)).size).toBe(usb.articles.length);
  });

  it('takes only the title lines for sections, not the lines a zero-width space happens to end (подразделения МВД)', () => {
    const units = parseWith('kutuzovskiy', 'ch-mvd-units');
    expect(units.articles.map((a) => a.number)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(units.articles[0]).toMatchObject({ title: 'ОД — Отдел дознания' });
    expect(units.articles[0].parts[0].text).toBe('Функции:');
  });
});
