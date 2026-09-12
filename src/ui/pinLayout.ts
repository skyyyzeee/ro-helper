import type { PinCard, PinGroup } from '../platform/types';

/** The id of the calculator's card; an article's card is keyed by its part («uk-65#1»). */
export const CALCULATOR_ID = 'calculator';

/** The screen the blocks live on, in CSS pixels (the stand-in scene in the preview). */
export interface Surface {
  width: number;
  height: number;
}

/** How big a block is before it is measured: the card's width, and enough of its height to stay on screen. */
export const CARD_WIDTH = 380;
const CARD_HEIGHT = 150;
/** Where the first block goes: left, a third down the screen. */
const FIRST_X = 40;
const FIRST_Y = 1 / 3;
/** Blocks are put one under another, then in the next column, so none covers the one before. */
const GAP_Y = 200;
const GAP_X = CARD_WIDTH + 24;

const size = (group: PinGroup) => ({ width: CARD_WIDTH, height: CARD_HEIGHT * group.cards.length });

/** Keeps a block on the screen: at least a corner of it stays reachable with the mouse. */
export function clampTo(x: number, y: number, surface: Surface, box = { width: CARD_WIDTH, height: CARD_HEIGHT }): { x: number; y: number } {
  const maxX = Math.max(0, surface.width - box.width);
  const maxY = Math.max(0, surface.height - box.height);
  return { x: Math.min(Math.max(0, Math.round(x)), maxX), y: Math.min(Math.max(0, Math.round(y)), maxY) };
}

/** A free spot for a new block: under the ones already there, then beside them. */
export function nextPlace(groups: PinGroup[], surface: Surface): { x: number; y: number } {
  const first = { x: FIRST_X, y: Math.round(surface.height * FIRST_Y) };
  const rows = Math.max(1, Math.floor((surface.height - first.y) / GAP_Y));
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < rows; row++) {
      const place = clampTo(first.x + column * GAP_X, first.y + row * GAP_Y, surface);
      if (!groups.some((g) => Math.abs(g.x - place.x) < 24 && Math.abs(g.y - place.y) < 24)) return place;
    }
  }
  return clampTo(first.x, first.y, surface);
}

/** An id no block has yet: a card's own id, or that id with a number after it. */
function freeId(groups: PinGroup[], base: string): string {
  if (!groups.some((g) => g.id === base)) return base;
  for (let n = 2; ; n++) if (!groups.some((g) => g.id === `${base}~${n}`)) return `${base}~${n}`;
}

export const hasCard = (groups: PinGroup[], id: string): boolean => groups.some((g) => g.cards.some((c) => c.id === id));

/** The card as it is now, wherever it was dropped; a card that is not pinned changes nothing. */
export function updateCard(groups: PinGroup[], card: PinCard): PinGroup[] {
  if (!hasCard(groups, card.id)) return groups;
  return groups.map((g) => ({ ...g, cards: g.cards.map((c) => (c.id === card.id ? card : c)) }));
}

/** Pins a card in a block of its own, or refreshes it where it already is. */
export function pinCard(groups: PinGroup[], card: PinCard, surface: Surface): PinGroup[] {
  if (hasCard(groups, card.id)) return updateCard(groups, card);
  return [...groups, { id: freeId(groups, card.id), ...nextPlace(groups, surface), cards: [card] }];
}

/** Unpins one card; a block left without cards goes with it. */
export function unpinCard(groups: PinGroup[], id: string): PinGroup[] {
  if (!hasCard(groups, id)) return groups;
  return groups.map((g) => ({ ...g, cards: g.cards.filter((c) => c.id !== id) })).filter((g) => g.cards.length > 0);
}

/** Unpins a whole block: its cross closes every card in it. */
export const unpinGroup = (groups: PinGroup[], groupId: string): PinGroup[] => groups.filter((g) => g.id !== groupId);

export function moveGroup(groups: PinGroup[], groupId: string, x: number, y: number, surface: Surface): PinGroup[] {
  return groups.map((g) => (g.id === groupId ? { ...g, ...clampTo(x, y, surface, size(g)) } : g));
}

/** Dropped onto another block, the cards join it and the block that was dragged is gone. */
export function joinGroups(groups: PinGroup[], fromId: string, intoId: string): PinGroup[] {
  const from = groups.find((g) => g.id === fromId);
  const into = groups.find((g) => g.id === intoId);
  if (!from || !into || fromId === intoId) return groups;
  return groups.filter((g) => g.id !== fromId).map((g) => (g.id === intoId ? { ...g, cards: [...g.cards, ...from.cards] } : g));
}

/** Dragged out of a block of several, a card becomes a block of its own where it was dropped. */
export function detachCard(groups: PinGroup[], groupId: string, cardId: string, x: number, y: number, surface: Surface): PinGroup[] {
  const group = groups.find((g) => g.id === groupId);
  const card = group?.cards.find((c) => c.id === cardId);
  if (!group || !card || group.cards.length < 2) return groups;
  const rest = groups.map((g) => (g.id === groupId ? { ...g, cards: g.cards.filter((c) => c.id !== cardId) } : g));
  return [...rest, { id: freeId(rest, cardId), ...clampTo(x, y, surface), cards: [card] }];
}

/** The screen the cards are put on: the game's in the app, the window's in the browser preview. */
export function surfaceNow(preview: boolean): Surface {
  const screen = window.screen;
  if (preview || !screen) return { width: window.innerWidth, height: window.innerHeight };
  return { width: screen.availWidth || window.innerWidth, height: screen.availHeight || window.innerHeight };
}

/** Blocks that survive a restart: the calculator's card belongs to the detention that is over. */
export function keepableGroups(groups: PinGroup[]): PinGroup[] {
  return unpinCard(groups, CALCULATOR_ID);
}
