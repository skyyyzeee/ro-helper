import type { Jurisdiction, Punishment, Sanction, StarRange, Subject } from '../core/model';

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

// Кутузовский adds «С» for the Следственный комитет, and writes it with a Latin C in the legend.
const JURISDICTIONS = new Set<string>(['Р', 'Ф', 'В', 'С', 'C']);

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
        // Latin «C» in the legend and Cyrillic «С» in the articles mean the same Следственный комитет.
        if (codes.every((code) => JURISDICTIONS.has(code))) result.jurisdiction = codes.map((code) => (code === 'C' ? 'С' : code)) as Jurisdiction[];
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

/**
 * What a criminal punishment carries besides the term or the fine: Тверской takes the military rank,
 * Кутузовский writes a criminal record and the damages the convict must pay.
 */
const CRIMINAL_ADDITIONS: [RegExp, string][] = [
  [/\s+с\s+обязательным\s+лишением\s+воинского\s+звания(?:\s*\([^)]*\))?$/i, 'лишение воинского звания'],
  [/,?\s+с\s+созданием\s+записи\s+о\s+судимости$/i, 'запись о судимости'],
  [/,?\s+а\s+также\s+полное\s+возмещение\s+материального\s+ущерба$/i, 'полное возмещение материального ущерба'],
  [/\s+и\s+изъяти\S*\s+лицензии\s+на\s+осуществление\s+рыбной\s+ловли$/i, 'изъятие лицензии на рыбную ловлю'],
];

