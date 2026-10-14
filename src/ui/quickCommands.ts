import type { Capability } from '../account/capabilities';
import type { QuickRequest, QuickState, QuickTarget } from '../platform/types';

/**
 * A command of the quick search (roadmap 2В): typed instead of an article, it does something in the assistant. Shown
 * only when the player may use it (`needs`, from what the overlay tells the bar) and when there is something to do.
 */
export interface QuickCommand {
  id: string;
  label: string;
  /** What it is found by: each word of these, begun, finds it. */
  words: string[];
  needs?: Capability;
  /** Only when there is something to do: a calculator with charges, recent articles. */
  when?: (state: QuickState) => boolean;
  /** Asked of the assistant, or done in the bar itself. */
  run: { request: QuickRequest } | { bar: 'recent' | 'ai' };
}

const open = (to: QuickTarget): { request: QuickRequest } => ({ request: { kind: 'open', to } });

/** What each part of the assistant needs; the overlay checks it again before opening. */
export const TARGET_NEEDS: Partial<Record<QuickTarget, Capability>> = {
  memos: 'memos.read',
  history: 'ai.analysis',
  document: 'ai.documents',
  lawyer: 'ai.check',
  detention: 'ai.check',
  trainer: 'ai.practice',
};

const command = (id: string, label: string, words: string[], run: QuickCommand['run'], extra: Partial<QuickCommand> = {}): QuickCommand => {
  const to = 'request' in run && run.request.kind === 'open' ? run.request.to : undefined;
  return { id, label, words, run, needs: to && TARGET_NEEDS[to], ...extra };
};

export const QUICK_COMMANDS: QuickCommand[] = [
  command('open-calculator', 'Открыть калькулятор', ['калькулятор', 'расчет срока'], { request: { kind: 'open-calculator' } }, { when: (s) => s.charges.length > 0 }),
  command('clear-charges', 'Очистить калькулятор', ['очистить калькулятор', 'сбросить калькулятор'], { request: { kind: 'clear-charges' } }, { when: (s) => s.charges.length > 0 }),
  command('recent', 'Недавние статьи', ['недавние', 'история статей', 'последние статьи'], { bar: 'recent' }),
  command('clear-recent', 'Очистить недавние', ['очистить недавние'], { request: { kind: 'clear-recent' } }, { when: (s) => s.recent.length > 0 }),
  command('favorites', 'Открыть избранное', ['избранное', 'закладки'], open('favorites')),
  command('pinned', 'Закреплённое над игрой', ['закрепленное', 'заметка', 'таймер'], open('pinned')),
  command('rules', 'Правила сервера', ['правила сервера', 'правила проекта'], open('rules')),
  command('memos', 'Памятки фракции', ['памятки', 'памятка'], open('memos')),
  command('wiki', 'Вики игры', ['вики', 'обновления игры', 'новости игры'], open('wiki')),
  command('settings', 'Настройки', ['настройки', 'горячие клавиши'], open('settings')),
  command('ask', 'Спросить ИИ', ['спросить ии', 'ии', 'нейросеть'], { bar: 'ai' }, { needs: 'ai.analysis' }),
  command('history', 'Последние разборы ИИ', ['последний разбор', 'разборы', 'история ии'], open('history')),
  command('detention', 'Проверка задержания', ['проверка задержания', 'задержание'], open('detention')),
  command('lawyer', 'Требования адвоката', ['адвокат', 'требования адвоката'], open('lawyer')),
  command('trainer', 'Тренажёр по законам', ['тренажер', 'экзамен', 'практика'], open('trainer')),
  command('document', 'Составить документ', ['документ', 'заявление', 'жалоба', 'иск'], open('document')),
];

const normal = (text: string) => text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Whether the player may use a command, and there is something for it to do. */
export const available = (command: QuickCommand, state: QuickState) =>
  (!command.needs || !!state.can?.includes(command.needs)) && (!command.when || command.when(state));

/**
 * The commands a query finds: «/» alone lists every one the player may use; otherwise three letters and more,
 * each typed word the beginning of a word of the command's.
 */
export function commandsFor(query: string, state: QuickState): QuickCommand[] {
  const typed = normal(query);
  const usable = QUICK_COMMANDS.filter((c) => available(c, state));
  if (typed === '/') return usable;
  const asked = normal(typed.replace(/^\//, ''));
  if (asked.length < 3) return [];
  const askedWords = asked.split(' ');
  return usable.filter((c) =>
    c.words.some((phrase) => {
      const words = normal(phrase).split(' ');
      return askedWords.every((a) => words.some((w) => w.startsWith(a)));
    }),
  );
}
