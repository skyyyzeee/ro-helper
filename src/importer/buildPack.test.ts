import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { buildPack } from './buildPack';
import { TVERSKOI } from './servers';

describe('bundled Тверской pack', () => {
  it('is exactly what the importer builds from the saved snapshots (run `npm run import` after changing sources)', () => {
    const root = join(import.meta.dirname, '..', '..');
    const { pack, issues } = buildPack(join(root, 'data', 'tverskoi'), TVERSKOI);
    expect(issues).toEqual([]);
    // Only when the pack was built is the importer's to set, as it saves the pack.
    const { built, ...bundled } = TVERSKOI_PACK;
    expect(built).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bundled).toEqual(pack);
  });

  it('carries the source and the date the law is current as of', () => {
    const uk = TVERSKOI_PACK.documents.find((d) => d.id === 'uk');
    expect(uk?.source).toMatchObject({ thread: 1176, lastEdited: '2026-10-08T03:59:49+03:00' });
    expect(uk).toMatchObject({ kind: 'penal-code', category: 'codes' });
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'koap')?.source.lastEdited).toBe('2026-10-02T23:02:47+03:00');
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'pdd')?.source.lastEdited).toBe('2026-09-29T20:47:25+03:00');
    // Never edited since posting: current as of the post itself.
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'fz16-fsvng')?.source).toMatchObject({ thread: 26674, lastEdited: '2026-09-21T20:05:46+03:00' });
    expect(TVERSKOI_PACK.server).toEqual({ id: 'tverskoi', name: 'Тверской', status: 'active' });
    // The laws and charters checked on 27 September were edited from 21 to 26 September — before the version already
    // out (the project rules, dated by the check at 21:58) — so their entry, and the version, are the time of the import;
    // so are the documents of the organisations added after them, posted long before.
    expect(TVERSKOI_PACK.version).toBe('2026-10-08T03:59:49+03:00');
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'ch-mvd')?.source).toMatchObject({ thread: 27660 });
    expect(TVERSKOI_PACK.changes.map((c) => c.version)).toEqual([
      '2026-10-08T03:59:49+03:00', '2026-09-27T23:04:03+03:00', '2026-09-27T22:38:20+03:00', '2026-09-27T21:58:06+03:00', '2026-09-24T15:52:15+03:00', '2026-09-11T12:14:23+03:00',
    ]);
    // Checked on 8 October: the УК's new ст. 64.1 came with no later edit date on the forum — dated by the check.
    expect(TVERSKOI_PACK.changes[0].documents.map((d) => d.documentId)).toEqual(expect.arrayContaining(['uk', 'koap', 'ch-hospital', 'rules-main']));
    expect(TVERSKOI_PACK.changes[1].documents.map((d) => d.documentId)).toEqual(['ch-army-structure', 'ch-army-id', 'ch-gov']);
    expect(TVERSKOI_PACK.changes[2].documents.some((d) => d.documentId === 'uk')).toBe(true);
    expect(TVERSKOI_PACK.changes[3].documents.every((d) => d.documentId.startsWith('rules-'))).toBe(true);
    expect(TVERSKOI_PACK.changes[4].documents.map((d) => d.documentId)).toEqual(['ch-mvd']);
    expect(TVERSKOI_PACK.changes[5].documents.every((d) => d.kind === 'added' && d.documentId.startsWith('rules-'))).toBe(true);
    expect(TVERSKOI_PACK.changes[5].documents).toHaveLength(10);
  });

  it('holds the legislative base, the charters of the organisations and the project rules: 66 documents', () => {
    expect(TVERSKOI_PACK.documents.map((d) => d.short)).toEqual([
      'Конституция', 'УК', 'КоАП', 'ПДД', 'УПК', 'ТК', 'Этика',
      '1-ФКЗ', '2-ФКЗ', '3-ФКЗ', '4-ФКЗ',
      '1-ФЗ', '2-ФЗ', '3-ФЗ', '4-ФЗ', '5-ФЗ', '6-ФЗ', '7-ФЗ', '8-ФЗ', '9-ФЗ', '10-ФЗ', '11-ФЗ', '12-ФЗ', '13-ФЗ', '14-ФЗ', '15-ФЗ', '16-ФЗ', '16-ФЗ',
      'Москва', 'Москва', 'Москва', 'Москва',
      'Устав', 'Устав', 'Регламент', 'Устав', 'Устав', 'Устав',
      'Положение', 'Порядок',
      'Положение', 'Положение', 'Положение', 'Положение', 'Положение', 'Положение', 'Положение', 'Положение',
      'Устав', 'Устав', 'Устав',
      'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила', 'Правила',
      'Правила', 'Правила',
    ]);
    expect(TVERSKOI_PACK.documents.filter((d) => d.kind === 'penal-code').map((d) => d.id)).toEqual(['uk', 'koap']);
    const byCategory = (category: string) => TVERSKOI_PACK.documents.filter((d) => d.category === category).length;
    expect(['codes', 'fkz', 'fz', 'moscow', 'charters', 'rules'].map(byCategory)).toEqual([7, 4, 17, 4, 19, 15]);
    // Every organisation's documents are in the pack now.
    for (const organization of TVERSKOI_PACK.organizations) {
      for (const id of organization.documents) expect(TVERSKOI_PACK.documents.map((d) => d.id)).toContain(id);
    }
  });

  it('lists the thirteen organisations to choose from, each pointing at Тверской documents', () => {
    expect(TVERSKOI_PACK.organizations.map((o) => o.name)).toEqual([
      'МВД', 'ГИБДД', 'ФСБ', 'ФСО', 'Армия / Росгвардия', 'Следственный комитет', 'Прокуратура',
      'Суд', 'Правительство', 'Больница', 'Вести Москвы', 'ОПГ', 'Без организации',
    ]);
    expect(TVERSKOI_PACK.organizations.find((o) => o.id === 'gibdd')?.documents).toEqual(['pdd', 'koap', 'fz15', 'ch-gibdd', 'fz6']);
  });
});
