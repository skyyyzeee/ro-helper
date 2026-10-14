import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { calculateDetention, leadPart, type CalculatorRules, type Charge, type ChargeItem, type DetentionResult, type Mode, type Offender, type SearchHit } from '../core';
import type { ChargeFields, ChargePatch } from './CalculatorPanel';
import { hitKey } from './saved';

/** A charge in the calculator, with what the officer typed for it. */
export interface Entry extends ChargeFields, Omit<ChargePatch, keyof ChargeFields> {
  key: string;
  hit: SearchHit;
}

/** «15 000» → 15000; an empty field is no number. */
export function typedNumber(text: string): number | undefined {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

export interface Charges {
  charges: Entry[];
  setCharges: Dispatch<SetStateAction<Entry[]>>;
  mode: Mode;
  setMode: (mode: Mode) => void;
  offender: Offender;
  setOffender: (offender: Offender) => void;
  fineInput: string;
  setFineInput: (text: string) => void;
  /** Арбатский: bail goes by the wanted priority the officer sets, 1 by default. */
  priority: number;
  setPriority: (priority: number) => void;
  /** The wanted levels bail goes by, when the server's bail does; else none. */
  priorityLevels: number[] | null;
  /** The charges as the calculator counts them, and its count. */
  items: Charge[];
  result: DetentionResult | null;
  /** The codes the calculator counts, and whether a found article is one it can take. */
  calculable: string[];
  addable: (hit: SearchHit) => boolean;
  inCalculator: (hit: SearchHit) => boolean;
  /** The calculator's entry behind a charge of the result. */
  entryOf: (item: ChargeItem) => Entry | undefined;
  /** Changes what the officer typed for a charge of the result. */
  updateCharge: (item: ChargeItem, patch: ChargePatch) => void;
  /** Something is in the calculator: a detention under way. */
  calculatorOpen: boolean;
}

/**
 * The calculator (roadmap 2А, out of Overlay.tsx): the charges of both codes, the mode and the offender for the whole
 * detention, the fine typed in, the wanted priority, and the count of it all by the server's rules. An emptied
 * calculator is a new detention: nothing carries over from the last one. Adding a found article — with the search's
 * recent list and the counts — stays the overlay's.
 */
export function useCharges(rules: CalculatorRules | undefined): Charges {
  const [charges, setCharges] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>('custody');
  const [offender, setOffender] = useState<Offender>('citizen');
  const [fineInput, setFineInput] = useState('');
  const [priority, setPriority] = useState(1);
  const calculable = rules ? [rules.criminalCode, rules.administrative.code] : [];
  const addable = (hit: SearchHit) => calculable.includes(hit.document.id) && !!(hit.part ?? leadPart(hit.article))?.punishment;
  const inCalculator = (hit: SearchHit) => charges.some((c) => c.key === hitKey(hit));
  const items = useMemo(
    () =>
      charges.map(
        (c): Charge => ({
          article: c.hit.article,
          document: c.hit.document,
          part: c.hit.part ?? leadPart(c.hit.article)!,
          stage: c.stage ?? 'done',
          wantedLevel: c.wantedLevel,
          choice: c.choice,
          amount: typedNumber(c.amount),
          days: typedNumber(c.days),
          unpaid: typedNumber(c.unpaid),
        }),
      ),
    [charges],
  );
  const result = useMemo(() => (rules ? calculateDetention(items, { mode, offender, priority }, rules) : null), [items, mode, offender, priority, rules]);
  const priorityLevels = rules?.bail.by === 'wanted' ? Object.keys(rules.bail.amounts).map(Number).sort((a, b) => a - b) : null;
  /** The calculator's entry behind a charge of the result. */
  const entryOf = (item: ChargeItem): Entry | undefined => charges[items.findIndex((c) => c === item)];
  const updateCharge = (item: ChargeItem, patch: ChargePatch) => {
    const key = entryOf(item)?.key;
    setCharges((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };
  const calculatorOpen = charges.length > 0;

  // An emptied calculator is a new detention: nothing carries over from the last one.
  useEffect(() => {
    if (calculatorOpen) return;
    setMode('custody');
    setOffender('citizen');
    setFineInput('');
    setPriority(1);
  }, [calculatorOpen]);

  return { charges, setCharges, mode, setMode, offender, setOffender, fineInput, setFineInput, priority, setPriority, priorityLevels, items, result, calculable, addable, inCalculator, entryOf, updateCharge, calculatorOpen };
}
