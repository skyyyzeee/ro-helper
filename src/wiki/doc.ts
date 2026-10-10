// The wiki writes its articles and updates as a document of nodes (the editor's): headings, paragraphs, lists,
// tables, pictures, the lines of an update marked added / changed / fixed. Here they become the few blocks the app
// shows (WikiBlock); what the app does not show — embedded maps (the wiki keeps its map closed), videos, link
// previews, rules — is left out, and so is the styling of the text (bold, links): the words stay.
import type { WikiBlock, WikiChange } from './model';

export interface DocNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

/** The wiki's marks of an update's lines. */
const CHANGES: Record<string, WikiChange> = { feat: 'added', update: 'changed', fix: 'fixed' };

/** The words of a node, its line breaks kept. */
function textOf(node: DocNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(textOf).join('');
}

const clean = (text: string) =>
  text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();

/** A picture's address on the world CDN: the main one does not answer through some VPNs (as the catalogs' pictures). */
export const worldCdn = (url: string) => url.replace('https://cdn.majestic-files.net/', 'https://cdn-world.majestic-files.net/');

function walk(node: DocNode, depth: number, out: WikiBlock[]): void {
  switch (node.type) {
    case 'heading': {
      const text = clean(textOf(node));
      if (text) out.push({ type: 'heading', text });
      return;
    }
    case 'paragraph': {
      const text = clean(textOf(node));
      if (text) out.push({ type: 'paragraph', text });
      return;
    }
    case 'blockquote': {
      const text = clean((node.content ?? []).map(textOf).join('\n'));
      if (text) out.push({ type: 'quote', text });
      return;
    }
    // An update's line: «Добавлено…», «Исправлено…», with what it explains under it.
    case 'log': {
      const kind = CHANGES[String(node.attrs?.type)];
      const own = (node.content ?? []).filter((c) => c.type !== 'bulletList' && c.type !== 'orderedList');
      const text = clean(own.map(textOf).join(''));
      if (text) out.push({ type: 'item', text, depth, ...(kind ? { kind } : {}) });
      for (const list of (node.content ?? []).filter((c) => c.type === 'bulletList' || c.type === 'orderedList')) walk(list, depth + 1, out);
      return;
    }
    case 'bulletList':
    case 'orderedList':
      for (const item of node.content ?? []) walk(item, depth, out);
      return;
    case 'listItem': {
      const own = (node.content ?? []).filter((c) => c.type !== 'bulletList' && c.type !== 'orderedList');
      const text = clean(own.map(textOf).join('\n'));
      if (text) out.push({ type: 'item', text, depth });
      for (const list of (node.content ?? []).filter((c) => c.type === 'bulletList' || c.type === 'orderedList')) walk(list, depth + 1, out);
      return;
    }
    case 'table': {
      const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => clean(textOf(cell))));
      const header = (node.content?.[0]?.content ?? []).some((cell) => cell.type === 'tableHeader');
      if (rows.some((row) => row.some(Boolean))) out.push({ type: 'table', rows, header });
      return;
    }
    case 'image': {
      const src = node.attrs?.src;
      if (typeof src === 'string' && src) out.push({ type: 'image', src: worldCdn(src) });
      return;
    }
    case 'gallery': {
      const images = (node.attrs?.images as { url?: string }[] | undefined) ?? [];
      for (const image of images) if (image.url) out.push({ type: 'image', src: worldCdn(image.url) });
      return;
    }
    case 'doc':
      for (const child of node.content ?? []) walk(child, depth, out);
      return;
    // map, iframeEmbed, linkPreview, horizontalRule, entity: not shown.
    default:
      return;
  }
}

/** The blocks of a document of the wiki. */
export function docBlocks(doc: DocNode | undefined): WikiBlock[] {
  const out: WikiBlock[] = [];
  if (doc) walk(doc, 0, out);
  return out;
}

/** How many lines of an update were added, changed, fixed — the top lines, not what explains them. */
export function changeCounts(blocks: WikiBlock[]): Partial<Record<WikiChange, number>> {
  const counts: Partial<Record<WikiChange, number>> = {};
  for (const block of blocks) if (block.type === 'item' && block.kind && block.depth === 0) counts[block.kind] = (counts[block.kind] ?? 0) + 1;
  return counts;
}
