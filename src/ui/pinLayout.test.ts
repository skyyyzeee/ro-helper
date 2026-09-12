import { describe, expect, it } from 'vitest';
import type { PinCard, PinGroup } from '../platform/types';
import { CALCULATOR_ID, MIN_HEIGHT, MIN_WIDTH, detachCard, hasCard, joinGroups, keepableGroups, moveGroup, nextPlace, pinCard, resizeGroup, unpinCard, unpinGroup, updateCard } from './pinLayout';

const SURFACE = { width: 1920, height: 1080 };
const card = (id: string, heading = id): PinCard => ({ id, kind: 'article', heading, lines: [] });
const total: PinCard = { id: CALCULATOR_ID, kind: 'calculator', heading: '30 мес', lines: [] };

describe('what is pinned', () => {
  it('gives every new block a place of its own', () => {
    let groups: PinGroup[] = [];
    for (const id of ['a', 'b', 'c']) groups = pinCard(groups, card(id), SURFACE);
    expect(groups.map((g) => g.cards[0].id)).toEqual(['a', 'b', 'c']);
    expect(new Set(groups.map((g) => `${g.x},${g.y}`)).size).toBe(3);
    expect(nextPlace(groups, SURFACE)).not.toEqual({ x: groups[0].x, y: groups[0].y });
  });

  it('pins a card once: the same card again only refreshes it where it is', () => {
    const groups = pinCard(pinCard([], card('a'), SURFACE), card('a', 'другой заголовок'), SURFACE);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards[0].heading).toBe('другой заголовок');
  });

  it('changes a card only while it is pinned, so the calculator does not pin itself', () => {
    const groups = pinCard([], card('a'), SURFACE);
    expect(updateCard(groups, total)).toBe(groups);
    expect(hasCard(updateCard(pinCard(groups, total, SURFACE), { ...total, heading: '40 мес' }), CALCULATOR_ID)).toBe(true);
  });

  it('unpins a card, and the block it leaves empty with it', () => {
    const groups = pinCard(pinCard([], card('a'), SURFACE), card('b'), SURFACE);
    expect(unpinCard(groups, 'a').map((g) => g.cards[0].id)).toEqual(['b']);
    expect(unpinCard(groups, 'unknown')).toBe(groups);
    expect(unpinGroup(groups, groups[0].id)).toHaveLength(1);
  });

  it('keeps a block on the screen wherever it is dragged', () => {
    const groups = pinCard([], card('a'), SURFACE);
    const id = groups[0].id;
    expect(moveGroup(groups, id, -200, -200, SURFACE)[0]).toMatchObject({ x: 0, y: 0 });
    expect(moveGroup(groups, id, 5000, 5000, SURFACE)[0]).toMatchObject({ x: 1540, y: 930 });
  });

  it('joins one block into another, and takes a card back out of it', () => {
    let groups = pinCard(pinCard([], card('a'), SURFACE), card('b'), SURFACE);
    groups = joinGroups(groups, groups[1].id, groups[0].id);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((c) => c.id)).toEqual(['a', 'b']);

    const split = detachCard(groups, groups[0].id, 'b', 700, 400, SURFACE);
    expect(split.map((g) => g.cards.map((c) => c.id))).toEqual([['a'], ['b']]);
    expect(split[1]).toMatchObject({ x: 700, y: 400 });
    // The last card of a block cannot be taken out of it: it is already one of its own.
    expect(detachCard(split, split[1].id, 'b', 0, 0, SURFACE)).toBe(split);
  });

  it('gives a card taken out of a block an id no other block has', () => {
    let groups = pinCard(pinCard([], card('a'), SURFACE), card('b'), SURFACE);
    groups = joinGroups(groups, groups[1].id, groups[0].id);
    const split = detachCard(groups, 'a', 'a', 0, 0, SURFACE);
    expect(new Set(split.map((g) => g.id)).size).toBe(2);
  });

  it('takes the size the corner was dragged to, never smaller than readable nor past the screen', () => {
    const groups = moveGroup(pinCard([], card('a'), SURFACE), 'a', 1500, 800, SURFACE);
    expect(resizeGroup(groups, 'a', 620, 500, SURFACE)[0]).toMatchObject({ width: 420, height: 280 });
    expect(resizeGroup(groups, 'a', 10, 10, SURFACE)[0]).toMatchObject({ width: MIN_WIDTH, height: MIN_HEIGHT });
  });

  it('gives a card taken out of a widened block the same width, and its own height', () => {
    let groups = pinCard(pinCard([], card('a'), SURFACE), card('b'), SURFACE);
    groups = joinGroups(groups, groups[1].id, groups[0].id);
    groups = resizeGroup(groups, 'a', 560, 700, SURFACE);
    const split = detachCard(groups, 'a', 'b', 100, 100, SURFACE);
    expect(split[1]).toMatchObject({ width: 560 });
    expect(split[1].height).toBeUndefined();
  });

  it('keeps the articles for the next launch, but not the total of a detention long over', () => {
    const groups = pinCard(pinCard([], card('a'), SURFACE), total, SURFACE);
    expect(keepableGroups(groups).flatMap((g) => g.cards.map((c) => c.id))).toEqual(['a']);
  });
});
