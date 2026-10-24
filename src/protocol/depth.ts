// When the full analysis is worth its wait without the player asking for it (an idea borrowed from LEX): a long
// situation, a test question with its answers to choose from, a matter for a court or a prosecutor. Everything else
// is answered quickly, as before; «Подробнее» still asks for the full one by hand.

/** So many words tell a situation, not a question. */
const LONG = 45;
/** «а) …», «1) …», «B. …» on lines of their own: the answers of a test. */
const OPTION = /^\s*(?:[а-гa-d]|\d)[).]\s+\S/gim;
/** A court, a claim, a motion, a prosecutor, an appeal — as words of their own: not «судимость», not «искать». */
const COURT = /(?:^|[^а-яё])(?:суд(?:а|е|у|ом|ы|ов|ам|ебн[а-яё]*)?|иск(?:а|е|у|ом|ов|ов[а-яё]+)?|ходатайств[а-яё]*|прокурор[а-яё]*|апелляц[а-яё]*|обжалова[а-яё]*|допрос[а-яё]*)(?![а-яё])/i;

/** Whether a question is one for the full analysis. */
export function wantsFullAnalysis(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean).length;
  if (words >= LONG) return true;
  if ((question.match(OPTION) ?? []).length >= 2) return true;
  return COURT.test(question.toLowerCase().replace(/ё/g, 'е'));
}
