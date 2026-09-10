// Prototype data. Real (from the Tverskoi forum): document list and article counts,
// the text of УК ст. 65 and КоАП 8.6 ч. 1, calculator rules. Everything else is sample.
const CATS = {
  codes: 'Кодексы и Конституция',
  fkz: 'Федеральные конституционные законы',
  fz: 'Федеральные законы',
  moscow: 'Законы Москвы',
  charters: 'Уставы организаций',
  rules: 'Правила проекта',
};
const TAGS = [['all', 'Все'], ['codes', 'Кодексы'], ['fkz', 'ФКЗ'], ['fz', 'ФЗ'], ['moscow', 'Москва'], ['charters', 'Уставы'], ['rules', 'Правила']];
const DOC_LIST = [
  ['const', 'Конституция', 'Конституция РО', 'codes', 117],
  ['uk', 'УК', 'Уголовный кодекс', 'codes', 117],
  ['koap', 'КоАП', 'Кодекс об административных правонарушениях', 'codes', 136],
  ['pdd', 'ПДД', 'Правила дорожного движения (15-ФЗ)', 'codes', 116],
  ['upk', 'УПК', 'Уголовно-процессуальный кодекс', 'codes', 165],
  ['tk', 'ТК', 'Трудовой кодекс', 'codes', 40],
  ['ethics', 'Этика', 'Кодекс этики и служебного поведения', 'codes', 27],
  ['fkz1', '1-ФКЗ', 'О Правительстве', 'fkz', 46],
  ['fkz2', '2-ФКЗ', 'О Государственной Думе', 'fkz', 35],
  ['fkz3', '3-ФКЗ', 'О вводимых правовых режимах', 'fkz', 14],
  ['fkz4', '4-ФКЗ', 'О судебной системе и судопроизводстве', 'fkz', 135],
  ['fz1', '1-ФЗ', 'О государственной службе', 'fz', 42],
  ['fz2', '2-ФЗ', 'Об обороне', 'fz', 23],
  ['fz3', '3-ФЗ', 'О прокуратуре', 'fz', 37],
  ['fz4', '4-ФЗ', 'О Следственном комитете', 'fz', 20],
  ['fz5', '5-ФЗ', 'О ФСБ', 'fz', 26],
  ['fz6', '6-ФЗ', 'О полиции', 'fz', 32],
  ['fz7', '7-ФЗ', 'О государственной охране', 'fz', 31],
  ['fz8', '8-ФЗ', 'О регулировании оружия', 'fz', 40],
  ['fz9', '9-ФЗ', 'О политических партиях', 'fz', 20],
  ['fz10', '10-ФЗ', 'Об особом правовом статусе должностных лиц', 'fz', 4],
  ['fz11', '11-ФЗ', 'О Министерстве юстиции', 'fz', 18],
  ['fz12', '12-ФЗ', 'О государственной тайне', 'fz', 10],
  ['fz13', '13-ФЗ', 'Об адвокатуре', 'fz', 65],
  ['fz14', '14-ФЗ', 'Об оперативно-розыскной деятельности', 'fz', 15],
  ['fz16', '16-ФЗ', 'О собраниях, митингах и шествиях', 'fz', 13],
  ['msk1', 'Москва', 'Устав города Москвы', 'moscow', 21],
  ['msk2', 'Москва', 'О здравоохранении', 'moscow', 17],
  ['msk3', 'Москва', 'О «Вести Москвы»', 'moscow', 26],
  ['msk4', 'Москва', 'О статусе гос. собственности и территорий', 'moscow', 51],
  ['ch-mvd', 'Устав', 'Внутренний устав МВД', 'charters', null],
  ['ch-gibdd', 'Устав', 'Устав ГИБДД', 'charters', null],
  ['ch-fso', 'Регламент', 'Внутренний регламент сотрудников ФСО', 'charters', null],
  ['ch-army', 'Устав', 'Устав Вооружённых сил', 'charters', null],
  ['ch-army2', 'Устав', 'Дисциплинарный устав', 'charters', null],
  ['ch-army3', 'Устав', 'Устав караульной службы', 'charters', null],
  ['ch-sk', 'Положения', 'Положения Следственного комитета', 'charters', null],
  ['ch-hosp', 'Устав', 'Устав больницы', 'charters', null],
  ['ch-news', 'Устав', 'Устав «Вести Москвы»', 'charters', null],
  ['r-main', 'Правила', 'Основные правила проекта', 'rules', null],
  ['r-gov', 'Правила', 'Правила государственных организаций', 'rules', null],
  ['r-crime', 'Правила', 'Правила криминальных организаций', 'rules', null],
];
const DOCS = {};
DOC_LIST.forEach(([id, badge, name, cat, count]) => { DOCS[id] = { id, badge, name, cat, count }; });

