import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPack } from './buildPack';
import { parseLawText } from './lawText';
import { applyOverrides, type Overrides } from './overrides';

const root = join(import.meta.dirname, '..', '..');
const koapText = readFileSync(join(root, 'data', 'tverskoi', 'sources', 'koap.txt'), 'utf8');
const overrides = JSON.parse(readFileSync(join(root, 'data', 'tverskoi', 'overrides.json'), 'utf8')) as Overrides;

function parseAndFix() {
  const parsed = parseLawText(koapText, 'koap', 'administrative-code');
  const result = applyOverrides(parsed.articles, parsed.issues, overrides);
  return { articles: parsed.articles, ...result };
}

describe('manual fixes', () => {
  it('fill in what the parser could not read and clear its issue', () => {
    const { articles, issues, stale } = parseAndFix();
    const fixed = articles.find((a) => a.id === 'koap-8.17')!.parts[0];
    expect(fixed.punishment).toEqual({
      alternatives: [{ kind: 'evacuation' }],
      additional: ['оплата повышенного штрафа по тарифам спецстоянки'],
    });
    expect(issues).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('survive re-parsing: the same source gives the same fixed result every time', () => {
    expect(parseAndFix().articles).toEqual(parseAndFix().articles);
  });

  it('report a fix for a part that no longer exists', () => {
    const parsed = parseLawText(koapText, 'koap', 'administrative-code');
    const { stale } = applyOverrides(parsed.articles, parsed.issues, { 'koap-8.6': { reason: 'test', parts: { '9': { text: 'x' } } } });
    expect(stale).toEqual([{ article: 'koap-8.6', line: '9', reason: 'Правка для несуществующей части «9»' }]);
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
    writeFileSync(join(dir, 'overrides.json'), JSON.stringify({ 'uk-999': { reason: 'test', title: 'x' } }));
    const { issues } = buildPack(dir, { id: 't', name: 'T', status: 'active', documents: ['uk'] });
    expect(issues).toEqual([{ article: 'uk-999', line: 'uk-999', reason: 'Правка для несуществующей статьи' }]);
  });
});
