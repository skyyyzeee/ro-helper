import { describe, expect, it } from 'vitest';
import { wantsFullAnalysis } from './depth';

describe('the full analysis without being asked (an idea from LEX)', () => {
  it('for a long situation, a test with its answers, a matter for a court or a prosecutor', () => {
    expect(wantsFullAnalysis('Сотрудник провёл обыск багажника без моего присутствия при остановке. '.repeat(5))).toBe(true);
    expect(wantsFullAnalysis('Кто вправе составить протокол?\nа) сотрудник ГИБДД\nб) гражданин\nв) прокурор')).toBe(true);
    expect(wantsFullAnalysis('Какие ходатайства заявить прокурору, если миранду зачитали без вопроса о понимании?')).toBe(true);
    expect(wantsFullAnalysis('как обжаловать штраф')).toBe(true);
  });

  it('not for a short question: that is answered quickly, as before', () => {
    for (const q of ['что будет за кражу', 'отказ от штрафа', 'Обязан ли сотрудник ГИБДД представиться?', 'ношение оружия без лицензии', 'судимость за кражу снимается?', 'где искать статью про оружие'])
      expect(wantsFullAnalysis(q), q).toBe(false);
    expect(wantsFullAnalysis('подал иск в суд')).toBe(true);
  });
});
