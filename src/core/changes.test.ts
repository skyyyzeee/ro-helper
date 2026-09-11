import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { articleText, changedArticles, changesSince, diffPacks, diffWords, recentChanges } from './changes';
import type { ChangeEntry, LawDocument, ServerPack } from './model';

const uk = TVERSKOI_PACK.documents.find((d) => d.id === 'uk')!;
const koap = TVERSKOI_PACK.documents.find((d) => d.id === 'koap')!;
const article = (number: string) => uk.articles.find((a) => a.number === number)!;
const pack = (...documents: LawDocument[]): Pick<ServerPack, 'documents'> => ({ documents });

/** The criminal code with ст. 65 reworded, ст. 113 gone and a new ст. 114. */
function editedUk(): LawDocument {
  const next = structuredClone(uk);
  const theft = next.articles.find((a) => a.id === 'uk-65')!;
  theft.parts[0].text = 'Кража, то есть тайное хищение чужого имущества или денег';
  theft.parts[0].punishment!.alternatives[0] = { kind: 'fine', max: 60000 };
  next.articles = next.articles.filter((a) => a.id !== 'uk-113');
  next.articles.push({ ...structuredClone(article('112')), id: 'uk-114', number: '114', title: 'Новое преступление' });
  return next;
}

describe('comparing two versions of the laws', () => {
  it('finds nothing between a version and itself', () => {
    expect(diffPacks(TVERSKOI_PACK, TVERSKOI_PACK)).toEqual([]);
  });

  it('finds the added, the removed and the changed article, with the text before and after', () => {
    const changes = diffPacks(pack(uk, koap), pack(editedUk(), koap));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ documentId: 'uk', short: 'УК', kind: 'changed' });
    expect(changes[0].articles.map((c) => [c.kind, c.articleId])).toEqual([
      ['changed', 'uk-65'],
      ['added', 'uk-114'],
      ['removed', 'uk-113'],
    ]);
    const [changed, added, removed] = changes[0].articles;
    expect(changed.before).toBe(article('65'));
    expect(articleText(changed.after!)).toContain('тайное хищение чужого имущества или денег');
    expect(articleText(changed.after!)).toContain('Наказание: штраф до 60 000 ₽');
    expect(added).toMatchObject({ after: { number: '114' } });
    expect(added.before).toBeUndefined();
    expect(removed).toMatchObject({ before: article('113') });
    expect(removed.after).toBeUndefined();
  });

  it('counts a document that came or went as one change, not its every article', () => {
    expect(diffPacks(pack(uk), pack(uk, koap))).toEqual([{ documentId: 'koap', short: 'КоАП', title: koap.title, kind: 'added', articles: [] }]);
    expect(diffPacks(pack(uk, koap), pack(uk))).toEqual([{ documentId: 'koap', short: 'КоАП', title: koap.title, kind: 'removed', articles: [] }]);
  });

  it('notices a new title, a new punishment and a new note', () => {
    const retitled = structuredClone(uk);
    retitled.articles.find((a) => a.id === 'uk-66')!.title = 'Грабеж';
    const noted = structuredClone(uk);
    noted.articles.find((a) => a.id === 'uk-66')!.notes.push({ label: 'Примечание', text: 'Новое примечание' });
    expect(diffPacks(pack(uk), pack(retitled))[0].articles.map((c) => c.articleId)).toEqual(['uk-66']);
    expect(diffPacks(pack(uk), pack(noted))[0].articles.map((c) => c.articleId)).toEqual(['uk-66']);
  });
});

describe('the article as text', () => {
  it('puts parts with their numbers, lists, punishments and notes on their own lines', () => {
    const text = articleText(article('104'));
    expect(text.split('\n')).toEqual([
      '1. Публичное оскорбление представителя власти при исполнении им своих должностных обязанностей или в связи с их исполнением',
      expect.stringMatching(/^Наказание: /),
      expect.stringMatching(/^Примечание: Публичным признается/),
    ]);
  });
});

describe('the changelog', () => {
  const entry = (version: string): ChangeEntry => ({ version, documents: [] });
  const changes = [entry('2026-09-10T10:00:00+03:00'), entry('2026-08-20T10:00:00+03:00'), entry('2026-06-01T10:00:00+03:00')];

  it('gives the updates the user has not seen yet', () => {
    expect(changesSince({ changes }, '2026-08-20T10:00:00+03:00').map((e) => e.version)).toEqual(['2026-09-10T10:00:00+03:00']);
    expect(changesSince({ changes }, '2026-09-10T10:00:00+03:00')).toEqual([]);
    expect(changesSince({ changes }, '2026-01-01T00:00:00+03:00')).toHaveLength(3);
  });

  it('gives the updates of the last days', () => {
    const now = new Date('2026-09-11T12:00:00+03:00');
    expect(recentChanges({ changes }, now, 14).map((e) => e.version)).toEqual(['2026-09-10T10:00:00+03:00']);
    expect(recentChanges({ changes }, now, 60)).toHaveLength(2);
  });

  it('marks the articles added or changed, with their newest change; removed ones are not there to mark', () => {
    const [document] = diffPacks(pack(uk), pack(editedUk()));
    const older = structuredClone(document);
    const marked = changedArticles([
      { version: '2026-09-10T10:00:00+03:00', documents: [document] },
      { version: '2026-08-20T10:00:00+03:00', documents: [older] },
    ]);
    expect([...marked.keys()]).toEqual(['uk-65', 'uk-114']);
    expect(marked.get('uk-65')?.entry.version).toBe('2026-09-10T10:00:00+03:00');
    expect(marked.get('uk-65')?.document.short).toBe('УК');
  });
});

describe('«было → стало» word by word', () => {
  const join = (words: ReturnType<typeof diffWords>, kinds: string[]) =>
    words
      .filter((w) => kinds.includes(w.kind))
      .map((w) => w.text)
      .join('');

  it('marks the words removed and added and keeps the rest', () => {
    const words = diffWords('штраф до 50 000 ₽ или лишение свободы', 'штраф до 60 000 ₽ или арест');
    expect(words.filter((w) => w.kind !== 'same').map((w) => [w.kind, w.text.trim()])).toEqual([
      ['removed', '50'],
      ['added', '60'],
      ['removed', 'лишение свободы'],
      ['added', 'арест'],
    ]);
  });

  it('gives back each text exactly, line breaks included', () => {
    const before = 'Кража, то есть\nтайное хищение  чужого имущества';
    const after = 'Кража, то есть\nоткрытое хищение чужого имущества\nи денег';
    const words = diffWords(before, after);
    expect(join(words, ['same', 'removed'])).toBe(before);
    expect(join(words, ['same', 'added'])).toBe(after);
  });

  it('gives a new or a removed article as all added or all removed', () => {
    expect(diffWords('', 'Новая статья')).toEqual([{ kind: 'added', text: 'Новая статья' }]);
    expect(diffWords('Старая статья', '')).toEqual([{ kind: 'removed', text: 'Старая статья' }]);
  });

  it('compares very long texts that differ throughout as a whole', () => {
    const before = Array.from({ length: 2500 }, (_, i) => `a${i}`).join(' ');
    const after = Array.from({ length: 2500 }, (_, i) => `b${i}`).join(' ');
    expect(diffWords(before, after)).toEqual([
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ]);
  });
});
