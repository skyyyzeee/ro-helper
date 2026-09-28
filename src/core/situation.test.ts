import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { findForSituation, sourceLabel, sourcesText } from './situation';

const labels = (text: string, limit = 12) => findForSituation(TVERSKOI_PACK, text, { limit }).map(sourceLabel);

describe('articles for a situation told in free words (real Тверской data)', () => {
  it('finds the article a situation is about though no single article holds all its words', () => {
    expect(labels('у меня на улице украли телефон, это кража?').join('\n')).toMatch(/УК ст\. 65 «Кража»/);
  });

  it('finds more with the situation retold in the words of the law', () => {
    const lawTerms = ['ношение оружия', 'электрошоковое устройство', 'сокрытие лица маска', 'здание органов внутренних дел'];
    const hits = findForSituation(TVERSKOI_PACK, 'человек в маске с электродубинкой возле здания МВД', { lawTerms, limit: 8 });
    expect(hits.map(sourceLabel).join('\n')).toMatch(/УК ст\. 74 /);
  });

  it('gives whole articles, each once', () => {
    const hits = findForSituation(TVERSKOI_PACK, 'кража кража кражу');
    expect(hits.every((hit) => hit.part === undefined)).toBe(true);
    expect(new Set(hits.map((hit) => hit.article.id)).size).toBe(hits.length);
  });

  it('gives nothing for words that say nothing', () => {
    expect(findForSituation(TVERSKOI_PACK, 'ну и что мне теперь')).toEqual([]);
  });

  it('writes the sources under the labels the AI is to cite', () => {
    const [hit] = findForSituation(TVERSKOI_PACK, 'кража');
    expect(sourcesText([hit])).toContain(`### ${sourceLabel(hit)} — ${hit.document.title}`);
  });
});
