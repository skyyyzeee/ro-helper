// The exam on one model of the AI server, by the admins' key (npm run eval -- --trial gpt-4.1-mini): to compare
// models before a change. Off the computer's limit, not cached; the server says the tokens each answer took.
import { AiError, type AiProvider } from '../src/protocol';

/** The tokens the trial model was given and wrote: its price is the API's, per million of each. */
export interface Tokens {
  input: number;
  output: number;
}

export function trialProvider(server: string, model: string, token: string, tokens: Tokens): AiProvider {
  const device = `trial${Math.random().toString(36).slice(2, 12)}`;
  return {
    async complete({ system, turns, json = false, think = false }) {
      const messages = turns.map((turn) => ({
        role: turn.role === 'model' ? 'assistant' : 'user',
        content: turn.parts.map((part) => ('text' in part ? part.text : '')).join('\n'),
      }));
      const response = await fetch(`${server}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device': device, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ system, messages, json, think, model }),
      });
      const body = (await response.json().catch(() => null)) as { text?: string; error?: string; usage?: Tokens | null } | null;
      if (!response.ok || !body?.text) throw new AiError(body?.error ?? `Сервер ИИ не ответил (код ${response.status}).`, response.status === 429 ? 'limit' : 'failed');
      tokens.input += body.usage?.input ?? 0;
      tokens.output += body.usage?.output ?? 0;
      return body.text;
    },
  };
}
