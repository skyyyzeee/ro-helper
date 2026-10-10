import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import type { Vote } from './feedback';
import { CloseIcon } from './icons';

/** Set once the player marked an answer or closed the hint: it is never shown again. */
export const MARK_HINT_KEY = 'ai.mark-hint';
/** The hint comes under the answer of this number in a conversation, not before: by then the AI has been of use. */
export const MARK_HINT_AFTER = 3;

/** Whether the hint to mark answers is over for this player, and the way to end it. */
export function useMarkHint(): { over: boolean; end: () => void } {
  const platform = usePlatform();
  // Over until read: a hint that blinks on and off at start is worse than one a moment late.
  const [over, setOver] = useState(true);
  useEffect(() => {
    void platform.readSetting<boolean>(MARK_HINT_KEY).then((done) => setOver(done === true));
  }, [platform]);
  const end = useCallback(() => {
    setOver(true);
    void platform.writeSetting(MARK_HINT_KEY, true);
  }, [platform]);
  return { over, end };
}

type State = { kind: 'idle' } | { kind: 'fixing'; text: string } | { kind: 'sending' } | { kind: 'sent'; vote: Vote } | { kind: 'failed'; why: string };

/**
 * Under an answer: was it right? 👍, 👎, or «Исправить» — what is right instead. One mark an answer; it is sent on
 * the press, to improve the assistant, and the player is told what goes (PRIVACY.md).
 */
export function MarkBar({ send, hint, onHintEnd }: { send: (vote: Vote, correction?: string) => Promise<void>; hint?: boolean; onHintEnd?: () => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const mark = async (vote: Vote, correction?: string) => {
    setState({ kind: 'sending' });
    // A mark given, the hint has done its work.
    onHintEnd?.();
    try {
      await send(vote, correction);
      setState({ kind: 'sent', vote });
    } catch (error) {
      setState({ kind: 'failed', why: error instanceof Error ? error.message : String(error) });
    }
  };

  if (state.kind === 'sent') {
    return (
      <p className="mark mark--sent" role="status">
        {state.vote === 'up' ? 'Спасибо за оценку!' : 'Спасибо — разберёмся и поправим.'}
      </p>
    );
  }
  if (state.kind === 'fixing') {
    return (
      <form
        className="mark mark--fix"
        onSubmit={(e) => {
          e.preventDefault();
          void mark('down', state.text);
        }}
      >
        <label className="mark__label" htmlFor="mark-fix">
          Как правильно? Например: «это ст. 66, а не 65» или «не учтено, что он сотрудник»
        </label>
        <textarea id="mark-fix" className="mark__text" rows={2} maxLength={1000} value={state.text} onChange={(e) => setState({ kind: 'fixing', text: e.target.value })} />
        <div className="mark__row">
          <button className="mark__btn mark__btn--send" type="submit" disabled={!state.text.trim()}>
            Отправить
          </button>
          <button className="mark__btn" type="button" onClick={() => setState({ kind: 'idle' })}>
            Отмена
          </button>
          <span className="mark__note">Уйдёт вопрос, ответ и ваша поправка — без ника и аккаунта.</span>
        </div>
      </form>
    );
  }
  const busy = state.kind === 'sending';
  return (
    <>
    {hint && state.kind === 'idle' && (
      <p className="mark__hint" role="note">
        <span>Ответ помог? Отметьте 👍 или 👎 — так ИИ станет точнее. Уходит только вопрос и ответ, без ника и аккаунта.</span>
        <button className="x" type="button" aria-label="Скрыть подсказку" title="Скрыть" onClick={onHintEnd}>
          <CloseIcon size={14} />
        </button>
      </p>
    )}
    <div className="mark" aria-label="Оценить ответ">
      <span className="mark__ask">Ответ верный?</span>
      <button className="mark__btn" type="button" aria-label="Ответ верный" title="Верно" disabled={busy} onClick={() => void mark('up')}>
        👍
      </button>
      <button className="mark__btn" type="button" aria-label="Ответ неверный" title="Неверно" disabled={busy} onClick={() => void mark('down')}>
        👎
      </button>
      <button className="mark__btn" type="button" disabled={busy} onClick={() => setState({ kind: 'fixing', text: '' })}>
        Исправить
      </button>
      {state.kind === 'failed' && <span className="mark__fail" role="alert">{state.why}</span>}
    </div>
    </>
  );
}
