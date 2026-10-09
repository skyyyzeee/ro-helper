import { describe, expect, it } from 'vitest';
import digests from '../data/charters.json';
import { PACKS, TVERSKOI_PACK } from '../data/bundled';
import { charterCards, pointArticle, type CharterDigest } from './charter';

const all = digests as unknown as Record<string, CharterDigest>;

describe('charter digests', () => {
  it('rest on points that are in the charters, for an organisation of the server', () => {
    for (const [server, digest] of Object.entries(all)) {
      const pack = PACKS[server];
      expect(pack, server).toBeDefined();
      for (const [organization, sections] of Object.entries(digest.organizations)) {
        expect(pack.organizations.some((o) => o.id === organization), `${server}/${organization}`).toBe(true);
        for (const section of sections) {
          const document = pack.documents.find((d) => d.id === section.document);
          expect(document, `${server}/${section.document}`).toBeDefined();
          expect(digest.edited[section.document], `${server}/${section.document} edited`).toBeTruthy();
          for (const point of section.points) expect(pointArticle(document!, point), `${server}/${section.document} п. ${point}`).toBeDefined();
          expect(section.items?.length || section.text, `${server}/${organization}/${section.kind}`).toBeTruthy();
        }
      }
    }
  });

  it('give an organisation its cards with the articles they cite', () => {
    const cards = charterCards(TVERSKOI_PACK, all.tverskoi, 'mvd');
    expect(cards.map((c) => c.kind)).toEqual(['ranks', 'chain', 'address', 'hours', 'penalties']);
    expect(cards[0].items).toContain('Генерал');
    expect(cards[0].articles.map((a) => a.number)).toEqual(['15.1']);
    expect(cards.every((c) => !c.stale)).toBe(true);
  });

  it('point a chapter-numbered charter by its chapter', () => {
    const gov = TVERSKOI_PACK.documents.find((d) => d.id === 'ch-gov')!;
    expect(pointArticle(gov, '1')).toBeUndefined();
    expect(pointArticle(gov, 'III/1')?.chapter).toBe('III');
  });

  it('flag a charter edited after its digest, and give nothing without one', () => {
    const digest: CharterDigest = { ...all.tverskoi, edited: { ...all.tverskoi.edited, 'ch-mvd': '2020-01-01T00:00:00+03:00' } };
    expect(charterCards(TVERSKOI_PACK, digest, 'mvd').every((c) => c.stale)).toBe(true);
    expect(charterCards(TVERSKOI_PACK, all.tverskoi, 'opg')).toEqual([]);
    expect(charterCards(TVERSKOI_PACK, undefined, 'mvd')).toEqual([]);
  });
});
