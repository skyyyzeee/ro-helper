import {
  articleTitle,
  chargeLabel,
  fineFits,
  formatRubles,
  type CriminalResult,
  type FineRange,
  type ItemResult,
  type Mode,
  type Stage,
} from '../core';
import { CloseIcon, WarnIcon } from './icons';
import { JurisdictionPill, Stars } from './lawBits';

const digits = (n: number) => formatRubles(n).replace(/\s₽$/, '');

function rangeText(range: FineRange): string {
  return range.min === undefined || range.min === range.max ? `до ${formatRubles(range.max)}` : `от ${digits(range.min)} до ${formatRubles(range.max)}`;
}

function valueText(r: ItemResult, mode: Mode): string {
  if (mode === 'custody') return r.term === null ? '—' : `${r.term} мес`;
  return r.fine ? rangeText(r.fine) : '—';
}

export interface CalculatorPanelProps {
  result: CriminalResult;
  /** The mode the officer picked; the result says which one could actually be used. */
  onMode: (mode: Mode) => void;
  onStage: (index: number, stage: Stage) => void;
  onWantedLevel: (index: number, level: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  fineInput: string;
  onFineInput: (value: string) => void;
}

/** The side panel: charges, the КПЗ / Штраф switch, the total by law and what it is based on. */
export function CalculatorPanel({ result, onMode, onStage, onWantedLevel, onRemove, onClear, fineInput, onFineInput }: CalculatorPanelProps) {
  const { items, mode } = result;
  const noFine = result.fineUnavailable;
  const noCustody = items.length > 0 && result.custodyUnavailable.length === items.length;
  const amount = Number(fineInput.replace(/\D/g, ''));
  const fits = !fineInput || !result.fineLimit || fineFits(amount, result.fineLimit);

  return (
    <aside className="calc glass" aria-label="Калькулятор">
      <div className="calc__head">
        <span className="calc__title">Калькулятор</span>
        <span className="count">{items.length}</span>
        <span className="sp" />
        <button className="link-btn" type="button" onClick={onClear}>
          Очистить
        </button>
      </div>

      <div className="calc__body">
        <div className="seg" role="radiogroup" aria-label="Наказание">
          <button type="button" role="radio" aria-checked={mode === 'custody'} disabled={noCustody} onClick={() => onMode('custody')}>
            КПЗ
          </button>
          <button type="button" role="radio" aria-checked={mode === 'fine'} disabled={noFine.length > 0} onClick={() => onMode('fine')}>
            Штраф
          </button>
        </div>
        {noFine.length > 0 && <p className="calc__hint">Штраф недоступен: у {noFine.map((r) => chargeLabel(r.item)).join(', ')} нет штрафа</p>}
        {noCustody && <p className="calc__hint">КПЗ недоступен: ни у одной статьи нет лишения свободы</p>}

        <div className="sec-t">УК · поглощение</div>
        <ul className="calc__items" aria-label="Статьи в калькуляторе">
          {items.map((r, i) => {
            const label = chargeLabel(r.item);
            const byStars = r.item.part.punishment?.alternatives.some((s) => s.kind === 'imprisonment-by-stars');
            const stars = r.item.part.stars;
            return (
              <li key={`${r.item.article.id}#${r.item.part.number ?? ''}`} className={r.absorbed ? 'ci ci--absorbed' : r.stacked ? 'ci ci--stacked' : 'ci'}>
                <div className="ci__row">
                  <span className="num">{label}</span>
                  <span className="ttl">{articleTitle(r.item.article)}</span>
                  <span className="sp" />
                  <span className="val">{valueText(r, mode)}</span>
                  <button className="x" type="button" aria-label={`Убрать ${label}`} title="Убрать" onClick={() => onRemove(i)}>
                    <CloseIcon size={14} />
                  </button>
                </div>
                <div className="ci__mods">
                  {(['attempt', 'preparation'] as const).map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      className={r.item.stage === stage ? 'mod mod--on' : 'mod'}
                      aria-pressed={r.item.stage === stage}
                      onClick={() => onStage(i, r.item.stage === stage ? 'done' : stage)}
                    >
                      {stage === 'attempt' ? 'покушение' : 'приготовление'}
                    </button>
                  ))}
                  {byStars && stars && (
                    <label className="ci__level">
                      розыск
                      <select
                        aria-label={`Уровень розыска для ${label}`}
                        value={r.item.wantedLevel ?? stars.max}
                        onChange={(e) => onWantedLevel(i, Number(e.target.value))}
                      >
                        {Array.from({ length: stars.max - stars.min + 1 }, (_, k) => stars.min + k).map((level) => (
                          <option key={level} value={level}>
                            {'★'.repeat(level)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <span className="sp" />
                  {r.item.part.jurisdiction && <JurisdictionPill jurisdiction={r.item.part.jurisdiction} />}
                </div>
              </li>
            );
          })}
        </ul>

        {mode === 'custody' ? (
          <div className="total" aria-label="Итог">
            <div>
              <div className="t-big">{result.term} мес</div>
              <div className="t-sub">{result.capped ? 'потолок по закону' : 'итог по УК'}</div>
            </div>
            <div className="t-stars">
              <span className="muted">выдать</span>
              <Stars stars={{ min: result.stars, max: result.stars }} size={15} />
              {result.starsMonths !== result.term && <span className="muted">= {result.starsMonths} мес</span>}
            </div>
          </div>
        ) : (
          result.fineLimit && (
            <div className="total total--fine" aria-label="Итог">
              <label className="fine">
                <span className="muted">Сумма штрафа</span>
                <span className="fine__field">
                  <input
                    className="fine__input"
                    inputMode="numeric"
                    aria-label="Сумма штрафа"
                    placeholder={digits(result.fineLimit.max)}
                    value={fineInput}
                    onChange={(e) => onFineInput(e.target.value.replace(/[^\d\s]/g, ''))}
                  />
                  ₽
                </span>
              </label>
              <span className={fits ? 'lim' : 'lim lim--bad'} role={fits ? undefined : 'alert'}>
                {fits ? rangeText(result.fineLimit) : `Вне предела: ${rangeText(result.fineLimit)}`}
              </span>
            </div>
          )
        )}

        {result.explanation.map((line) => (
          <p key={line} className="why">
            {line}
          </p>
        ))}
        {mode === 'custody' && result.bail && (
          <div className="bail">
            <span>Залог</span>
            <span className="muted">({result.bail.category})</span>
            <span className="sp" />
            <span className="val">{result.bail.amount ? formatRubles(result.bail.amount) : 'не предусмотрен'}</span>
          </div>
        )}
        {result.warnings.map((warning) => (
          <div key={warning} className="warn" role="alert">
            <WarnIcon />
            <span>{warning}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
