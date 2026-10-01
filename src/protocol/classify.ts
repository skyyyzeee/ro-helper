// What a question is, decided before any AI is asked — so a greeting, a question about the weather or the real
// laws of Russia, gibberish, or a bare article number costs no AI call and never reaches the model at all. Plain
// rules over the words; when they cannot tell, the AI's first call (the search phrases) also says what it is.
import { unknownWords, type ServerPack } from '../core';
import type { Scope, ScopeChoice } from './sources';

export type QuestionType =
  /** A situation or question about the laws (and the charters that apply them). */
  | 'legal'
  /** About the rules of the server — the project's own rules, not its laws. */
  | 'server_rule'
  /** About both, told apart in the answer. */
  | 'mixed'
  /** A bare article number («65», «ук 10.2»): the search answers it, no AI. */
  | 'article_lookup'
  /** «Привет», «спасибо», «что ты умеешь». */
  | 'greeting'
  /** Something the app's base has no answer to: the weather, the news, real laws. */
  | 'out_of_scope'
  /** No question at all. */
  | 'nonsense'
  /** Could be about the laws or the rules — or neither: the AI's first call decides, or the player is asked. */
  | 'unclear';

export interface Classification {
  type: QuestionType;
  /** Which documents may answer it; none for what needs no sources. */
  scope?: Scope;
  /** Why, in a few words — for the debug view and the exam. */
  why: string;
  /** The player chose laws or rules, but the question looks like the other: said beside the answer. */
  mismatch?: Scope;
}

/** The types the app answers itself, with no AI and no sources. */
export const ANSWERED_BY_APP = new Set<QuestionType>(['article_lookup', 'greeting', 'out_of_scope', 'nonsense']);

/** `\b` and `\w` of JavaScript know only Latin letters: in these patterns they are a word's edge and letter in Russian too. */
const EDGE = '(?:(?<![а-яa-z0-9])(?=[а-яa-z0-9])|(?<=[а-яa-z0-9])(?![а-яa-z0-9]))';
const ru = (source: RegExp) => new RegExp(source.source.replaceAll('\\b', EDGE).replaceAll('\\w', '[а-яa-z0-9]'));

const normal = (text: string) => text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const GREETING = ru(/^(привет\w*|здравств\w*|здрасьте|добр(ый|ое|ой) (день|вечер|утро|ночи)|хай|hello|hi|спасибо\w*|благодар\w*|ок|окей|пока|кто ты|что ты (умеешь|можешь)|ты кто)[\s!.,?)]*$/);

/** A bare article number, perhaps with its code and part: «65», «ук 10.2», «статья 65 ч 2», «коап 8.6?». */
const ARTICLE_LOOKUP = /^(?:(?:ук|коап|пдд|упк|тк|устав|правила|ст\.?|статья|статью|статьи)\s*)*\d+(?:\.\d+)*(?:\s*(?:ч\.?|часть)\s*\d+)?\s*\??$/;

/** The real world, not the game: what the base can never answer. */
const OUT_OF_SCOPE: { re: RegExp; why: string }[] = [
  { re: ru(/\b(реальн\w+|настоящ\w+)\s+(ук|коап|закон\w*|кодекс\w*|рф)\b|\b(ук|коап|закон\w*|кодекс\w*)\s+рф\b|российск\w+ (закон\w*|кодекс\w*|федерации)|\bв (реальной )?россии\b/), why: 'реальные законы РФ' },
  { re: ru(/\bпогод\w*|\bновост\w* (мира|в мире|сегодня)|\bкурс (доллар|евро|валют|рубл)\w*|биткоин|\bакци[ия] (сбер|газпром)|гороскоп|анекдот/), why: 'вопрос не об игре' },
  { re: ru(/\bрецепт\w*|\bкак приготовить|\bболит\b|\bлекарств\w*|\bтаблетк\w*|\bсимптом\w*/), why: 'вопрос не об игре' },
  { re: ru(/\bпрезидент\w* (рф|россии|сша)|\bвыбор\w* (в|президента)|\bвойн\w* (на украине|в мире)|\bфутбол\w*|\bсериал\w*|\bдомашн\w+ задани\w*|\bреферат\w*/), why: 'вопрос не об игре' },
];

/** Words of the rules of the project: the game's own terms and its admins' punishments. */
const RULE_WORDS = ru(
  /\bпо правилам\b(?! дорожн)|правил\w* (сервера|проекта)|\bпо серверу\b|\bадмин(ы|а|у|ам|ов|ом|ка|ки|истратор\w*|истраци\w*)?\b|\bнрп\b|\bnon ?rp\b|\bnonrp\b|\bрп\b|\brp\b|\bдм\b|\bdm\b|\bрдм\b|\brdm\b|\bмг\b|метагейм\w*|\bпг\b|пауэргейм\w*|\bтк\b|\bdb\b|\bдб\b|\bsk\b|\bск\b(?=.*(убил|спавн|респ))|\booc\b|\bic\b|отыгр\w*|\bбан\w*|\bварн\w*|\bдеморган\w*|\bджайл\w*|\bкик\w*|багоюз\w*|\bчит\w*|стороннее по|твинк\w*|\bспавн\w*|\bреспаун\w*|капт\w*|\bбизвар\w*|война за территори\w*|\bфорт\w*|\bairdrop\b|аирдроп\w*|поставк\w*|\bцех\w*|\bдилер\w*|стрим-?снайп\w*/,
);

