import type { PinGroup } from '../platform/types';
import { notePinCard } from './pinCards';
import { pinBlock, type Place, type Surface } from './pinLayout';

/**
 * The player's notes (issue #40; several, each under a heading of its own, asked for by a player on 24.10.2026):
 * signs, plates, the plan, the rights to read out — written in «Закреплённые», kept on this computer only, sent
 * nowhere. Over the game they are one block, a page a note, shown and hidden by their key.
 */
export interface Note {
  id: string;
  /** «Заметка» unless the player calls it otherwise. */
  title: string;
  text: string;
}

/** The notes, in order. */
export const NOTES_KEY = 'notes.list';
/** Where their block stood when it was last hidden: it comes back there. */
export const NOTES_PLACE_KEY = 'notes.place';
/** The heading a note has until the player gives it one. */
export const NOTE_TITLE = 'Заметка';
/** So many at most: the block pages through them over the game. */
export const NOTES_MAX = 20;
/** The id of the one note there was before 2.24: its card, pinned then, is the same card now. */
const FIRST_ID = 'note';

export const newNote = (id = `note-${Date.now().toString(36)}`): Note => ({ id, title: NOTE_TITLE, text: '' });

/** The notes as kept; before 2.24 there was one, under `note.text`, and it comes first. Never none: one to write in. */
export function restoreNotes(saved: unknown, legacyText: unknown): Note[] {
  const kept = Array.isArray(saved)
    ? saved.filter((n): n is Note => !!n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.text === 'string').slice(0, NOTES_MAX)
    : [];
  if (kept.length) return kept;
  return [{ ...newNote(FIRST_ID), text: typeof legacyText === 'string' ? legacyText : '' }];
}

const written = (notes: Note[]) => notes.filter((note) => note.text.trim());
const isNote = (card: { kind: string }) => card.kind === 'note';

/** Whether the notes are over the game now. */
export const notesShown = (groups: PinGroup[]): boolean => groups.some((group) => group.cards.some(isNote));

/** Where the notes' block stands, to bring it back there after it is hidden. */
export function notesPlace(groups: PinGroup[]): Place | undefined {
  const group = groups.find((g) => g.cards.some(isNote));
  if (!group) return undefined;
  return { x: group.x, y: group.y, ...(group.width ? { width: group.width } : {}), ...(group.height ? { height: group.height } : {}) };
}

/** Every note with something written, as one block of pages — where it stood before, if given. */
export function showNotes(groups: PinGroup[], notes: Note[], surface: Surface, place?: Place): PinGroup[] {
  const cards = written(notes).map(notePinCard);
  const rest = hideNotes(groups);
  return cards.length ? pinBlock(rest, 'notes', cards, surface, place) : rest;
}

/** The notes off the game; the cards pinned beside them stay. */
export function hideNotes(groups: PinGroup[]): PinGroup[] {
  return groups.map((g) => ({ ...g, cards: g.cards.filter((card) => !isNote(card)) })).filter((g) => g.cards.length > 0);
}

/**
 * The notes on show, as they are written now — in the block they are in, wherever it was dragged: a note emptied or
 * deleted leaves it, one written on joins it. Not shown, nothing changes.
 */
export function refreshNotes(groups: PinGroup[], notes: Note[]): PinGroup[] {
  const at = groups.findIndex((g) => g.cards.some(isNote));
  if (at < 0) return groups;
  const cards = written(notes).map(notePinCard);
  const block = groups[at];
  const others = block.cards.filter((card) => !isNote(card));
  const next = groups.map((g, i) => (i === at ? { ...g, cards: [...others, ...cards], paged: others.length + cards.length > 1 ? true : g.paged } : g));
  // A note dragged out into a block of its own is in the cards above already: no other block keeps one.
  return next.map((g, i) => (i === at ? g : { ...g, cards: g.cards.filter((card) => !isNote(card)) })).filter((g) => g.cards.length > 0);
}
