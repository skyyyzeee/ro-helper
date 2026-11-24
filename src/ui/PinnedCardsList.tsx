import { useLayoutEffect, useRef } from 'react';
import type { PinCard } from '../platform/types';

export type PinnedCardSummary = Pick<PinCard, 'id' | 'heading' | 'kind'>;
const LABELS: Record<PinCard['kind'], string> = {
  article: 'Статья', calculator: 'Итог расчёта', ai: 'Ответ ИИ', phrases: 'Заготовки', timer: 'Таймер', note: 'Заметки',
};

/** Manage the visible cards without reaching for their separate windows over the game. */
export function PinnedCardsList({ cards, onUnpin }: { cards: readonly PinnedCardSummary[]; onUnpin: (id: string) => void }) {
  const list = useRef<HTMLUListElement>(null);
  const empty = useRef<HTMLParagraphElement>(null);
  const focusAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (focusAt.current === null) return;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button');
    const target = buttons?.[Math.min(focusAt.current, buttons.length - 1)] ?? empty.current;
    target?.focus({ preventScroll: true });
    focusAt.current = null;
  }, [cards]);
  if (!cards.length) return <p ref={empty} className="set__hint pins-manager__empty" tabIndex={-1}>Карточек пока нет. Откройте нужную статью и нажмите «Закрепить» — она останется поверх игры.</p>;
  return (
    <ul ref={list} className="pins-manager" aria-label="Закреплённые карточки">
      {cards.map((card, index) => (
        <li key={card.id} className="pins-manager__row">
          <div><span className="pins-manager__kind">{LABELS[card.kind]}</span><p>{card.heading}</p></div>
          <button type="button" className="settings__button" aria-label={`Открепить «${card.heading}»`} onClick={() => { focusAt.current = index; onUnpin(card.id); }}>Открепить</button>
        </li>
      ))}
    </ul>
  );
}