/** Words of the laws: their names, their institutions and what they deal in. */
const LAW_WORDS = ru(
  /\bстать[яиюей]\w*|\bст\.?\s*\d|\bук\b|\bкоап\b|\bупк\b|\bпдд\b|закон\w*|кодекс\w*|конституц\w*|штраф\w*|\bсрок\w*|наказан\w*|\bарест\w*|задерж\w*|задержа\w*|полиц\w*|\bмент\w*|\bкоп\w*|\bмвд\b|\bфсб\b|\bфсо\b|гибдд|\bдпс\b|сотрудник\w*|адвокат\w*|\bсуд\w*|прокур\w*|\bправа\b|\bправ\b|обыск\w*|протокол\w*|взятк\w*|розыск\w*|\bзвезд\w*|залог\w*|уголовн\w*|административн\w*|\bлиценз\w*|оружи\w*|наркот\w*|\bпреступ\w*|правонаруш\w*|\bнарушил\w*|\bчто (ему|мне|ей|им) (будет|грозит|светит|дадут)|впаят\w*|\bгрозит\b|\bдают\b|\bположено\b|светофор\w*|\bкрасный\b|\bкрасн\w* свет\w*|перекрест\w*|\bводител\w*|\bза рулем\b|\bдтп\b|\bпарков\w*|\bскорост\w*|\bпешеход\w*|\bобгон\w*|\bвстречк\w*|\bгаи\b/,
);

/** The everyday words the server's synonyms list («украл», «избил»…): situations the laws speak to. */
function synonymWords(pack: ServerPack): RegExp | null {
  const keys = Object.keys(pack.synonyms ?? {}).map((k) => normal(k)).filter((k) => k.length >= 3);
  return keys.length ? new RegExp(`(^|[^а-яa-z])(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`) : null;
}
const synonymsCache = new WeakMap<ServerPack, RegExp | null>();

/** Letters in the text: gibberish and keyboard mashing have few words of any language. */
function looksLikeNonsense(text: string): boolean {
  const words = text.match(/[а-яa-z]{2,}/g) ?? [];
  if (!words.length) return !/\d/.test(text);
  // A long run of consonants or one letter repeated: «ываываыва», «ааааа».
  return words.every((w) => /(.)\1{3,}/.test(w) || /[бвгджзйклмнпрстфхцчшщ]{6,}/.test(w));
}

/**
 * The question's type and scope. The player's choice of laws or rules is the scope whatever the words say — the
 * question only decides what is no question of the base at all, and what to say if it looks like the other kind.
 */
export function classify(pack: ServerPack, raw: string, choice: ScopeChoice = 'auto'): Classification {
  const text = normal(raw);
  if (!text || looksLikeNonsense(text)) return { type: 'nonsense', why: 'не похоже на вопрос' };
  if (GREETING.test(text)) return { type: 'greeting', why: 'приветствие или вопрос об ассистенте' };
  if (ARTICLE_LOOKUP.test(text)) return { type: 'article_lookup', why: 'номер статьи — ответит поиск' };
  for (const { re, why } of OUT_OF_SCOPE) if (re.test(text)) return { type: 'out_of_scope', why };

  if (!synonymsCache.has(pack)) synonymsCache.set(pack, synonymWords(pack));
  const synonyms = synonymsCache.get(pack);
  const rule = RULE_WORDS.test(text);
  const law = LAW_WORDS.test(text) || !!synonyms?.test(text);
  // Not one word the server's documents hold, nor a word of the laws or rules: «ывапролдж», «трактор весит» —
  // nothing the base could answer, so nothing to ask the AI about.
  if (!rule && !law && !/\d/.test(text)) {
    const { known, unknown } = unknownWords(pack, text);
    if (!known && unknown.length) return { type: 'nonsense', why: 'ни одного слова из базы сервера' };
  }
  const said: Scope | null = rule && law ? 'mixed' : rule ? 'server_rule' : law ? 'law' : null;
  const why = said === 'mixed' ? 'слова и закона, и правил сервера' : said === 'server_rule' ? 'слова правил сервера' : said === 'law' ? 'слова закона' : 'ни слов закона, ни слов правил';

  if (choice !== 'auto') {
    const mismatch = said && said !== 'mixed' && said !== choice ? said : undefined;
    return { type: choice === 'law' ? 'legal' : 'server_rule', scope: choice, why: `выбрано вручную; ${why}`, ...(mismatch ? { mismatch } : {}) };
  }
  if (!said) return { type: 'unclear', why };
  return { type: said === 'law' ? 'legal' : said, scope: said, why };
}

/** What the AI's first call may say a question is, when the words could not tell. */
export const AI_INTENTS = new Set(['legal', 'server_rule', 'mixed', 'out_of_scope', 'nonsense', 'unclear']);
