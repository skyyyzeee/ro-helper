import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changeCounts, docBlocks, type DocNode } from './doc';

const root = join(import.meta.dirname, '..', '..');
const raw = (name: string) => JSON.parse(readFileSync(join(root, 'data', 'wiki', `${name}.json`), 'utf8')).items as { slug: string; content: DocNode }[];

describe('the wiki’s documents as the app shows them', () => {
  it('keeps headings, paragraphs, lists with their depth, quotes, tables and pictures; leaves maps and styling out', () => {
    const blocks = docBlocks({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Покупка' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Купите ' }, { type: 'text', text: 'GTA V' }, { type: 'hardBreak' }, { type: 'text', text: 'в Steam.' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Первое' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Вложенное' }] }] }] }] }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Важно' }] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Уровень' }] }] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] }] }] },
        { type: 'image', attrs: { src: 'https://cdn.majestic-files.net/public/a.webp' } },
        { type: 'map', attrs: { params: '?x=1' } },
        { type: 'horizontalRule' },
      ],
    });
    expect(blocks).toEqual([
      { type: 'heading', text: 'Покупка' },
      { type: 'paragraph', text: 'Купите GTA V\nв Steam.' },
      { type: 'item', text: 'Первое', depth: 0 },
      { type: 'item', text: 'Вложенное', depth: 1 },
      { type: 'quote', text: 'Важно' },
      { type: 'table', rows: [['Уровень'], ['1']], header: true },
      { type: 'image', src: 'https://cdn-world.majestic-files.net/public/a.webp' },
    ]);
  });

  it('counts an update’s lines by the wiki’s marks, not the lines that explain them (real data)', () => {
    const update = raw('updates').find((u) => u.slug === 'sborka-437602057')!;
    const blocks = docBlocks(update.content);
    expect(changeCounts(blocks)).toEqual({ added: 3, changed: 3, fixed: 15 });
    // «Уменьшена стоимость…» and, under it, «Разница… компенсирована»: the explanation is a line with no mark — not
    // counted as a change of its own.
    expect(blocks.some((b) => b.type === 'item' && !b.kind && b.text.startsWith('Разница в стоимости'))).toBe(true);
  });

  it('reads every article of the wiki into something to show (real data)', () => {
    for (const post of raw('posts')) expect(docBlocks(post.content).length, post.slug).toBeGreaterThan(0);
  });
});
