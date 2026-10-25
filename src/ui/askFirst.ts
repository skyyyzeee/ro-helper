// A question or a situation typed into the search («Сотрудник ГИБДД не представился, он обязан?») is the AI's: the
// offer to ask it stands first in the results, chosen, so Enter asks. A few words of an article («кража», «65»,
// «коап 8.6») are the search's, as ever: Enter puts the article into the calculator.

/** An article number, perhaps with its code: «65», «ук 10.2», «коап 8.6?» — never the AI's. */
const ARTICLE = /^\s*(?:(?:ук|коап|пдд|упк|тк|ст\.?|статья|статью|п\.?|пункт)\s*)?\d+(?:\.\d+)*\s*\??\s*$/i;

/** Words a question or a told situation opens with. */
const OPENING = /^(?:что|как|можно|могу|может|обязан\w*|должен|должна|сколько|почему|зачем|когда|где|если|законно|имеет|имею|меня|мне|я|он|она|они|мы|игрок|сотрудник\w*|полицейск\w*|водител\w*|человек|чел)(?![а-яё])/i;

/** Whether the search's text reads as a question for the AI rather than words to find an article by. */
export function asksTheAi(query: string): boolean {
  const text = query.trim().replace(/ё/gi, 'е');
  if (!text || ARTICLE.test(text)) return false;
  const words = text.split(/\s+/).filter((w) => /[а-яa-z]/i.test(w)).length;
  if (words >= 4) return true;
  if (/\?\s*$/.test(text) && words >= 2) return true;
  return words >= 2 && OPENING.test(text);
}