/** Reads the clause after «наказывается»: alternatives separated by «либо». */
export function parsePunishment(clause: string): ParsedPunishment {
  const alternatives: Sanction[] = [];
  const additional: string[] = [];
  const unparsed: string[] = [];

  // Note: `\b` does not work with Cyrillic in JS regexes, so words are delimited by whitespace.
  for (const rawAlt of clause.split(/\s*,?\s+либо\s+/)) {
    let alt = rawAlt.trim().replace(/[.;,\s]+$/, '');
    if (!alt) continue;

    for (const [pattern, label] of CRIMINAL_ADDITIONS) {
      const found = alt.match(pattern);
      if (found && found.index !== undefined) {
        additional.push(label);
        alt = alt.slice(0, found.index).replace(/[.;,\s]+$/, '');
      }
    }

    // Each pattern must cover the whole alternative; anything left over is reported, not ignored.
    const fine = alt.match(/^штраф\S*\s+в\s+размере\s+(?:от\s+([\d.\s]+?)\s+до\s+([\d.\s]+?)|до\s+([\d.\s]+?)|([\d.\s]+?))\s+рубл\S*$/);
    // «на срок 30 месяцев» (Тверской) and «на срок до 50 месяцев» (Арбатский) mean the same: the term of the article.
    const term =
      alt.match(/^лишени\S*\s+свободы\s+на\s+срок\s+(?:до\s+)?(\d+)\s+месяц\S*$/i) ??
      alt.match(/^(?:до\s+)?(\d+)\s+месяц\S*\s+лишения(?:\s+свободы)?$/i);
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

const WORD_NUMBERS: Record<string, number> = { пяти: 5, десяти: 10, пятнадцати: 15, двадцати: 20, тридцати: 30 };
const MULTIPLIERS: Record<string, number> = { дву: 2, трех: 3, трёх: 3, пяти: 5, десяти: 10 };

/** A number written with digits («15», «50.000») or as a word in the genitive («пятнадцати»). */
function readNumber(raw: string): number | undefined {
  return /^\d/.test(raw) ? parseAmount(raw) : WORD_NUMBERS[raw];
}

const SUBJECT_PHRASES: [RegExp, Subject][] = [
  // Кутузовский names whom the fine is for in the dative: «штраф гражданину от 5 000 …».
  [/\s*работодателю(?:\s+или\s+виновному\s+должностному\s+лицу)?(?=[\s,;—-]|$)/i, 'official'],
  [/\s*должностному\s+лицу(?=[\s,;—-]|$)/i, 'official'],
  [/\s*(?:организации|юридическому\s+лицу)(?=[\s,;—-]|$)/i, 'legal'],
  [/\s*гражданину(?=[\s,;—-]|$)/i, 'citizen'],
  [/\s*(?:на|для)\s+граждан(?=[\s,;-]|$)/, 'citizen'],
  [/\s*(?:на|для)\s+должностных\s+лиц(?=[\s,;-]|$)/, 'official'],
  [/\s*(?:на|для)\s+юридических\s+лиц(?=[\s,;-]|$)/, 'legal'],
  [/\s+гражданам$/, 'citizen'],
  [/\s+должностным\s+лицам$/, 'official'],
  [/\s+юридическим\s+лицам$/, 'legal'],
];

// «до 10.000 рублей», «от 5.000 до 10.000 рублей», «до - 10.000 рублей» (a stray dash in Арбатский).
const AMOUNT = String.raw`(?:в\s+размере\s+)?(?:от\s+([\d.\s]+?)(?:\s+рубл\S*)?\s+до\s+[-—–]?\s*([\d.\s]+?)|до\s+[-—–]?\s*([\d.\s]+?)|([\d.\s]+?))\s+рубл\S*`;
// Тверской writes «влечет наложение административного штрафа …», Арбатский just «Штраф до 10.000 рублей»:
// the patterns ignore case so both read the same.
const ADMIN_FINE = new RegExp(String.raw`^(?:наложени\S+\s+)?(?:административн\S+\s+)?(?:штраф\S*\s+)?` + AMOUNT + '$', 'i');
const ADMIN_MULTIPLE = /^(?:наложени\S+\s+)?(?:административн\S+\s+)?штраф\S*\s+в\s+(\S+?)кратном\s+размере\s+суммы\s+неуплаченного\s+административного\s+штрафа(?:,\s*но\s+не\s+менее\s+([\d.\s]+?)\s+рубл\S*)?$/i;
const ADMIN_ARREST = /^административн\S+\s+арест\S*(?:\s+на(?:\s+срок)?)?\s+(до\s+)?(\d+|[а-яё]+)\s+сут\S*$/i;
const ADMIN_LICENSE = /^лишени\S+\s+права\s+(?:на\s+)?управлени\S*\s+(?:транспортными\s+средствами|ТС)$/i;
const ADMIN_EVACUATION = /^эвакуаци\S+\s+транспортного\s+средства$/i;
const ADMIN_WARNING = /^предупреждени\S*$/i;
const ADMIN_ADDITIONS: [RegExp, string][] = [
  [/\s+с\s+лишением\s+права\s+(?:на\s+)?управлени\S*\s+(?:транспортным\s+средством|транспортными\s+средствами|ТС)$/i, 'лишение права управления ТС'],
  [/\s+и\s+изъяти\S*\s+лицензии$/i, 'изъятие лицензии'],
];

/**
 * Кутузовский hangs what else follows the fine on the same line: «… с обязанностью возместить ущерб»,
 * «; возможно лишение специального права …», «. Материал также направляется …». Each is kept as written,
 * so nothing of the law is lost, and the fine itself is read as usual.
 */
const ADMIN_EXTRA =
  /\s+с\s+(?:возможн\S+\s+|обязательн\S+\s+)?(?:обязанностью|изъятием|отстранением|лишением|конфискацией|запретом|возмещением|передачей|перемещением|административным\s+приостановлением)\s[^;]*$/i;
const ADMIN_TAIL = /\.\s+[А-ЯЁ][^.]*\.?$/;
/** A segment that describes a condition, a possibility or someone else's fine, not a punishment of its own. */
const ADMIN_ASIDE = /^(?:возможн\S*|при\s|в\s+случае\s|организатору\s|организаторам\s)/i;

/** «Полное возмещение ущерба» → «полное возмещение ущерба»: an addition reads as part of a sentence. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const ADMIN_SUSPENSION = /\s+с\s+административным\s+приостановлением\s+деятельности\s+(?:данного\s+)?юридического\s+лица\s+на\s+срок\s+до\s+(\S+)\s+месяц\S*$/i;
const MONTH_WORDS: Record<string, number> = { одного: 1, двух: 2, трех: 3, трёх: 3, шести: 6 };

function readAdministrativeAlternative(alt: string): Sanction | null {
  let m: RegExpMatchArray | null;
  if (ADMIN_WARNING.test(alt)) return { kind: 'warning' };
  if ((m = alt.match(ADMIN_MULTIPLE))) {
    const multiplier = MULTIPLIERS[m[1]];
    if (!multiplier) return null;
    return m[2] ? { kind: 'fine-multiple', multiplier, min: parseAmount(m[2]) } : { kind: 'fine-multiple', multiplier };
  }
  if ((m = alt.match(ADMIN_FINE))) {
    const [, from, to, upTo, fixed] = m;
    if (from && to) return { kind: 'fine', min: parseAmount(from), max: parseAmount(to) };
    if (upTo) return { kind: 'fine', max: parseAmount(upTo) };
    return { kind: 'fine', min: parseAmount(fixed), max: parseAmount(fixed) };
  }
  if ((m = alt.match(ADMIN_ARREST))) {
    const days = readNumber(m[2]);
    if (days === undefined) return null;
    return m[1] ? { kind: 'arrest', max: days } : { kind: 'arrest', min: days, max: days };
  }
  if (ADMIN_LICENSE.test(alt)) return { kind: 'license-revocation' };
  if (ADMIN_EVACUATION.test(alt)) return { kind: 'evacuation' };
  return null;
}

/**
 * Reads a КоАП sanction line after «влечет» / «влекут»: segments separated by «;» name who they
 * apply to («на граждан», «на должностных лиц - …», «юридическим лицам»), and each segment holds
 * alternatives separated by «или», «либо», «и/или».
 */
export function parseAdministrativeSanction(clause: string): ParsedPunishment {
  const alternatives: Sanction[] = [];
  const additional: string[] = [];
  const unparsed: string[] = [];
  let rest = clause.trim().replace(/[.;,\s]+$/, '');

  // A sentence after the punishment says what else happens to the material; it is no punishment.
  const tail = rest.match(ADMIN_TAIL);
  if (tail && tail.index !== undefined) {
    additional.push(lowerFirst(tail[0].replace(/^\.\s+/, '').replace(/\.$/, '')));
    rest = rest.slice(0, tail.index);
  }

  // Additions written after the fine: «… с лишением права управления ТС», «… и изъятие лицензии».
  for (const [pattern, label] of ADMIN_ADDITIONS) {
    const found = rest.match(pattern);
    if (found && found.index !== undefined) {
      additional.push(label);
      rest = rest.slice(0, found.index);
    }
  }

  const suspension = rest.match(ADMIN_SUSPENSION);
  if (suspension && suspension.index !== undefined) {
    const months = readNumber(suspension[1]) ?? MONTH_WORDS[suspension[1]];
    additional.push(months ? `приостановление деятельности юрлица до ${months} мес` : 'приостановление деятельности юрлица');
    rest = rest.slice(0, suspension.index);
  }

  for (const rawSegment of rest.split(/\s*;\s*/)) {
    let segment = rawSegment.trim();
    let subject: Subject | undefined;
    for (const [pattern, who] of SUBJECT_PHRASES) {
      if (pattern.test(segment)) {
        subject = who;
        segment = segment.replace(pattern, '').trim();
        break;
      }
    }
    segment = segment.replace(/^[-—–]\s*/, '');
    if (!segment) continue;

    const extra = segment.match(ADMIN_EXTRA);
    if (extra && extra.index !== undefined) {
      additional.push(lowerFirst(extra[0].trim().replace(/^с\s+/i, '')));
      segment = segment.slice(0, extra.index).trim();
    }
    // «возможно лишение …», «при продолжении нарушения — …»: what may follow, written out as it stands.
    if (ADMIN_ASIDE.test(segment)) {
      additional.push(lowerFirst(segment));
      continue;
    }

    for (const rawAlt of segment.split(/\s*,?\s+(?:или|либо|и\/или)\s+/)) {
      const alt = rawAlt.trim().replace(/[.;,\s]+$/, '');
      if (!alt) continue;
      const sanction = readAdministrativeAlternative(alt);
      if (sanction) alternatives.push(subject ? { ...sanction, subject } : sanction);
      else unparsed.push(alt);
    }
  }

  return { punishment: { alternatives, additional }, unparsed };
}
