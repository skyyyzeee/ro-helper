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
    expect(TVERSKOI_PACK).toEqual(pack);
  });

  it('carries the source and the date the law is current as of', () => {
    const uk = TVERSKOI_PACK.documents.find((d) => d.id === 'uk');
    expect(uk?.source).toMatchObject({ thread: 1176, lastEdited: '2026-09-06T19:38:37+03:00' });
    expect(uk).toMatchObject({ kind: 'penal-code', category: 'codes' });
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'koap')?.source.lastEdited).toBe('2026-08-27T23:08:51+03:00');
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'pdd')?.source.lastEdited).toBe('2026-08-30T23:07:15+03:00');
    // Never edited since posting: current as of the post itself.
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'fkz2')?.source).toMatchObject({ thread: 14682, lastEdited: '2026-09-02T21:44:37+03:00' });
    expect(TVERSKOI_PACK.server).toEqual({ id: 'tverskoi', name: 'Тверской', status: 'active' });
    // The version is the newest edit: the Army charters, 11 September. No law has changed since the pack was first built.
    expect(TVERSKOI_PACK.version).toBe('2026-09-11T12:14:23+03:00');
    expect(TVERSKOI_PACK.changes).toEqual([]);
  });

  it('holds the legislative base, the charters of the organisations and the project rules: 49 documents', () => {
    expect(TVERSKOI_PACK.documents.map((d) => d.short)).toEqual([
      'Конституция', 'УК', 'КоАП', 'ПДД', 'УПК', 'ТК', 'Этика',
      '1-ФКЗ', '2-ФКЗ', '3-ФКЗ', '4-ФКЗ',
      '1-ФЗ', '2-ФЗ', '3-ФЗ', '4-ФЗ', '5-ФЗ', '6-ФЗ', '7-ФЗ', '8-ФЗ', '9-ФЗ', '10-ФЗ', '11-ФЗ', '12-ФЗ', '13-ФЗ', '14-ФЗ', '16-ФЗ',
      'Москва', 'Москва', 'Москва', 'Москва',
      'Устав', 'Устав', 'Регламент', 'Устав', 'Устав', 'Устав',
      'Положение', 'Положение', 'Положение', 'Положение', 'Положение', 'Положение', 'Положение', 'Положение',
      'Устав', 'Устав',
      'Правила', 'Правила', 'Правила',
    ]);
    expect(TVERSKOI_PACK.documents.filter((d) => d.kind === 'penal-code').map((d) => d.id)).toEqual(['uk', 'koap']);
    const byCategory = (category: string) => TVERSKOI_PACK.documents.filter((d) => d.category === category).length;
    expect(['codes', 'fkz', 'fz', 'moscow', 'charters', 'rules'].map(byCategory)).toEqual([7, 4, 15, 4, 16, 3]);
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
    expect(TVERSKOI_PACK.organizations.find((o) => o.id === 'gibdd')?.documents).toEqual(['pdd', 'koap', 'ch-gibdd', 'fz6']);
  });
});
