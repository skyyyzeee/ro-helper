import { useState, type ReactNode } from 'react';
import type { SearchHit } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { AiTabs, citedIn, shortLabel, type AiTab } from './AiView';
import { DOCUMENT_EXAMPLES, DOCUMENT_KINDS, type DocumentAuthor, type DocumentWriter } from './documents';
import { BackIcon, CheckIcon, WarnIcon } from './icons';

/** The written document, line by line: a line citing a found article opens it; {gaps} stand out to be filled in. */
function Preview({ text, sources, onOpen }: { text: string; sources: SearchHit[]; onOpen: (hit: SearchHit) => void }) {
  const gaps = (line: string): ReactNode[] =>
    line.split(/(\{[^}]+\})/).map((part, i) =>
      /^\{[^}]+\}$/.test(part) ? (
        <mark key={i} className="doc__gap" title="Заполните это место сами">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  return (
    <div className="doc__paper">
      {text.split('\n').map((line, i) => {
        const cited = citedIn(line, sources);
        return (
          <p key={i} className="doc__line">
            {cited ? (
              <button type="button" className="ai__cite" title={`Открыть ${shortLabel(cited)}`} onClick={() => onOpen(cited)}>
                {gaps(line)}
              </button>
            ) : line ? (
              gaps(line)
            ) : (
              ' '
            )}
          </p>
        );
      })}
    </div>
  );
}

/** Who writes: filled in once, kept in the settings, put into every document instead of {ФИО}, {звание}, {должность}. */
function AuthorForm({ author, onSave }: { author: DocumentAuthor; onSave: (author: DocumentAuthor) => void }) {
  const [draft, setDraft] = useState(author);
  const filled = [author.rank, author.name, author.position].filter(Boolean).join(', ');
  const field = (key: keyof DocumentAuthor, label: string, placeholder: string) => (
    <label className="doc__field">
      <span>{label}</span>
      <input
        className="presets__input"
        type="text"
        value={draft[key]}
        placeholder={placeholder}
        maxLength={80}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.stopPropagation();
        }}
      />
    </label>
  );
  return (
    <details className="doc__author" open={!filled}>
      <summary>{filled ? `От кого: ${filled}` : 'Ваши данные для документов — заполните один раз'}</summary>
      <div className="doc__fields">
        {field('name', 'ФИО', 'Иван Петров')}
        {field('rank', 'Звание', 'лейтенант полиции')}
        {field('position', 'Должность', 'инспектор ППС')}
      </div>
      <button className="settings__button" type="button" onClick={() => onSave(draft)}>
        Сохранить
      </button>
    </details>
  );
}

/** «Составить документ»: the kind, who writes, then the situation in the search field — and the text to copy. */
export function DocumentView({
  writer,
  backLabel,
  onBack,
  onOpen,
  onTab,
}: {
  writer: DocumentWriter;
  backLabel: string;
  onBack: () => void;
  onOpen: (hit: SearchHit) => void;
  onTab: (tab: AiTab) => void;
}) {
  const platform = usePlatform();
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const result = writer.result;
  const kind = DOCUMENT_KINDS.find((k) => k.id === writer.kind)!;

  return (
    <section className="art ai doc" aria-label="Составить документ">
      <div className="ai__top">
        <button className="back" type="button" onClick={onBack}>
          <BackIcon />
          <span>{backLabel}</span>
        </button>
        <span className="sp" />
        {result && (
          <button className="link-btn" type="button" disabled={writer.busy} onClick={writer.reset}>
            Новый документ
          </button>
        )}
      </div>
      <AiTabs tab="document" onTab={onTab} />

      <div className="ai__chips" role="radiogroup" aria-label="Какой документ">
        {DOCUMENT_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={writer.kind === k.id}
            className={writer.kind === k.id ? 'ai__chip ai__chip--on' : 'ai__chip'}
            onClick={() => writer.setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <AuthorForm key={JSON.stringify(writer.author)} author={writer.author} onSave={writer.saveAuthor} />

      {!result && !writer.busy && !writer.error && (
        <>
          <p className="set__hint">
            Опишите в поле сверху, что произошло, и нажмите <b>Enter</b> — ИИ составит {kind.label.toLowerCase()} со ссылками на статьи
            законов сервера.
          </p>
          <div className="ai__examples" aria-label="Пример">
            <span className="set__label">Попробуйте:</span>
            <button type="button" className="ai__example" onClick={() => void writer.write(DOCUMENT_EXAMPLES[writer.kind])}>
              {DOCUMENT_EXAMPLES[writer.kind]}
            </button>
          </div>
        </>
      )}

      {writer.busy && (
        <div className="ai__pending" role="status">
          <span className="ai__dots" aria-hidden="true" />
          Ищу статьи и составляю {kind.label.toLowerCase()}…
        </div>
      )}

      {writer.error && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>{writer.error}</span>
        </div>
      )}

      {result && !writer.busy && (
        <>
          <p className="set__hint doc__situation">По описанию: «{result.situation}»</p>
          {editing ? (
            <textarea
              className="doc__edit"
              aria-label="Текст документа"
              value={result.text}
              rows={Math.min(24, result.text.split('\n').length + 2)}
              onChange={(e) => writer.edit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEditing(false);
                }
              }}
            />
          ) : (
            <Preview text={result.text} sources={result.sources} onOpen={onOpen} />
          )}
          <div className="set__row doc__actions">
            <button
              className="btn btn--primary doc__copy"
              type="button"
              onClick={() =>
                void platform.writeClipboard(result.text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? (
                <>
                  <CheckIcon size={16} /> Скопировано
                </>
              ) : (
                'Скопировать для форума'
              )}
            </button>
            <button className="settings__button" type="button" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Готово' : 'Исправить'}
            </button>
          </div>
          {/\{[^}]+\}/.test(result.text) && (
            <p className="set__hint">Места в фигурных скобках ИИ не знал — заполните их сами («Исправить») перед отправкой.</p>
          )}
          <p className="set__hint">ИИ может ошибиться: прочитайте документ и откройте статьи по ссылкам, прежде чем публиковать.</p>
        </>
      )}
    </section>
  );
}
