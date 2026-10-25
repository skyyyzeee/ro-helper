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
  // An officer who did not say who they are: the law names it the identification of a state servant.
  { all: [OFFICIAL, ru(/не представил|не назвал\w* себя|не показал\w* удостоверени|без удостоверени|удостоверени\w* не (показ|предъяв)/)], terms: ['идентификация государственного служащего', 'служебное удостоверение'] },
  // A bat, a knife in the hands in the street: the weapon bared in a public place.
  { all: [ru(/\bбит[аоуеы]\w*|\bнож\w*|\bтопор\w*|\bмачет\w*|\bкастет\w*|оружи\w*|пистолет\w*|ствол\w*/), ru(/в рук\w*|достал|вытащил|держал|стоял|ходил|на улиц\w*|в общественн\w*/)], terms: ['обнажение оружия', 'обнажение оружия в общественных местах'] },
  // A macro, a cheat, a script: software for an advantage in the game (the project's rules).
  { all: [ru(/\bмакрос\w*|\bчит\w*|\bскрипт\w*|\bаим\w*|\baim\w*|\bбот\b|\bботом\b|автокликер\w*|\bсофт\w*/)], terms: ['постороннее ПО', 'игрового преимущества'] },
  // Leaving the game in the middle of a scene: the rules call it leaving the RP.
  { all: [ru(/(?:вышел|вышла|вышли|выход\w*|выйти|ушел|ушла) из игры|\bливн\w*|\bлив(ает|нул)\w*|\bрелог\w*|перезаш[её]л|\bвышел из (?:рп|rp)\b/)], terms: ['уход от RP', 'выход из игры во время RP'] },
  // A member of a service doing a crime: the rules of the state factions forbid it without an approved scene.
  { all: [ru(/^(?:сотрудник|полицейск|офицер|военнослужащ|военн|госслужащ|инспектор|\bмент|\bкоп)/), ru(/ограбил|украл|похитил|убил|избил|угнал|продал|торговал|грабил|крал|наркот/)], terms: ['криминальные действия сотрудникам гос. структур'] },
  // A robbery told in a word («ограбил магазин»): the law names it грабёж — or разбой, with violence.
  { all: [ru(/ограбил|ограблени|грабанул|обнес|обчистил/)], terms: ['грабёж', 'разбой'] },
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
/**
 * Situations that break the project's rules, told the way players tell them in complaints on the forum: the rules'
 * own words for them («DM», «NonRP Drive», «злоупотребление функционалом государственных структур»). One of these
 * in a question also tells the classifier the rules are asked about (classify.ts), with no AI.
 */
const RULE_HINTS: Hint[] = [
  // Killed or hit for nothing: DM.
  { all: [ru(/убил|убили|застрелил|пристрелил|стрелял|избил|ударил|напал|завалил/), ru(/без (?:ic |ик |рп )?(?:причин|повод|диалог)|ни за что|просто так|ничего (?:ему |ей |им )?не (?:делал|сделал)|первым не|молча/)], terms: ['DM Deathmatch', 'без IC причины и IC диалога'] },
  // Run over on purpose: DB.
  { all: [ru(/наехал|наезжал|сбил|давил|задавил|переехал|таранил/), ru(/специально|намеренно|несколько раз|постоянно|нарочно|машин|авто|транспорт/)], terms: ['DriveBy наезд на игрока транспортом'] },
  // Driven where no car can go: NonRP Drive.
  { all: [ru(/заехал|ездил|езди[тл]|катался|ехал|въехал|гонял/), ru(/в здани|в интерьер|по горам|по горе|на гору|по воде|по реке|по лестниц|в помещени/)], terms: ['NonRP Drive вождение транспорта в невозможных условиях'] },
  // Back where one was killed: NLR.
  { all: [ru(/вернулся|вернулась|пришел|пришла|приехал|приехала|возвращ/), ru(/убили|смерт|возродил|респ|погиб|после того как умер/)], terms: ['NLR правила новой жизни возвращение на место гибели'] },
  // More than the character could do: PG.
  { all: [ru(/в наручник|связанн|раненый|с ранени|со сломанн|без сознани|избитый/), ru(/убежал|побежал|перепрыгнул|прыгнул|залез|дрался|стрелял|сбежал|отбивался/)], terms: ['PG Power gaming преувеличение возможностей персонажа'] },
  // A detainee who ran: leaving the RP by the rules, an escape from custody by the law.
  { all: [ru(/в наручник|задержанн|из-под стражи|из кпз|из камеры|под конвоем|при задержании/), ru(/убежал|сбежал|побежал|вырвался|скрылся/)], terms: ['уход от RP', 'побег из-под стражи'] },
  // A chase or a gunfight taken into a green zone.
  { all: [ru(/зелен\w* зон/)], terms: ['погони и перестрелки в зеленых зонах'] },
  // Cheated of money or property.
  { all: [ru(/обманул|кинул|скам|развел|не вернул|пропал|забрал деньги|не отдал|исчез/), ru(/деньг|машин|имуществ|перев[её]л|сделк|оплат|предоплат|купит/)], terms: ['обмана на имущество'] },
  // An officer who did not say the charge or the rights.
  { all: [OFFICIAL, ru(/не (?:сказал|назвал|озвучил|объяснил|разъяснил|зачитал|огласил)/), ru(/стать|прав|за что/)], terms: ['права и статьи озвучены в голосовой чат'] },
  // An officer misusing the state's functions: for a mask, an AFK player, the casino, five stars for a trifle.
  { all: [OFFICIAL, ru(/задерж|дал|выдал|посадил|арестовал|оштрафовал|повязал|принял|кафа/), ru(/за маску|в маске|\bafk\b|\bафк\b|казино|5 звезд|пять звезд|максимальн\w* срок|за мелк|судимост|в больниц/)], terms: ['злоупотребление функционалом государственных структур'] },
  // A quarrel carried from outside the game into it.
  { all: [ru(/дискорд|discord|из жизни|в реале|\booc\b|\bоос\b|вне игры|телеграм/), ru(/ссор|конфликт|обид|мстит|убивает|враж|претензи/)], terms: ['Переносить конфликты из OOC в IC'] },
  // Accounts: more than one, or sold.
  { all: [ru(/аккаунт/), ru(/\bдва\b|\b2\b|несколько|второй|твинк|еще один/)], terms: ['количество разрешенных аккаунтов'] },
  { all: [ru(/аккаунт/), ru(/прода|обмен|передат|отдат|купит/)], terms: ['продажа обмен игровых аккаунтов'] },
  // Bugs.
  { all: [ru(/\bбаг\w*|багоюз|сквозь стен|сквозь текстур|под текстур|уязвимост|\bдюп\w*/)], terms: ['уязвимости системы и баги'] },
];

/** Whether the question tells a situation that breaks the project's rules. */
export const breaksRules = (text: string): boolean => {
  const normal = text.toLowerCase().replace(/ё/g, 'е');
  return RULE_HINTS.some((hint) => hint.all.every((pattern) => pattern.test(normal)));
};

export function hintTerms(text: string): string[] {
  const normal = text.toLowerCase().replace(/ё/g, 'е');
  const terms = [...HINTS, ...RULE_HINTS].filter((hint) => hint.all.every((pattern) => pattern.test(normal))).flatMap((hint) => hint.terms);
  return [...new Set(terms)];
}
