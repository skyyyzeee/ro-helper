import { articleLabel } from './format';
import type { Article, CalculatorRules, Jurisdiction, LawDocument, Part, Sanction } from './model';

/** How far the crime went: finished, attempted (покушение) or prepared (приготовление). */
export type Stage = 'done' | 'attempt' | 'preparation';

/** Custody (КПЗ) or a fine for the whole detention; the officer decides on the spot. */
export type Mode = 'custody' | 'fine';

export interface ChargeItem {
  article: Article;
  document: LawDocument;
  part: Part;
  stage: Stage;
  /** For a term set by the wanted level (УК ст. 100.1): the current level in stars. */
  wantedLevel?: number;
}

export interface FineRange {
  min?: number;
  max: number;
}

export interface ItemResult {
  item: ChargeItem;
  /** Term in months after the stage reduction; null if the part has no imprisonment. */
  term: number | null;
  /** Fine limits after the stage reduction; null if the part has no fine. */
  fine: FineRange | null;
  /** Absorbed by a stricter punishment (shown struck through). */
  absorbed: boolean;
  /** Added once on top of the strictest punishment. */
  stacked: boolean;
}

export interface CriminalResult {
  items: ItemResult[];
  /** How the charges were combined: the strictest absorbs the rest, or the terms add up. */
  combine: 'absorption' | 'sum';
  /** The mode actually used: a fine is impossible if some charge has none, custody if none has a term. */
  mode: Mode;
  custodyUnavailable: ItemResult[];
  fineUnavailable: ItemResult[];
  /** Custody: total term in months, after the cap. */
  term: number;
  capped: boolean;
  /** Stars to set for that term, and the term they stand for. */
  stars: number;
  starsMonths: number;
  /** Fine mode: what the officer may write. */
  fineLimit: FineRange | null;
  /** Custody: bail by the most serious crime or by the wanted priority; null when there is none. */
  bail: { category: string; amount: number | null } | null;
  /** One line per rule that shaped the result, each ending with its article. */
  explanation: string[];
  warnings: string[];
}

/** Term of the charge's part before any reduction; a term set by the wanted level uses the chosen level. */
function baseTerm(item: ChargeItem): number | null {
  const sanctions: Sanction[] = item.part.punishment?.alternatives ?? [];
  for (const s of sanctions) {
    if (s.kind === 'imprisonment') return s.months;
    if (s.kind === 'imprisonment-by-stars') return (item.wantedLevel ?? item.part.stars?.max ?? 1) * s.monthsPerStar;
  }
  return null;
}

function baseFine(item: ChargeItem): FineRange | null {
  const fine = item.part.punishment?.alternatives.find((s) => s.kind === 'fine');
  return fine?.kind === 'fine' ? { min: fine.min, max: fine.max } : null;
}

/** УК ст. 45: a stage caps the punishment at a share of the maximum; «не может превышать», so round down. */
function reduce(value: number, item: ChargeItem, rules: CalculatorRules): number {
  return item.stage === 'done' ? value : Math.floor(value * rules.stages[item.stage].factor);
}

/** Category of the crime by the article's maximum term (УК ст. 11), regardless of the stage. */
export function crimeCategory(item: ChargeItem, rules: CalculatorRules): { name: string; label: string } {
  const term = baseTerm(item) ?? 0;
  const list = rules.categories.list;
  return list.find((c) => c.maxMonths === undefined || term <= c.maxMonths) ?? list[list.length - 1];
}

/** «ст. 65 ч. 1», or «ст. 104» for an article with a single punished part. */
export const chargeLabel = (item: Pick<ChargeItem, 'article' | 'part'>) =>
  articleLabel(item.article, item.article.parts.filter((p) => p.punishment).length > 1 ? item.part : undefined);
const labelOf = chargeLabel;

/**
 * Combines criminal charges by the server's rules: either the strictest punishment absorbs the rest
 * and an allowed article is added once on top (Тверской), or the terms of all the charges add up
 * (Арбатский). Stages reduce each charge, the total is capped, and the result says how many stars to
 * set, what bail applies and which rules were used.
 */
