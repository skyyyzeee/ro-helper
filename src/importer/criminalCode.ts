import type { Article, Chapter, Note, Part } from '../core/model';
import { parseLeadingTags, parsePunishment, splitPenalty } from './sanctions';

export interface ParseIssue {
  article?: string;
  line: string;
  reason: string;
}

export interface ParsedCode {
  chapters: Chapter[];
  articles: Article[];
  /** Adoption lines after the last article. */
  footer: string[];
  issues: ParseIssue[];
}

/** Zero-width spaces and non-breaking spaces from the forum markup. */
export function cleanLines(text: string): string[] {
  return text
    .replace(/[​‌‍﻿]/g, '')
    .replace(/ /g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const SECTION = /^РАЗДЕЛ\s+([IVXLC]+)\.\s*(.*)$/i;
const CHAPTER = /^Глава\s+(\d+(?:\.\d+)*)\.\s*(.*)$/;
const ARTICLE = /^Статья\s+(\d+(?:\.\d+)*)\.\s*(.*)$/;
const NOTE = /^(Примечани[ея]|Пояснени[ея])\s*[.:]?\s*(.*)$/;
const NUMBERED = /^(\d+)\.\s+(.*)$/;
const POINT = /^([а-яё])\)\s+(.*)$/;
const TAGGED = /^\[[^\]]*\]/;
const MARKERS = /^(ОСОБЕННАЯ ЧАСТЬ|ОБЩАЯ ЧАСТЬ|УГОЛОВНЫЙ КОДЕКС РО)$/i;
/** Adoption footer at the end of the code: «Одобрен Государственной Думой …», «Подписан Премьер Министром …». */
const FOOTER = /^(Одобрен|Подписан|Принят)\S*\s/;

/**
 * Parses the Уголовный кодекс thread text: sections, chapters, articles, parts
 * (numbered, lettered points, or tagged special-part lines with sanctions) and notes.
 * Anything it cannot place is returned in `issues`, never dropped silently.
 */
export function parseCriminalCode(text: string, documentId: string): ParsedCode {
  const chapters: Chapter[] = [];
  const articles: Article[] = [];
  const issues: ParseIssue[] = [];
  const footer: string[] = [];
  let section: string | undefined;
  let chapter: Chapter | undefined;
  let article: Article | undefined;
  let lastNote: Note | undefined;

  const lastPart = () => (article ? article.parts[article.parts.length - 1] : undefined);

  for (const line of cleanLines(text)) {
    let m: RegExpMatchArray | null;

    if (MARKERS.test(line)) continue;
    if (FOOTER.test(line)) {
      footer.push(line);
      article = undefined;
      continue;
    }

    if ((m = line.match(SECTION))) {
      section = `Раздел ${m[1]}. ${m[2]}`.trim();
      article = undefined;
      continue;
    }
    if ((m = line.match(CHAPTER))) {
      chapter = { number: m[1], title: m[2], section, preface: [] };
      chapters.push(chapter);
      article = undefined;
      continue;
    }
    if ((m = line.match(ARTICLE))) {
      article = { id: `${documentId}-${m[1]}`, number: m[1], title: m[2], chapter: chapter?.number, parts: [], notes: [] };
      articles.push(article);
      lastNote = undefined;
      continue;
    }

    if (!article) {
      if (chapter) chapter.preface.push(line);
      else issues.push({ line, reason: 'Текст вне главы и статьи' });
      continue;
    }

    if ((m = line.match(NOTE))) {
      lastNote = { label: /^Примечани/.test(m[1]) ? 'Примечание' : 'Пояснение', text: m[2] };
      article.notes.push(lastNote);
      continue;
    }

    if (TAGGED.test(line)) {
      lastNote = undefined;
      const tags = parseLeadingTags(line);
      const { offence, clause } = splitPenalty(tags.rest);
      const part: Part = {
        number: tags.number ?? String(article.parts.filter((p) => p.number !== undefined).length + 1),
        text: offence,
        points: [],
        jurisdiction: tags.jurisdiction,
        stars: tags.stars,
      };
      if (clause) {
        const { punishment, unparsed } = parsePunishment(clause);
        part.punishment = punishment;
        for (const alt of unparsed) issues.push({ article: article.id, line, reason: `Не разобрано наказание: «${alt}»` });
        if (!punishment.alternatives.length) issues.push({ article: article.id, line, reason: 'Нет ни одного наказания' });
      } else {
        issues.push({ article: article.id, line, reason: 'Часть с метками, но без наказания' });
      }
      article.parts.push(part);
      continue;
    }

    if ((m = line.match(NUMBERED))) {
      lastNote = undefined;
      article.parts.push({ number: m[1], text: m[2], points: [] });
      continue;
    }

    if ((m = line.match(POINT))) {
      const part = lastPart();
      if (part) part.points.push({ letter: m[1], text: m[2] });
      else article.parts.push({ text: '', points: [{ letter: m[1], text: m[2] }] });
      continue;
    }

    // A plain paragraph: continues a note if one is open, otherwise it is an unnumbered part.
    if (lastNote) lastNote.text = `${lastNote.text} ${line}`.trim();
    else article.parts.push({ text: line, points: [] });
  }

  return { chapters, articles, footer, issues };
}
