import { describe, expect, it } from 'vitest';
import { asksTheAi } from './askFirst';

describe('what the search takes for a question to the AI', () => {
  it('takes a question or a told situation', () => {
    for (const q of [
      'Сотрудник ГИБДД остановил меня и не представился. Он обязан?',
      'можно ли макрос?',
      'что будет за кражу',
      'меня задержали без причины',
      'убил игрока без причины у больницы',
    ])
      expect(asksTheAi(q), q).toBe(true);
  });

  it('leaves a few words of an article, or its number, to the search', () => {
    for (const q of ['кража', '65', 'ук 10.2', 'коап 8.6?', 'превышение скорости', 'ст. 51', '']) expect(asksTheAi(q), q).toBe(false);
  });
});
