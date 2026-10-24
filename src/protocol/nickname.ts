// «Aiden_Arokij», «проверь ник Иван_Петров»: a character's name, checked by the app — no AI call, no day's limit
// spent. What is plainly wrong with it is said; whether a name is «nonRP» is the administration's word, so the rule
// itself is given to read.
import { searchArticles, type SearchHit, type ServerPack } from '../core';
import { packInScope } from './sources';

/** A name as the game writes it, «Имя_Фамилия», perhaps after «ник» or «проверь ник». */
const NICKNAME = /^(?:(?:проверь(?:те)?|проверка|подойд[её]т(?: ли)?|норм(?:альный)?(?: ли)?|можно(?: ли)?)\s+)?(?:(?:ник(?:нейм)?|имя)\s*[:-]?\s+)?([a-zа-яё]+)_([a-zа-яё]+)\s*[?!.]*$/i;

/** The name of a question that is only a character's name, «Имя_Фамилия»; null for any other question. */
export function nicknameOf(message: string): { first: string; last: string } | null {
  const match = NICKNAME.exec(message.trim());
  return match ? { first: match[1], last: match[2] } : null;
}

/** What is plainly wrong with the name — not a judgement of whether it is RP, which the administration makes. */
function problems(first: string, last: string): string[] {
  const found: string[] = [];
  const latin = /[a-z]/i.test(first + last);
  const cyrillic = /[а-яё]/i.test(first + last);
  if (latin && cyrillic) found.push('смешаны русские и латинские буквы');
  else if (latin) found.push('написан латиницей: на русском проекте имя «Имя Фамилия» по-русски, латиница может быть сочтена nonRP');
  for (const [word, label] of [[first, 'Имя'], [last, 'Фамилия']] as const) {
    if (word[0] !== word[0].toUpperCase()) found.push(`${label} с маленькой буквы`);
    if (word.length < 2) found.push(`${label} из одной буквы`);
  }
  return found;
}

/** The rule on characters' names (Основные правила, 2.9 on every server): the search finds it by its words. */
function nameRule(pack: ServerPack): SearchHit[] {
  return searchArticles(packInScope(pack, 'server_rule'), 'nonRP Имя Фамилия никнейм ', { limit: 3 })
    .filter((hit) => /имя.{0,3}фамили/i.test(hit.article.parts.map((p) => p.text).join(' ')))
    .slice(0, 1);
}

/** The app's word on a name, and the rule to read: what is wrong with it, or that nothing plain is. */
export function checkNickname(pack: ServerPack, name: { first: string; last: string }): { text: string; hits: SearchHit[] } {
  const shown = `${name.first} ${name.last}`;
  const found = problems(name.first, name.last);
  const text = found.length
    ? `Ник «${shown}», скорее всего, не подойдёт: ${found.join('; ')}. За nonRP-ник — деморган до смены ника, при возврате того же ника — 150 минут.`
    : `В нике «${shown}» явных ошибок нет. Но nonRP-ник — это ещё и выдуманное, несуразное или известное имя: сверьте со списком в правиле. Последнее слово — за администрацией.`;
  return { text, hits: nameRule(pack) };
}
