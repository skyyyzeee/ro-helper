import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PinBridge } from '../platform/tauri';
import type { PinArea, PinCard, PinGroup } from '../platform/types';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, GripIcon, PagesIcon, PinIcon, ResizeIcon, StarIcon } from './icons';
import { CARD_WIDTH, MIN_HEIGHT, detachCard, dropSide, joinGroups, moveGroup, pageGroup, resizeGroup, unpinCard, unpinGroup, type DropSide } from './pinLayout';

/** What a card pinned over the game shows: an article's part, or the calculator's total. */
function PinCardBody({ card }: { card: PinCard }) {
  return (
    <>
      {card.kind === 'calculator' ? (
        <div className="pin__big">
          <span>{card.heading}</span>
          {card.stars ? (
            <span className="stars" role="img" aria-label={`Звёзд розыска: ${card.stars}`}>
              {Array.from({ length: card.stars }, (_, i) => (
                <StarIcon key={i} size={15} />
              ))}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="pin__title">{card.heading}</div>
      )}
      {card.punishment?.map((line) => (
        <div key={line.who ?? 'all'} className="pin__accent">
          {line.who && <span className="pin__who">{line.who}: </span>}
          {line.text}
        </div>
      ))}
      {card.penalty && <div className="pin__penalty">{card.penalty}</div>}
      {card.extra?.map((extra) => (
        <div key={extra} className="pin__extra">
          + {extra}
        </div>
      ))}
      {card.lines.map((line) => (
        <div key={line} className={card.kind === 'calculator' ? 'pin__line pin__line--strong' : 'pin__line'}>
          {line}
        </div>
      ))}
      {card.warning && <div className="pin__warn">{card.warning}</div>}
    </>
  );
}

/**
 * What the mouse is doing to a block: moving it — with the block it would join under the mouse — or
 * dragging its corner to a new size.
 */
interface Drag {
  id: string;
  mode: 'move' | 'resize';
  /** Moving: how far into the block the mouse took it. Resizing: where the corner started, and the size then. */
  dx: number;
  dy: number;
  from?: { width: number; height: number };
  /** The block the cards would join, and the edge of it they are over. */
  over?: { id: string; side: DropSide };
}

export interface PinSurfaceProps {
  groups: PinGroup[];
  /** The overlay is open: the blocks can be dragged, joined and closed. Otherwise they only show. */
  live: boolean;
  onChange: (groups: PinGroup[]) => void;
  /** Where the blocks are now, in physical pixels, for the window that lets the mouse through elsewhere. */
  onAreas?: (areas: PinArea[]) => void;
}

/** Room around a block for the outline shown while the overlay is open. */
const PAD = 4;

/** The key a card's own element is kept under, so a card can be dragged out of a block. */
const cardKey = (groupId: string, cardId: string) => `${groupId} :: ${cardId}`;

/**
 * Everything pinned over the game: blocks of cards, each where the user dropped it. A block is dragged
 * by its head; dropped onto another it joins it, and a card dragged out of a block becomes one of its own.
 */
export function PinSurface({ groups: incoming, live, onChange, onAreas }: PinSurfaceProps) {
  const [groups, setGroups] = useState(incoming);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Which card of a paged block is on show, by block. */
  const [pages, setPages] = useState<Record<string, number>>({});
  const root = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const latest = useRef(groups);
  latest.current = groups;

  // While a block follows the mouse, its place is the mouse's, not the one the overlay last sent.
  useEffect(() => {
    if (!drag) setGroups(incoming);
  }, [incoming, drag]);

  const surface = useCallback(() => {
    const rect = root.current?.getBoundingClientRect();
    return { width: rect?.width || window.innerWidth, height: rect?.height || window.innerHeight };
  }, []);

  const commit = (next: PinGroup[]) => {
    latest.current = next;
    setGroups(next);
    onChange(next);
  };

  /**
   * The block under the mouse, if it is not the one being dragged: dropping there joins them, on the
   * edge the mouse is nearest.
   */
  const targetAt = (x: number, y: number, dragged: string): Drag['over'] => {
    for (const group of latest.current) {
      if (group.id === dragged) continue;
      const rect = boxes.current.get(group.id)?.getBoundingClientRect();
      if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { id: group.id, side: dropSide(rect, x, y) };
      }
    }
    return undefined;
  };

  const startDrag = (event: ReactPointerEvent, groupId: string, cardId?: string) => {
    if (!live || event.button !== 0) return;
    event.preventDefault();
    const element = boxes.current.get(cardId ? cardKey(groupId, cardId) : groupId);
    const rect = element?.getBoundingClientRect();
    const origin = { x: rect?.left ?? 0, y: rect?.top ?? 0 };
    let id = groupId;
    if (cardId) {
      // A card taken by its own handle leaves the block it was in and follows the mouse alone.
      const detached = detachCard(groups, groupId, cardId, origin.x, origin.y, surface());
      if (detached !== groups) {
        id = detached[detached.length - 1].id;
        latest.current = detached;
        setGroups(detached);
      }
    }
    setDrag({ id, mode: 'move', dx: event.clientX - origin.x, dy: event.clientY - origin.y });
  };

  const startResize = (event: ReactPointerEvent, groupId: string) => {
    if (!live || event.button !== 0) return;
    event.preventDefault();
    const rect = boxes.current.get(groupId)?.getBoundingClientRect();
    setDrag({
      id: groupId,
      mode: 'resize',
      dx: event.clientX,
      dy: event.clientY,
      from: { width: rect?.width ?? 0, height: rect?.height ?? 0 },
    });
  };

  const dragId = drag?.id;
  useEffect(() => {
    if (!dragId) return;
    const place = (event: PointerEvent) => {
      const dragging = drag!;
      const next =
        dragging.mode === 'resize'
          ? resizeGroup(
              latest.current,
              dragId,
              dragging.from!.width + (event.clientX - dragging.dx),
              dragging.from!.height + (event.clientY - dragging.dy),
              surface(),
            )
          : moveGroup(latest.current, dragId, event.clientX - dragging.dx, event.clientY - dragging.dy, surface());
      latest.current = next;
      setGroups(next);
      // Only a block being moved can be dropped onto another one.
      const over = dragging.mode === 'move' ? targetAt(event.clientX, event.clientY, dragId) : undefined;
      setDrag((current) =>
        current && (current.over?.id !== over?.id || current.over?.side !== over?.side) ? { ...current, over } : current,
      );
    };
    const drop = (event: PointerEvent) => {
      const over = drag?.mode === 'move' ? targetAt(event.clientX, event.clientY, dragId) : undefined;
      setDrag(null);
      commit(over ? joinGroups(latest.current, dragId, over.id, over.side) : latest.current);
    };
    window.addEventListener('pointermove', place);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
    return () => {
      window.removeEventListener('pointermove', place);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', drop);
    };
    // The listeners only need the block being dragged; everything else they read when they run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  // The window over the game covers the screen: only where the cards are does it take the mouse, and
  // while a block is being dragged the mouse must stay with it wherever it goes.
  useLayoutEffect(() => {
    if (!onAreas) return;
    const ratio = window.devicePixelRatio || 1;
    const physical = (rect: { left: number; top: number; width: number; height: number }): PinArea => ({
      x: Math.floor((rect.left - PAD) * ratio),
      y: Math.floor((rect.top - PAD) * ratio),
      width: Math.ceil((rect.width + 2 * PAD) * ratio),
      height: Math.ceil((rect.height + 2 * PAD) * ratio),
    });
    if (dragId) {
      onAreas([physical({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight })]);
      return;
    }
    const report = () => {
      const rects = groups.map((group) => boxes.current.get(group.id)?.getBoundingClientRect()).filter((rect) => rect !== undefined);
      onAreas(rects.map(physical));
    };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    for (const group of groups) {
      const element = boxes.current.get(group.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [groups, dragId, live, onAreas]);

  // How much room the cards have: the screen in the app, the window in the preview.
  const size = surface();

  const hold = (element: HTMLElement | null, key: string) => {
    if (element) boxes.current.set(key, element);
    else boxes.current.delete(key);
  };

  return (
    <div ref={root} className={live ? 'pin-surface pin-surface--live' : 'pin-surface'}>
      {groups.map((group) => {
        const stacked = group.cards.length > 1;
        const paged = stacked && !!group.paged;
        const page = paged ? Math.min(pages[group.id] ?? 0, group.cards.length - 1) : 0;
        const shown = paged ? [group.cards[page]] : group.cards;
        const turn = (to: number) => setPages((current) => ({ ...current, [group.id]: (to + group.cards.length) % group.cards.length }));
        const drop = drag?.over?.id === group.id ? drag.over.side : null;
        // Side by side, a block is as wide as the cards in it — as far as the screen allows.
        const wide = group.flow === 'row' && shown.length > 1 ? Math.min(CARD_WIDTH * shown.length, Math.max(CARD_WIDTH, size.width - group.x - 8)) : undefined;
        const classes = [
          'pin',
          live && 'pin--live',
          group.height !== undefined && 'pin--sized',
          dragId === group.id && 'pin--drag',
          drop && `pin--drop pin--drop-${drop}`,
        ];
        return (
          <section
            key={group.id}
            ref={(element) => hold(element, group.id)}
            className={classes.filter(Boolean).join(' ')}
            style={{
              left: group.x,
              top: group.y,
              ...(group.width ? { width: group.width } : wide ? { width: wide } : {}),
              ...(group.height ? { height: group.height } : {}),
              // Never past the bottom of the screen: what does not fit is scrolled to.
              maxHeight: Math.max(MIN_HEIGHT, size.height - group.y - 8),
            }}
            aria-label={stacked ? `Закреплено: ${group.cards.length}` : 'Закреплено'}
          >
            {stacked && (
              <div className="pin__bar" onPointerDown={(event) => startDrag(event, group.id)}>
                <PinIcon size={14} />
                {paged ? (
                  <span className="pin__pager">
                    {live && (
                      <button className="x x--sm" type="button" aria-label="Предыдущая карточка" onClick={() => turn(page - 1)}>
                        <ChevronLeftIcon size={14} />
                      </button>
                    )}
                    <span>
                      {page + 1} / {group.cards.length}
                    </span>
                    {live && (
                      <button className="x x--sm" type="button" aria-label="Следующая карточка" onClick={() => turn(page + 1)}>
                        <ChevronRightIcon size={14} />
                      </button>
                    )}
                  </span>
                ) : (
                  <span>Закреплено · {group.cards.length}</span>
                )}
                <span className="sp" />
                {live && (
                  <button
                    className={paged ? 'x x--on' : 'x'}
                    type="button"
                    aria-pressed={paged}
                    aria-label={paged ? 'Показать все карточки' : 'Листать по одной'}
                    title={paged ? 'Показать все карточки' : 'Листать по одной'}
                    onClick={() => commit(pageGroup(groups, group.id, !paged))}
                  >
                    <PagesIcon size={14} />
                  </button>
                )}
                {live && (
                  <button className="x" type="button" aria-label="Открепить всё" title="Открепить всё" onClick={() => commit(unpinGroup(groups, group.id))}>
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
            )}
            <div className={group.flow === 'row' && !paged ? 'pin__cards pin__cards--row' : 'pin__cards'}>
              {shown.map((card) => (
                <div
                  key={card.id}
                  ref={(element) => hold(element, cardKey(group.id, card.id))}
                  className={stacked ? 'pin__card pin__card--stacked' : 'pin__card'}
                >
                  <div className="pin__head" onPointerDown={(event) => startDrag(event, group.id, stacked ? card.id : undefined)}>
                    {stacked ? <GripIcon size={14} /> : <PinIcon size={14} />}
                    <span>{stacked ? 'Отделить' : 'Закреплено'}</span>
                    <span className="sp" />
                    {live && (
                      <button
                        className="x"
                        type="button"
                        aria-label={stacked ? `Открепить: ${card.heading}` : 'Открепить'}
                        title="Открепить"
                        onClick={() => commit(unpinCard(groups, card.id))}
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </div>
                  <PinCardBody card={card} />
                </div>
              ))}
            </div>
            {live && (
              <button
                className="pin__resize"
                type="button"
                aria-label="Изменить размер"
                title="Потяните, чтобы изменить размер"
                onPointerDown={(event) => startResize(event, group.id)}
              >
                <ResizeIcon size={12} />
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The pin window of the app: everything pinned over the game, and what the user does with it there. */
export function PinWindow({ bridge }: { bridge: PinBridge }) {
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    void bridge.state().then((state) => {
      setGroups((current) => (current.length ? current : state.groups));
      setLive(state.live);
    });
    const stopGroups = bridge.onGroups(setGroups);
    const stopLive = bridge.onLive(setLive);
    return () => {
      stopGroups();
      stopLive();
    };
  }, [bridge]);

  const areas = useCallback((next: PinArea[]) => void bridge.areas(next), [bridge]);
  const change = useCallback(
    (next: PinGroup[]) => {
      setGroups(next);
      void bridge.layout(next);
    },
    [bridge],
  );

  return <PinSurface groups={groups} live={live} onChange={change} onAreas={areas} />;
}