const ORGS = [
  ['mvd', 'МВД', ['fz6', 'upk', 'ch-mvd']],
  ['gibdd', 'ГИБДД', ['pdd', 'koap', 'ch-gibdd', 'fz6']],
  ['fsb', 'ФСБ', ['fz5', 'fz14', 'fz12', 'upk']],
  ['fso', 'ФСО', ['fz7', 'ch-fso']],
  ['army', 'Армия / Росгвардия', ['fz2', 'ch-army', 'ch-army2', 'ch-army3']],
  ['sk', 'Следственный комитет', ['fz4', 'upk', 'ch-sk']],
  ['prok', 'Прокуратура', ['fz3', 'upk']],
  ['court', 'Суд', ['fkz4', 'upk']],
  ['gov', 'Правительство', ['fkz1', 'fz1', 'ethics']],
  ['hosp', 'Больница', ['msk2', 'ch-hosp']],
  ['news', 'Вести Москвы', ['msk3', 'ch-news']],
  ['opg', 'ОПГ', ['r-crime']],
  ['none', 'Без организации', []],
];
const ORG = {};
ORGS.forEach(([id, name, docs]) => { ORG[id] = { id, name, docs }; });

const SERVERS = [['tver', 'Тверской', ''], ['arbat', 'Арбатский', 'скоро'], ['kutuz', 'Кутузовский', 'скоро · для новичков']];

