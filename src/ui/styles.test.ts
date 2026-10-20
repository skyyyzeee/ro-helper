import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const uiDir = join(import.meta.dirname, '.');

/** Where a block of a style sheet is left open: the browser then nests every rule after it and none applies. */
function unclosed(css: string): number | null {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' ')).replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');
  const open: number[] = [];
  text.split('\n').forEach((line, i) => {
    for (const c of line) {
      if (c === '{') open.push(i + 1);
      if (c === '}') open.pop();
    }
  });
  return open.length ? open[0] : null;
}

describe('style sheets', () => {
  // 2.19.0 shipped with one `}` lost in a merge: the tooltips, the poll and the crash screen went unstyled.
  it('close every block they open', () => {
    const sheets = readdirSync(uiDir).filter((name) => name.endsWith('.css'));
    expect(sheets.length).toBeGreaterThan(0);
    const broken = sheets.map((name) => ({ name, line: unclosed(readFileSync(join(uiDir, name), 'utf8')) })).filter((s) => s.line !== null);
    expect(broken).toEqual([]);
  });

  it('finds a block left open', () => {
    expect(unclosed('.a {\n  color: red;\n.b {\n  color: blue;\n}\n')).toBe(1);
    expect(unclosed('.a { content: "{"; }\n/* } */\n')).toBeNull();
  });
});
