import { chargeLabel, type ChargeItem, type FineRange } from './calculator';
import { formatRubles } from './format';
import type { AdministrativeRules, Sanction, Subject } from './model';

/** Who administrative charges are brought against; the calculator does not handle legal entities. */
export type Offender = Extract<Subject, 'citizen' | 'official'>;

/** «гражданину не назначается», «должностному лицу не более 150 000 ₽». */
export const OFFENDER_DATIVE: Record<Offender, string> = {
  citizen: 'гражданину',
  official: 'должностному лицу',
};

/** The alternative of an article the officer picks for a violation. */
export type Choice = 'fine' | 'arrest' | 'warning' | 'license-revocation' | 'evacuation';

export interface AdministrativeItem extends Pick<ChargeItem, 'article' | 'document' | 'part'> {
  /** The alternative picked; a fine, or the only alternative, when absent or not available. */
  choice?: Choice;
  /** Fine the officer typed; the limit when absent. */
  amount?: number;
  /** Days of arrest the officer typed; the longest when absent. */
  days?: number;
  /** For a fine that is a multiple of an unpaid one (КоАП 10.2): the unpaid fine. */
  unpaid?: number;
}

export interface AdministrativeFine {
  /** Limits of the article, narrowed by the limits of any one fine. */
  limit: FineRange;
  /** What counts towards the total. */
  amount: number;
  /** A fixed amount: nothing to type. */
  fixed: boolean;
  fits: boolean;
  /** Set when the amount is a multiple of an unpaid fine, typed instead of the amount. */
  multiplier?: number;
}

export interface AdministrativeArrest {
  limit: { min?: number; max: number };
  days: number;
  fixed: boolean;
  fits: boolean;
}

export interface AdministrativeItemResult<T extends AdministrativeItem = AdministrativeItem> {
  item: T;
  /** False when the article punishes someone else: the charge stays listed, but counts nowhere. */
  applicable: boolean;
  /** Alternatives the article gives this offender, in the order of the text. */
  choices: Choice[];
  choice: Choice | null;
  fine: AdministrativeFine | null;
  arrest: AdministrativeArrest | null;
  /** Mandatory add-ons written in the article. */
  additional: string[];
}

export interface AdministrativeResult<T extends AdministrativeItem = AdministrativeItem> {
  offender: Offender;
  items: AdministrativeItemResult<T>[];
  fineTotal: number;
  arrestDays: number;
  /** Bail to be released from the whole arrest, or null without one. */
  bail: { days: number; perDay: number; amount: number } | null;
  /** Punishments without an amount, each with its charges: «Лишение права управления: ст. 8.6 ч. 3». */
  other: string[];
  /** Stars for the arrests: the highest tag among charges with an arrest picked, 0 without one. */
  stars: number;
  /** The charge those stars come from. */
  starsFrom: T | null;
  explanation: string[];
  /** Charges whose fine or days are outside the limits. */
  outOfLimits: T[];
}

const OTHER_LABELS: Record<Exclude<Choice, 'fine' | 'arrest'>, string> = {
  warning: 'Предупреждение',
  'license-revocation': 'Лишение права управления',
  evacuation: 'Эвакуация ТС',
};

function choiceOf(sanction: Sanction): Choice | null {
  switch (sanction.kind) {
    case 'fine':
    case 'fine-multiple':
      return 'fine';
    case 'arrest':
    case 'warning':
    case 'license-revocation':
    case 'evacuation':
      return sanction.kind;
    default:
      return null;
  }
}

/** The article's alternatives for this offender; one the law names for them replaces a general one. */
function sanctionsFor(item: AdministrativeItem, offender: Offender): Map<Choice, Sanction> {
  const result = new Map<Choice, Sanction>();
  for (const sanction of item.part.punishment?.alternatives ?? []) {
    const choice = choiceOf(sanction);
    if (!choice || (sanction.subject && sanction.subject !== offender)) continue;
    if (!result.has(choice) || sanction.subject === offender) result.set(choice, sanction);
  }
  return result;
}

