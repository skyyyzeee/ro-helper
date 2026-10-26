// The exam's own answers, checked against the base: an expected article that is not there, or a label several
// documents share («Правила 5.1» is in three sets of rules), would let the exam pass the wrong one or fail the right.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKS } from '../data/bundled';
import type { EvalCase } from './grade';

const { cases } = JSON.parse(readFileSync(join(import.meta.dirname, '../../eval/cases.json'), 'utf8')) as { cases: EvalCase[] };

/** The articles of the server a wanted «УК 65» or «rules-main-5.1» names: by its label, or by its id in the base. */
function named(server: string, wanted: string) {
  const at = wanted.lastIndexOf(' ');
  return PACKS[server].documents.flatMap((document) =>
    document.articles.filter((article) => article.id === wanted || (document.short === wanted.slice(0, at) && article.number === wanted.slice(at + 1))),
  );
}

describe('the exam\'s expected articles', () => {
  it('are each one article of the case\'s server: there, and not a label several documents share', () => {
    const wrong = cases.flatMap((c, i) =>
      (c.expect ?? []).flatMap((entry) =>
        entry.split('|').flatMap((one) => {
          const found = named(c.server, one.trim()).length;
          return found === 1 ? [] : [`№${i + 1} ${c.server} «${one}»: ${found ? `${found} статей с таким номером — укажите id` : 'нет в базе'}`];
        }),
      ),
    );
    expect(wrong).toEqual([]);
  });
});
