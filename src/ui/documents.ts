// Documents written by the AI from a situation told in free words — a report, a detention record, a complaint —
// in the forms RP players post on the forum. As with the analysis, the AI is given only the articles the search
// found in the server's laws, and may cite only those.
import { useCallback, useEffect, useState } from 'react';
import { findForSituation, type SearchHit, type ServerPack } from '../core';
import { coreRules, labelSources, packInScope, playerData, sourcesBlock, textIssues } from '../protocol';
import type { PlatformAdapter } from '../platform/types';
import { SOURCES, ask, connect, lawTerms } from './ai';

export type DocumentKind = 'report' | 'detention' | 'statement' | 'complaint' | 'lawsuit';

export const DOCUMENT_KINDS: { id: DocumentKind; label: string; who: string; form: string }[] = [
  {
    id: 'report',
    label: 'Рапорт',
    who: 'сотрудник государственной организации докладывает руководству о происшествии',
    form: 'Шапка: кому (начальнику подразделения), от кого (звание, ФИО, должность). Заголовок «РАПОРТ». Текст от первого лица: дата, время, место, что произошло, какие действия предприняты. Квалификация со ссылками на статьи. Дата и подпись.',
  },
  {
    id: 'detention',
    label: 'Протокол задержания',
    who: 'сотрудник составляет протокол задержания подозреваемого',
    form: 'Заголовок «ПРОТОКОЛ ЗАДЕРЖАНИЯ». Дата, время и место задержания; кто задержал (звание, ФИО, должность); кого задержали (ФИО или приметы). Основания задержания со ссылками на статьи. Что изъято. Разъяснены ли права. Подписи.',
  },
  {
    id: 'statement',
    label: 'Заявление',
    who: 'гражданин подаёт заявление в полицию о правонарушении против него',
    form: 'Шапка: кому (начальнику отдела полиции), от кого (ФИО). Заголовок «ЗАЯВЛЕНИЕ». Что произошло: дата, время, место, кто и что сделал. Просьба привлечь виновного к ответственности со ссылками на статьи. Дата и подпись.',
  },
  {
    id: 'complaint',
    label: 'Жалоба',
    who: 'гражданин или адвокат жалуется в прокуратуру на незаконные действия сотрудника',
    form: 'Шапка: в прокуратуру, от кого (ФИО, для адвоката — чьи интересы представляет). Заголовок «ЖАЛОБА на действия сотрудника». Что сделал сотрудник (дата, время, место, жетон или ФИО если известны). Какие нормы нарушены — со ссылками на статьи. Просьба провести проверку. Дата и подпись.',
  },
  {
    id: 'lawsuit',
    label: 'Иск',
    who: 'адвокат или гражданин подаёт исковое заявление в суд',
    form: 'Шапка: в суд, истец, ответчик. Заголовок «ИСКОВОЕ ЗАЯВЛЕНИЕ». Обстоятельства дела. Какие права нарушены — со ссылками на статьи. Требования к суду по пунктам. Перечень доказательств. Дата и подпись.',
  },
];

/** A situation to try each document with the first time. */
export const DOCUMENT_EXAMPLES: Record<DocumentKind, string> = {
  report: 'Сегодня в 21:40 у банка на Тверской задержал Ивана Петрова: был в маске, при себе электродубинка, отказался показать документы.',
  detention: 'Задержал Ивана Петрова у банка в 21:40 по подозрению в краже телефона, изъял телефон и электродубинку, права разъяснил.',
  statement: 'Сегодня около 21:00 у метро двое в масках отняли у меня телефон и убежали в сторону парка.',
  complaint: 'Сотрудник ППС остановил меня у магазина, обыскал без объяснения причины и не назвал ни себя, ни номер жетона.',
  lawsuit: 'Сотрудник полиции незаконно задержал моего доверителя на сутки без оснований и повредил его машину при задержании.',
};

/** Who writes the documents: filled in once in the settings, put in every document. */
export interface DocumentAuthor {
  name: string;
  rank: string;
  position: string;
}

export const AUTHOR_KEY = 'docs.author';
export const EMPTY_AUTHOR: DocumentAuthor = { name: '', rank: '', position: '' };

