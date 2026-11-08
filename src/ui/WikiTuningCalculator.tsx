import { useState } from 'react';
import { formatRubles } from '../core';
import type { WikiTuning } from '../wiki/model';

const PARTS = { engine: 'Двигатель', brakes: 'Тормоза', transmission: 'Трансмиссия', turbo: 'Турбонаддув' };
const AXLES = { front: 'Передняя подвеска', rear: 'Задняя подвеска' };
const OPTIONS = { camber: 'Развал', height: 'Высота' };
const PART_HINTS = {
  engine: 'Скорость и ускорение', brakes: 'Эффективность торможения',
  transmission: 'Переключение передач', turbo: 'Кратковременное ускорение',
};
const NODE_PATHS = {
  engine: 'M4 8h3l2-3h7l2 3h2v8h-3l-2 2H8l-2-3H4zM10 5V3m4 0h-4',
  brakes: 'M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm0 5a3 3 0 1 0 3 3 3 3 0 0 0-3-3z',
  transmission: 'M6 5v14M12 5v14M18 5v8M6 12h12',
  turbo: 'M12 4a8 8 0 1 0 8 8h-5a3 3 0 1 1-3-3zM12 4h5',
  axle: 'M4 12h16M4 8v8m16-8v8M9 8l6 3-6 2 6 3',
};

function NodeIcon({ part }: { part: keyof typeof NODE_PATHS }) {
  return <span className="wiki__tuning-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={NODE_PATHS[part]} />
    </svg>
  </span>;
}

