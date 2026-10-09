import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import type { ServerPack } from './model';
import { articleFingerprint, changedSince, packLabel, snapshotOf } from './snapshot';

const pack = TVERSKOI_PACK;
const theft = pack.documents.find((d) => d.id === 'uk')!.articles.find((a) => a.number === '65')!;
/** The pack with one article changed by `change`. */
const edited = (id: string, change: (article: typeof theft) => typeof theft): ServerPack => ({
  ...pack,
  documents: pack.documents.map((d) => ({ ...d, articles: d.articles.map((a) => (a.id === id ? change(a) : a)) })),
});

describe('the version of a pack, for people (roadmap 1Б)', () => {
  it('is the day the pack was built, by Moscow time', () => {
    expect(packLabel({ ...pack, built: '2026-09-30T07:39:10.609Z' })).toBe('2026.9.30');
    // Late in the evening by UTC it is already the next day in Moscow.
    expect(packLabel({ ...pack, built: '2026-09-30T21:30:00.000Z' })).toBe('2026.10.1');
  });

  it('is the day of the newest law edit for a pack that was never built by the importer', () => {
    expect(packLabel({ ...pack, built: undefined, version: '2026-09-27T23:04:03+03:00' })).toBe('2026.9.27');
    expect(packLabel({ ...pack, built: undefined, version: '0000-00-00' })).toBe('—');
  });
});

describe('the fingerprint of an article', () => {
  it('is short, the same for the same text, and changes with the title, the text or the punishment', () => {
    const print = articleFingerprint(theft);
    expect(print).toMatch(/^[0-9a-f]{8}$/);
    expect(articleFingerprint({ ...theft })).toBe(print);
    expect(articleFingerprint({ ...theft, title: `${theft.title}!` })).not.toBe(print);
    const [first, ...rest] = theft.parts;
    expect(articleFingerprint({ ...theft, parts: [{ ...first, text: `${first.text} ` + 'и ещё' }, ...rest] })).not.toBe(print);
  });

  it('is different for every article of the pack that reads differently', () => {
    const texts = new Map<string, string>();
    for (const document of pack.documents) {
      for (const article of document.articles) {
        const print = articleFingerprint(article);
        const text = JSON.stringify([article.title, article.parts, article.notes]);
        // Two articles may share a fingerprint only when they read the same.
        if (texts.has(print)) expect(texts.get(print)).toBe(text);
        texts.set(print, text);
      }
    }
  });
});

describe('a snapshot of the laws a case was made by', () => {
  it('keeps the pack and the fingerprints of the articles named', () => {
    const snapshot = snapshotOf(pack, [theft.id, 'no-such-article']);
    expect(snapshot).toEqual({ server: 'tverskoi', label: packLabel(pack), built: pack.built, articles: { [theft.id]: articleFingerprint(theft) } });
  });

  it('tells nothing changed while the laws read the same, even in a pack built later', () => {
    const snapshot = snapshotOf(pack, [theft.id]);
    expect(changedSince({ ...pack, built: '2027-01-01T00:00:00.000Z' }, snapshot)).toEqual({ changed: [], gone: [] });
  });

  it('tells which articles read differently now, and which are gone', () => {
    const snapshot = snapshotOf(pack, [theft.id]);
    expect(changedSince(edited(theft.id, (a) => ({ ...a, title: 'Кража и хищение' })), snapshot)).toEqual({ changed: [theft.id], gone: [] });
    const without: ServerPack = { ...pack, documents: pack.documents.map((d) => ({ ...d, articles: d.articles.filter((a) => a.id !== theft.id) })) };
    expect(changedSince(without, snapshot)).toEqual({ changed: [], gone: [theft.id] });
  });
});
