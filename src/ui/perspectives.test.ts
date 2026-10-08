import { describe, expect, it } from 'vitest';
import type { Organization } from '../core';
import { perspectivesFor, sideOfQuestion } from './ai';

const org = (kind?: 'state' | 'crime'): Organization => ({ id: kind ?? 'none', name: '', ...(kind ? { kind } : {}), documents: [] });

describe('the side a case is seen from follows the profile', () => {
  it('its own side first; an officer\'s powers for the state, the crime\'s view for the crime', () => {
    expect(perspectivesFor(org())).toEqual(['citizen', 'lawyer']);
    expect(perspectivesFor(org('state'))).toEqual(['state', 'lawyer', 'citizen']);
    expect(perspectivesFor(org('crime'))).toEqual(['crime', 'lawyer', 'citizen']);
  });

  it('a case told as done to the player is the citizen\'s, whatever the organisation; an officer\'s own task stays theirs', () => {
    const mvd = org('state');
    for (const question of [
      'Мне не зачитали права при задержании, что мне грозит?',
      'Меня задержали без причины',
      'Сотрудник остановил меня на улице и требует паспорт',
      'Меня незаконно оштрафовали',
      'Нарушили мои права при обыске',
      'У меня требуют документы',
    ]) expect(sideOfQuestion(question, mvd), question).toBe('citizen');
    for (const question of ['Мне нужно задержать человека в маске', 'Задержанный просит адвоката', 'Что мне делать, если гражданин молчит?'])
      expect(sideOfQuestion(question, mvd), question).toBe('state');
    expect(sideOfQuestion('Меня задержали', org('crime'))).toBe('citizen');
    expect(sideOfQuestion('Меня задержали', org())).toBe('citizen');
  });
});
