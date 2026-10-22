import { describe, expect, it } from 'vitest';
import type { SearchHit } from '../core';
import { TVERSKOI_PACK } from '../data/bundled';
import { ownCharters } from './charters';
import { coreRules } from './prompt';

const pack = TVERSKOI_PACK;
const first = (document: string): SearchHit => {
  const doc = pack.documents.find((d) => d.id === document)!;
  return { document: doc, article: doc.articles[0] };
};
const org = (id: string) => pack.organizations.find((o) => o.id === id)!;
const hits = [first('uk'), first('ch-mvd'), first('ch-gibdd'), first('ch-hospital')];
const docs = (list: SearchHit[]) => list.map((h) => h.document.id);

describe('the charter of the player’s own service (idea from LEX v1.2)', () => {
  it('leaves another service’s charter out of an officer’s sources, the laws and their own charter in', () => {
    expect(docs(ownCharters(hits, pack, org('gibdd'), 'остановил машину, водитель отказался выйти'))).toEqual(['uk', 'ch-gibdd']);
  });

  it('keeps another service’s charter when the question names it', () => {
    expect(docs(ownCharters(hits, pack, org('gibdd'), 'что по уставу полиции при задержании'))).toEqual(['uk', 'ch-mvd', 'ch-gibdd']);
  });

  it('keeps every charter for a citizen and a gang: what an officer must do is in them', () => {
    expect(docs(ownCharters(hits, pack, org('none'), 'обязан ли сотрудник представиться'))).toEqual(docs(hits));
    expect(docs(ownCharters(hits, pack, org('opg'), 'обязан ли сотрудник представиться'))).toEqual(docs(hits));
    expect(docs(ownCharters(hits, pack, undefined, 'обязан ли сотрудник представиться'))).toEqual(docs(hits));
  });

  it('tells the AI the law stands over a charter', () => {
    expect(coreRules(pack, 'law')).toContain('если устав расходится с законом (S), прав закон');
  });
});
