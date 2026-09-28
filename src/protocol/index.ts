// Protocol core: the legal AI pipeline over the law core — context, answer format, checks, providers.
// Pure TypeScript like the law core: no React, Tauri or UI (a boundary test enforces it).
export { AnswerFormatError, parseAnswer, type AnswerNorm, type Clarification, type LegalAnswer, type Stage } from './answer';
export { PERSPECTIVE_FOCUS, buildContext, labelSources, type CaseState, type ContextInput, type Perspective, type Source } from './context';
export { analysisPrompt, type Depth } from './prompt';
export { AiError, geminiProvider, serverProvider, type AiErrorKind, type AiProvider, type AiRequest, type Turn } from './provider';
export {
  STATUS_LABELS,
  articleExists,
  calculateCharges,
  figures,
  validateAnswer,
  type CheckedNorm,
  type Status,
  type Validation,
} from './validate';
export { SOURCES, analyse, lawTerms, type Analysis, type AnalyseInput } from './pipeline';
