import { SERVERS } from './profile';

/** Picking a server: at the first launch and from the settings, the same list. */
export function ServerChoice({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  return (
    <div className="ob__options" role="radiogroup" aria-label="Сервер">
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
