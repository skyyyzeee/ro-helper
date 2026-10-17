import { describe, expect, it } from 'vitest';
import { ARBATSKIY_PACK, KUTUZOVSKIY_PACK, TVERSKOI_PACK } from '../data/bundled';
import { articleLabel } from './format';
import { searchUnderstood, understand } from './intent';
import type { ServerPack } from './model';
import { searchArticles } from './search';

/** The intent a query is understood by, and its first articles as «УК ст. 65 ч. 1». */
const ask = (pack: ServerPack, query: string, count = 1) => {
  const { hits, intent } = searchUnderstood(pack, `${query} `);
  return { intent: intent?.id, first: hits.slice(0, count).map((hit) => `${hit.document.short} ${articleLabel(hit.article, hit.part)}`) };
};

describe('the intents of queries (roadmap 2Б, ADR 0004): query → intent → first article', () => {
  it('Тверской', () => {
    expect(ask(TVERSKOI_PACK, 'что ему впаяют за кражу')).toEqual({ intent: 'punishment', first: ['УК ст. 65 ч. 1'] });
    expect(ask(TVERSKOI_PACK, 'сколько штраф за превышение скорости')).toEqual({ intent: 'punishment', first: ['КоАП ст. 8.6 ч. 1'] });
    expect(ask(TVERSKOI_PACK, 'сколько штраф за парковку')).toEqual({ intent: 'punishment', first: ['КоАП ст. 8.12 ч. 1'] });
    expect(ask(TVERSKOI_PACK, 'чела приняли')).toEqual({ intent: 'detention', first: ['УПК ст. 51'] });
    expect(ask(TVERSKOI_PACK, 'что мне положено при задержании').intent).toBe('rights');
    expect(ask(TVERSKOI_PACK, 'по серверу можно стрелять в зеленой зоне')).toEqual({ intent: 'server-rules', first: ['Правила ст. 1.10'] });
  });

  it('Арбатский', () => {
    expect(ask(ARBATSKIY_PACK, 'сколько штраф за превышение скорости')).toEqual({ intent: 'punishment', first: ['КоАП ст. 24.1'] });
    expect(ask(ARBATSKIY_PACK, 'сколько штраф за парковку', 2).first).toContain('КоАП ст. 17.1');
    expect(ask(ARBATSKIY_PACK, 'можно ли по правилам сервера убивать').intent).toBe('server-rules');
    expect(ask(ARBATSKIY_PACK, 'имеет ли право мент обыскать')).toEqual({ intent: 'rights', first: ['Устав ст. 15'] });
  });

  it('Кутузовский', () => {
    expect(ask(KUTUZOVSKIY_PACK, 'что ему впаяют за кражу')).toEqual({ intent: 'punishment', first: ['УК ст. 10.1'] });
    expect(ask(KUTUZOVSKIY_PACK, 'сколько штраф за превышение скорости')).toEqual({ intent: 'punishment', first: ['КоАП ст. 14.7'] });
    expect(ask(KUTUZOVSKIY_PACK, 'сколько штраф за парковку')).toEqual({ intent: 'punishment', first: ['КоАП ст. 14.9'] });
    expect(ask(KUTUZOVSKIY_PACK, 'имеет ли право мент обыскать', 2).first).toContain('ФЗ ст. 38');
  });

  it('leaves a query in the words of the law, by number or naming a document as it was', () => {
    for (const query of ['кража', 'правила дорожного движения', 'арест имущества', 'ук 65', '8.6']) {
      expect(understand(TVERSKOI_PACK, query)).toBeNull();
      expect(searchUnderstood(TVERSKOI_PACK, query).hits).toEqual(searchArticles(TVERSKOI_PACK, query));
    }
  });

  it('tells «права» from «правила»: a short stem is known only as written', () => {
    expect(understand(TVERSKOI_PACK, 'мои права при задержании')?.intent.id).toBe('rights');
    expect(understand(TVERSKOI_PACK, 'правила дорожного движения')).toBeNull();
  });

  it('«Искать везде» searches as before, and an intent that finds nothing never loses what the search would find', () => {
    const everywhere = searchUnderstood(TVERSKOI_PACK, 'штраф за превышение скорости ', { everywhere: true });
    expect(everywhere.intent).toBeUndefined();
    expect(everywhere.hits).toEqual(searchArticles(TVERSKOI_PACK, 'штраф за превышение скорости '));

    // «срок» asks a punishment, but «срок давности» has none: the search everywhere answers, as before.
    expect(understand(TVERSKOI_PACK, 'срок давности')?.intent.id).toBe('punishment');
    expect(searchUnderstood(TVERSKOI_PACK, 'срок давности ')).toEqual({ hits: searchArticles(TVERSKOI_PACK, 'срок давности ') });
  });

  it('works without a dictionary: a pack from before it searches as before', () => {
    const old: ServerPack = { ...TVERSKOI_PACK, dictionary: undefined };
    expect(searchUnderstood(old, 'что ему впаяют за кражу ')).toEqual({ hits: searchArticles(old, 'что ему впаяют за кражу ') });
  });

  it('searches without the everyday words when the query as typed finds nothing, intent or not', () => {
    expect(understand(ARBATSKIY_PACK, 'что будет за кражу')).toBeNull();
    expect(ask(ARBATSKIY_PACK, 'что будет за кражу')).toEqual({ intent: undefined, first: ['УК ст. 10.5 ч. 1'] });
  });

  it('Арбатский: ст. 10.5 is «Кража» by its text (the forum repeats the title of 10.4 over it)', () => {
    expect(ask(ARBATSKIY_PACK, 'кража', 2).first).toEqual(['УК ст. 10.5 ч. 1', 'УК ст. 10.5 ч. 2']);
    const article = ARBATSKIY_PACK.documents.find((d) => d.id === 'uk')!.articles.find((a) => a.number === '10.5')!;
    expect(article.title).toBe('Кража');
    expect(article.parts[0].text).toMatch(/^Кража, то есть тайное хищение/);
  });
});
