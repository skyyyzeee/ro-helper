import type { ReactNode } from 'react';

/**
 * The markup of a memo: a leader's memo is laid out like a document — headings, lists, colours, a table — but kept
 * as text, never as HTML: a memo one writes is read by the whole faction, so nothing in it can run as code. A plain
 * memo written before stays as it was.
 *
 *   # Заголовок            ## Подзаголовок        ---  линия
 *   - пункт                1. пункт по номеру     -> по центру <-
 *   **жирный**  *курсив*  __подчёркнутый__  ~~зачёркнутый~~  {red}цветной{/}
 *   | ячейка | ячейка |    (первая строка — шапка)
 */
export const MEMO_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type MemoColor = (typeof MEMO_COLORS)[number];

export const MEMO_COLOR_NAMES: Record<MemoColor, string> = {
  red: 'Красный',
  orange: 'Оранжевый',
  yellow: 'Жёлтый',
  green: 'Зелёный',
  blue: 'Синий',
  purple: 'Фиолетовый',
};

const INLINE = /\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*|\{(red|orange|yellow|green|blue|purple)\}(.+?)\{\/\}/s;

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  for (let m = INLINE.exec(rest); m; m = INLINE.exec(rest)) {
    if (m.index) out.push(rest.slice(0, m.index));
    const k = `${key}.${n++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<u key={k}>{inline(m[2], k)}</u>);
    else if (m[3] !== undefined) out.push(<s key={k}>{inline(m[3], k)}</s>);
    else if (m[4] !== undefined) out.push(<em key={k}>{inline(m[4], k)}</em>);
    else out.push(<span key={k} className={`mt--${m[5]}`}>{inline(m[6], k)}</span>);
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

const CENTER = /^->\s?(.*?)\s?<-$/;
const BULLET = /^[-•]\s+/;
const NUMBER = /^\d+[.)]\s+/;
const ROW = /^\|.*\|$/;
const SEPARATOR = /^\|[\s:|-]+\|$/;

const cells = (row: string) => row.slice(1, -1).split('|').map((cell) => cell.trim());

/** A memo laid out: its blocks as elements, a line break where the leader broke a line. */
export function MemoText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const lines = paragraph;
    const k = `p${blocks.length}`;
    blocks.push(
      <p key={k} className="mt__p">
        {lines.flatMap((line, i) => (i ? [<br key={`${k}.br${i}`} />, ...inline(line, `${k}.${i}`)] : inline(line, `${k}.${i}`)))}
      </p>,
    );
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const k = `b${blocks.length}`;
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      flush();
      blocks.push(<hr key={k} className="mt__hr" />);
    } else if (line.startsWith('# ') || line.startsWith('## ')) {
      flush();
      const sub = line.startsWith('## ');
      const body = inline(line.slice(sub ? 3 : 2), k);
      blocks.push(sub ? <h4 key={k} className="mt__h2">{body}</h4> : <h3 key={k} className="mt__h1">{body}</h3>);
    } else if (CENTER.test(line.trim())) {
      flush();
      blocks.push(
        <p key={k} className="mt__p mt__center">
          {inline(CENTER.exec(line.trim())![1], k)}
        </p>,
      );
    } else if (BULLET.test(line) || NUMBER.test(line)) {
      flush();
      const numbered = NUMBER.test(line);
      const items: string[] = [];
      for (; i < lines.length && (numbered ? NUMBER : BULLET).test(lines[i]); i++) items.push(lines[i].replace(numbered ? NUMBER : BULLET, ''));
      i--;
      const list = items.map((item, j) => <li key={j}>{inline(item, `${k}.${j}`)}</li>);
      blocks.push(numbered ? <ol key={k} className="mt__list">{list}</ol> : <ul key={k} className="mt__list">{list}</ul>);
    } else if (ROW.test(line.trim())) {
      flush();
      const rows: string[][] = [];
      let head = false;
      for (; i < lines.length && ROW.test(lines[i].trim()); i++) {
        const row = lines[i].trim();
        if (SEPARATOR.test(row)) head ||= rows.length === 1;
        else rows.push(cells(row));
      }
      i--;
      const width = Math.max(...rows.map((row) => row.length));
      const cell = (row: string[], j: number, Tag: 'th' | 'td', r: number) => <Tag key={j}>{inline(row[j] ?? '', `${k}.${r}.${j}`)}</Tag>;
      blocks.push(
        <div key={k} className="mt__table">
          <table>
            {head && (
              <thead>
                <tr>{Array.from({ length: width }, (_, j) => cell(rows[0], j, 'th', 0))}</tr>
              </thead>
            )}
            <tbody>
              {rows.slice(head ? 1 : 0).map((row, r) => (
                <tr key={r}>{Array.from({ length: width }, (_, j) => cell(row, j, 'td', r + 1))}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return <div className="mt">{blocks}</div>;
}

/** The memo as plain words: for a notice over the game and a one-line preview. */
export function memoPlain(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^-{3,}$/.test(line.trim()) && !SEPARATOR.test(line.trim()))
    .map((line) =>
      line
        .replace(/^#{1,2} /, '')
        .replace(/^->\s?(.*?)\s?<-$/, '$1')
        .replace(ROW, (row) => cells(row).join(' · '))
        .replace(/\{(?:red|orange|yellow|green|blue|purple)\}|\{\/\}/g, '')
        .replace(/\*\*|__|~~/g, '')
        .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The palette colour nearest a CSS colour, or none for black, white and greys: those are the text's own. */
export function nearestColor(css: string): MemoColor | null {
  const rgb = parseColor(css);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.18) return null;
  const d = max - min;
  const hue = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return hue < 15 || hue >= 330 ? 'red' : hue < 40 ? 'orange' : hue < 70 ? 'yellow' : hue < 170 ? 'green' : hue < 255 ? 'blue' : 'purple';
}

const NAMED: Record<string, string> = { red: '#ff0000', orange: '#ffa500', yellow: '#ffff00', green: '#008000', lime: '#00ff00', blue: '#0000ff', navy: '#000080', purple: '#800080', fuchsia: '#ff00ff', teal: '#008080', maroon: '#800000', olive: '#808000' };

function parseColor(css: string): [number, number, number] | null {
  const value = NAMED[css.trim().toLowerCase()] ?? css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((at) => parseInt(h.slice(at, at + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'TABLE', 'UL', 'OL', 'BLOCKQUOTE', 'SECTION', 'ARTICLE']);
const SKIP = new Set(['STYLE', 'SCRIPT', 'HEAD', 'META', 'TITLE', 'IMG', 'svg']);

/**
 * A document copied out of Word or Google Docs, in the memo's markup: its headings, lists, emphasis, colours,
 * centred lines and tables. What the markup has no words for — fonts, sizes, pictures — is left out.
 */
export function memoFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];
  let line = '';
  const end = () => {
    const done = line.replace(/[ \t]+/g, ' ').trim();
    if (done) lines.push(done);
    line = '';
  };

  const text = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ');
    if (!(node instanceof Element) || SKIP.has(node.tagName) || isWordBullet(node)) return '';
    if (node.tagName === 'BR') return '\n';
    const inner = [...node.childNodes].map(text).join('');
    if (!inner.trim()) return inner;
    return wrap(node, inner);
  };

  const block = (node: Node, list?: { numbered: boolean; at: number }) => {
    if (!(node instanceof Element)) {
      line += text(node);
      return;
    }
    if (SKIP.has(node.tagName)) return;
    if (node.tagName === 'HR') {
      end();
      lines.push('---');
      return;
    }
    if (node.tagName === 'TABLE') {
      end();
      const rows = [...node.querySelectorAll('tr')].filter((row) => row.closest('table') === node);
      rows.forEach((row, r) => {
        const cellsOf = [...row.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
        lines.push(`| ${cellsOf.map((c) => text(c).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim()).join(' | ')} |`);
        if (r === 0) lines.push(`|${cellsOf.map(() => '---').join('|')}|`);
      });
      lines.push('');
      return;
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      end();
      let at = 0;
      for (const child of node.children) if (child.tagName === 'LI') block(child, { numbered: node.tagName === 'OL', at: ++at });
      return;
    }
    if (!BLOCKS.has(node.tagName)) {
      // Google Docs wraps the whole document in one <b> that is not bold: its paragraphs are blocks still.
      if (node.querySelector([...BLOCKS].join(','))) for (const child of node.childNodes) block(child);
      else line += text(node);
      return;
    }
    end();
    const style = node.getAttribute('style') ?? '';
    const cls = node.getAttribute('class') ?? '';
    const level = /^H1$/.test(node.tagName) || /Title|Heading1/i.test(cls) ? '# ' : /^H[2-6]$/.test(node.tagName) || /Heading[2-6]|Subtitle/i.test(cls) ? '## ' : '';
    const prefix = list ? (list.numbered ? `${list.at}. ` : '- ') : /MsoListParagraph/i.test(cls) ? '- ' : level;
    const inner = [...node.childNodes].some((c) => c instanceof Element && BLOCKS.has(c.tagName));
    if (inner && !list) {
      for (const child of node.childNodes) block(child);
      end();
      return;
    }
    const body = [...node.childNodes].map(text).join('').replace(/[ \t]+/g, ' ').trim();
    if (!body) return;
    // A heading is bold already: its own bold would only clutter the markup.
    const plain = level ? body.replace(/^\*\*(.*)\*\*$/s, '$1') : body;
    const centred = !prefix && (/text-align:\s*center/i.test(style) || node.getAttribute('align') === 'center');
    for (const [i, part] of plain.split('\n').entries()) lines.push(i ? part.trim() : centred ? `-> ${part.trim()} <-` : prefix + part.trim());
  };

  for (const child of doc.body.childNodes) block(child);
  end();
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Word draws a list's bullet as text of its own, marked to be ignored. */
const isWordBullet = (node: Element) => /mso-list:\s*Ignore/i.test(node.getAttribute('style') ?? '');

function wrap(node: Element, inner: string): string {
  const style = node.getAttribute('style') ?? '';
  const weight = /font-weight:\s*(\w+)/i.exec(style)?.[1];
  const tag = node.tagName;
  const bold = weight ? weight === 'bold' || Number(weight) >= 600 : tag === 'B' || tag === 'STRONG';
  const italic = /font-style:\s*italic/i.test(style) || ((tag === 'I' || tag === 'EM') && !/font-style:\s*normal/i.test(style));
  const underline = /text-decoration[^;]*underline/i.test(style) || tag === 'U';
  const strike = /text-decoration[^;]*line-through/i.test(style) || tag === 'S' || tag === 'STRIKE' || tag === 'DEL';
  const color = nearestColor(/(?:^|;)\s*color:\s*([^;]+)/i.exec(style)?.[1] ?? node.getAttribute('color') ?? '');
  // The markers hug the words: spaces at the ends go outside, or the markup would not close.
  const [, lead, body, trail] = /^(\s*)(.*?)(\s*)$/s.exec(inner)!;
  let out = body;
  if (strike) out = `~~${out}~~`;
  if (underline) out = `__${out}__`;
  if (italic) out = `*${out}*`;
  if (bold) out = `**${out}**`;
  if (color) out = `{${color}}${out}{/}`;
  return lead + out + trail;
}
