import type { Jurisdiction, Punishment, Sanction, StarRange } from '../core/model';

/** «50.000» / «50 000» → 50000. */
export function parseAmount(raw: string): number {
  return Number(raw.replace(/[.\s ]/g, ''));
}

export interface LeadingTags {
  jurisdiction?: Jurisdiction[];
  stars?: StarRange;
  number?: string;
  rest: string;
}

const JURISDICTIONS = new Set<string>(['Р', 'Ф', 'В']);

/**
 * Reads the tags a special-part line starts with, in any order: `[Р/Ф]`, `[★★★]`,
 * `[от ★ до ★★★★★]` and an explicit part number `1.` (УК ст. 113: `[В] 1. [★★] …`).
 */
export function parseLeadingTags(line: string): LeadingTags {
  const result: LeadingTags = { rest: line };
  let rest = line;
  for (;;) {
    const bracket = rest.match(/^\[([^\]]*)\]\s*/);
    const number = rest.match(/^(\d+)\.\s+/);
    if (bracket) {
      const inner = bracket[1].trim();
      const range = inner.match(/^от\s*(★+)\s*до\s*(★+)$/);
      if (range) result.stars = { min: range[1].length, max: range[2].length };
      else if (/^★+$/.test(inner)) result.stars = { min: inner.length, max: inner.length };
      else {
        const codes = inner.split('/').map((code) => code.trim());
        if (codes.every((code) => JURISDICTIONS.has(code))) result.jurisdiction = codes as Jurisdiction[];
        else break; // not a tag we know — leave it in the text
      }
      rest = rest.slice(bracket[0].length);
    } else if (number && result.number === undefined && rest !== line) {
      // A number only counts as a part number after at least one tag.
      result.number = number[1];
      rest = rest.slice(number[0].length);
    } else break;
  }
  result.rest = rest;
  return result;
}

export interface SplitPenalty {
  /** The offence description, without the trailing dash. */
  offence: string;
  /** The sanction clause after «наказывается», or null if the line has none. */
  clause: string | null;
}

/** Splits «… , — наказывается штрафом … либо лишением свободы …» into offence and clause. */
export function splitPenalty(text: string): SplitPenalty {
  const verb = text.match(/\s*[—–-]?\s*наказыва(?:ется|ются)\s+/);
  if (verb && verb.index !== undefined) {
    return { offence: text.slice(0, verb.index).replace(/[,\s]+$/, ''), clause: text.slice(verb.index + verb[0].length) };
  }
  // Some lines drop the verb: «…, — лишением свободы на срок 40 месяцев …» (УК ст. 112).
  const dash = text.match(/\s*[—–]\s*(?=(?:штраф|лишени))/);
  if (dash && dash.index !== undefined) {
    return { offence: text.slice(0, dash.index).replace(/[,\s]+$/, ''), clause: text.slice(dash.index + dash[0].length) };
  }
  return { offence: text, clause: null };
}

export interface ParsedPunishment {
  punishment: Punishment;
  /** Alternatives that could not be read; reported by the importer. */
  unparsed: string[];
}

/** Reads the clause after «наказывается»: alternatives separated by «либо». */
export function parsePunishment(clause: string): ParsedPunishment {
  const alternatives: Sanction[] = [];
  const additional: string[] = [];
  const unparsed: string[] = [];

  // Note: `\b` does not work with Cyrillic in JS regexes, so words are delimited by whitespace.
  for (const rawAlt of clause.split(/\s*,?\s+либо\s+/)) {
    let alt = rawAlt.trim().replace(/[.;,\s]+$/, '');
    if (!alt) continue;

    const military = alt.match(/\s+с\s+обязательным\s+лишением\s+воинского\s+звания(?:\s*\([^)]*\))?$/);
    if (military && military.index !== undefined) {
      additional.push('лишение воинского звания');
      alt = alt.slice(0, military.index);
    }

    // Each pattern must cover the whole alternative; anything left over is reported, not ignored.
    const fine = alt.match(/^штраф\S*\s+в\s+размере\s+(?:от\s+([\d.\s]+?)\s+до\s+([\d.\s]+?)|до\s+([\d.\s]+?)|([\d.\s]+?))\s+рубл\S*$/);
    const term = alt.match(/^лишени\S*\s+свободы\s+на\s+срок\s+(\d+)\s+месяц\S*$/);
    const byStars = alt.match(/^лишени\S*\s+свободы\s+на\s+срок,\s+предусмотренный\s+приоритетом[^,]*,\s+где\s+1\s+приоритет\s+равняется\s+(\d+)\s+месяц\S*\s+лишения\s+свободы$/);

    if (fine) {
      const [, from, to, upTo, fixed] = fine;
      if (from && to) alternatives.push({ kind: 'fine', min: parseAmount(from), max: parseAmount(to) });
      else if (upTo) alternatives.push({ kind: 'fine', max: parseAmount(upTo) });
      else alternatives.push({ kind: 'fine', min: parseAmount(fixed), max: parseAmount(fixed) });
    } else if (term) {
      alternatives.push({ kind: 'imprisonment', months: Number(term[1]) });
    } else if (byStars) {
      alternatives.push({ kind: 'imprisonment-by-stars', monthsPerStar: Number(byStars[1]) });
    } else {
      unparsed.push(alt);
    }
  }

  return { punishment: { alternatives, additional }, unparsed };
}
