import { describe, expect, it } from 'vitest';
import type { Organization } from '../core';
import { PHRASES_MAX, PHRASE_TEXT_MAX, cleanPhrases, defaultPhrases, fillPhrase } from './phrases';

const GIBDD: Organization = { id: 'gibdd', name: 'ГИБДД', kind: 'state', force: true, documents: [] };
const MVD: Organization = { id: 'mvd', name: 'МВД', kind: 'state', force: true, documents: [] };
const HOSPITAL: Organization = { id: 'hospital', name: 'Больница', kind: 'state', documents: [] };

describe('phrases for the chat (issue #40)', () => {
  it('gives the traffic police a set of their own, the other forces one to share, the rest none', () => {
    expect(defaultPhrases(GIBDD).map((p) => p.title)).toContain('Требование остановиться');
    expect(defaultPhrases(MVD).map((p) => p.title)).toContain('Задержание');
    expect(defaultPhrases(MVD).map((p) => p.title)).not.toContain('Требование остановиться');
    expect(defaultPhrases(HOSPITAL)).toEqual([]);
    expect(defaultPhrases(undefined)).toEqual([]);
  });

  it('keeps the ready sets within what a list may hold, each phrase its own', () => {
    for (const organization of [GIBDD, MVD]) {
      const set = defaultPhrases(organization);
      expect(cleanPhrases(set)).toEqual(set);
      expect(new Set(set.map((p) => p.id)).size).toBe(set.length);
    }
  });

  it('puts the profile’s words into a phrase', () => {
    const who = { player: { position: 'Сержант', gameName: 'Ivan_Petrov' }, organization: 'ГИБДД' };
    expect(fillPhrase('Здравствуйте. {должность} {имя}, {организация}.', who)).toBe('Здравствуйте. Сержант Ivan_Petrov, ГИБДД.');
  });

  it('leaves no gap where the profile has nothing', () => {
    expect(fillPhrase('Здравствуйте. {должность} {имя}, {организация}.', { organization: 'ГИБДД' })).toBe('Здравствуйте. ГИБДД.');
    expect(fillPhrase('Здравствуйте. {должность} {имя}, {организация}.', { player: { gameName: 'Ivan_Petrov' } })).toBe('Здравствуйте. Ivan_Petrov.');
    // What the player is to finish themselves keeps its space.
    expect(fillPhrase('Причина остановки: ', {})).toBe('Причина остановки: ');
  });

  it('cleans a list before it is kept: trimmed, cut, the empty ones and the ones past the limit dropped', () => {
    const many = Array.from({ length: PHRASES_MAX + 5 }, (_, i) => ({ id: `p${i}`, title: ` Фраза ${i} `, text: 'x'.repeat(PHRASE_TEXT_MAX + 50) }));
    const clean = cleanPhrases([{ id: 'empty', title: '  ', text: 'текст' }, { id: 'blank', title: 'Пусто', text: '   ' }, ...many]);
    expect(clean).toHaveLength(PHRASES_MAX);
    expect(clean[0]).toEqual({ id: 'p0', title: 'Фраза 0', text: 'x'.repeat(PHRASE_TEXT_MAX) });
  });
});
