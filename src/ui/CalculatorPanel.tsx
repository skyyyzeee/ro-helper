import {
  OFFENDER_DATIVE,
  articleTitle,
  chargeLabel,
  fineFits,
  formatRubles,
  type AdministrativeItemResult,
  type AdministrativeResult,
  type Charge,
  type ChargeItem,
  type Choice,
  type CriminalResult,
  type DetentionResult,
  type FineRange,
  type ItemResult,
  type Mode,
  type Offender,
  type Stage,
} from '../core';
import { CloseIcon, PinIcon, WarnIcon } from './icons';
import { JurisdictionPill, Stars } from './lawBits';

const digits = (n: number) => formatRubles(n).replace(/\s₽$/, '');

function rangeText(range: FineRange): string {
  return range.min === undefined || range.min === range.max ? `до ${formatRubles(range.max)}` : `от ${digits(range.min)} до ${formatRubles(range.max)}`;
}

function valueText(r: ItemResult, mode: Mode): string {
  if (mode === 'custody') return r.term === null ? '—' : `${r.term} мес`;
  return r.fine ? rangeText(r.fine) : '—';
}

const CHOICE_LABELS: Record<Choice, string> = {
  fine: 'штраф',
  arrest: 'арест',
  warning: 'предупреждение',
  'license-revocation': 'лишение прав',
  evacuation: 'эвакуация',
};

/** What the officer typed for an administrative charge, kept as text while typing. */
export interface ChargeFields {
  amount: string;
  days: string;
  unpaid: string;
}

/** A change to one charge from the panel. */
export type ChargePatch = Partial<ChargeFields> & { stage?: Stage; wantedLevel?: number; choice?: Choice };

export type CopyState = 'idle' | 'copied' | 'failed';

export interface CalculatorPanelProps {
  result: DetentionResult;
  /** The mode the officer picked; the result says which one could actually be used. */
  onMode: (mode: Mode) => void;
  onOffender: (offender: Offender) => void;
  /** Where bail goes by the wanted priority (Арбатский): the priority the officer set, and setting it. */
  priority?: { value: number; levels: number[]; onChange: (value: number) => void };
  fieldsOf: (item: ChargeItem) => ChargeFields;
  onUpdate: (item: ChargeItem, patch: ChargePatch) => void;
  onRemove: (item: ChargeItem) => void;
  onClear: () => void;
  fineInput: string;
  onFineInput: (value: string) => void;
  onCopy: () => void;
  copyState: CopyState;
  /** Pins the total over the game, to read the charges out to the detainee. */
  onPin: () => void;
}

