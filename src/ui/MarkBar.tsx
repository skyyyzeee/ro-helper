import { useState } from 'react';
import type { Vote } from './feedback';

type State = { kind: 'idle' } | { kind: 'fixing'; text: string } | { kind: 'sending' } | { kind: 'sent'; vote: Vote } | { kind: 'failed'; why: string };

/**
 * Under an answer: was it right? 👍, 👎, or «Исправить» — what is right instead. One mark an answer; it is sent on
 * the press, to improve the assistant, and the player is told what goes (PRIVACY.md).
 */
export function MarkBar({ send }: { send: (vote: Vote, correction?: string) => Promise<void> }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const mark = async (vote: Vote, correction?: string) => {
    setState({ kind: 'sending' });
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
  );
}
