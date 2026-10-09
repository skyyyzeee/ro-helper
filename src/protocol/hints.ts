/**
 * Situations players tell in everyday words that the law names otherwise: «взял 20 000, чтобы не выписывать штраф»
 * is a bribe, «ехал 140 км/ч» — speeding, «пообещал убить» — a threat to kill. Their words alone do not reach the
 * article; these patterns give the search the law's words for them, with no AI — and beside the AI's own phrases,
 * so its miss is not the search's.
 */
interface Hint {
  /** Every one of these in the text. */
  all: RegExp[];
  /** The law's words for it, searched as phrases. */
  terms: string[];
}

/** A word's edge in Cyrillic too: «\b» of JavaScript knows only Latin letters. The text is matched in lower case, «ё» as «е». */
const EDGE = '(?:(?<=[а-яa-z0-9])(?![а-яa-z0-9])|(?<![а-яa-z0-9])(?=[а-яa-z0-9]))';
const ru = (pattern: RegExp) => new RegExp(pattern.source.replaceAll('\\b', EDGE).replaceAll('\\w', '[а-яa-z0-9]'));
const MONEY = ru(/деньг|денег|бабк|бабл|налик|налич|рубл|\d[\d\s.]*(?:000|к\b|тыс)|\bсумм/);
const OFFICIAL = ru(/сотрудник|полицейск|\bмент|\bкоп|офицер|инспектор|\bдпс|гибдд|\bмвд|следовател|прокурор|чиновник|должностн/);

const HINTS: Hint[] = [
  // Money for doing or not doing something: a bribe, given or taken.
  { all: [MONEY, ru(/чтобы|чтоб|за то,? что|отпуст|не выписыв|не оформ|не приезжа|закрыл[аио]? глаза|замя[лт]|отмаза/)], terms: ['взятка', 'получение взятки', 'дача взятки'] },
  // A speed in km/h.
  { all: [ru(/\d{2,3}\s*(?:км|km)/)], terms: ['превышение скорости'] },
  { all: [ru(/гнал|летел|несся|разогнал/), ru(/скорост|км/)], terms: ['превышение скорости'] },
  // A red light: the law says «запрещающий сигнал» (КоАП Арбатского — the chapter's title only, not its article's text).
  { all: [ru(/на красн|красный свет|красный сигнал|на запрещающ|проскочил светофор|светофор\w* на красн/)], terms: ['проезд на запрещающий сигнал', 'запрещающий сигнал светофора', 'остановка перед стоп-линией'] },
  // A threat to kill.
  { all: [ru(/пообещал|обещал|грозил|угрожал|сказал|написал|кричал/), ru(/убьет|убью|убить|завалю|завалит|прикончу|прибью/)], terms: ['угроза убийством'] },
  // An officer beating someone.
  { all: [OFFICIAL, ru(/избил|избива|\bбил\b|ударил|пинал|дубинк|бьет|покалечил/)], terms: ['превышение должностных полномочий'] },
  // A weapon with no licence.
  { all: [ru(/пистолет|ствол|автомат|ружь|оружи|дробовик|винтовк|револьвер/), ru(/без лицензи|нет лицензи|не было лицензи|лицензи.{0,30}(?:нет|не было|отсутств)/)], terms: ['незаконное хранение оружия', 'ношение оружия'] },
  // Parking where it is not allowed.
  { all: [ru(/постав|припарков|останов|стоял|брос|оставил/), ru(/пешеходн\w* переход|тротуар|газон|остановк\w* общественн/)], terms: ['нарушение правил остановки или стоянки', 'стоянка'] },
  // What one learned outside the game, used in it: MG.
  { all: [ru(/дискорд|discord|\booc\b|\bоос\b|вне игры|телеграм|\bтг\b|стрим|в реале/), ru(/инф|спалил|узнал|рассказал|сказал|использ/)], terms: ['Meta Gaming', 'OOC информации'] },
  // «Зачитать миранду»: the rights a detainee is told.
  { all: [ru(/миранд|(?:зачит|разъясн|огласи|прочит)\w* (?:(?:ему|мне|им|нам|ей|задержанному) )?(?:его )?прав/)], terms: ['разъяснение прав задержанному', 'права задержанного'] },
  // Swearing: an insult, and to an officer — of a representative of the power.
  { all: [ru(/обматерил|матом|мат\b|матерн|послал на|оскорбил|оскорбля/)], terms: ['оскорбление', 'матерной брани'] },
  { all: [OFFICIAL, ru(/обматерил|матом|послал на|оскорбил|оскорбля/)], terms: ['оскорбление представителя власти'] },
  // Family insulted — the project's rules name it «оскорбление родственников» (Тверской, Правила 4.2–4.3).
  { all: [ru(/родн|родствен|\bмам|\bмат(?:ь|ери)\b|\bпап|\bотц|\bбат[яе]/), ru(/оскорб|обозвал|послал|обматерил|матом|упомина|шут/)], terms: ['оскорбление родственников'] },
];

/** The law's words for what the text tells in everyday ones; none when no pattern fits. */
export function hintTerms(text: string): string[] {
  const normal = text.toLowerCase().replace(/ё/g, 'е');
  const terms = HINTS.filter((hint) => hint.all.every((pattern) => pattern.test(normal))).flatMap((hint) => hint.terms);
  return [...new Set(terms)];
}
