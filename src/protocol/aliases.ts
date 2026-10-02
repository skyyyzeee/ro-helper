// The players' own words, as the admins approved them: «что ему впаяют» → «наказание», «ствол» → «огнестрельное
// оружие», «по серверу можно?» → the rules of the server. An approved expression helps the search and the classifier
// without the AI: its normal form is searched like the player's words, and its scope settles a question the words
// alone could not. Nothing here is a source: an alias finds articles only through the search of the base.
import type { Scope } from './sources';

/** An approved expression of the players (docs/AI_DATASET.md). */
export interface QueryAlias {
  /** What players write, lower case: «чела приняли». */
  phrase: string;
  /** The same in the words of the base, for the search: «задержание». */
  normalized: string;
  /** Which documents answer it, when the expression says: the laws or the rules of the server. */
  scope?: Exclude<Scope, 'mixed'>;
  /** What is asked: punishment, detention, rights… — for the admins and the exam. */
  intent?: string;
}

const normal = (text: string) => text.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();

/** The approved expressions the text holds, as whole words. */
export function matchAliases(text: string, aliases: readonly QueryAlias[] = []): QueryAlias[] {
  const said = ` ${normal(text)} `;
  return aliases.filter((alias) => {
    const phrase = normal(alias.phrase);
    return phrase.length >= 3 && alias.normalized.trim() && said.includes(` ${phrase} `);
  });
}

/** The scope the matched expressions agree on, if they say one at all. */
export function aliasScope(matched: readonly QueryAlias[]): Exclude<Scope, 'mixed'> | undefined {
  const scopes = new Set(matched.map((alias) => alias.scope).filter((scope) => !!scope));
  return scopes.size === 1 ? [...scopes][0] : undefined;
}
