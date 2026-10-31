import type { Article, Chapter, Jurisdiction, Note, Part } from '../core/model';
import { parsePointsText, uniqueIds, type PointsOptions } from './points';
import { parseSectionsText, type SectionsOptions } from './sections';
import { parseAdministrativeSanction, parseLeadingTags, parsePunishment, splitPenalty } from './sanctions';

/**
 * How sanctions are written in a document:
 * - `criminal-code` (УК): tagged lines `[Р/Ф] [★★★] … — наказывается …` carry their own sanction;
 * - `administrative-code` (КоАП): an offence line (optionally tagged) is followed by a «влечет …» line;
 * - `traffic-rules` (ПДД): no sanctions; chapters in Roman numerals and sub-headings between articles;
 * - `law` (any other law, code or charter): no sanctions; sections and chapters in any numbering, and
 *   articles that may start again from 1 in each chapter;
 * - `points` (charters, regulations, project rules): numbered points, see `parsePointsText`;
 * - `sections` (the additional rules of a server): titled sections with no numbers, see `parseSectionsText`.
 */
export type LawFormat = 'criminal-code' | 'administrative-code' | 'traffic-rules' | 'law' | 'points' | 'sections';

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
const ARTICLE = /^Статья\s+(\d+(?:\.\d+)*)(?:\s*\.\s*(.*)|\s+(\(?[А-ЯЁA-Z«"].*)|)$/;
/** Кутузовский marks the jurisdiction in the article's heading: «Статья 10.3 (Ф/Р) Кража …». */
const HEADING_JURISDICTION = /^\(([ФРВСC](?:\s*\/\s*[ФРВСC])*)\)\s*(.*)$/;
/** Кутузовский writes the wanted level on its own line: «Приоритет розыска 3». */
const PRIORITY_LINE = /^Приоритет\s+розыска\s+(\d)\s*$/i;
const NOTE = /^(Примечани[ея]|Пояснени[ея])(?:\s+(\d+))?\s*[.:]?\s*(.*)$/;
const SUBNUMBERED = /^(\d+(?:\.\d+)+)\.\s+(.*)$/;
/** «36.1 Неуважительное отношение…»: an item of an article, its number with no full stop after it. */
const SUB_ITEM = /^(\d+(?:\.\d+)+)\.?\s+(\S.*)$/;
/** «Наказание: штраф в размере 5000 Рублей.» under an item. */
const PENALTY_LINE = /^Наказание\s*:\s*(.+)$/i;
/** «ч. 1. Порядок …», «ч. 1 Судебная …», «Часть 1. На территории …». */

const LABELLED_PART = /^(?:ч\.|Часть)\s*(\d+(?:\.\d+)*)\.?\s+(.*)$/;
const NUMBERED = /^(\d+)\.\s+(.*)$/;
const POINT = /^([а-яё]|\d+)\)\s+(.*)$/;
const TAGGED = /^\[[^\]]*\]/;
const SANCTION = /^(?:влеч[её]т|влекут)\s+(.*)$/;
/** «наказывается …», «Штраф до 50.000 рублей.»: Арбатский writes the punishment on its own line. */
const SANCTION_LINE = /^(?:наказание\s*:\s*|наказыва(?:ется|ются)\s|(?:предупреждени\S*\s+(?:или|либо)\s+)?штраф\S*\s+(?:в\s+размере\s+)?(?:до|от|в)\s)/i;
/** «Наказание: …» (Кутузовский) — the word is a label, the punishment follows it. */
const SANCTION_LABEL = /^наказание\s*:\s*/i;
/** Part-of-code markers that carry no content of their own. */
const MARKERS = /^(ОСОБЕННАЯ ЧАСТЬ|ОБЩАЯ ЧАСТЬ)$/i;
/**
 * Adoption lines and appendix references at the end: «Одобрен Государственной Думой …», «Приложение к ПДД …»,
 * and the Moscow ones: «Настоящий Закон принят Московской городской Думой.», «Вступает в юридическую силу после
 * подписания Мэром …», «Нормативно-правовой акт подписан …».
 */
const FOOTER =
  // «Принят(а/о) …», not «Принятые законопроекты …» — an article's text that starts so (Конституция Арбатского, ст. 57).
  /^(?:(?:Одобрен|Подписан|Принят)[аоы]?[\s:,.]|Приложение\s+к\s|(?:Настоящий\s+)?Закон\s+принят\s|Вступает\s+в\s+юридическую\s+силу\s+после\s|Нормативно-правовой\s+акт\s+подписан\s)/;
/** Markup debris such as a stray code fence. */
const JUNK = /^(?:[`*_=~]{3,}|[✦❖▰◆◇═─━\s]+)$/;
/** A short unpunctuated line right before an article heading (ПДД: «аварийные сигналы»). */
const SUBHEADING = /^[^\d[\]()]{3,40}$/;

/** «… , -» / «… —» at the end of a КоАП offence line. */
function stripTrailingDash(text: string): string {
  return text.replace(/[\s,]*[-—–]$/, '').trim();
}

/** Longer than a title reads: the article's text written after its number with no title, «Статья 1.1. Задачами … являются …». */
const TEXT_AS_HEADING = 60;

/**
 * A long heading that reads as the article's own text, not its title: several sentences («… работником. Внутри …»),
 * an introduction with a colon («… в следующих случаях:»), a definition with a dash («Рабочее время - период …»),
 * or a finite verb («признается», «возникают», «работает», «защищать»). A noun phrase («Возмещение имущественного
 * ущерба …») has none of these and stays a title.
 */
const READS_AS_TEXT =
  /[.!?]\s+[А-ЯЁA-Z«(]|:(?:\s|$)|\s[-—–]\s|(?:ется|ются|ают|яют|еют|уют|ает|яет|еет|ать|ять|ить|ыть|еть|уть|оть|ться)(?=[\s.,;:!?…)]|$)/i;

/**
 * An article with nothing but a long heading — no text, points or punishment — has its text where the title goes
 * (КоАП, ТК and the federal laws of Арбатский, the УК of Кутузовский): the heading becomes its text, and the title is
 * left to the start of it. A heading over articles of its own («Статья 2.1 …», then «Статья 2.1.1 …») stays a title,
 * unless it reads as a sentence or an introduction (READS_AS_TEXT): then it is the text over its own sub-articles
 * (КоАП and ТК of Арбатский, УПК of Кутузовский).
 */
function headingsAsText(articles: Article[]): void {
  articles.forEach((article, i) => {
    if (article.title.length <= TEXT_AS_HEADING) return;
    if (article.parts.some((part) => part.text || part.punishment || part.points.length)) return;
    if (articles[i + 1]?.number.startsWith(`${article.number}.`) && !READS_AS_TEXT.test(article.title)) return;
    // The title lost its full stop; the text keeps one.
    const text = /[.!?:;…]$/.test(article.title) ? article.title : `${article.title}.`;
    if (article.parts[0]) article.parts[0].text = text;
    else article.parts.push({ text, points: [] });
    article.title = '';
  });
}

/** A line of ornament only, «▰ ◆ ▰», «* * *». */
const ORNAMENT = /^[^\p{L}\p{N}]+$/u;
/** A chapter's name on its own line: capitalised, one phrase — no stop, colon or semicolon but one full stop at the end. */
const CHAPTER_NAME = /^[\p{Lu}«"][^.;:]{0,98}[^.;:,]\.?$/u;

/**
 * «Глава 1» with its name on the next line (Арбатский, the army's charters of Кутузовский): the name went into
 * the chapter's preface, ornaments and all, and the contents said only «Глава 1» (backlog 02). The first line of
 * the preface that reads as a name becomes the chapter's title; the ornaments over it go.
 * And a note with no text — «Примечание к п.3.13:» over lines read as the article's own — is left out (backlog 07).
 */
function tidied<T extends { chapters: Chapter[]; articles: Article[] }>(parsed: T): T {
  for (const article of parsed.articles) article.notes = article.notes.filter((note) => note.text.trim());
  for (const chapter of parsed.chapters) {
    if (chapter.title) continue;
    const at = chapter.preface.findIndex((line) => !ORNAMENT.test(line));
    if (at < 0 || !CHAPTER_NAME.test(chapter.preface[at])) continue;
    // «Общие положения.», «"Возбуждение … дела"»: as a title, without the full stop and the quotes.
    chapter.title = chapter.preface[at].replace(/\.$/, '').replace(/^"(.*)"$/, '$1');
    chapter.preface = chapter.preface.slice(at + 1);
  }
  return parsed;
}

export function parseLawText(text: string, documentId: string, format: LawFormat, options: PointsOptions & SectionsOptions = {}): ParsedLaw {
  if (format === 'points') return tidied(parsePointsText(text, documentId, options));
  if (format === 'sections') return tidied(parseSectionsText(text, documentId, options));
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
  /** Chapters that have articles of their own: an empty one repeated later is a table of contents' line. */
  const filled = new Set<Chapter>();
  /** Only the penal codes carry punishments the calculator can use. */
  const penal = format === 'criminal-code' || format === 'administrative-code';
  let group: string | undefined;
  let article: Article | undefined;
  /** The article whose items with a punishment each («36.1 …», «Наказание: …») are being read as articles of their own. */
  let itemsOf: Article | undefined;
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
      let title = m[2];
      // «ГЛАВА 3.» / «ВОИНСКИЕ ЗВАНИЯ»: the title on the line under the number (Армия Арбатского).
      const next = lines[i + 1] ?? '';
      if (!title && /^[^a-zа-яё]{3,80}$/.test(next) && !CHAPTER.test(next) && !ARTICLE.test(next) && !JUNK.test(next)) title = lines[++i];
      chapter = { number: m[1], title, section, preface: [] };
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
      let title = (m[2] ?? m[3] ?? '').replace(/\.$/, '');
      // «Статья 10.3 (Ф/Р) Кража …»: the tag belongs to the punishment, the rest is the offence itself.
      const heading = title.match(HEADING_JURISDICTION);
      let headingJurisdiction: Jurisdiction[] | undefined;
      if (penal && heading) {
        headingJurisdiction = heading[1].split('/').map((tag) => (tag.trim() === 'C' ? 'С' : tag.trim()) as Jurisdiction);
        title = heading[2].replace(/\.$/, '');
      }
      article = { id: `${documentId}-${m[1]}`, number: m[1], title, chapter: chapter?.number, parts: [], notes: [] };
      itemsOf = undefined;
      if (chapter) filled.add(chapter);
      if (headingJurisdiction) article.parts.push({ text: '', points: [], jurisdiction: headingJurisdiction });
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
      // «[Ф] Те же деяния: а) …; б) …; в) …, - наказывается …»: the sanction stands on its own line under the points.
      let after = i + 1;
      while (POINT.test(lines[after] ?? '')) after++;
      const tail = !clause && after > i + 1 ? (lines[after] ?? '').match(/^[-—–]\s*(наказыва(?:ется|ются)\s.*)$/) : null;
      if (tail) {
        for (let j = i + 1; j < after; j++) {
          const point = lines[j].match(POINT)!;
          part.points.push({ marker: point[1], text: point[2] });
        }
        i = after;
      }
      const sanction = clause ?? (tail ? splitPenalty(`— ${tail[1]}`).clause : null);
      if (sanction) {
        const { punishment, unparsed } = parsePunishment(sanction);
        part.punishment = punishment;
        for (const alt of unparsed) issue(line, `Не разобрано наказание: «${alt}»`, part);
        if (!punishment.alternatives.length) issue(line, 'Нет ни одного наказания', part);
      } else if (!/^\s*[-—–]/.test(part.text)) {
        // «[Р] - Статья относится к подследственности МВД»: the general part explains the tags themselves.
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

    // The ethics code: «36.1 Неуважительное отношение…» with «Наказание: штраф…» under it — every item with a punishment
    // of its own is an article of its own («ст. 36.1»), the punishment its note, as the documents of points have it
    // (backlog 03). Only so when the punishment follows: other numbered lines stay the article's parts.
    if (!penal && (m = line.match(SUB_ITEM)) && m[1].startsWith(`${(itemsOf ?? article).number}.`) && PENALTY_LINE.test(lines[i + 1] ?? '')) {
      lastNote = undefined;
      itemsOf ??= article;
      article = { id: `${documentId}-${m[1]}`, number: m[1], title: '', chapter: itemsOf.chapter, parts: [{ text: m[2], points: [] }], notes: [] };
      if (itemsOf.group) article.group = itemsOf.group;
      articles.push(article);
      continue;
    }
    if (!penal && itemsOf && (m = line.match(PENALTY_LINE))) {
      lastNote = undefined;
      article.notes.push({ label: 'Наказание', text: m[1] });
      continue;
    }

    if ((m = line.match(LABELLED_PART)) || (m = line.match(SUBNUMBERED)) || (m = line.match(NUMBERED))) {
      lastNote = undefined;
      article.parts.push({ number: m[1], text: m[2], points: [] });
      continue;
    }

    // Кутузовский writes the wanted level of the article on its own line, between the offence and the punishment.
    if (penal && (m = line.match(PRIORITY_LINE))) {
      const level = Number(m[1]);
      const part = lastPart() ?? (article.parts.push({ text: '', points: [] }), article.parts[0]);
      part.stars = { min: level, max: level };
      continue;
    }

    // Арбатский writes the punishment on the line under the offence: it belongs to the part above it.
    if (penal && SANCTION_LINE.test(line)) {
      // КоАП Арбатского writes the offence in the article's title and the punishment under it, with no parts.
      const part = lastPart() ?? (article.parts.push({ text: '', points: [] }), article.parts[0]);
      {
        lastNote = undefined;
        part.text = stripTrailingDash(part.text);
        if (part.punishment) issue(line, 'Второе наказание для одной части', part);
        else {
          const clause = line.replace(SANCTION_LABEL, '');
          const { punishment, unparsed } =
            format === 'administrative-code'
              ? parseAdministrativeSanction(clause.replace(/\.$/, ''))
              : parsePunishment(splitPenalty(`— ${clause}`).clause ?? clause);
          part.punishment = punishment;
          for (const alt of unparsed) issue(line, `Не разобрано наказание: «${alt}»`, part);
          if (!punishment.alternatives.length) issue(line, 'Нет ни одного наказания', part);
        }
        continue;
      }
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

  // A table of contents written as «ГЛАВА 1. …» lines lists the chapters before they come: those empty copies go,
  // and so does an empty one before the first chapter with articles (a contents' line whose chapter has no heading).
  const firstFilled = chapters.findIndex((c) => filled.has(c));
  const kept = chapters.filter(
    (c, i) =>
      filled.has(c) ||
      c.preface.length ||
      (i > firstFilled && !chapters.slice(i + 1).some((later) => later.number === c.number)),
  );
  headingsAsText(articles);
  uniqueIds(articles, documentId, issues);
  return tidied({ chapters: kept, articles, header, footer, issues });
}