export function calculateCriminal(charges: ChargeItem[], wanted: Mode, rules: CalculatorRules, priority?: number): CriminalResult {
  const items: ItemResult[] = charges.map((item) => {
    const term = baseTerm(item);
    const fine = baseFine(item);
    return {
      item,
      term: term === null ? null : reduce(term, item, rules),
      fine: fine && { min: fine.min === undefined ? undefined : reduce(fine.min, item, rules), max: reduce(fine.max, item, rules) },
      absorbed: false,
      stacked: false,
    };
  });

  const custodyUnavailable = items.filter((r) => r.term === null);
  const fineUnavailable = items.filter((r) => r.fine === null);
  let mode: Mode = wanted;
  if (mode === 'fine' && fineUnavailable.length) mode = 'custody';
  if (mode === 'custody' && items.length && !items.some((r) => r.term !== null)) mode = 'fine';

  const explanation: string[] = [];
  const sum = rules.combine.kind === 'sum';
  const stackArticle = sum ? undefined : rules.stackOnce?.article;
  const main = items.filter((r) => r.item.article.number !== stackArticle);
  const stackItem = items.find((r) => r.item.article.number === stackArticle);
  const measure = (r: ItemResult) => (mode === 'custody' ? r.term ?? -1 : r.fine?.max ?? -1);

  // The strictest charge; the stack-once article counts only when it is alone.
  const pool = main.length ? main : items;
  const strictest = pool.reduce<ItemResult | undefined>((best, r) => (!best || measure(r) > measure(best) ? r : best), undefined);
  const stacked = stackItem && main.length ? stackItem : undefined;

  if (!sum) {
    for (const r of pool) if (r !== strictest) r.absorbed = true;
    if (stacked) stacked.stacked = true;
    // A second copy of the stack-once article is absorbed like any other charge.
    for (const r of items) if (r.item.article.number === stackArticle && r !== stacked && r !== strictest) r.absorbed = true;

    const absorbed = items.filter((r) => r.absorbed);
    if (strictest && absorbed.length) {
      explanation.push(`${labelOf(strictest.item)} поглощает ${absorbed.map((r) => labelOf(r.item)).join(', ')} — ${rules.combine.basis}`);
    }
    if (stacked && rules.stackOnce) {
      explanation.push(`${labelOf(stacked.item)} добавлена к самому строгому один раз — ${rules.stackOnce.basis}; её можно и поглотить — ${rules.combine.basis}`);
    }
  } else if (items.length > 1) {
    explanation.push(`Наказания складываются: ${items.map((r) => labelOf(r.item)).join(' + ')} — ${rules.combine.basis}`);
  }
  for (const r of items) {
    if (r.item.stage !== 'done') {
      const stage = rules.stages[r.item.stage];
      const share = stage.factor === 0.75 ? '¾' : stage.factor === 0.5 ? '½' : String(stage.factor);
      explanation.push(`${labelOf(r.item)}: ${stage.label} — не более ${share} наказания, ${stage.basis}`);
    }
  }

  let term = 0;
  let capped = false;
  let fineLimit: FineRange | null = null;
  let bail: CriminalResult['bail'] = null;

  if (mode === 'custody' && strictest) {
    term = sum ? items.reduce((total, r) => total + (r.term ?? 0), 0) : (strictest.term ?? 0) + (stacked?.term ?? 0);
    if (term > rules.maxTotalMonths.value) {
      term = rules.maxTotalMonths.value;
      capped = true;
      explanation.push(`Срок ограничен ${rules.maxTotalMonths.value} мес — ${rules.maxTotalMonths.basis}`);
    }
    if (rules.bail.by === 'wanted') {
      // The officer sets the wanted priority, the law only says what bail each priority costs.
      const level = priority ?? 1;
      bail = { category: `приоритет розыска ${level}`, amount: rules.bail.amounts[String(level)] ?? null };
    } else {
      const category = crimeCategory(strictest.item, rules);
      bail = { category: category.label, amount: rules.bail.amounts[category.name] ?? null };
    }
  } else if (mode === 'fine' && strictest?.fine) {
    fineLimit = sum
      ? {
          min: items.every((r) => r.fine?.min !== undefined) ? items.reduce((total, r) => total + (r.fine?.min ?? 0), 0) : undefined,
          max: items.reduce((total, r) => total + (r.fine?.max ?? 0), 0),
        }
      : { min: strictest.fine.min, max: strictest.fine.max + (stacked?.fine?.max ?? 0) };
  }

  const stars = rules.stars ? Math.min(rules.stars.max, Math.floor(term / rules.stars.monthsPerStar)) : 0;

  const warnings: string[] = [];
  for (const [tag, text] of Object.entries(rules.jurisdictionWarnings) as [Jurisdiction, string][]) {
    const only = items.filter((r) => r.item.part.jurisdiction?.length === 1 && r.item.part.jurisdiction[0] === tag);
    if (only.length) warnings.push(`${only.map((r) => labelOf(r.item)).join(', ')} — ${text}`);
  }

  return {
    items,
    combine: rules.combine.kind,
    mode,
    custodyUnavailable,
    fineUnavailable,
    term,
    capped,
    stars,
    starsMonths: rules.stars ? stars * rules.stars.monthsPerStar : 0,
    fineLimit,
    bail,
    explanation,
    warnings,
  };
}

/** Whether an amount the officer typed fits the fine limit. */
export function fineFits(amount: number, limit: FineRange): boolean {
  return amount <= limit.max && (limit.min === undefined || amount >= limit.min);
}
