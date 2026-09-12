import { calculateAdministrative, type AdministrativeItem, type AdministrativeResult, type Offender } from './administrative';
import { calculateCriminal, chargeLabel, type ChargeItem, type CriminalResult, type Mode } from './calculator';
import type { CalculatorRules } from './model';

/** A charge of either code: stage and wanted level matter for the criminal one, the rest for the administrative one. */
export type Charge = ChargeItem & Omit<AdministrativeItem, keyof ChargeItem>;

export interface DetentionOptions {
  /** КПЗ or a fine for the criminal charges. */
  mode: Mode;
  /** Who the administrative charges are brought against. */
  offender: Offender;
  /** Where bail goes by the wanted priority (Арбатский): the priority the officer set, 1 by default. */
  priority?: number;
}

export interface DetentionStars {
  count: number;
  /** The term those stars stand for (1 ★ = 10 мес). */
  months: number;
  /** Whether they come from the criminal term or from an arrest, which a term in months does not explain. */
  from: 'criminal' | 'administrative';
  /** «по ст. 5.4 ч. 1 КоАП (арест)» when they come from an arrest. */
  note?: string;
}

export interface DetentionResult {
  /** Null without criminal charges. */
  criminal: CriminalResult | null;
  /** Null without administrative charges. */
  administrative: AdministrativeResult<Charge> | null;
  /** Stars to set for the whole detention: the most of the criminal term's and the arrests'; null when nothing is served. */
  stars: DetentionStars | null;
  /** The charges for a report: `ст. 65 (покушение), 88 УК; ст. 8.6 ч. 1 КоАП`. */
  charge: string;
}

/** «8.6» < «8.12» < «10.1»: numbers compared segment by segment. */
function compareNumbers(a = '', b = ''): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? -1) - (y[i] ?? -1);
    if (diff) return diff;
  }
  return 0;
}

/** The charges grouped by document, criminal first, each group in article order; with the stage if not finished. */
function chargeLine(charges: Charge[], rules: CalculatorRules): string {
  const rank = (id: string) => (id === rules.criminalCode ? 0 : id === rules.administrative.code ? 1 : 2);
  const documents = [...new Map(charges.map((c) => [c.document.id, c.document])).values()].sort((a, b) => rank(a.id) - rank(b.id));
  return documents
    .map((document) => {
      const labels = charges
        .filter((c) => c.document.id === document.id)
        .sort((a, b) => compareNumbers(a.article.number, b.article.number) || compareNumbers(a.part.number, b.part.number))
        .map((c) => {
          const label = chargeLabel(c).replace(/^ст\. /, '');
          return c.stage === 'done' ? label : `${label} (${rules.stages[c.stage].label})`;
        });
      return `ст. ${labels.join(', ')} ${document.short}`;
    })
    .join('; ');
}

/**
 * One detention: criminal charges combined by absorption, administrative ones added up, the stars to set
 * for all of it, and the line of charges to copy. Articles of other documents are left out.
 */
export function calculateDetention(charges: Charge[], options: DetentionOptions, rules: CalculatorRules): DetentionResult {
  const criminalCharges = charges.filter((c) => c.document.id === rules.criminalCode);
  const administrativeCharges = charges.filter((c) => c.document.id === rules.administrative.code);
  const criminal = criminalCharges.length ? calculateCriminal(criminalCharges, options.mode, rules, options.priority) : null;
  const administrative = administrativeCharges.length
    ? calculateAdministrative(administrativeCharges, options.offender, rules.administrative)
    : null;

  let stars: DetentionStars | null = null;
  // Without stars in the laws (Арбатский) the wanted level is the officer's to set, not the calculator's.
  if (rules.stars && criminal?.mode === 'custody') stars = { count: criminal.stars, months: criminal.starsMonths, from: 'criminal' };
  if (rules.stars && administrative?.starsFrom && administrative.stars > (stars?.count ?? 0)) {
    const count = Math.min(administrative.stars, rules.stars.max);
    stars = {
      count,
      months: count * rules.stars.monthsPerStar,
      from: 'administrative',
      note: `по ${chargeLabel(administrative.starsFrom)} ${administrative.starsFrom.document.short} (арест)`,
    };
  }

  // An administrative article that does not punish this offender is no charge against them.
  const inapplicable = new Set(administrative?.items.filter((r) => !r.applicable).map((r) => r.item));
  const charged = [...criminalCharges, ...administrativeCharges].filter((c) => !inapplicable.has(c));

  return { criminal, administrative, stars, charge: chargeLine(charged, rules) };
}
