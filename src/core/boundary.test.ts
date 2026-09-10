import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreDir = join(import.meta.dirname, '.');
const forbidden = [/from ['"]react/, /from ['"]react-dom/, /from ['"]@tauri-apps\//, /from ['"]\.\.\/(ui|platform)\b/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('law core boundary', () => {
  it('does not depend on the UI, React or Tauri', () => {
    const offenders = sourceFiles(coreDir).filter((file) => {
      const text = readFileSync(file, 'utf8');
      return forbidden.some((pattern) => pattern.test(text));
    });
    expect(offenders).toEqual([]);
  });
});
