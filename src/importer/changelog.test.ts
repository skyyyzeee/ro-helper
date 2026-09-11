import { describe, expect, it } from 'vitest';
import type { DocumentChange, LawDocument, ServerPack } from '../core';
import { TVERSKOI_PACK } from '../data';
import { KEEP_DAYS, compareImports, nextChangelog } from './changelog';

const uk = TVERSKOI_PACK.documents.find((d) => d.id === 'uk')!;
const koap = TVERSKOI_PACK.documents.find((d) => d.id === 'koap')!;
const pack = (...documents: LawDocument[]): Pick<ServerPack, 'documents'> => ({ documents });

function reworded(document: LawDocument, lastEdited?: string): LawDocument {
  const next = structuredClone(document);
  next.articles[0].parts[0].text += ' (новая редакция)';
  if (lastEdited) next.source.lastEdited = lastEdited;
  return next;
}

describe('the import report', () => {
  it('has nothing to compare on the first import', () => {
    expect(compareImports(undefined, TVERSKOI_PACK)).toEqual({ laws: [], parser: [] });
  });

  it('counts a change to a document whose forum post was edited as a change to the laws', () => {
    const report = compareImports(pack(uk, koap), pack(reworded(uk, '2026-09-20T10:00:00+03:00'), koap));
    expect(report.laws.map((d) => d.documentId)).toEqual(['uk']);
    expect(report.parser).toEqual([]);
  });

  it('puts a difference in a document the forum did not touch down to the parser, not the laws', () => {
    const report = compareImports(pack(uk, koap), pack(uk, reworded(koap)));
    expect(report.laws).toEqual([]);
    expect(report.parser.map((d) => d.documentId)).toEqual(['koap']);
  });

  it('counts a document that came or went as a change to the laws', () => {
    expect(compareImports(pack(uk), pack(uk, koap)).laws.map((d) => [d.kind, d.documentId])).toEqual([['added', 'koap']]);
    expect(compareImports(pack(uk, koap), pack(uk)).laws.map((d) => [d.kind, d.documentId])).toEqual([['removed', 'koap']]);
  });
});

describe('the changelog after an import', () => {
  const change = (documentId: string): DocumentChange => ({ documentId, short: documentId, title: documentId, kind: 'changed', articles: [] });

  it('puts the new changes on top and keeps the earlier ones', () => {
    const earlier = [{ version: '2026-09-01T10:00:00+03:00', documents: [change('uk')] }];
    expect(nextChangelog(earlier, '2026-09-20T10:00:00+03:00', [change('koap')])).toEqual([
      { version: '2026-09-20T10:00:00+03:00', documents: [change('koap')] },
      ...earlier,
    ]);
  });

  it('adds nothing when the laws did not change', () => {
    const earlier = [{ version: '2026-09-01T10:00:00+03:00', documents: [change('uk')] }];
    expect(nextChangelog(earlier, '2026-09-01T10:00:00+03:00', [])).toEqual(earlier);
    expect(nextChangelog([], '2026-09-01T10:00:00+03:00', [])).toEqual([]);
  });

  it(`drops updates older than ${KEEP_DAYS} days`, () => {
    const earlier = [
      { version: '2026-08-01T10:00:00+03:00', documents: [change('uk')] },
      { version: '2026-05-01T10:00:00+03:00', documents: [change('pdd')] },
    ];
    expect(nextChangelog(earlier, '2026-09-20T10:00:00+03:00', [change('koap')]).map((e) => e.version)).toEqual([
      '2026-09-20T10:00:00+03:00',
      '2026-08-01T10:00:00+03:00',
    ]);
  });

  it('joins changes of the same version, a document changed again replaced', () => {
    const earlier = [{ version: '2026-09-20T10:00:00+03:00', documents: [change('uk'), change('pdd')] }];
    const again = { ...change('uk'), kind: 'removed' as const };
    expect(nextChangelog(earlier, '2026-09-20T10:00:00+03:00', [again, change('koap')])).toEqual([
      { version: '2026-09-20T10:00:00+03:00', documents: [again, change('koap'), change('pdd')] },
    ]);
  });
});
