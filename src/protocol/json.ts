// The AI's JSON as it comes: GigaChat at times wraps it in fences or a word before or after («Вот разбор: {…}»), and a
// whole right answer was lost for it. Only what the model wrote is read — the object it wrote, from its first «{» to
// its last «}» — nothing is guessed or mended inside it. The AI server reads the same way (server.mjs readableJson).

/** The JSON the AI wrote: whole, out of fences, or the one object amid words; throws when there is none. */
export function readJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*|```\s*$/g, '');
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw error;
    return JSON.parse(text.slice(start, end + 1));
  }
}
