// What the AI is given for one question: the case as structured blocks and the found articles under ids,
// so every article it cites can be traced back to a text it was actually shown.
import { articleText, sourceLabel, type Organization, type SearchHit, type ServerPack } from '../core';

/** A found article under the id the AI cites it by: «S1», «S2»… */
export interface Source {
  id: string;
  hit: SearchHit;
}

export const labelSources = (hits: SearchHit[]): Source[] => hits.map((hit, i) => ({ id: `S${i + 1}`, hit }));

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
  /** Labels of the articles the last answer held applicable. */
  norms: string[];
  /** Their ids in the laws: a follow-up keeps them among its sources. */
  articles?: string[];
  /** The last answer's conclusion, in a sentence. */
  conclusion: string;
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
      `ПРОШЛЫЙ ВЫВОД: ${previous.conclusion || '—'}; статьи: ${previous.norms.join(', ') || 'не найдены'}`,
      `НОВОЕ СООБЩЕНИЕ ИГРОКА (уточнение, поправка или «а если…»): ${message}`,
    );
  } else {
    blocks.push(`СИТУАЦИЯ СО СЛОВ ИГРОКА: ${message}`);
  }
  blocks.push(
    sources.length
      ? `НАЙДЕННЫЕ СТАТЬИ ЗАКОНОВ СЕРВЕРА (других нет; ссылайся по id):\n\n${sources.map(sourceBlock).join('\n\n')}`
      : 'НАЙДЕННЫЕ СТАТЬИ: поиск по законам сервера ничего не нашёл.',
  );
  return blocks.filter(Boolean).join('\n\n');
}

function sourceBlock({ id, hit }: Source): string {
  const text = articleText(hit.article);
  const cut = text.length > SOURCE_CHARS ? `${text.slice(0, SOURCE_CHARS)}…` : text;
  return `[${id}] ${sourceLabel(hit)} — ${hit.document.title}\n${cut}`;
}
