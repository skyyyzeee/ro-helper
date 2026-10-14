import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { searchArticles, type SearchHit } from '../core';
import { ARBATSKIY_PACK, TVERSKOI_PACK } from '../data/bundled';
import { hitKey } from './saved';
import { typedNumber, useCharges, type Entry } from './useCharges';

const pack = TVERSKOI_PACK;
const found = (query: string): SearchHit => searchArticles(pack, query)[0];
const entry = (hit: SearchHit): Entry => ({ key: hitKey(hit), hit, stage: 'done', amount: '', days: '', unpaid: '' });

describe('useCharges (roadmap 2А)', () => {
  it('counts the charges by the server’s rules, and says which found articles it can take', () => {
    const { result } = renderHook(() => useCharges(pack.calculator));
    const theft = found('ук 65 ч 1');
    expect(result.current.addable(theft)).toBe(true);
    expect(result.current.calculatorOpen).toBe(false);

    act(() => result.current.setCharges([entry(theft)]));
    expect(result.current.inCalculator(theft)).toBe(true);
    expect(result.current.calculatorOpen).toBe(true);
    expect(result.current.result?.criminal).not.toBeNull();
    expect(result.current.result?.charge).toContain('65');
  });

  it('keeps what the officer typed for a charge of the result', () => {
    const { result } = renderHook(() => useCharges(pack.calculator));
    act(() => result.current.setCharges([entry(found('ук 65 ч 1'))]));
    const [{ item }] = result.current.result!.criminal!.items;
    act(() => result.current.updateCharge(item, { stage: 'attempt' }));
    expect(result.current.charges[0].stage).toBe('attempt');
    expect(result.current.entryOf(result.current.result!.criminal!.items[0].item)?.key).toBe(result.current.charges[0].key);
  });

  it('starts an emptied calculator as a new detention: mode, offender, fine and priority go back', () => {
    const { result } = renderHook(() => useCharges(pack.calculator));
    act(() => result.current.setCharges([entry(found('ук 65 ч 1'))]));
    act(() => {
      result.current.setMode('fine');
      result.current.setOffender('official');
      result.current.setFineInput('15 000');
      result.current.setPriority(3);
    });
    expect(result.current.fineInput).toBe('15 000');

    act(() => result.current.setCharges([]));
    expect(result.current.mode).toBe('custody');
    expect(result.current.offender).toBe('citizen');
    expect(result.current.fineInput).toBe('');
    expect(result.current.priority).toBe(1);
  });

  it('offers the wanted priority only where bail goes by it (Арбатский)', () => {
    const { result } = renderHook(() => useCharges(ARBATSKIY_PACK.calculator));
    expect(result.current.priorityLevels?.[0]).toBe(1);
  });

  it('counts nothing on a server without a calculator', () => {
    const { result } = renderHook(() => useCharges(undefined));
    expect(result.current.calculable).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.priorityLevels).toBeNull();
  });

  it('reads the number out of what was typed', () => {
    expect(typedNumber('15 000 ₽')).toBe(15000);
    expect(typedNumber('')).toBeUndefined();
  });
});
