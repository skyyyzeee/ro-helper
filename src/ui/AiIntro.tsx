import type { ReactNode } from 'react';

/**
 * The first screen of a tab of the AI, the same in every one as in «Разбор»: a badge, what to do, and an example
 * pressed to try it.
 */
export function AiIntro({ icon, title, children, examples, onExample, disabled }: { icon: ReactNode; title: string; children: ReactNode; examples: string[]; onExample: (text: string) => void; disabled?: boolean }) {
  return (
    <div className="ai__intro ai__intro--tab">
      <span className="ai__hello-icon" aria-hidden="true">
        {icon}
      </span>
      <h2 className="ai__hello">{title}</h2>
      <p className="set__hint">{children}</p>
      <div className="ai__examples" aria-label={examples.length > 1 ? 'Примеры' : 'Пример'}>
        {examples.map((example) => (
          <button key={example} type="button" className="ai__example" disabled={disabled} onClick={() => onExample(example)}>
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
