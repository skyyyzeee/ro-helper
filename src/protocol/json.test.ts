import { describe, expect, it } from 'vitest';
import { readJson } from './json';

describe('the AI\'s JSON as it comes', () => {
  it('reads it whole, out of fences, or the one object amid words', () => {
    expect(readJson('{"a": 1}')).toEqual({ a: 1 });
    expect(readJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(readJson('Вот разбор: {"a": {"b": [1, 2]}} Надеюсь, помог.')).toEqual({ a: { b: [1, 2] } });
    expect(readJson('["кража"]')).toEqual(['кража']);
  });

  it('mends nothing: a cut or broken object is no answer', () => {
    expect(() => readJson('{"a": [1, 2')).toThrow();
    expect(() => readJson('Не могу ответить.')).toThrow();
    expect(() => readJson('{"a": 1} и ещё {"b": 2}')).toThrow();
  });
});
