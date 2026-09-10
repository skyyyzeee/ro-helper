import { describe, expect, it } from 'vitest';
import { stem } from './stem';

describe('Russian stemmer', () => {
  it('brings the forms of a word to one stem', () => {
    const forms = (...words: string[]) => new Set(words.map(stem));
    expect(forms('кража', 'кражу', 'кражи', 'кражей', 'краже')).toEqual(new Set(['краж']));
    expect(forms('превышение', 'превышения', 'превышением')).toEqual(new Set(['превышен']));
    expect(forms('скорость', 'скорости', 'скоростью')).toEqual(new Set(['скорост']));
    expect(forms('оружие', 'оружия', 'оружием')).toEqual(new Set(['оруж']));
    expect(forms('взятка', 'взятки', 'взятку')).toEqual(new Set(['взятк']));
  });

  it('follows the algorithm on each kind of ending', () => {
    expect(stem('вагоны')).toBe('вагон'); // noun
    expect(stem('важная')).toBe('важн'); // adjective
    expect(stem('важнейшие')).toBe('важн'); // adjective, then superlative
    expect(stem('вдохновенно')).toBe('вдохновен'); // noun, then нн → н
    expect(stem('прочитав')).toBe('прочита'); // perfective gerund after «а»
    expect(stem('тонированные')).toBe('тонирова'); // participle after «а» + adjective
    expect(stem('управляющим')).toBe('управля'); // participle + adjective
    expect(stem('задержался')).toBe('задержа'); // reflexive, then verb after «а»
  });

  it('leaves short and vowel-less words alone', () => {
    expect(stem('мвд')).toBe('мвд');
    expect(stem('ук')).toBe('ук');
  });
});
