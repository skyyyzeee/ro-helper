import { describe, expect, it } from 'vitest';
import { neighbours, pick, rubles, tagsOf } from './catalog';
import { FRESH, STATE_ALLOWED, type WikiData, type WikiEntry } from './model';

const entry = (id: string, patch: Partial<WikiEntry>): WikiEntry => ({ id, catalog: 'vehicles', title: id, facts: [], tags: [], sources: [], url: 'https://wiki.russia.online/ru', ...patch });
const data: WikiData = {
  takenAt: '2026-10-06T00:00:00Z',
  source: 'https://wiki.russia.online/ru',
  catalogs: [],
  entries: [
    entry('m5', { title: 'Blau & Weiss M5 F90', subtitle: 'BMW M5 F90', group: 'car', price: 9_700_000, createdAt: '2026-09-01', tags: ['Можно передать'] }),
    entry('samara', { title: 'TAZ 2114', subtitle: 'LADA Samara', group: 'car', price: 300_000, createdAt: '2026-10-01', tags: [FRESH, 'Можно передать'] }),
    entry('bike', { title: 'Велосипед', group: 'bicycle', createdAt: '2026-08-01' }),
    entry('curls', { catalog: 'haircuts', title: 'Лохматые кудри', gender: 'male', group: 'state', tags: [STATE_ALLOWED] }),
    entry('braid', { catalog: 'haircuts', title: 'Коса', gender: 'female', group: 'other' }),
  ],
};

describe('the wiki\'s catalog, picked', () => {
  it('by catalog and tab, newest first; by price either way; by name', () => {
    expect(pick(data, { catalog: 'vehicles' }).map((e) => e.id)).toEqual(['samara', 'm5', 'bike']);
    expect(pick(data, { catalog: 'vehicles', group: 'car', sort: 'expensive' }).map((e) => e.id)).toEqual(['m5', 'samara']);
    // Nothing to pay for goes last when the cheapest come first.
    expect(pick(data, { catalog: 'vehicles', sort: 'cheap' }).map((e) => e.id)).toEqual(['samara', 'm5', 'bike']);
    // In Russian order: Cyrillic first.
    expect(pick(data, { catalog: 'vehicles', sort: 'name' }).map((e) => e.id)).toEqual(['bike', 'm5', 'samara']);
  });

  it('by words — in the name or the line under it, «ё» as «е» — and by every tag ticked', () => {
    expect(pick(data, { words: 'bmw f90' }).map((e) => e.id)).toEqual(['m5']);
    expect(pick(data, { words: 'лохматые' }).map((e) => e.id)).toEqual(['curls']);
    expect(pick(data, { catalog: 'vehicles', tags: [FRESH, 'Можно передать'] }).map((e) => e.id)).toEqual(['samara']);
  });

  it('men\'s or women\'s where the catalog is split; the haircuts the state allows are a filter', () => {
    expect(pick(data, { catalog: 'haircuts', gender: 'female' }).map((e) => e.id)).toEqual(['braid']);
    expect(tagsOf(data, 'haircuts')).toEqual([{ tag: STATE_ALLOWED, count: 1 }]);
    // A tag every entry has filters nothing: not offered.
    expect(tagsOf({ ...data, entries: data.entries.filter((e) => e.id === 'curls') }, 'haircuts')).toEqual([]);
  });

  it('others of its tab, and prices as the wiki writes them', () => {
    expect(neighbours(data, data.entries[0]).map((e) => e.id)).toEqual(['samara']);
    // The game's money is the ruble, as the rest of the app writes it.
    expect(rubles(9_700_000).replace(/\s/g, ' ')).toBe('9 700 000 ₽');
  });
});
