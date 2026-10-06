import { useEffect, useState } from 'react';
import { Dropdown } from './Dropdown';
import { CloseIcon, PinIcon, WarnIcon } from './icons';
import { PHRASES_MAX, PHRASE_KEYS, PHRASE_MODIFIERS, PHRASE_TEXT_MAX, PHRASE_TITLE_MAX, type Phrase, type PhrasesControl } from './phrases';
import { formatHotkey } from './profile';

export interface PhrasesBlockProps {
  control: PhrasesControl;
  /** A phrase as it is pasted: the profile's words in. */
  fill: (text: string) => string;
  onCopy: (phrase: Phrase) => void;
  /** Whether the phrases are pinned over the game, and pinning them. */
  pinned: boolean;
  onPin: () => void;
  /** What is held with a digit to copy a phrase over the game; '' — no keys. */
  keys: string;
  onKeys: (keys: string) => void;
  /** Keys another program holds: they will not work. */
  takenKeys: string[];
  /** The profile has neither the game name nor the position: a phrase that names the officer has nothing to name. */
  nameless: boolean;
  onProfile: () => void;
}

/**
 * «Заготовки для чата» on the faction's page (issue #40): a phrase a tile; pressed, it is in the clipboard for
 * the player to paste into the game's chat. The faction's ready set to start with, the player's own after
 * «Изменить». Nothing here types into the game.
 */
export function PhrasesBlock({ control, fill, onCopy, pinned, onPin, keys, onKeys, takenKeys, nameless, onProfile }: PhrasesBlockProps) {
  const { phrases, custom, save, reset } = control;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Phrase[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const edit = () => {
    setDraft(phrases);
    setEditing(true);
  };
  const change = (id: string, patch: Partial<Phrase>) => setDraft((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <section className="phrases" aria-label="Заготовки для чата">
      <div className="sec-t phrases__head">
        <span>
          Заготовки для чата <span className="dept__sub">· нажмите — фраза в буфере, вставьте её в чат игры: Ctrl+V</span>
        </span>
        <span className="sp" />
        {!editing && (
          <button className="link-btn" type="button" onClick={edit}>
            Изменить
          </button>
        )}
        {!editing && phrases.length > 0 && (
          <button
            className={pinned ? 'x x--on' : 'x'}
            type="button"
            aria-pressed={pinned}
            aria-label={pinned ? 'Открепить заготовки' : 'Закрепить заготовки поверх игры'}
            title={pinned ? 'Открепить' : 'Закрепить поверх игры'}
            onClick={onPin}
          >
            <PinIcon size={14} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="phrases__edit">
          {draft.map((phrase, index) => (
            <div key={phrase.id} className="phrases__row" role="group" aria-label={`Заготовка ${index + 1}`}>
              <span className="phrases__n">{index + 1}</span>
              <input
                className="presets__input phrases__title"
                aria-label="Название"
                placeholder="Название"
                maxLength={PHRASE_TITLE_MAX}
                value={phrase.title}
                onChange={(e) => change(phrase.id, { title: e.target.value })}
              />
              <input
                className="presets__input phrases__text"
                aria-label="Текст"
                placeholder="Текст фразы"
                maxLength={PHRASE_TEXT_MAX}
                value={phrase.text}
                onChange={(e) => change(phrase.id, { text: e.target.value })}
              />
              <button className="x" type="button" aria-label={`Удалить заготовку ${index + 1}`} title="Удалить" onClick={() => setDraft((list) => list.filter((p) => p.id !== phrase.id))}>
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
          <p className="set__hint">
            {'{должность}'}, {'{имя}'} и {'{организация}'} подставятся из вашего профиля. Первые {PHRASE_KEYS} заготовок можно копировать клавишами.
          </p>
          <div className="phrases__keys">
            <span className="set__label">Клавиши поверх игры</span>
            <Dropdown
              variant="pill"
              label="Клавиши заготовок"
              value={keys}
              onChange={onKeys}
              options={[{ value: '', label: 'Выключены' }, ...PHRASE_MODIFIERS.map((m) => ({ value: m, label: `${formatHotkey(m)} + 1…${PHRASE_KEYS}` }))]}
            />
          </div>
          <div className="phrases__actions">
            <button
              className="settings__button"
              type="button"
              disabled={draft.length >= PHRASES_MAX}
              onClick={() => setDraft((list) => [...list, { id: `own-${Date.now()}-${list.length}`, title: '', text: '' }])}
            >
              Добавить заготовку
            </button>
            {custom && (
              <button
                className="settings__button"
                type="button"
                onClick={() => {
                  reset();
                  setEditing(false);
                }}
              >
                Вернуть набор отдела
              </button>
            )}
            <span className="sp" />
            <button className="settings__button" type="button" onClick={() => setEditing(false)}>
              Отмена
            </button>
            <button
              className="btn btn--primary phrases__done"
              type="button"
              onClick={() => {
                save(draft);
                setEditing(false);
              }}
            >
              Готово
            </button>
          </div>
        </div>
      ) : phrases.length > 0 ? (
        <div className="phrases__tiles">
          {phrases.map((phrase, index) => (
            <button key={phrase.id} className={copied === phrase.id ? 'phrase phrase--copied' : 'phrase'} type="button" title={fill(phrase.text)} onClick={() => (onCopy(phrase), setCopied(phrase.id))}>
              <b>{copied === phrase.id ? 'Скопировано' : phrase.title}</b>
              <span>{fill(phrase.text)}</span>
              {keys && index < PHRASE_KEYS && <kbd className="kbd">{formatHotkey(`${keys}+${index + 1}`)}</kbd>}
            </button>
          ))}
        </div>
      ) : (
        <p className="set__hint">Здесь пока пусто. «Изменить» — и добавьте фразы, которые говорите чаще всего.</p>
      )}

      {takenKeys.length > 0 && !editing && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>
            {takenKeys.map(formatHotkey).join(', ')} — {takenKeys.length === 1 ? 'сочетание занято' : 'сочетания заняты'} другой программой и не сработа{takenKeys.length === 1 ? 'ет' : 'ют'}. Выберите другие
            клавиши в «Изменить».
          </span>
        </div>
      )}
      {nameless && !editing && phrases.some((p) => /\{(должность|имя)\}/.test(p.text)) && (
        <p className="set__hint">
          Чтобы в заготовки подставлялись ваши должность и ник, укажите их в профиле.{' '}
          <button className="link" type="button" onClick={onProfile}>
            Открыть профиль
          </button>
        </p>
      )}
      <p className="dept__note">Ассистент ничего не печатает в игру: он только кладёт фразу в буфер обмена, вставляете её вы сами.</p>
    </section>
  );
}
