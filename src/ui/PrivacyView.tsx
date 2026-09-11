import type { ReactNode } from 'react';
import policy from '../../PRIVACY.md?raw';
import { usePlatform } from '../platform/PlatformContext';
import { BackIcon } from './icons';

/** The Russian part of PRIVACY.md: everything before the English one, after the line «---». */
export const PRIVACY_TEXT = policy.split(/\r?\n---\r?\n/)[0];

/** **bold**, `code`, <kbd>key</kbd> and [links](url) — all the policy uses. */
function Inline({ text }: { text: string }) {
  const platform = usePlatform();
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`|<kbd>(.+?)<\/kbd>|\[(.+?)\]\((.+?)\)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    parts.push(text.slice(last, m.index));
    const key = m.index;
    if (m[1]) parts.push(<strong key={key}>{m[1]}</strong>);
    else if (m[2]) parts.push(<code key={key}>{m[2]}</code>);
    else if (m[3]) parts.push(<kbd key={key}>{m[3]}</kbd>);
    else {
      const url = m[5];
      parts.push(
        <button key={key} className="link" type="button" onClick={() => void platform.openExternal(url)}>
          {m[4]}
        </button>,
      );
    }
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

/** The privacy policy inside the app, from the same file as on GitHub. */
export function PrivacyView({ onBack }: { onBack: () => void }) {
  const blocks = PRIVACY_TEXT.trim().split(/\r?\n\r?\n/);
  return (
    <article className="art privacy" aria-label="Политика конфиденциальности">
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>Назад</span>
      </button>
      {blocks.map((block, i) => {
        if (block.startsWith('# ')) return <h2 key={i} className="art__title">{block.slice(2)}</h2>;
        if (block.startsWith('## ')) return <h3 key={i} className="privacy__h">{block.slice(3)}</h3>;
        if (block.startsWith('- ')) {
          return (
            <ul key={i} className="privacy__list">
              {block.split(/\r?\n/).map((item, j) => (
                <li key={j}>
                  <Inline text={item.replace(/^- /, '')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="privacy__p">
            <Inline text={block.replace(/\r?\n/g, ' ')} />
          </p>
        );
      })}
    </article>
  );
}
