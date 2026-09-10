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
    expect(TVERSKOI_PACK.documents.map((d) => `${d.short}:${d.kind}`)).toEqual(['УК:penal-code', 'КоАП:penal-code', 'ПДД:law']);
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'koap')?.source.lastEdited).toBe('2026-08-27T23:08:51+03:00');
    expect(TVERSKOI_PACK.documents.find((d) => d.id === 'pdd')?.source.lastEdited).toBe('2026-08-30T23:07:15+03:00');
    expect(TVERSKOI_PACK.server).toEqual({ id: 'tverskoi', name: 'Тверской', status: 'active' });
    expect(TVERSKOI_PACK.version).toBe('2026-09-06');
  });
});
