// Russian stemmer: the Snowball algorithm (https://snowballstem.org/algorithms/russian/stemmer.html).
// Input is expected lower-case with «ё» already replaced by «е».

const VOWELS = new Set('аеиоуыэюя');

/** Endings sorted longest first, so the first match is the longest one. */
const sorted = (list: string) => list.split(' ').sort((a, b) => b.length - a.length);

const PERFECTIVE_GERUND_1 = sorted('в вши вшись'); // preceded by а/я
const PERFECTIVE_GERUND_2 = sorted('ив ивши ившись ыв ывши ывшись');
const ADJECTIVE = sorted('ее ие ые ое ими ыми ей ий ый ой ем им ым ом его ого ему ому их ых ую юю ая яя ою ею');
const PARTICIPLE_1 = sorted('ем нн вш ющ щ'); // preceded by а/я
const PARTICIPLE_2 = sorted('ивш ывш ующ');
const REFLEXIVE = sorted('ся сь');
const VERB_1 = sorted('ла на ете йте ли й л ем н ло но ет ют ны ть ешь нно'); // preceded by а/я
const VERB_2 = sorted('ила ыла ена ейте уйте ите или ыли ей уй ил ыл им ым ен ило ыло ено ят ует уют ит ыт ены ить ыть ишь ую ю');
const NOUN = sorted('а ев ов ие ье е иями ями ами еи ии и ией ей ой ий й иям ям ием ем ам ом о у ах иях ях ы ь ию ью ю ия ья я');
const SUPERLATIVE = sorted('ейш ейше');
const DERIVATIONAL = sorted('ост ость');

/** Start of RV (after the first vowel), R1 and R2 (after the first vowel–consonant pair, twice). */
function regions(word: string): { rv: number; r2: number } {
  let rv = word.length;
  for (let i = 0; i < word.length; i++) {
    if (VOWELS.has(word[i])) {
      rv = i + 1;
      break;
    }
  }
  const after = (start: number) => {
    for (let i = start + 1; i < word.length; i++) if (!VOWELS.has(word[i]) && VOWELS.has(word[i - 1])) return i + 1;
    return word.length;
  };
  const r1 = after(0);
  return { rv, r2: after(r1) };
}

/** Removes the longest ending that lies within the region; group-1 endings must follow «а» or «я». */
function strip(word: string, from: number, group1: string[], group2: string[] = []): string | null {
  const cutAt = (ending: string) => word.length - ending.length;
  // Lists are sorted longest first, so `find` returns the longest matching ending.
  const afterAYa = group1.find((e) => word.endsWith(e) && cutAt(e) - 1 >= from && 'ая'.includes(word[cutAt(e) - 1]));
  const plain = group2.find((e) => word.endsWith(e) && cutAt(e) >= from);
  const ending = afterAYa === undefined ? plain : plain === undefined || afterAYa.length >= plain.length ? afterAYa : plain;
  return ending === undefined ? null : word.slice(0, cutAt(ending));
}

export function stem(input: string): string {
  let word = input;
  const { rv, r2 } = regions(word);
  if (rv >= word.length) return word;

  // Step 1
  const gerund = strip(word, rv, PERFECTIVE_GERUND_1, PERFECTIVE_GERUND_2);
  if (gerund !== null) word = gerund;
  else {
    word = strip(word, rv, [], REFLEXIVE) ?? word;
    const adjective = strip(word, rv, [], ADJECTIVE);
    if (adjective !== null) word = strip(adjective, rv, PARTICIPLE_1, PARTICIPLE_2) ?? adjective;
    else word = strip(word, rv, VERB_1, VERB_2) ?? strip(word, rv, [], NOUN) ?? word;
  }

  // Step 2
  if (word.endsWith('и') && word.length - 1 >= rv) word = word.slice(0, -1);

  // Step 3
  word = strip(word, r2, [], DERIVATIONAL) ?? word;

  // Step 4
  if (word.endsWith('нн') && word.length - 1 >= rv) return word.slice(0, -1);
  const superlative = strip(word, rv, [], SUPERLATIVE);
  if (superlative !== null) {
    word = superlative;
    return word.endsWith('нн') ? word.slice(0, -1) : word;
  }
  if (word.endsWith('ь') && word.length - 1 >= rv) word = word.slice(0, -1);
  return word;
}
