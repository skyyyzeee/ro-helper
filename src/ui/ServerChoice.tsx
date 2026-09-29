import { ServerIcon } from './icons';
import { SERVERS } from './profile';

/** Picking a server: at the first launch and from the settings, the same list. */
/** `compact`: the three as tiles in a row, for the switcher over the search (direction C). */
export function ServerChoice({ value, onPick, compact = false }: { value: string; onPick: (id: string) => void; compact?: boolean }) {
  return (
    <div className={compact ? 'ob__options ob__options--tiles' : 'ob__options'} role="radiogroup" aria-label="Сервер">
      {SERVERS.map((choice) => (
        <button
          key={choice.id}
          type="button"
          role="radio"
          aria-checked={value === choice.id}
          disabled={choice.status !== 'active'}
          className={value === choice.id ? 'ob__option ob__option--on' : 'ob__option'}
          onClick={() => onPick(choice.id)}
        >
          <span className="ob__option-mark">
            <ServerIcon id={choice.id} size={20} />
          </span>
          <span className="ob__option-name">{choice.name}</span>
          <span className="sp" />
          {(choice.status === 'soon' || choice.note) && (
            <span className="ob__option-note">{[choice.status === 'soon' ? 'скоро' : null, choice.note].filter(Boolean).join(' · ')}</span>
          )}
          <span className="ob__radio" />
        </button>
      ))}
    </div>
  );
}
