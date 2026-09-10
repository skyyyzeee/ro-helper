// Law core: search, calculator, version diff and charge formatting over server law data.
// Pure TypeScript with no UI, Tauri or importer imports (enforced by boundary.test.ts).
export type * from './model';
export { searchArticles, type SearchHit } from './search';
export {
  calculateCriminal,
  chargeLabel,
  crimeCategory,
  fineFits,
  type ChargeItem,
  type CriminalResult,
  type FineRange,
  type ItemResult,
  type Mode,
  type Stage,
} from './calculator';
export {
  SUBJECT_LABELS,
  articleLabel,
  articleTitle,
  formatJurisdiction,
  formatPunishment,
  formatRubles,
  formatSanction,
  leadPart,
  penalParts,
  punishmentBySubject,
  starCount,
  type SubjectLine,
} from './format';