export function WikiTuningCalculator({ tuning }: { tuning: WikiTuning }) {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const keyOf = ({ axle, option }: WikiTuning['suspension'][number]) => axle + ':' + option;
  const levelCost = tuning.levels.reduce((total, { part, prices }) =>
    total + prices.slice(0, levels[part] ?? 0).reduce((sum, price) => sum + price, 0), 0);
  const cost = tuning.suspension.reduce((total, item) => total + (selected[keyOf(item)] ? item.price : 0), levelCost);
  const engine = tuning.levels.find(({ part }) => part === 'engine');
  const engineLevel = levels.engine ?? 0;
  const gain = tuning.engineGain ?? (engine && tuning.stockSpeed && tuning.fullSpeed && tuning.fullSpeed > tuning.stockSpeed
    ? (tuning.fullSpeed - tuning.stockSpeed) / engine.prices.length
    : undefined);
  const speed = tuning.stockSpeed === undefined || (engineLevel > 0 && gain === undefined)
    ? undefined
    : tuning.stockSpeed + engineLevel * (gain ?? 0);
  const axleActive = (axle: 'front' | 'rear') => tuning.suspension.some((item) => item.axle === axle && selected[keyOf(item)]);
  const chooseAll = (max: boolean) => {
    setLevels(max ? Object.fromEntries(tuning.levels.map(({ part, prices }) => [part, prices.length])) : {});
    setSelected(max ? Object.fromEntries(tuning.suspension.map((item) => [keyOf(item), true])) : {});
  };

  return (
    <section className="wiki__tuning" aria-label="Улучшения транспорта">
      <header className="wiki__tuning-heading">
        <h3 className="wiki__h3">Улучшения транспорта</h3>
        <span>Собери комплект и посмотри цену и скорость</span>
      </header>
      <div className={tuning.suspension.length > 0 ? 'wiki__tuning-parts wiki__tuning-parts--chassis' : 'wiki__tuning-parts'}>
        {tuning.suspension.length > 0 && (
          <svg className="wiki__tuning-chassis" viewBox="0 0 120 230" fill="none" aria-hidden="true">
            <path d="M31 20Q60 5 89 20L102 52V182L89 210Q60 223 31 210L18 182V52Z" stroke="currentColor" strokeWidth="2" />
            <path d="M30 57 40 38H80L90 57 82 78H38ZM38 151H82L89 178 80 194H40L31 178Z" stroke="currentColor" />
            <path d="M31 82V146M89 82V146M60 75V167M22 49H98M22 177H98" stroke="currentColor" strokeWidth="2" />
            <path d="M28 28Q60 13 92 28M28 202Q60 217 92 202M23 76V153M97 76V153M37 87H83V142H37ZM48 58v21l8 13v62l-8 20m24-116v21l-8 13v62l8 20" stroke="currentColor" opacity=".55" />
            <path d="M22 48h16m44 0h16M22 177h16m44 0h16" stroke="currentColor" strokeWidth="3" />
            <rect x="41" y="30" width="38" height="28" rx="5" className={engineLevel ? 'wiki__tuning-node--active' : ''} />
            <rect x="8" y="33" width="15" height="39" rx="4" className={axleActive('front') ? 'wiki__tuning-node--active' : ''} />
            <rect x="97" y="33" width="15" height="39" rx="4" className={axleActive('front') ? 'wiki__tuning-node--active' : ''} />
            <rect x="8" y="158" width="15" height="39" rx="4" className={axleActive('rear') ? 'wiki__tuning-node--active' : ''} />
            <rect x="97" y="158" width="15" height="39" rx="4" className={axleActive('rear') ? 'wiki__tuning-node--active' : ''} />
            <circle cx="30" cy="177" r="7" className={levels.brakes ? 'wiki__tuning-node--active' : ''} />
            <circle cx="90" cy="177" r="7" className={levels.brakes ? 'wiki__tuning-node--active' : ''} />
          </svg>
        )}
        {tuning.levels.map(({ part, prices }) => {
          const level = levels[part] ?? 0;
          const change = (next: number) => setLevels((current) => ({ ...current, [part]: next }));
          return (
            <section className="wiki__fact" data-tuning-part={part} key={part} aria-label={PARTS[part]}>
              <div className="wiki__tuning-part-head">
                <NodeIcon part={part} />
                <div><h4>{PARTS[part]}</h4><small>{PART_HINTS[part]}</small></div>
                <span>{level ? formatRubles(prices.slice(0, level).reduce((sum, price) => sum + price, 0)) : 'Не установлено'}</span>
              </div>
              <div className="wiki__tuning-controls">
                <button className="btn btn--sm" type="button" aria-label={PARTS[part] + ' — уровень ниже'} disabled={level === 0} onClick={() => change(level - 1)}>−</button>
                {prices.map((price, index) => (
                  <button className="wiki__tuning-step" type="button" key={index} data-filled={index < level} aria-label={PARTS[part] + ' — уровень ' + (index + 1)}
                    title={formatRubles(price)} aria-pressed={level === index + 1} onClick={() => change(index + 1)}><span aria-hidden="true" /></button>
                ))}
                <button className="btn btn--sm" type="button" aria-label={PARTS[part] + ' — уровень выше'} disabled={level === prices.length} onClick={() => change(level + 1)}>+</button>
                <span className="wiki__tuning-level">{level ? 'Уровень ' + level : 'Сток'}</span>
              </div>
              {level < prices.length && <p>Следующий уровень · {formatRubles(prices[level])}{part === 'engine' && gain !== undefined && ' · +' + gain.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' км/ч'}</p>}
            </section>
          );
        })}
        {(['front', 'rear'] as const).map((axle) => {
          const options = tuning.suspension.filter((item) => item.axle === axle);
          return options.length > 0 && (
            <section className="wiki__fact" data-tuning-part={axle} key={axle} aria-label={AXLES[axle]}>
              <div className="wiki__tuning-part-head">
                <NodeIcon part="axle" />
                <div><h4>{AXLES[axle]}</h4><small>Развал и высота</small></div>
                <span>{axleActive(axle) ? formatRubles(options.reduce((sum, item) => sum + (selected[keyOf(item)] ? item.price : 0), 0)) : 'Не установлено'}</span>
              </div>
              <div className="wiki__tuning-controls">
                {options.map((item) => {
                  const key = keyOf(item);
                  return <label className="wiki__tuning-option" key={key}>
                    <input type="checkbox" checked={!!selected[key]} onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSelected((current) => ({ ...current, [key]: checked }));
                    }} />
                    <span>{OPTIONS[item.option]}</span><small>{formatRubles(item.price)}</small>
                  </label>;
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="wiki__tuning-total">
        {speed !== undefined && <div className="wiki__tuning-stat" aria-live="polite">
          <small>{engineLevel > 0 && tuning.engineGain === undefined ? 'Расчётная скорость' : 'Макс. скорость'}</small>
          <b>{speed.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км/ч</b>
        </div>}
        <p>В LSC итог зависит от комиссии сервера.</p>
        <div className="wiki__tuning-stat" aria-live="polite"><small>Стоимость набора</small><b>{formatRubles(cost)}</b></div>
        <div className="wiki__tuning-controls">
          <button className="btn btn--sm" type="button" onClick={() => chooseAll(false)}>Сток</button>
          <button className="btn btn--primary btn--sm" type="button" onClick={() => chooseAll(true)}>Максимум</button>
        </div>
      </div>
    </section>
  );
}
