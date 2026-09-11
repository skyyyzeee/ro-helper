import type { Article, Chapter, Note, Part } from '../core/model';
import { parsePointsText, uniqueIds } from './points';
import { parseAdministrativeSanction, parseLeadingTags, parsePunishment, splitPenalty } from './sanctions';

/**
 * How sanctions are written in a document:
 * - `criminal-code` (УК): tagged lines `[Р/Ф] [★★★] … — наказывается …` carry their own sanction;
 * - `administrative-code` (КоАП): an offence line (optionally tagged) is followed by a «влечет …» line;
 * - `traffic-rules` (ПДД): no sanctions; chapters in Roman numerals and sub-headings between articles;
 * - `law` (any other law, code or charter): no sanctions; sections and chapters in any numbering, and
 *   articles that may start again from 1 in each chapter.
 */
export type LawFormat = 'criminal-code' | 'administrative-code' | 'traffic-rules' | 'law' | 'points';

export interface ParseIssue {
  article?: string;
  /** Part number, if the part has one. */
  part?: string;
  /** 1-based position of the part in the article, so manual fixes can target unnumbered parts. */
  partIndex?: number;
  line: string;
  reason: string;
}

export interface ParsedLaw {
  chapters: Chapter[];
  articles: Article[];
  /** Title lines before the first chapter or article. */
  header: string[];
  /** Adoption lines and appendix references after the last article. */
  footer: string[];
  issues: ParseIssue[];
}

