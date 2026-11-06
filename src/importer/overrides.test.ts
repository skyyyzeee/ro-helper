import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPack } from './buildPack';
import { parseLawText } from './lawText';
import { applyOverrides, type Overrides } from './overrides';

const root = join(import.meta.dirname, '..', '..');
const ukText = readFileSync(join(root, 'data', 'tverskoi', 'sources', 'uk.txt'), 'utf8');
const overrides = JSON.parse(readFileSync(join(root, 'data', 'tverskoi', 'overrides.json'), 'utf8')) as Overrides;

function parseAndFix() {
  const parsed = parseLawText(ukText, 'uk', 'criminal-code');
  const result = applyOverrides(parsed.articles, parsed.issues, overrides);
  return { articles: parsed.articles, ...result };
}

describe('manual fixes', () => {
  it('fill in what the parser could not read and clear its issue', () => {
    const { articles, issues, stale } = parseAndFix();
    const fixed = articles.find((a) => a.id === 'uk-153')!.parts[0];
    expect(fixed.punishment).toEqual({
      alternatives: [{ kind: 'imprisonment-by-stars', monthsPerStar: 10 }],
      additional: [],
    });
    expect(issues).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('survive re-parsing: the same source gives the same fixed result every time', () => {
    expect(parseAndFix().articles).toEqual(parseAndFix().articles);
  });

  it('report a fix for a part that no longer exists', () => {
    const parsed = parseLawText(ukText, 'uk', 'criminal-code');
    const { stale } = applyOverrides(parsed.articles, parsed.issues, { 'uk-153': { reason: 'test', parts: { '9': { text: 'x' } } } });
    expect(stale).toEqual([{ article: 'uk-153', line: '9', reason: 'Правка для несуществующей части «9»' }]);
  });
});

describe('manual fixes in a server build', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('report a fix for an article that no longer exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'ro-helper-'));
    cpSync(join(root, 'data', 'tverskoi', 'sources'), join(dir, 'sources'), { recursive: true });
    cpSync(join(root, 'data', 'tverskoi', 'calculator.json'), join(dir, 'calculator.json'));
    // The server's own fixes to the УК stay, so what they resolve is not reported; the one for a missing article is added.
    const uk = Object.fromEntries(Object.entries(overrides).filter(([id]) => id.startsWith('uk-')));
    writeFileSync(join(dir, 'overrides.json'), JSON.stringify({ ...uk, 'uk-999': { reason: 'test', title: 'x' } }));
    const { issues } = buildPack(dir, { id: 't', name: 'T', status: 'active', documents: ['uk'] });
    expect(issues).toEqual([{ article: 'uk-999', line: 'uk-999', reason: 'Правка для несуществующей статьи' }]);
  });
});
