import { describe, expect, it } from 'vitest';
import { bonusNow, jobOf, moscowMinutes, timeLeft } from './jobs';

const OVERVIEW =
  'Без требований к уровню можно начать с работы шахтёром . С 1 уровня доступны строитель и собиратель . На 2 уровне открывается больше направлений: повар , рыбак , таксист и кладоискатель . Легальные: строитель , шахтёр , таксист . Полулегальные: рыбак , фермер . Нелегальные: закладчик , угонщик .';

describe('a job, as the wiki’s articles tell of it', () => {
  it('reads the level, the rank, the lawfulness and the bonus hours', () => {
    const job = jobOf('Мусорщик', 'Работа доступна с 3 уровня персонажа или после достижения 2 ранга. Начиная с 06:00 до 13:00 выплата повышается на 15%. Аренда — ₽500 в час.', OVERVIEW);
    expect(job).toEqual({ level: 3, rank: 2, bonuses: [{ from: '06:00', to: '13:00', percent: 15, text: 'Начиная с 06:00 до 13:00 выплата повышается на 15%.' }] });
    expect(jobOf('Строитель', 'Работа с 08:00 до 12:00 и с 13:00 до 17:00 увеличивает зарплату на 15%', OVERVIEW).bonuses.map((b) => `${b.from}-${b.to}`)).toEqual(['08:00-12:00', '13:00-17:00']);
  });

  it('takes a level the article does not say from the overview, and the lawfulness from its lists', () => {
    expect(jobOf('Таксист', 'Оплата за километр такси эконом-класса ₽400.', OVERVIEW)).toMatchObject({ level: 2, legality: 'legal' });
    expect(jobOf('Шахтёр', 'Добывает руду.', OVERVIEW)).toMatchObject({ level: 1, legality: 'legal' });
    expect(jobOf('Угонщик', 'С 09:00 до 01:00 доход за сдачу транспорта увеличивается на 50%', OVERVIEW)).toMatchObject({ legality: 'illegal', bonuses: [{ from: '09:00', to: '01:00', percent: 50 }] });
    // Hours with no percent are no bonus to the pay.
    expect(jobOf('Сыщик', 'С 10:00 до 00:00 в ящиках находится увеличенное количество ресурсов.', OVERVIEW).bonuses).toEqual([]);
  });

  it('knows a bonus on now and how long it lasts, past midnight too', () => {
    const job = jobOf('Угонщик', 'С 09:00 до 01:00 доход увеличивается на 50%', OVERVIEW);
    expect(bonusNow(job, 23 * 60)).toMatchObject({ left: 120 });
    expect(bonusNow(job, 30)).toMatchObject({ left: 30 });
    expect(bonusNow(job, 3 * 60)).toBeNull();
    expect(timeLeft(130)).toBe('2 ч 10 мин');
    expect(timeLeft(45)).toBe('45 мин');
    // 12:00 UTC is 15:00 in Moscow.
    expect(moscowMinutes(new Date('2026-10-22T12:00:00Z'))).toBe(15 * 60);
  });
});