/**
 * Administrative charges by the server's rules: a punishment for each violation, all of them added up.
 * Each fine and arrest stays within the limits for any one punishment; the result says what to write,
 * the bail for the arrest, how many stars it takes and which rules were used.
 */
export function calculateAdministrative<T extends AdministrativeItem>(
  charges: T[],
  offender: Offender,
  rules: AdministrativeRules,
): AdministrativeResult<T> {
  const explanation: string[] = [];
  const dative = OFFENDER_DATIVE[offender];

  const items = charges.map((item): AdministrativeItemResult<T> => {
    const sanctions = sanctionsFor(item, offender);
    const choices = [...sanctions.keys()];
    const choice = item.choice && sanctions.has(item.choice) ? item.choice : sanctions.has('fine') ? 'fine' : (choices[0] ?? null);
    const sanction = choice ? sanctions.get(choice)! : undefined;
    const label = chargeLabel(item);
    let fine: AdministrativeFine | null = null;
    let arrest: AdministrativeArrest | null = null;

    const cap = rules.fine.max[offender];
    const capNote = () => explanation.push(`${label}: ${dative} не более ${formatRubles(cap!)} — ${rules.fine.basis}`);
    if (sanction?.kind === 'fine') {
      const max = cap === undefined ? sanction.max : Math.min(sanction.max, cap);
      if (max < sanction.max) capNote();
      const min = Math.min(Math.max(sanction.min ?? rules.fine.min, rules.fine.min), max);
      const fixed = min === max;
      const amount = fixed ? max : (item.amount ?? max);
      fine = { limit: { min, max }, amount, fixed, fits: amount >= min && amount <= max };
    } else if (sanction?.kind === 'fine-multiple') {
      const min = sanction.min ?? rules.fine.min;
      let amount = Math.max((item.unpaid ?? 0) * sanction.multiplier, min);
      if (cap !== undefined && amount > cap) {
        amount = cap;
        capNote();
      }
      fine = { limit: { min, max: cap ?? amount }, amount, fixed: false, fits: true, multiplier: sanction.multiplier };
    } else if (sanction?.kind === 'arrest') {
      const max = Math.min(sanction.max, rules.arrest.maxDays);
      if (max < sanction.max) explanation.push(`${label}: арест не более ${max} сут — ${rules.arrest.basis}`);
      const fixed = sanction.min === sanction.max;
      const days = fixed ? max : (item.days ?? max);
      arrest = { limit: { min: sanction.min, max }, days, fixed, fits: days >= (sanction.min ?? 1) && days <= max };
    }

    return {
      item,
      applicable: choices.length > 0,
      choices,
      choice,
      fine,
      arrest,
      additional: item.part.punishment?.additional ?? [],
    };
  });

  const counted = items.filter((r) => r.applicable);
  if (counted.length > 1) explanation.unshift(`Наказание назначается за каждое нарушение и складывается — ${rules.sum.basis}`);

  const fineTotal = counted.reduce((sum, r) => sum + (r.fine?.amount ?? 0), 0);
  const arrestDays = counted.reduce((sum, r) => sum + (r.arrest?.days ?? 0), 0);

  const other = (Object.keys(OTHER_LABELS) as (keyof typeof OTHER_LABELS)[])
    .map((choice) => ({ choice, labels: counted.filter((r) => r.choice === choice).map((r) => chargeLabel(r.item)) }))
    .filter((group) => group.labels.length)
    .map((group) => `${OTHER_LABELS[group.choice]}: ${group.labels.join(', ')}`);

  let stars = 0;
  let starsFrom: T | null = null;
  for (const r of counted) {
    const tag = r.item.part.stars?.max ?? 0;
    if (r.choice === 'arrest' && tag > stars) {
      stars = tag;
      starsFrom = r.item;
    }
  }

  return {
    offender,
    items,
    fineTotal,
    arrestDays,
    bail: arrestDays ? { days: arrestDays, perDay: rules.bail.perDay, amount: arrestDays * rules.bail.perDay } : null,
    other,
    stars,
    starsFrom,
    explanation,
    outOfLimits: counted.filter((r) => (r.fine && !r.fine.fits) || (r.arrest && !r.arrest.fits)).map((r) => r.item),
  };
}