const ARTS = [
  { id: 'uk-65', doc: 'uk', num: '65', title: 'Кража', jur: 'Р/Ф', stars: 3, term: 30, fine: 50000, cat: 'medium', chapter: 'Глава 14. Преступления против собственности', updated: '06.09.2026', syn: ['воровство', 'украл', 'хищение'],
    parts: [{ n: '', t: 'Кража, то есть тайное хищение чужого имущества, — наказывается штрафом в размере до 50.000 рублей, либо лишением свободы на срок 30 месяцев.' }],
    note: 'Хищение имущества стоимостью до 5 000 рублей квалифицируется как мелкое хищение по ст. 7.27 КоАП.' },
  { id: 'uk-65.1', doc: 'uk', num: '65.1', title: 'Кража в крупном размере', jur: 'Р/Ф', stars: 4, term: 40, cat: 'grave', chapter: 'Глава 14. Преступления против собственности', updated: '06.09.2026', syn: ['хищение'],
    parts: [{ n: '', t: 'Кража, совершённая в крупном размере, — наказывается лишением свободы на срок 40 месяцев.' }],
    note: 'Крупным размером признаётся стоимость имущества свыше 500 000 рублей.' },
  { id: 'uk-70', doc: 'uk', num: '70', title: 'Грабёж', jur: 'Р/Ф', stars: 4, term: 40, cat: 'grave', chapter: 'Глава 14. Преступления против собственности', updated: '06.09.2026', syn: ['хищение', 'отобрал'],
    parts: [{ n: '', t: 'Грабёж, то есть открытое хищение чужого имущества, — наказывается лишением свободы на срок 40 месяцев.' }] },
  { id: 'uk-88', doc: 'uk', num: '88', title: 'Незаконный оборот оружия', jur: 'Ф', stars: 4, term: 40, cat: 'grave', chapter: 'Глава 17. Преступления против общественной безопасности', updated: '06.09.2026', syn: ['оружие', 'ствол', 'пушка'],
    parts: [{ n: '', t: 'Незаконные приобретение, передача, сбыт, хранение, перевозка или ношение оружия — наказываются лишением свободы на срок 40 месяцев.' }] },
  { id: 'uk-96', doc: 'uk', num: '96', title: 'Хулиганство', jur: 'Р', stars: 2, term: 20, fine: 30000, cat: 'small', chapter: 'Глава 17. Преступления против общественной безопасности', updated: '06.09.2026', syn: ['хулиган', 'порядок'],
    parts: [{ n: '', t: 'Хулиганство, то есть грубое нарушение общественного порядка, — наказывается штрафом в размере до 30.000 рублей, либо лишением свободы на срок 20 месяцев.' }] },
  { id: 'uk-104', doc: 'uk', num: '104', title: 'Оскорбление представителя власти', jur: 'Р', stars: 1, term: 10, fine: 20000, cat: 'small', chapter: 'Глава 20. Преступления против порядка управления', updated: '06.09.2026', syn: ['оскорбил', 'мат', 'сотрудник'],
    parts: [{ n: '', t: 'Публичное оскорбление представителя власти при исполнении им своих должностных обязанностей — наказывается штрафом в размере до 20.000 рублей, либо лишением свободы на срок 10 месяцев.' }] },
  { id: 'koap-8.6-1', doc: 'koap', num: '8.6', part: 'ч. 1', title: 'Превышение скорости более 15 км/ч', max: 10000, maxOff: 20000, chapter: 'Глава 8. Правонарушения в области дорожного движения', updated: '27.08.2026', syn: ['скорость', 'превышение', 'гонки'],
    parts: [{ n: '1.', t: 'Превышение установленной скорости движения транспортного средства на величину более 15 км/ч - влечет наложение административного штрафа в размере до 10.000 рублей.' }] },
  { id: 'koap-8.6-2', doc: 'koap', num: '8.6', part: 'ч. 2', title: 'Превышение скорости более 40 км/ч', max: 25000, maxOff: 40000, chapter: 'Глава 8. Правонарушения в области дорожного движения', updated: '27.08.2026', syn: ['скорость', 'превышение', 'гонки'],
    parts: [{ n: '2.', t: 'Превышение установленной скорости движения транспортного средства на величину более 40 км/ч - влечет наложение административного штрафа в размере до 25.000 рублей.' }] },
  { id: 'koap-7.27', doc: 'koap', num: '7.27', title: 'Мелкое хищение', max: 5000, maxOff: 10000, chapter: 'Глава 7. Правонарушения в области охраны собственности', updated: '27.08.2026', syn: ['кража', 'хищение', 'украл'],
    parts: [{ n: '1.', t: 'Мелкое хищение чужого имущества стоимостью до 5 000 рублей - влечет наложение административного штрафа в размере до 5.000 рублей.' }] },
  { id: 'koap-8.12', doc: 'koap', num: '8.12', title: 'Тонированные стёкла', max: 5000, maxOff: 10000, chapter: 'Глава 8. Правонарушения в области дорожного движения', updated: '27.08.2026', syn: ['тонировка', 'тонированные', 'стекла'],
    parts: [{ n: '1.', t: 'Управление транспортным средством, на котором установлены стёкла со светопропускаемостью ниже допустимой, - влечет наложение административного штрафа в размере до 5.000 рублей.' }] },
  { id: 'koap-20.1', doc: 'koap', num: '20.1', title: 'Мелкое хулиганство', max: 5000, maxOff: 5000, arrest: 5, chapter: 'Глава 20. Правонарушения против общественного порядка', updated: '27.08.2026', syn: ['хулиган', 'порядок'],
    parts: [{ n: '1.', t: 'Мелкое хулиганство - влечет наложение административного штрафа в размере до 5.000 рублей или административный арест на срок до 5 суток.' }] },
  { id: 'pdd-10.1', doc: 'pdd', num: '10.1', title: 'Скорость движения', chapter: 'X. Скорость движения', updated: '30.08.2026', syn: ['скорость'],
    parts: [{ n: '', t: 'Водитель должен вести транспортное средство со скоростью, не превышающей установленного ограничения, учитывая интенсивность движения и дорожные условия.' }] },
  { id: 'fz6-13', doc: 'fz6', num: '13', title: 'Права полиции', chapter: 'Глава 3. Обязанности и права полиции', updated: '26.08.2026', syn: ['полиция', 'документы'],
    parts: [
      { n: '1.', t: 'Полиции для выполнения возложенных на неё обязанностей предоставляется право требовать от граждан прекращения противоправных действий.' },
      { n: '2.', t: 'Проверять документы, удостоверяющие личность, если имеются основания подозревать граждан в совершении правонарушения.' },
    ] },
];
const ART = {};
ARTS.forEach((a, i) => { a.order = i; ART[a.id] = a; });

const START = { 'Первый запуск': 'onboarding', 'Поиск': 'search', 'Статья': 'article', 'Калькулятор': 'calculator', 'Закреплено': 'pinned', 'Меню': 'menu' };
const CALC0 = [{ id: 'uk-88', mod: 'none' }, { id: 'uk-65', mod: 'none' }, { id: 'koap-8.6-1', amount: '5000' }];
const ALIAS = { 'ук': 'uk', 'коап': 'koap', 'пдд': 'pdd', 'упк': 'upk', 'тк': 'tk' };
const MOD = { none: 1, att: 0.75, prep: 0.5 };
const BAIL = { small: 50000, medium: 75000 };