/** Zero-width spaces and non-breaking spaces from the forum markup; blank lines dropped. */
export function cleanLines(text: string): string[] {
  return text
    .replace(/[​‌‍﻿]/g, '')
    .replace(/ /g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const SECTION = /^Раздел\s+([IVXLC]+|\d+)\.\s*(.*)$/i;
const CHAPTER = /^Глава\s+([IVXLC]+|\d+(?:\.\d+)*)\.\s*(.*)$/i;
/** «Статья 1. Название», «Статья 1», «Статья 17.1 Название»; without the full stop, only an empty or capitalised title, so a sentence «Статья 5 настоящего закона …» is not a heading. */
const ARTICLE = /^Статья\s+(\d+(?:\.\d+)*)(?:\s*\.\s*(.*)|\s+([А-ЯЁA-Z«"].*)|)$/;
const NOTE = /^(Примечани[ея]|Пояснени[ея])(?:\s+(\d+))?\s*[.:]?\s*(.*)$/;
const SUBNUMBERED = /^(\d+(?:\.\d+)+)\.\s+(.*)$/;
/** «ч. 1. Порядок …», «ч. 1 Судебная …», «Часть 1. На территории …». */
const LABELLED_PART = /^(?:ч\.|Часть)\s*(\d+(?:\.\d+)*)\.?\s+(.*)$/;
const NUMBERED = /^(\d+)\.\s+(.*)$/;
const POINT = /^([а-яё]|\d+)\)\s+(.*)$/;
const TAGGED = /^\[[^\]]*\]/;
const SANCTION = /^(?:влеч[её]т|влекут)\s+(.*)$/;
/** Part-of-code markers that carry no content of their own. */
const MARKERS = /^(ОСОБЕННАЯ ЧАСТЬ|ОБЩАЯ ЧАСТЬ)$/i;
/**
 * Adoption lines and appendix references at the end: «Одобрен Государственной Думой …», «Приложение к ПДД …»,
 * and the Moscow ones: «Настоящий Закон принят Московской городской Думой.», «Вступает в юридическую силу после
 * подписания Мэром …», «Нормативно-правовой акт подписан …».
 */
const FOOTER =
  /^(?:(?:Одобрен|Подписан|Принят)\S*\s|Приложение\s+к\s|(?:Настоящий\s+)?Закон\s+принят\s|Вступает\s+в\s+юридическую\s+силу\s+после\s|Нормативно-правовой\s+акт\s+подписан\s)/;
/** Markup debris such as a stray code fence. */
const JUNK = /^[`*_=~]{3,}$/;
/** A short unpunctuated line right before an article heading (ПДД: «аварийные сигналы»). */
const SUBHEADING = /^[^\d[\]()]{3,40}$/;

/** «… , -» / «… —» at the end of a КоАП offence line. */
function stripTrailingDash(text: string): string {
  return text.replace(/[\s,]*[-—–]$/, '').trim();
}

export function parseLawText(text: string, documentId: string, format: LawFormat): ParsedLaw {
  if (format === 'points') return parsePointsText(text, documentId);
  const lines = cleanLines(text);
  const chapters: Chapter[] = [];
  const articles: Article[] = [];
  const header: string[] = [];
  const footer: string[] = [];
  const issues: ParseIssue[] = [];
  let started = false;
  let section: string | undefined;
  /** A section whose articles come before any chapter of it: it becomes their chapter. */
  let openSection: { number: string; title: string; preface: string[] } | undefined;
  let chapter: Chapter | undefined;
  let group: string | undefined;
  let article: Article | undefined;
  let lastNote: Note | undefined;

  const lastPart = (): Part | undefined => article?.parts[article.parts.length - 1];
  const issue = (line: string, reason: string, part?: Part) =>
    issues.push({
      article: article?.id,
      part: part?.number,
      partIndex: part && article ? article.parts.indexOf(part) + 1 : undefined,
      line,
      reason,
    });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpMatchArray | null;

    if (JUNK.test(line) || MARKERS.test(line)) continue;
    if (FOOTER.test(line)) {
      footer.push(line);
      article = undefined;
      continue;
    }
    if ((m = line.match(SECTION))) {
      started = true;
      const heading = `Раздел ${m[1]}. ${m[2]}`.trim();
      if (chapter && /^\d+$/.test(m[1]) && format === 'law') {
        // «Раздел 1.» inside a chapter (13-ФЗ) is a sub-heading of its articles, not a section of the law.
        group = heading;
      } else {
        section = heading;
        openSection = { number: m[1], title: m[2], preface: [] };
        chapter = undefined;
        group = undefined;
      }
      article = undefined;
      continue;
    }
    if ((m = line.match(CHAPTER))) {
      started = true;
      chapter = { number: m[1], title: m[2], section, preface: [] };
      chapters.push(chapter);
      openSection = undefined;
      group = undefined;
      article = undefined;
      continue;
    }
    if ((m = line.match(ARTICLE))) {
      started = true;
      if (!chapter && openSection) {
        chapter = { number: openSection.number, title: openSection.title, kind: 'section', preface: openSection.preface };
        chapters.push(chapter);
        openSection = undefined;
      }
      const title = (m[2] ?? m[3] ?? '').replace(/\.$/, '');
      article = { id: `${documentId}-${m[1]}`, number: m[1], title, chapter: chapter?.number, parts: [], notes: [] };
      if (group) article.group = group;
      articles.push(article);
      lastNote = undefined;
      continue;
    }
    if (!started) {
      header.push(line);
      continue;
    }

    if (format === 'traffic-rules' && SUBHEADING.test(line) && !/[.;:,!?]$/.test(line) && ARTICLE.test(lines[i + 1] ?? '')) {
      group = line.charAt(0).toUpperCase() + line.slice(1);
      article = undefined;
      continue;
    }

    if (!article) {
      if (chapter) chapter.preface.push(line);
      else if (openSection) openSection.preface.push(line);
      else issue(line, 'Текст вне главы и статьи');
      continue;
    }

    if ((m = line.match(NOTE))) {
      const label = /^Примечани/.test(m[1]) ? 'Примечание' : 'Пояснение';
      lastNote = { label: m[2] ? `${label} ${m[2]}` : label, text: m[3] };
      article.notes.push(lastNote);
      continue;
    }

    if (format === 'criminal-code' && TAGGED.test(line)) {
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
      article.parts.push(part);
      if (clause) {
        const { punishment, unparsed } = parsePunishment(clause);
        part.punishment = punishment;
        for (const alt of unparsed) issue(line, `Не разобрано наказание: «${alt}»`, part);
        if (!punishment.alternatives.length) issue(line, 'Нет ни одного наказания', part);
      } else {
        issue(line, 'Часть с метками, но без наказания', part);
      }
      continue;
    }

    if (format === 'administrative-code') {
      if ((m = line.match(SANCTION))) {
        lastNote = undefined;
        const part = lastPart();
        if (!part) issue(line, '«Влечет» без описания нарушения');
        else if (part.punishment) issue(line, 'Второе «влечет» для одной части', part);
        else {
          const { punishment, unparsed } = parseAdministrativeSanction(m[1]);
          part.punishment = punishment;
          for (const alt of unparsed) issue(line, `Не разобрана санкция: «${alt}»`, part);
        }
        continue;
      }
      const numbered = line.match(NUMBERED);
      if (numbered || TAGGED.test(line)) {
        // «1. [★★] Оскорбление … -» or «[★★] 2. Управление … -»
        lastNote = undefined;
        const tags = parseLeadingTags(numbered ? numbered[2] : line);
        const part: Part = { text: stripTrailingDash(tags.rest), points: [] };
        const number = numbered?.[1] ?? tags.number;
        if (number) part.number = number;
        if (tags.stars) part.stars = tags.stars;
        article.parts.push(part);
        continue;
      }
    }

    if ((format === 'law' && (m = line.match(LABELLED_PART))) || (m = line.match(SUBNUMBERED)) || (m = line.match(NUMBERED))) {
      lastNote = undefined;
      article.parts.push({ number: m[1], text: m[2], points: [] });
      continue;
    }

    if ((m = line.match(POINT))) {
      const part = lastPart();
      if (part) part.points.push({ marker: m[1], text: m[2] });
      else article.parts.push({ text: '', points: [{ marker: m[1], text: m[2] }] });
      continue;
    }

    // A plain paragraph: continues an open note, otherwise it is an unnumbered part.
    if (lastNote) lastNote.text = `${lastNote.text} ${line}`.trim();
    else article.parts.push({ text: format === 'administrative-code' ? stripTrailingDash(line) : line, points: [] });
  }

  uniqueIds(articles, documentId);
  return { chapters, articles, header, footer, issues };
}
