// The AI's JSON as it comes: GigaChat at times wraps it in fences or words («Вот разбор: {…}»), or closes its object
// and goes on after it (`…]}","summary": "…"`) — and a whole right answer was lost for it. Only what the model wrote
// is read: the whole text, or else the first object it completed — nothing is guessed or mended inside it. The AI
// server reads the same way (server.mjs jsonOf).

/** The first object the text completes, from its first «{» to the «}» that closes it; empty when none closes. */
export function firstObject(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let quoted = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '\\') i += 1;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth += 1;
    else if ((char === '}' || char === ']') && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}

/** The JSON the AI wrote: whole, out of fences, or the first object it completed; throws when there is none. */
export function readJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  try {
    return JSON.parse(text);
  } catch (error) {
    const object = firstObject(text);
    if (!object) throw error;
    return JSON.parse(object);
  }
}
