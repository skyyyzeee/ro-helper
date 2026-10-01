// Protocol core: the legal AI pipeline over the law core — classifier, scope, context, answer format, checks, providers.
// Pure TypeScript like the law core: no React, Tauri or UI (a boundary test enforces it).
export { AnswerFormatError, parseAnswer, readAnswer, type AnswerNorm, type Claim, type Clarification, type LegalAnswer, type Stage } from './answer';
export { ANSWERED_BY_APP, classify, type Classification, type QuestionType } from './classify';
export { groundItems, idsOf, strayArticles, strayFigures, textIssues, type GroundedItem } from './check';
export { confirmedHallucinations, gradeCase, refOf, type Category, type EvalCase, type Grade } from './grade';
export { PERSPECTIVE_FOCUS, buildContext, sourcesBlock, type CaseState, type ContextInput, type Perspective } from './context';
export { analysisPrompt, coreRules, playerData, type Depth } from './prompt';
export { AiError, geminiProvider, openaiProvider, serverProvider, type AiErrorKind, type AiProvider, type AiRequest, type CustomAi, type Turn } from './provider';
export {
  SCOPE_TYPES,
  SOURCE_TYPE_LABELS,
  inScope,
  labelSources,
  packInScope,
  sourceTypeOf,
  sourceTypeOfId,
  type Scope,
  type ScopeChoice,
  type Source,
  type SourceType,
} from './sources';
export {
  STATUS_LABELS,
  articleExists,
  calculateCharges,
  figures,
  namedArticles,
  validateAnswer,
  type CheckedNorm,
  type Status,
  type Validation,
} from './validate';
export {
  SOURCES,
  analyse,
  answerQuestion,
  lawTerms,
  searchTerms,
  type Analysis,
  type AnalyseInput,
  type Outcome,
  type QuestionInput,
  type SystemReason,
  type Terms,
} from './pipeline';
