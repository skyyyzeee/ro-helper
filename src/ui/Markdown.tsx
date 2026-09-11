import type { ReactNode } from 'react';
import { usePlatform } from '../platform/PlatformContext';

/** **bold**, `code`, <kbd>key</kbd> and [links](url) — as much as the policy and the release notes use. */
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

/** A small Markdown text: «# » a title, «## » headings, «- » lists, paragraphs split by blank lines. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\r?\n\s*\r?\n/);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.startsWith('# ')) return <h2 key={i} className="art__title">{block.slice(2)}</h2>;
        if (block.startsWith('## ')) return <h3 key={i} className="md__h">{block.slice(3)}</h3>;
        if (block.startsWith('- ')) {
          return (
            <ul key={i} className="md__list">
              {block.split(/\r?\n(?=- )/).map((item, j) => (
                <li key={j}>
                  <Inline text={item.replace(/^- /, '').replace(/\r?\n/g, ' ')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="md__p">
            <Inline text={block.replace(/\r?\n/g, ' ')} />
          </p>
        );
      })}
    </>
  );
}
