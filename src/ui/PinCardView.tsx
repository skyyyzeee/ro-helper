import { forwardRef, useEffect, useRef, useState } from 'react';
import type { PinBridge } from '../platform/tauri';
import type { PinCard } from '../platform/types';
import { CloseIcon, PinIcon, StarIcon } from './icons';

export interface PinCardViewProps {
  card: PinCard;
  /** The overlay is open: the card can be dragged and closed. Otherwise it only shows, and clicks pass through. */
  live: boolean;
  onClose: () => void;
}

/** The card pinned over the game: one article's part, or the calculator's total. */
export const PinCardView = forwardRef<HTMLElement, PinCardViewProps>(function PinCardView({ card, live, onClose }, ref) {
  // Tauri drags the window from an element marked as a drag region, not from its children: every part is marked.
  const drag = live ? { 'data-tauri-drag-region': true } : {};
  return (
    <section ref={ref} className={live ? 'pin pin--live' : 'pin'} aria-label="Закреплено" {...drag}>
      <div className="pin__head" {...drag}>
        <PinIcon size={14} />
        <span {...drag}>Закреплено</span>
        <span className="sp" {...drag} />
        {live && (
          <button className="x" type="button" aria-label="Открепить" title="Открепить" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      {card.kind === 'calculator' ? (
        <div className="pin__big" {...drag}>
          <span {...drag}>{card.heading}</span>
          {card.stars ? (
            <span className="stars" role="img" aria-label={`Звёзд розыска: ${card.stars}`} {...drag}>
              {Array.from({ length: card.stars }, (_, i) => (
                <StarIcon key={i} size={15} />
              ))}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="pin__title" {...drag}>
          {card.heading}
        </div>
      )}
      {card.accent && (
        <div className="pin__accent" {...drag}>
          {card.accent}
        </div>
      )}
      {card.lines.map((line) => (
        <div key={line} className={card.kind === 'calculator' ? 'pin__line pin__line--strong' : 'pin__line'} {...drag}>
          {line}
        </div>
      ))}
      {card.warning && (
        <div className="pin__warn" {...drag}>
          {card.warning}
        </div>
      )}
    </section>
  );
});

/** The pin window of the app: shows the card the overlay pinned and keeps the window the card's size. */
export function PinWindow({ bridge }: { bridge: PinBridge }) {
  const [card, setCard] = useState<PinCard | null>(null);
  const [live, setLive] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    void bridge.state().then((state) => {
      setCard((current) => current ?? state.card);
      setLive(state.live);
    });
    const stopCard = bridge.onCard(setCard);
    const stopLive = bridge.onLive(setLive);
    return () => {
      stopCard();
      stopLive();
    };
  }, [bridge]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      void bridge.fit(Math.ceil(width) + 2 * PIN_MARGIN, Math.ceil(height) + 2 * PIN_MARGIN);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bridge, card]);

  return (
    <div className="pin-stage">
      {card && (
        <PinCardView
          ref={ref}
          card={card}
          live={live}
          onClose={() => {
            setCard(null);
            void bridge.close();
          }}
        />
      )}
    </div>
  );
}

/** Room around the card inside its window, for the outline shown while the overlay is open. */
const PIN_MARGIN = 4;