function documentPrompt(pack: ServerPack, kind: (typeof DOCUMENT_KINDS)[number], author: DocumentAuthor, now: Date): string {
  const me = [author.rank && `звание: ${author.rank}`, author.name && `ФИО: ${author.name}`, author.position && `должность: ${author.position}`]
    .filter(Boolean)
    .join('; ');
  return [
    coreRules(pack, 'law'),
    'ЗАДАЧА: ты составляешь документ для игры.',
    `Документ: ${kind.label}. Ситуация: ${kind.who}.`,
    `Форма: ${kind.form}`,
    `Автор документа — ${me || 'не указан'}. Где данных автора нет, оставь поле в фигурных скобках: {ФИО}, {звание}, {должность}. Так же — для любых сведений, которых нет в описании игрока: {время}, {место}, {ФИО задержанного} и т.п. Ничего не выдумывай.`,
    `Сегодня ${now.toLocaleDateString('ru-RU')}. Если игрок не назвал дату, ставь сегодняшнюю; время — только если он его назвал.`,
    'СТРОГИЕ ПРАВИЛА: ссылайся только на статьи из источников в сообщении, в точности как они подписаны (например «УК ст. 65»). Никаких законов РФ, никаких статей и санкций, которых нет в источниках. Если подходящей статьи в источниках нет — напиши в квалификации {статья не найдена в законах сервера}.',
    'Пиши официально-деловым языком, кратко, как на форуме сервера. Ответь только текстом документа, без пояснений и без markdown.',
  ].join('\n\n');
}

export interface WrittenDocument {
  kind: DocumentKind;
  situation: string;
  text: string;
  /** The articles the AI was given to cite. */
  sources: SearchHit[];
  /** What the checks found wrong in the text: an article none of the sources is. */
  issues: string[];
}

export interface DocumentWriter {
  kind: DocumentKind;
  setKind: (kind: DocumentKind) => void;
  author: DocumentAuthor;
  saveAuthor: (author: DocumentAuthor) => void;
  busy: boolean;
  result: WrittenDocument | null;
  error: string | null;
  write: (situation: string) => Promise<void>;
  /** The player's own corrections to the written text. */
  edit: (text: string) => void;
  reset: () => void;
}

export function useDocumentWriter(platform: PlatformAdapter, pack: ServerPack, boostDocuments?: string[]): DocumentWriter {
  const [kind, setKind] = useState<DocumentKind>('report');
  const [author, setAuthor] = useState<DocumentAuthor>(EMPTY_AUTHOR);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WrittenDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void platform.readSetting<DocumentAuthor>(AUTHOR_KEY).then((saved) => setAuthor({ ...EMPTY_AUTHOR, ...saved }));
  }, [platform]);

  const saveAuthor = useCallback(
    (next: DocumentAuthor) => {
      setAuthor(next);
      void platform.writeSetting(AUTHOR_KEY, next);
    },
    [platform],
  );

  const write = useCallback(
    async (situation: string) => {
      const text = situation.trim();
      if (!text || busy) return;
      setBusy(true);
      setError(null);
      try {
        const key = await connect(platform);
        const form = DOCUMENT_KINDS.find((k) => k.id === kind)!;
        const terms = await lawTerms(key, text);
        // A document cites the laws and charters: the rules of the server are no ground for a report or a lawsuit.
        const sources = labelSources(findForSituation(packInScope(pack, 'law'), text, { boostDocuments, lawTerms: terms, limit: SOURCES }));
        const prompt = sources.length
          ? `Описание игрока.\n${playerData(text)}\n\n${sourcesBlock(sources)}`
          : `Описание игрока.\n${playerData(text)}\n\nПоиск по законам сервера ничего не нашёл: статей не указывай, поставь {статья не найдена в законах сервера}.`;
        const written = await ask(key, documentPrompt(pack, form, author, new Date()), [{ role: 'user', parts: [{ text: prompt }] }]);
        const document = written.trim().replace(/^```\w*\n?|```$/g, '').trim();
        setResult({ kind, situation: text, text: document, sources: sources.map((source) => source.hit), issues: textIssues(document, sources) });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, platform, pack, boostDocuments, kind, author],
  );

  const edit = useCallback((text: string) => setResult((current) => (current ? { ...current, text } : current)), []);
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { kind, setKind, author, saveAuthor, busy, result, error, write, edit, reset };
}