const fmt = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
const stem = (w) => (w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w);
const nArr = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
const label = (a) => 'ст. ' + a.num + (a.part ? ' ' + a.part : '');
const isPenal = (a) => a.doc === 'uk' || a.doc === 'koap';
const numKey = (a) => a.num.split('.').map(Number);
const byNum = (x, y) => { const p = numKey(x), q = numKey(y); for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (p[i] || 0) - (q[i] || 0); if (d) return d; } return (x.part || '').localeCompare(y.part || ''); };
const money = (v) => { const n = parseInt(String(v).replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; };

function initial(start) {
  const base = {
    screen: 'app', step: 1, settings: false, server: 'tver', org: 'mvd', hotkey: ['Alt', 'X'], listening: false,
    overlay: true, query: '', sel: 0, article: null, scope: null, drawer: false, drTag: 'all', drFilter: '',
    calc: [], mode: 'kpz', subject: 'citizen', fine: '', pinned: null,
    favs: ['uk-65', 'koap-8.6-1', 'uk-104'], recent: ['uk-88', 'koap-7.27', 'fz6-13'], copied: false,
  };
  switch (start) {
    case 'onboarding': return { ...base, screen: 'onboarding' };
    case 'article': return { ...base, query: 'кража', article: 'uk-65' };
    case 'calculator': return { ...base, query: '65', calc: CALC0.map((c) => ({ ...c })) };
    case 'pinned': return { ...base, overlay: false, query: '65', calc: CALC0.map((c) => ({ ...c })), pinned: { kind: 'calc' } };
    case 'menu': return { ...base, drawer: true };
    default: return { ...base, query: 'кража' };
  }
}

function search(q, scope, org) {
  const toks = norm(q).trim().split(/\s+/).filter(Boolean);
  if (!toks.length && !scope) return [];
  let docF = scope, part = null, partNext = false;
  const nums = [], words = [];
  for (const t of toks) {
    if (ALIAS[t] && !docF) { docF = ALIAS[t]; continue; }
    if (t === 'ч' || t === 'ч.') { partNext = true; continue; }
    if (t === 'ст' || t === 'ст.') continue;
    if (partNext && /^\d+$/.test(t)) { part = 'ч. ' + t; partNext = false; continue; }
    if (/^\d+(\.\d+)*$/.test(t)) nums.push(t); else words.push(stem(t));
  }
  const boost = (ORG[org] || ORG.none).docs;
  const out = [];
  for (const a of ARTS) {
    if (docF && a.doc !== docF) continue;
    if (part && a.part !== part) continue;
    let score = 0, ok = true;
    for (const n of nums) {
      if (a.num === n) score += 100; else if (a.num.startsWith(n)) score += 40; else { ok = false; break; }
    }
    if (!ok) continue;
    const title = norm(a.title), syn = norm((a.syn || []).join(' ')), text = norm(a.parts.map((p) => p.t).join(' '));
    for (const w of words) {
      if (title.includes(w)) score += 30; else if (syn.includes(w)) score += 20; else if (text.includes(w)) score += 10; else { ok = false; break; }
    }
    if (!ok) continue;
    if (boost.includes(a.doc)) score += 5;
    if (a.doc === 'uk' || a.doc === 'koap') score += 3;
    out.push({ a, score });
  }
  out.sort((x, y) => y.score - x.score || x.a.order - y.a.order);
  return out.map((x) => x.a);
}

function penOf(a) {
  if (a.doc === 'uk') return a.fine ? { main: 'штраф до ' + fmt(a.fine), alt: a.term + ' мес' } : { main: a.term + ' мес' };
  if (a.doc === 'koap') return { main: 'штраф до ' + fmt(a.max), alt: a.arrest ? 'арест до ' + a.arrest + ' сут' : null };
  return { main: 'без наказания' };
}

function chargeOf(items) {
  const groups = [];
  const uk = items.filter((x) => x.a.doc === 'uk').map((x) => x.a).sort(byNum);
  const koap = items.filter((x) => x.a.doc === 'koap').map((x) => x.a).sort(byNum);
  if (uk.length) groups.push('ст. ' + uk.map((a) => a.num).join(', ') + ' УК');
  if (koap.length) groups.push('ст. ' + koap.map((a) => a.num + (a.part ? ' ' + a.part : '')).join(', ') + ' КоАП');
  return groups.join('; ');
}

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = initial(START[props.screen] || 'search');
  }
  componentDidUpdate(prev) {
    if (prev.screen !== this.props.screen) this.setState(initial(START[this.props.screen] || 'search'));
  }
  componentWillUnmount() { clearTimeout(this._t); }

  inCalc(id) { return this.state.calc.some((c) => c.id === id); }
  toggleCalc(id) {
    const calc = this.inCalc(id) ? this.state.calc.filter((c) => c.id !== id) : [...this.state.calc, { id, mod: 'none' }];
    this.setState({ calc, pinned: this.state.pinned && this.state.pinned.kind === 'calc' && !calc.length ? null : this.state.pinned });
  }
  updateItem(id, patch) { this.setState({ calc: this.state.calc.map((c) => (c.id === id ? { ...c, ...patch } : c)) }); }
  openArticle(id) {
    const recent = [id, ...this.state.recent.filter((r) => r !== id)].slice(0, 20);
    this.setState({ article: id, recent, drawer: false });
  }
  toggleFav(id) {
    const favs = this.state.favs.includes(id) ? this.state.favs.filter((f) => f !== id) : [...this.state.favs, id];
    this.setState({ favs });
  }
  copyCharge() {
    try { if (navigator.clipboard) navigator.clipboard.writeText(this._charge || '').catch(() => {}); } catch (e) { /* sandboxed */ }
    this.setState({ copied: true });
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setState({ copied: false }), 1500);
  }

  rowVM(a, selected) {
    const p = penOf(a), added = this.inCalc(a.id), d = DOCS[a.doc];
    return {
      cls: selected ? 'row sel' : 'row', badge: d.badge, badgeCls: 'badge b-' + d.cat, num: label(a), title: a.title,
      hasJur: !!a.jur, jur: a.jur || '', stars: nArr(a.stars || 0), penMain: p.main, hasOr: !!p.alt, penAlt: p.alt || '',
      canAdd: isPenal(a), added, notAdded: !added, addCls: added ? 'add on' : 'add', addTitle: added ? 'Убрать из калькулятора' : 'Добавить в калькулятор',
      open: () => this.openArticle(a.id), add: () => this.toggleCalc(a.id),
    };
  }

  calcVM() {
    const s = this.state;
    const items = s.calc.map((c) => ({ ...c, a: ART[c.id] }));
    const uk = items.filter((x) => x.a.doc === 'uk').map((x) => {
      const m = MOD[x.mod || 'none'];
      return { ...x, term: Math.round(x.a.term * m), fine: x.a.fine ? Math.round(x.a.fine * m) : null };
    });
    const koap = items.filter((x) => x.a.doc === 'koap');
    const charge = chargeOf(items);
    this._charge = charge;

    const noFine = uk.filter((x) => !x.fine);
    const fineDisabled = noFine.length > 0;
    const mode = fineDisabled ? 'kpz' : s.mode;
    const main = uk.filter((x) => x.a.num !== '104');
    const add104 = uk.find((x) => x.a.num === '104');
    const byTerm = [...main].sort((x, y) => y.term - x.term);
    const byFine = [...main].sort((x, y) => (y.fine || 0) - (x.fine || 0));
    const strict = (mode === 'kpz' ? byTerm[0] : byFine[0]) || add104;
    const absorbed = main.filter((x) => x !== strict);
    const stacked = add104 && strict && strict !== add104 ? add104 : null;

    let term = strict ? strict.term + (stacked ? stacked.term : 0) : 0;
    const capped = term > 100;
    if (capped) term = 100;
    const fineLimit = strict ? (strict.fine || 0) + (stacked ? stacked.fine || 0 : 0) : 0;
    const fineAmount = s.fine === '' ? String(fineLimit) : s.fine;
    const fineOver = money(fineAmount) > fineLimit;

    const why = [];
    if (strict && absorbed.length) why.push(label(strict.a) + ' поглощает ' + absorbed.map((x) => label(x.a)).join(', ') + ' — УК ст. 41 ч. 2');
    if (stacked) why.push('ст. 104 добавлена сверху один раз — УК ст. 41 ч. 4');
    uk.filter((x) => x.mod && x.mod !== 'none').forEach((x) => why.push(label(x.a) + ': ' + (x.mod === 'att' ? 'покушение — ¾ наказания' : 'приготовление — ½ наказания') + ' — УК ст. 45'));
    if (capped && mode === 'kpz') why.push('Срок ограничен 100 месяцами — УК ст. 39 ч. 2');

    const fOnly = uk.filter((x) => x.a.jur === 'Ф');
    const bail = mode === 'kpz' && strict ? BAIL[strict.a.cat] : null;
    const subjOff = s.subject === 'official';
    const koapVM = koap.map((x) => {
      const max = subjOff ? x.a.maxOff : x.a.max;
      const amount = x.amount == null ? String(max) : x.amount;
      const over = money(amount) > max;
      return {
        num: label(x.a), title: x.a.title, amount, limit: over ? 'Больше предела: до ' + fmt(max) : 'до ' + fmt(max),
        limitCls: over ? 'lim bad' : 'lim', onAmount: (e) => this.updateItem(x.id, { amount: e.target.value.replace(/[^\d ]/g, '') }),
        remove: () => this.toggleCalc(x.id),
      };
    });
    const koapTotal = koapVM.reduce((sum, k) => sum + money(k.amount), 0);

    return {
      hasUk: uk.length > 0, hasKoap: koap.length > 0, charge,
      kpzCls: mode === 'kpz' ? 'on' : '', fineCls: mode === 'fine' ? 'on' : '', fineDisabled,
      fineHint: fineDisabled ? 'Штраф недоступен: у ' + noFine.map((x) => label(x.a)).join(', ') + ' нет штрафа' : '',
      setKpz: () => this.setState({ mode: 'kpz' }), setFine: () => this.setState({ mode: 'fine', fine: '' }),
      isKpz: mode === 'kpz', isFine: mode === 'fine',
      uk: uk.map((x) => {
        const isAbs = absorbed.includes(x);
        return {
          cls: isAbs ? 'ci absorbed' : 'ci', num: label(x.a), title: x.a.title,
          val: mode === 'kpz' ? x.term + ' мес' : x.fine ? 'до ' + fmt(x.fine) : '—',
          attCls: x.mod === 'att' ? 'mod on' : 'mod', prepCls: x.mod === 'prep' ? 'mod on' : 'mod',
          att: () => this.updateItem(x.id, { mod: x.mod === 'att' ? 'none' : 'att' }),
          prep: () => this.updateItem(x.id, { mod: x.mod === 'prep' ? 'none' : 'prep' }),
          hasJur: !!x.a.jur, jur: x.a.jur, jurCls: x.a.jur === 'Ф' ? 'jur f' : 'jur',
          remove: () => this.toggleCalc(x.id),
        };
      }),
      term: term + ' мес', termNote: capped ? 'потолок по УК ст. 39 ч. 2' : 'итог по УК', stars: nArr(Math.round(term / 10)),
      fineAmount, onFine: (e) => this.setState({ fine: e.target.value.replace(/[^\d ]/g, '') }),
      fineLimit: fineOver ? 'Больше предела: до ' + fmt(fineLimit) : 'до ' + fmt(fineLimit), fineLimitCls: fineOver ? 'lim bad' : 'lim',
      fineValue: fmt(money(fineAmount)),
      why, hasBail: !!strict && mode === 'kpz', bail: bail ? fmt(bail) + ' · УК ст. 50.1' : 'не предусмотрен',
      hasWarn: fOnly.length > 0, warn: fOnly.map((x) => label(x.a)).join(', ') + ' — федеральная подследственность. Дело ФСБ.',
      citCls: subjOff ? '' : 'on', offCls: subjOff ? 'on' : '',
      setCit: () => this.setState({ subject: 'citizen' }), setOff: () => this.setState({ subject: 'official' }),
      koap: koapVM, koapTotal: fmt(koapTotal),
    };
  }

  articleVM(a) {
    const d = DOCS[a.doc], added = this.inCalc(a.id), fav = this.state.favs.includes(a.id);
    const pens = [];
    if (a.doc === 'uk') {
      if (a.fine) pens.push({ isCell: true, isSep: false, label: 'Штраф', value: 'до ' + fmt(a.fine) }, { isCell: false, isSep: true });
      pens.push({ isCell: true, isSep: false, label: 'Лишение свободы', value: a.term + ' мес' });
    } else if (a.doc === 'koap') {
      pens.push({ isCell: true, isSep: false, label: 'Штраф, гражданин', value: 'до ' + fmt(a.max) });
      if (a.maxOff !== a.max) pens.push({ isCell: true, isSep: false, label: 'Должностное лицо', value: 'до ' + fmt(a.maxOff) });
      if (a.arrest) pens.push({ isCell: false, isSep: true }, { isCell: true, isSep: false, label: 'Арест', value: 'до ' + a.arrest + ' сут' });
    }
    const jurLong = a.jur === 'Ф' ? 'Ф · федеральная' : a.jur === 'Р' ? 'Р · региональная' : a.jur === 'Р/Ф' ? 'Р/Ф · любая подследственность' : '';
    return {
      badge: d.badge, badgeCls: 'badge b-' + d.cat, docName: d.name, chapter: a.chapter,
      heading: (a.doc === 'pdd' ? 'Пункт ' : 'Статья ') + a.num + (a.part ? ', ' + a.part : '') + '. ' + a.title,
      hasTags: !!a.jur || !!a.stars, hasJur: !!a.jur, jurLong, jurCls: a.jur === 'Ф' ? 'jur f' : 'jur',
      hasStars: !!a.stars, stars: nArr(a.stars || 0), starsNote: a.stars ? a.stars + ' ★ = ' + a.stars * 10 + ' мес' : '',
      hasPen: pens.length > 0, pens, parts: a.parts.map((p) => ({ ...p, hasN: !!p.n })),
      hasNote: !!a.note, note: a.note || '', updated: a.updated,
      canAdd: isPenal(a), addCls: added ? 'btn grow' : 'btn pri grow', addLabel: added ? 'Убрать из калькулятора' : 'Добавить в калькулятор',
      add: () => this.toggleCalc(a.id), pin: () => this.setState({ pinned: { kind: 'article', id: a.id }, overlay: false, drawer: false }),
      favCls: fav ? 'btn icon fav on' : 'btn icon fav', fav: () => this.toggleFav(a.id),
    };
  }

  drawerVM() {
    const s = this.state;
    const f = norm(s.drFilter.trim());
    const match = (d) => (s.drTag === 'all' || d.cat === s.drTag) && (!f || norm(d.name + ' ' + d.badge).includes(f));
    const docRow = (d) => ({
      cls: s.scope === d.id ? 'dr-row on' : 'dr-row', badge: d.badge, badgeCls: 'badge b-' + d.cat, name: d.name,
      count: d.count ? String(d.count) : '', pick: () => this.setState({ scope: d.id, query: '', sel: 0, drawer: false, article: null }),
    });
    const groups = [];
    const org = ORG[s.org];
    if (org && org.docs.length && s.drTag === 'all' && !f) groups.push({ title: org.name + ' · ваша организация', docs: org.docs.map((id) => docRow(DOCS[id])) });
    Object.keys(CATS).forEach((cat) => {
      const docs = DOC_LIST.map(([id]) => DOCS[id]).filter((d) => d.cat === cat && match(d));
      if (docs.length) groups.push({ title: CATS[cat], docs: docs.map(docRow) });
    });
    return {
      groups, empty: groups.length === 0,
      tags: TAGS.map(([id, name]) => ({ name, cls: s.drTag === id ? 'tag on' : 'tag', pick: () => this.setState({ drTag: id }) })),
    };
  }

  renderVals() {
    const s = this.state;
    const org = ORG[s.org] || ORG.none;
    const hotkeyText = s.hotkey.join(' + ');

    // Onboarding
    const obNext = () => {
      if (s.step < 4) this.setState({ step: s.step + 1, listening: false });
      else this.setState({ screen: 'app', overlay: true, step: 1, settings: false });
    };
    const onHotkey = (e) => {
      if (!s.listening) return;
      e.preventDefault();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');
      keys.push(e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key);
      this.setState({ hotkey: keys, listening: false });
    };

    // Search / results
    const inHome = !s.query.trim() && !s.scope;
    const results = inHome ? [] : search(s.query, s.scope, s.org);
    const homeList = inHome ? [...s.favs, ...s.recent.filter((r) => !s.favs.includes(r))].map((id) => ART[id]) : [];
    const nav = inHome ? homeList : results;
    this._nav = nav;
    const sel = Math.min(s.sel, Math.max(0, nav.length - 1));
    const favRows = s.favs.map((id, i) => this.rowVM(ART[id], inHome && i === sel && !s.article));
    const recentOnly = s.recent.filter((r) => !s.favs.includes(r));
    const recentRows = recentOnly.map((id, i) => this.rowVM(ART[id], inHome && s.favs.length + i === sel && !s.article));
    const resultRows = results.map((a, i) => this.rowVM(a, i === sel && !s.article));
    const scopeDoc = s.scope ? DOCS[s.scope] : null;

    const onKey = (e) => {
      const cur = this._nav[Math.min(this.state.sel, this._nav.length - 1)];
      if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ sel: Math.min(this.state.sel + 1, this._nav.length - 1) }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ sel: Math.max(this.state.sel - 1, 0) }); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const a = this.state.article ? ART[this.state.article] : cur;
        if (a) { if (isPenal(a)) this.toggleCalc(a.id); else this.openArticle(a.id); }
      } else if (e.key === 'ArrowRight' && cur && !this.state.article && e.target.selectionStart === e.target.value.length) { e.preventDefault(); this.openArticle(cur.id); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (this.state.drawer) this.setState({ drawer: false });
        else if (this.state.article) this.setState({ article: null });
        else if (this.state.query || this.state.scope) this.setState({ query: '', scope: null, sel: 0 });
        else this.setState({ overlay: false });
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'с') && e.target.selectionStart === e.target.selectionEnd && this.state.calc.length) {
        e.preventDefault(); this.copyCharge();
      }
    };

    const c = this.calcVM();
    const art = s.article ? this.articleVM(ART[s.article]) : null;
    const dr = this.drawerVM();

    // Pinned card
    const pinned = s.pinned && (s.pinned.kind === 'article' || s.calc.length) ? s.pinned : null;
    let pin = { isCalc: false, isArticle: false };
    if (pinned && pinned.kind === 'calc') {
      pin = { isCalc: true, isArticle: false, term: c.isKpz ? c.term : c.fineValue, stars: c.isKpz ? c.stars : [], charge: c.charge,
        hasKoap: c.hasKoap, koapTotal: c.koapTotal, hasWarn: c.hasWarn, warn: c.warn };
    } else if (pinned) {
      const a = ART[pinned.id], p = penOf(a);
      pin = { isCalc: false, isArticle: true, heading: DOCS[a.doc].badge + ' ' + label(a) + '. ' + a.title,
        pen: p.alt ? p.main + ' либо ' + p.alt : p.main, text: a.parts.map((x) => x.t).join(' ') };
    }

    return {
      hotkeyText,
      isOnboarding: s.screen === 'onboarding', isApp: s.screen === 'app',
      obTitle: s.settings ? 'Настройки' : 'РО Хелпер', step: s.step,
      progress: [1, 2, 3, 4].map((n) => ({ cls: n <= s.step ? 'on' : '' })),
      step1: s.step === 1, step2: s.step === 2, step3: s.step === 3, step4: s.step === 4,
      servers: SERVERS.map(([id, name, note]) => ({ name, note, disabled: !!note, cls: s.server === id ? 'opt on' : 'opt', pick: () => this.setState({ server: id }) })),
      orgs: ORGS.map(([id, name]) => ({ name, cls: s.org === id ? 'org on' : 'org', pick: () => this.setState({ org: id }) })),
      hkCls: s.listening ? 'hk listen' : 'hk', listening: s.listening, notListening: !s.listening, hotkey: s.hotkey,
      listen: () => this.setState({ listening: true }), onHotkey, hkWarn: s.hotkey.length === 1,
      summary: 'Тверской · ' + org.name + ' · ' + hotkeyText + '. Всё это можно поменять в настройках.',
      canBack: s.step > 1, back: () => this.setState({ step: s.step - 1, listening: false }),
      next: obNext, nextLabel: s.step < 4 ? 'Далее' : s.settings ? 'Сохранить' : 'Готово',

      onGame: () => { if (s.screen === 'app') this.setState({ overlay: !s.overlay, drawer: false }); },
      overlayOn: s.overlay,
      ovCls: s.overlay ? 'ov glass' : 'ov glass hidden',
      calcCls: s.overlay && s.calc.length ? 'calc glass' : 'calc glass hidden',
      calcCount: String(s.calc.length),
      menuCls: s.drawer ? 'icon-btn on' : 'icon-btn',
      toggleDrawer: () => this.setState({ drawer: !s.drawer }),
      openSettings: () => this.setState({ screen: 'onboarding', settings: true, step: 1 }),
      hideOverlay: () => this.setState({ overlay: false, drawer: false }),
      chip: 'Тверской · ' + (s.org === 'none' ? 'без организации' : org.name),
      hasScope: !!scopeDoc, scopeBadge: scopeDoc ? scopeDoc.badge : '', clearScope: () => this.setState({ scope: null, sel: 0 }),
      query: s.query, placeholder: scopeDoc ? 'Поиск: ' + scopeDoc.name : 'Номер или слова: 65, коап 8.6, кража',
      onQuery: (e) => this.setState({ query: e.target.value, sel: 0, article: null }), onKey,

      showArticle: !!art, showHome: !art && inHome, showResults: !art && !inHome, art: art || {},
      backLabel: inHome ? 'Избранное и недавние' : 'Результаты', closeArticle: () => this.setState({ article: null }),
      favRows, recentRows, resultRows,
      metaLeft: scopeDoc ? scopeDoc.name : results.length + ' ' + (results.length === 1 ? 'результат' : results.length > 1 && results.length < 5 ? 'результата' : 'результатов'),
      metaRight: scopeDoc ? (scopeDoc.count ? scopeDoc.count + ' статей' : '') : 'все документы',
      noResults: results.length === 0,
      emptyText: scopeDoc ? 'В прототипе статьи этого документа не заполнены' : 'Ничего не найдено',

      c, copy: () => this.copyCharge(), copyLabel: s.copied ? 'Скопировано' : 'Скопировать',
      clearCalc: () => this.setState({ calc: [], pinned: s.pinned && s.pinned.kind === 'calc' ? null : s.pinned }),
      pinCalc: () => this.setState({ pinned: { kind: 'calc' }, overlay: false, drawer: false }),

      hasPin: !!pinned, pin, pinCls: s.overlay ? 'pin live' : 'pin', unpin: () => this.setState({ pinned: null }),

      scrimCls: s.drawer ? 'scrim on' : 'scrim', drawerCls: s.drawer ? 'drawer on' : 'drawer',
      drFilter: s.drFilter, onDrFilter: (e) => this.setState({ drFilter: e.target.value }),
      drTags: dr.tags, drGroups: dr.groups, drEmpty: dr.empty,
    };
  }
}
