import { describe, expect, it } from 'vitest';
import { commandsFor } from './quickCommands';

const ids = (query: string, can: string[] = [], charges: string[] = []) => commandsFor(query, { charges, recent: [], can }).map((c) => c.id);

describe('the commands of the quick search (roadmap 2В)', () => {
  it('finds a command by the beginnings of its words, ё or е, three letters and more', () => {
    expect(ids('избр')).toEqual(['favorites']);
    expect(ids('закреплённое')).toEqual(['pinned']);
    expect(ids('прав серв')).toEqual(['rules']);
    expect(ids('из')).toEqual([]);
    expect(ids('/наст')).toEqual(['settings']);
  });

  it('never offers what the player may not use, nor what has nothing to do', () => {
    expect(ids('тренажер')).toEqual([]);
    expect(ids('тренажер', ['ai.practice'])).toEqual(['trainer']);
    expect(ids('памятки')).toEqual([]);
    expect(ids('очистить калькулятор')).toEqual([]);
    expect(ids('очистить калькулятор', [], ['uk-65#1'])).toEqual(['clear-charges']);
  });

  it('lists every usable one for «/»', () => {
    const all = ids('/', ['ai.analysis', 'memos.read']);
    expect(all).toContain('ask');
    expect(all).toContain('memos');
    expect(all).not.toContain('detention');
  });
});
