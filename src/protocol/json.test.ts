import { describe, expect, it } from 'vitest';
import { readJson } from './json';

describe('the AI\'s JSON as it comes', () => {
  it('reads it whole, out of fences, or the one object amid words', () => {
    expect(readJson('{"a": 1}')).toEqual({ a: 1 });
    expect(readJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(readJson('Вот разбор: {"a": {"b": [1, 2]}} Надеюсь, помог.')).toEqual({ a: { b: [1, 2] } });
    expect(readJson('["кража"]')).toEqual(['кража']);
  });

  it('reads the object the model completed when it goes on after it — the summary after the close is dropped', () => {
    // As GigaChat-3-Ultra wrote it on the exam of 25.10.2026.
    const said = '{"steps":[{"step":"Посадил в КПЗ на 30 минут","verdict":"violation","sources":["R2"]}],"missed":[{"what":"Не озвучил права","sources":["R5"]}]}","summary":"За 1 звезду — нарушение."}';
    expect(readJson(said)).toEqual({ steps: [{ step: 'Посадил в КПЗ на 30 минут', verdict: 'violation', sources: ['R2'] }], missed: [{ what: 'Не озвучил права', sources: ['R5'] }] });
    // A brace or a quote inside a string does not close anything.
    expect(readJson('Ответ: {"a": "скобка } и \\" кавычка", "b": [1]} хвост')).toEqual({ a: 'скобка } и " кавычка', b: [1] });
  });

  it('mends nothing: a cut or broken object is no answer', () => {
    expect(() => readJson('{"a": [1, 2')).toThrow();
    expect(() => readJson('Не могу ответить.')).toThrow();
  });
});
