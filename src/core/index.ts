// Law core: search, calculator, version diff and charge formatting over server law data.
// Pure TypeScript with no UI, Tauri or importer imports (enforced by boundary.test.ts).
export type * from './model';
export { searchArticles, type SearchHit } from './search';
export { formatJurisdiction, formatPunishment, formatRubles, formatSanction, leadPart, starCount } from './format';
