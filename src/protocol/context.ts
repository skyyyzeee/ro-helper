// What the AI is given for one question: the case as structured blocks and the found sources under ids, each type
// in a block of its own, so every norm it cites can be traced back to a text it was actually shown — and the
// player's words come as fenced data, not as instructions.
import { articleText, sourceLabel, type Organization, type ServerPack } from '../core';
import { playerData } from './prompt';
import { SOURCE_TYPE_LABELS, type Scope, type Source, type SourceType } from './sources';

/** How long one article may be, so a dozen fit and a huge one does not crowd out the rest. */
const SOURCE_CHARS = 1800;

/** One side of the same sources: what the player wants to know, never other facts or other laws. */
export type Perspective = 'state' | 'citizen' | 'lawyer' | 'crime';

export const PERSPECTIVE_FOCUS: Record<Perspective, string> = {
  state: 'полномочия и порядок действий сотрудника: на каком основании, что он обязан и что ему нельзя',
  citizen: 'права и обязанности гражданина: что от него законно требуют и что он вправе оспорить',
  lawyer: 'процессуальные возможности защиты: соблюдена ли процедура, какие права затронуты, что можно потребовать',
  crime: 'квалификация действий по нормам и её последствия — без советов, как уйти от ответственности',
};

/** The case as it stands after the earlier answers: a follow-up changes it, it is not told again. */
export interface CaseState {
  facts: string[];
  assumptions: string[];
  /** Labels of the norms the last answer held applicable. */
  norms: string[];
  /** Their ids in the laws: a follow-up keeps them among its sources. */
  articles?: string[];
  /** The last answer's conclusion, in a sentence. */
  conclusion: string;
  /** What the question was about, so a follow-up stays in it. */
  scope?: Scope;
}

export interface ContextInput {
  pack: ServerPack;
  organization?: Organization;
  /** The player's message: the situation, or a change to it («а если он был без маски?»). */
  message: string;
  sources: Source[];
  perspective?: Perspective;
  /** The case so far; absent for the first question. */
  previous?: CaseState;
}

const list = (items: string[]) => (items.length ? items.map((item) => `- ${item}`).join('\n') : '- нет');

/** The heading of each type's block, plural. */
const BLOCK_HEADING: Record<SourceType, string> = {
  law: 'ЗАКОНЫ',
  charter: 'УСТАВЫ И ПОЛОЖЕНИЯ',
  server_rule: 'ПРАВИЛА СЕРВЕРА',
  other: 'ДРУГИЕ ДОКУМЕНТЫ',
};
const BLOCK_ORDER: SourceType[] = ['law', 'charter', 'server_rule', 'other'];

/** The whole package, in blocks the prompt names. */
export function buildContext(input: ContextInput): string {
  const { pack, organization, message, sources, perspective, previous } = input;
  const blocks = [
    `СЕРВЕР: ${pack.server.name}`,
    `ОРГАНИЗАЦИЯ ИГРОКА: ${organization && organization.id !== 'none' ? organization.name : 'не указана'}`,
    perspective ? `ТОЧКА ЗРЕНИЯ: ${PERSPECTIVE_FOCUS[perspective]}` : '',
  ];
  if (previous) {
    blocks.push(
      `ФАКТЫ ДЕЛА ДО ЭТОГО СООБЩЕНИЯ:\n${list(previous.facts)}`,
      `ДОПУЩЕНИЯ ПРОШЛОГО ОТВЕТА:\n${list(previous.assumptions)}`,
      `ПРОШЛЫЙ ВЫВОД: ${previous.conclusion || '—'}; нормы: ${previous.norms.join(', ') || 'не найдены'}`,
      `НОВОЕ СООБЩЕНИЕ ИГРОКА — уточнение, поправка или «а если…».\n${playerData(message)}`,
    );
  } else {
    blocks.push(`СИТУАЦИЯ СО СЛОВ ИГРОКА.\n${playerData(message)}`);
  }
  blocks.push(sourcesBlock(sources));
  return blocks.filter(Boolean).join('\n\n');
}

/** The found sources, each type apart: the model sees which is a law and which a rule of the server. */
export function sourcesBlock(sources: Source[]): string {
  if (!sources.length) return 'НАЙДЕННЫЕ ИСТОЧНИКИ: поиск по базе сервера ничего не нашёл.';
  const parts = BLOCK_ORDER.flatMap((type) => {
    const ofType = sources.filter((s) => s.type === type);
    return ofType.length ? [`— ${BLOCK_HEADING[type]} —\n\n${ofType.map(sourceText).join('\n\n')}`] : [];
  });
  return `НАЙДЕННЫЕ ИСТОЧНИКИ (других нет; ссылайся по id):\n\n${parts.join('\n\n')}`;
}

function sourceText({ id, type, hit }: Source): string {
  const text = articleText(hit.article);
  const cut = text.length > SOURCE_CHARS ? `${text.slice(0, SOURCE_CHARS)}…` : text;
  // The label first, as the model copies it into "ref"; the type after the document's name.
  return `[${id}] ${sourceLabel(hit)} — ${hit.document.title} (${SOURCE_TYPE_LABELS[type].toLowerCase()})\n${cut}`;
}