/** The side panel: criminal and administrative charges, their totals by law, and the charges to copy. */
export function CalculatorPanel(props: CalculatorPanelProps) {
  const { result, onClear, onCopy, copyState, onPin } = props;
  const count = (result.criminal?.items.length ?? 0) + (result.administrative?.items.length ?? 0);

  return (
    <aside className="calc glass" aria-label="Калькулятор">
      <div className="calc__head">
        <span className="calc__title">Калькулятор</span>
        <span className="count">{count}</span>
        <span className="sp" />
        <button className="link-btn" type="button" onClick={onClear}>
          Очистить
        </button>
      </div>

      <div className="calc__body">
        {result.criminal && <CriminalSection {...props} criminal={result.criminal} />}
        {result.administrative && <AdministrativeSection {...props} administrative={result.administrative} />}
      </div>

      <div className="calc__copy">
        {result.charge ? <div className="copy-str">{result.charge}</div> : <div className="copy-str copy-str--empty">Обвинять не в чем</div>}
        <div className="calc__copy-row">
          <button className="btn btn--primary calc__copy-btn" type="button" disabled={!result.charge} onClick={onCopy}>
            <span>{copyState === 'copied' ? 'Скопировано' : copyState === 'failed' ? 'Не удалось скопировать' : 'Скопировать'}</span>
            <span className="kbd kbd--on-accent" aria-hidden="true">
              Ctrl+C
            </span>
          </button>
          <button className="btn btn--icon" type="button" aria-label="Закрепить итог поверх игры" title="Закрепить поверх игры" onClick={onPin}>
            <PinIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}

function CriminalSection({ result, criminal, onMode, onUpdate, onRemove, fineInput, onFineInput, priority }: CalculatorPanelProps & { criminal: CriminalResult }) {
  const { items, mode } = criminal;
  const noFine = criminal.fineUnavailable;
  const noCustody = criminal.custodyUnavailable.length === items.length;
  const amount = Number(fineInput.replace(/\D/g, ''));
  const fits = !fineInput || !criminal.fineLimit || fineFits(amount, criminal.fineLimit);
  const stars = result.stars;

  return (
    <>
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

      <div className="sec-t">УК · {criminal.combine === 'sum' ? 'сложение' : 'поглощение'}</div>
      <ul className="calc__items" aria-label="Статьи в калькуляторе">
        {items.map((r) => {
          const label = chargeLabel(r.item);
          const byStars = r.item.part.punishment?.alternatives.some((s) => s.kind === 'imprisonment-by-stars');
          const partStars = r.item.part.stars;
          return (
            <li key={`${r.item.article.id}#${r.item.part.number ?? ''}`} className={r.absorbed ? 'ci ci--absorbed' : r.stacked ? 'ci ci--stacked' : 'ci'}>
              <div className="ci__row">
                <span className="num">{label}</span>
                <span className="ttl">{articleTitle(r.item.article)}</span>
                <span className="sp" />
                <span className="val">{valueText(r, mode)}</span>
                <button className="x" type="button" aria-label={`Убрать ${label}`} title="Убрать" onClick={() => onRemove(r.item)}>
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
                    onClick={() => onUpdate(r.item, { stage: r.item.stage === stage ? 'done' : stage })}
                  >
                    {stage === 'attempt' ? 'покушение' : 'приготовление'}
                  </button>
                ))}
                {byStars && partStars && (
                  <label className="ci__level">
                    розыск
                    <select
                      aria-label={`Уровень розыска для ${label}`}
                      value={r.item.wantedLevel ?? partStars.max}
                      onChange={(e) => onUpdate(r.item, { wantedLevel: Number(e.target.value) })}
                    >
                      {Array.from({ length: partStars.max - partStars.min + 1 }, (_, k) => partStars.min + k).map((level) => (
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
            <div className="t-big">{criminal.term} мес</div>
            <div className="t-sub">{criminal.capped ? 'потолок по закону' : 'итог по УК'}</div>
          </div>
          {stars && (
            <div className="t-stars">
              <span className="muted">выдать</span>
              <Stars stars={{ min: stars.count, max: stars.count }} size={15} />
              {stars.note ? (
                <span className="muted">{stars.note}</span>
              ) : (
                stars.months !== criminal.term && <span className="muted">= {stars.months} мес</span>
              )}
            </div>
          )}
        </div>
      ) : (
        criminal.fineLimit && (
          <div className="total total--fine" aria-label="Итог">
            <label className="fine">
              <span className="muted">Сумма штрафа</span>
              <span className="fine__field">
                <input
                  className="fine__input"
                  inputMode="numeric"
                  aria-label="Сумма штрафа"
                  placeholder={digits(criminal.fineLimit.max)}
                  value={fineInput}
                  onChange={(e) => onFineInput(e.target.value.replace(/[^\d\s]/g, ''))}
                />
                ₽
              </span>
            </label>
            <span className={fits ? 'lim' : 'lim lim--bad'} role={fits ? undefined : 'alert'}>
              {fits ? rangeText(criminal.fineLimit) : `Вне предела: ${rangeText(criminal.fineLimit)}`}
            </span>
          </div>
        )
      )}

      {criminal.explanation.map((line) => (
        <p key={line} className="why">
          {line}
        </p>
      ))}
      {mode === 'custody' && criminal.bail && (
        <div className="bail">
          <span>Залог</span>
          {priority ? (
            <span className="bail__levels" role="radiogroup" aria-label="Приоритет розыска">
              {priority.levels.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={priority.value === level}
                  aria-label={`Приоритет розыска ${level}`}
                  className={priority.value === level ? 'bail__level bail__level--on' : 'bail__level'}
                  onClick={() => priority.onChange(level)}
                >
                  {level}
                </button>
              ))}
            </span>
          ) : (
            <span className="muted">({criminal.bail.category})</span>
          )}
          <span className="sp" />
          <span className="val">{criminal.bail.amount ? formatRubles(criminal.bail.amount) : 'не предусмотрен'}</span>
        </div>
      )}
      {criminal.warnings.map((warning) => (
        <div key={warning} className="warn" role="alert">
          <WarnIcon />
          <span>{warning}</span>
        </div>
      ))}
    </>
  );
}

/** A number field inside a charge row: a fine in rubles or an arrest in days. */
function AmountField({ label, unit, value, placeholder, onChange }: { label: string; unit: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <span className="amt">
      <input
        className="amt__input"
        inputMode="numeric"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, ''))}
      />
      {unit}
    </span>
  );
}

