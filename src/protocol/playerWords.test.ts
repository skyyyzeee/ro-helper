import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import { classify } from './classify';
import { checkNickname, nicknameOf } from './nickname';
import { verdictLabel } from './verdict';

// Questions players ask (the exam group «players», October 2026) that the app took for the wrong kind or answered by nothing.
describe('what players ask, read the way they mean it', () => {
  const pack = TVERSKOI_PACK;

  it('takes a deed with no reason in the game, leaving the game, a macro for the rules of the project', () => {
    expect(classify(pack, 'Я убил игрока без причины у больницы, что мне будет?').scope).toBe('mixed');
    expect(classify(pack, 'Игрок вышел из игры, когда его задерживали').scope).toBe('mixed');
    expect(classify(pack, 'Можно ли использовать макрос для стрельбы?').scope).toBe('server_rule');
  });

  it('takes what a member of a service did for both the law and the rules of the state factions', () => {
    expect(classify(pack, 'Сотрудник МВД в форме ограбил магазин').scope).toBe('mixed');
    // Something done to an officer is the laws' alone.
    expect(classify(pack, 'Сколько лет дадут за убийство сотрудника полиции?').scope).toBe('law');
  });

  it('takes a question of a faction’s service — its hours, its course, its reprimands — for the charters', () => {
    for (const q of ['Во сколько у армии обед и вечерняя поверка?', 'Как пройти КМБ быстрее всех?', 'Сколько выговоров до увольнения в ФСБ?'])
      expect(classify(pack, q), q).toMatchObject({ type: 'legal', scope: 'law' });
  });

  it('checks a character’s name by the rule on names, with no AI', () => {
    expect(classify(pack, 'Aiden_Arokij').type).toBe('nickname');
    expect(nicknameOf('проверь ник Иван_Петров')).toEqual({ first: 'Иван', last: 'Петров' });
    expect(nicknameOf('у меня украли телефон')).toBeNull();

    const latin = checkNickname(pack, { first: 'Aiden', last: 'Arokij' });
    expect(latin.text).toMatch(/не подойдёт: написан латиницей/);
    expect(latin.hits[0].article.parts[0].text).toMatch(/nonRP "Имя Фамилия"/);
    expect(checkNickname(pack, { first: 'Иван', last: 'Петров' }).text).toMatch(/явных ошибок нет/);
    expect(checkNickname(pack, { first: 'иван', last: 'Петров' }).text).toMatch(/Имя с маленькой буквы/);
  });
});

describe('the answer in the words of the question', () => {
  it('answers «можно ли» with «Можно» or «Нельзя», «обязан ли» with «Обязан», and «Да» or «Нет» elsewhere', () => {
    expect(verdictLabel('no', 'Можно ли использовать макрос?')).toBe('Нельзя');
    expect(verdictLabel('yes', 'Имеет ли право полицейский обыскать машину?')).toBe('Можно');
    expect(verdictLabel('no', 'Законно ли меня задержали?')).toBe('Незаконно');
    expect(verdictLabel('yes', 'Обязан ли сотрудник ГИБДД представиться?')).toBe('Обязан');
    expect(verdictLabel('yes', 'Является ли это кражей?')).toBe('Да');
    expect(verdictLabel('clarify', 'Можно ли?')).toBe('Нужно уточнение');
  });
});
