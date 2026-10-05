// The wiki of Russia Online (wiki.russia.online) is a React Router app: each page's data comes as a «turbo-stream»
// — one flat JSON array where an object maps "_<index of its key>" to the index of its value. This reads it back.

/** Special values of the format: negative indices. */
const SPECIAL: Record<number, unknown> = { [-1]: undefined, [-2]: null, [-3]: Number.NaN, [-4]: -0, [-5]: undefined, [-6]: Infinity, [-7]: -Infinity };

export function decodeTurboStream(text: string): unknown {
  const first = text.split('\n').find((line) => line.trim());
  if (!first) throw new Error('empty turbo-stream');
  const flat = JSON.parse(first) as unknown[];
  const memo = new Map<number, unknown>();
  const hydrate = (index: number): unknown => {
    if (index < 0) return SPECIAL[index];
    if (memo.has(index)) return memo.get(index);
    const value = flat[index];
    if (Array.isArray(value)) {
      // A typed value: ["D", date], ["P", promise], …: its payload as it is.
      if (typeof value[0] === 'string' && /^[A-Z]$/.test(value[0]) && value.length === 2) {
        memo.set(index, value[1]);
        return value[1];
      }
      const out: unknown[] = [];
      memo.set(index, out);
      for (const item of value) out.push(hydrate(item as number));
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      memo.set(index, out);
      for (const [key, item] of Object.entries(value)) out[String(flat[Number(key.slice(1))])] = hydrate(item as number);
      return out;
    }
    memo.set(index, value);
    return value;
  };
  return hydrate(0);
}