function AdministrativeRow({ r, offender, fieldsOf, onUpdate, onRemove }: CalculatorPanelProps & { r: AdministrativeItemResult<Charge>; offender: Offender }) {
  const label = chargeLabel(r.item);
  const fields = fieldsOf(r.item);
  const { fine, arrest } = r;

  let value = null;
  let limit = null;
  if (!r.applicable) {
    limit = <span className="lim">{OFFENDER_DATIVE[offender]} не назначается</span>;
  } else if (fine?.multiplier) {
    value = <AmountField label={`Неуплаченный штраф по ${label}`} unit="₽" value={fields.unpaid} placeholder="неуплач." onChange={(unpaid) => onUpdate(r.item, { unpaid })} />;
    limit = <span className="lim">×{fine.multiplier} от неуплаченного, не менее {formatRubles(fine.limit.min!)}: {formatRubles(fine.amount)}</span>;
  } else if (fine) {
    value = fine.fixed ? (
      <span className="val">{formatRubles(fine.amount)}</span>
    ) : (
      <AmountField label={`Сумма штрафа по ${label}`} unit="₽" value={fields.amount} placeholder={digits(fine.limit.max)} onChange={(amount) => onUpdate(r.item, { amount })} />
    );
    if (!fine.fixed) {
      limit = (
        <span className={fine.fits ? 'lim' : 'lim lim--bad'} role={fine.fits ? undefined : 'alert'}>
          {fine.fits ? rangeText(fine.limit) : `Вне предела: ${rangeText(fine.limit)}`}
        </span>
      );
    }
  } else if (arrest) {
    const range = arrest.limit.min === undefined ? `до ${arrest.limit.max} сут` : `от ${arrest.limit.min} до ${arrest.limit.max} сут`;
    value = arrest.fixed ? (
      <span className="val">{arrest.days} сут</span>
    ) : (
      <AmountField label={`Срок ареста по ${label}`} unit="сут" value={fields.days} placeholder={String(arrest.limit.max)} onChange={(days) => onUpdate(r.item, { days })} />
    );
    if (!arrest.fixed) {
      limit = (
        <span className={arrest.fits ? 'lim' : 'lim lim--bad'} role={arrest.fits ? undefined : 'alert'}>
          {arrest.fits ? range : `Вне предела: ${range}`}
        </span>
      );
    }
  } else if (r.choice) {
    value = <span className="val">{CHOICE_LABELS[r.choice]}</span>;
  }

  return (
    <li className={r.applicable ? 'ci' : 'ci ci--off'}>
      <div className="ci__row">
        <span className="num">{label}</span>
        <span className="ttl">{articleTitle(r.item.article)}</span>
        <span className="sp" />
        {value}
        <button className="x" type="button" aria-label={`Убрать ${label}`} title="Убрать" onClick={() => onRemove(r.item)}>
          <CloseIcon size={14} />
        </button>
      </div>
      {r.choices.length > 1 && (
        <div className="ci__mods" role="radiogroup" aria-label={`Наказание по ${label}`}>
          {r.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={r.choice === choice}
              className={r.choice === choice ? 'mod mod--on' : 'mod'}
              onClick={() => onUpdate(r.item, { choice })}
            >
              {CHOICE_LABELS[choice]}
            </button>
          ))}
        </div>
      )}
      {limit}
      {r.applicable && r.additional.map((extra) => <span key={extra} className="ci__extra">+ {extra}</span>)}
    </li>
  );
}

function AdministrativeSection(props: CalculatorPanelProps & { administrative: AdministrativeResult<Charge> }) {
  const { result, administrative, onOffender } = props;
  const { offender } = administrative;
  const counted = administrative.items.some((r) => r.applicable);
  const hasFine = administrative.items.some((r) => r.applicable && r.fine);
  // The stars go with the criminal total when there is a term; otherwise they are the arrest's.
  const stars = result.stars && result.criminal?.mode !== 'custody' ? result.stars : null;

  return (
    <>
      <div className="sec-row">
        <span className="sec-t">КоАП · сложение</span>
        <span className="sp" />
        <div className="seg seg--sm" role="radiogroup" aria-label="Кому назначается">
          {(['citizen', 'official'] as const).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={offender === o} onClick={() => onOffender(o)}>
              {o === 'citizen' ? 'гражданин' : 'должн. лицо'}
            </button>
          ))}
        </div>
      </div>
      <ul className="calc__items" aria-label="Статьи КоАП в калькуляторе">
        {administrative.items.map((r) => (
          <AdministrativeRow key={`${r.item.article.id}#${r.item.part.number ?? ''}`} {...props} r={r} offender={offender} />
        ))}
      </ul>

      {counted && (
        <div className="total total--admin" aria-label="Итог КоАП">
          {hasFine && (
            <div className="tot-row">
              <span>Штраф</span>
              <span className="val">{formatRubles(administrative.fineTotal)}</span>
            </div>
          )}
          {administrative.arrestDays > 0 && (
            <div className="tot-row">
              <span>Арест</span>
              <span className="val">{administrative.arrestDays} сут</span>
            </div>
          )}
          {administrative.other.map((line) => (
            <div key={line} className="tot-row tot-row--other">
              {line}
            </div>
          ))}
          {stars && (
            <div className="tot-row">
              <span className="muted">выдать</span>
              <Stars stars={{ min: stars.count, max: stars.count }} size={15} />
            </div>
          )}
        </div>
      )}

      {administrative.explanation.map((line) => (
        <p key={line} className="why">
          {line}
        </p>
      ))}
      {administrative.bail && (
        <div className="bail">
          <span>Залог за арест</span>
          <span className="muted">
            ({administrative.bail.days} сут × {formatRubles(administrative.bail.perDay)})
          </span>
          <span className="sp" />
          <span className="val">{formatRubles(administrative.bail.amount)}</span>
        </div>
      )}
    </>
  );
}
