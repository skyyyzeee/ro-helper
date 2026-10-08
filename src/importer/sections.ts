import type { Article } from '../core/model';
import type { ParsedLaw } from './lawText';
import { uniqueIds } from './points';

/**
 * Rules written as titled sections with no numbered points (the additional rules of each server: «Нападение на Форт»,
 * «AirDrop», «Правила перехвата поставок»). The forum marks a section's title with a zero-width space — at the end of
 * the title's own line or alone on the line right under it. Each section is an article numbered by its place, titled
 * by its title; its lines are its paragraphs, and what follows «|» on a line is a punishment (each told once).
 *
 * Where the forum's own list numbers are lost (a numbered list copies without its numbers) and zero-width spaces end
 * ordinary lines too, `headings` names the title lines instead: «^[IVX]+\. » (УСБ ФСБ), «^\d+\. \S+ — » (подразделения
 * МВД). A title's own number («IV.», «3.») then numbers its section.
 */

export interface SectionsOptions {
  /** A pattern for the title lines, in place of the zero-width space marks. */
  headings?: string;
}

const MARK = /[​‌‍﻿]/;
const clean = (line: string) => line.replace(/[​‌‍﻿]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const NUMBERED = /^([IVXLC]+|\d+)\.\s+(.*)$/;

export function parseSectionsText(text: string, documentId: string, options: SectionsOptions = {}): ParsedLaw {
  const raw = text.split(/\r?\n/);
  const headings = options.headings ? new RegExp(options.headings) : undefined;
  const articles: Article[] = [];
  const header: string[] = [];
  let article: Article | undefined;

  raw.forEach((line, i) => {
    const content = clean(line);
    if (!content) return;
    const next = raw[i + 1] ?? '';
    // A sentence («… лидеру.», «… (медикаменты);») or a line with a punishment is no title, a mark at its end or not.
    const titleLike = !/[.;!?]$/.test(content) && !/\s\|\s/.test(content);
    const title = headings ? headings.test(content) : titleLike && (MARK.test(line.slice(-2)) || (MARK.test(next) && !clean(next)));
    if (title) {
      const numbered = headings ? NUMBERED.exec(content) : null;
      const number = numbered?.[1] ?? String(articles.length + 1);
      article = { id: `${documentId}-${number}`, number, title: (numbered?.[2] ?? content).replace(/[.:]$/, ''), parts: [], notes: [] };
      articles.push(article);
      return;
    }
    if (!article) {
      header.push(content);
      return;
    }
    const [body, ...rest] = content.split(/\s+\|\s+/);
    article.parts.push({ text: body, points: [] });
    // «… при превышении лимита.Примечание: включая Армию.»: a note run into the punishment has a line of its own.
    const [, punishment = rest.join(' | '), label, note] = /^(.*?[.!?])\s*(Примечание|Пояснение|Исключение):\s*(.*)$/.exec(rest.join(' | ')) ?? [];
    for (const [l, t] of [['Наказание', punishment], [label, note]]) {
      if (l && t && !article.notes.some((n) => n.label === l && n.text === t)) article.notes.push({ label: l, text: t });
    }
  });

  // «XI» twice (УСБ ФСБ): the second keeps its place in the ids.
  uniqueIds(articles, documentId);
  return { chapters: [], articles, header, footer: [], issues: [] };
}
