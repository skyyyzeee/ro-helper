import { describe, expect, it } from 'vitest';
import { ARBATSKIY_PACK, KUTUZOVSKIY_PACK, TVERSKOI_PACK } from '../data';
import { directPunishment, punishmentSubject } from './direct';

const titles = (pack = TVERSKOI_PACK, question: string) => directPunishment(pack, question)?.hits.map((hit) => `${hit.document.short} ${hit.article.number}`) ?? null;

describe('«что будет за …», answered by the base alone', () => {
  it('takes the deed out of the question', () => {
    expect(punishmentSubject('Что будет за кражу?')).toBe('кражу');
    expect(punishmentSubject('сколько дают за 65')).toBe('65');
    expect(punishmentSubject('какой штраф за превышение скорости')).toBe('превышение скорости');
    expect(punishmentSubject('а что ему грозит за угон?')).toBe('угон');
    expect(punishmentSubject('наказание за хулиганство')).toBe('хулиганство');
    // A story is the AI's: too many words after «за», or no «за» at all.
    expect(punishmentSubject('что мне будет за то что я ударил человека возле мвд в маске')).toBeNull();
    expect(punishmentSubject('меня задержали без причины')).toBeNull();
  });

  it('finds the article that names the deed, by its title or the server\'s dictionary', () => {
    expect(titles(TVERSKOI_PACK, 'Что будет за кражу?')).toEqual(['УК 65']);
    expect(titles(TVERSKOI_PACK, 'сколько дают за 65')).toEqual(['УК 65']);
    expect(titles(TVERSKOI_PACK, 'наказание за угон')).toEqual(['УК 67']);
    expect(titles(TVERSKOI_PACK, 'штраф за превышение скорости')).toEqual(['КоАП 8.6']);
    expect(titles(ARBATSKIY_PACK, 'что будет за мошенничество')).toEqual(['УК 10.1']);
    expect(titles(KUTUZOVSKIY_PACK, 'что будет за взятку')).toContain('УК 15.4');
  });

  it('takes the deed heading a title, not one it is only a word of', () => {
    const murder = titles(TVERSKOI_PACK, 'что грозит за убийство')!;
    expect(murder).toEqual(['УК 51', 'УК 52']);
    expect(murder).not.toContain('УК 57'); // «Угроза убийством»
    expect(titles(TVERSKOI_PACK, 'что будет за хулиганство')).toEqual(['УК 73', 'КоАП 11.1']); // and «Мелкое хулиганство»
  });

  it('leaves to the AI a deed no title names, or a number the codes do not have', () => {
    expect(titles(TVERSKOI_PACK, 'что будет за маску')).toBeNull();
    expect(titles(TVERSKOI_PACK, 'что будет за уход от погони')).toBeNull();
    expect(titles(ARBATSKIY_PACK, 'что будет за ук 104')).toBeNull();
  });
});
