// The AI server against a fake GigaChat and a fake paid API: who answers, and when the paid one takes over.
// `node --test server/` — plain Node, like the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler).listen(0, '127.0.0.1', () => resolve(server));
  });
const read = (request) => new Promise((resolve) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => resolve(body));
});
const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

/** GigaChat: a token that lasts `life` ms; answers by what the question says. */
async function fakeGigachat({ life = 30 * 60_000, delay = 0 } = {}) {
  const seen = { tokens: 0, chats: 0 };
  const server = await listen(async (request, response) => {
    const body = await read(request);
    if (request.url === '/oauth') {
      seen.tokens += 1;
      assert.equal(request.headers.authorization, 'Basic Z2lnYTprZXk=');
      return json(response, 200, { access_token: `t${seen.tokens}`, expires_at: Date.now() + life });
    }
    seen.chats += 1;
    const question = JSON.parse(body).messages.at(-1).content;
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (question.includes('травка')) return json(response, 200, { choices: [{ message: { content: 'Генеративные языковые модели не обладают собственным мнением…' }, finish_reason: 'blacklist' }] });
    if (question.includes('сломай')) return json(response, 200, { choices: [{ message: { content: '{"phra e": [' }, finish_reason: 'stop' }] });
    if (question.includes('лимит')) return json(response, 402, { message: 'Payment Required' });
    return json(response, 200, { choices: [{ message: { content: '{"from": "gigachat"}' }, finish_reason: 'stop' }] });
  });
  return { url: `http://127.0.0.1:${server.address().port}`, seen, server };
}

async function fakePaid() {
  const seen = { chats: 0 };
  const server = await listen(async (request, response) => {
    await read(request);
    seen.chats += 1;
    json(response, 200, { choices: [{ message: { content: '{"from": "paid"}' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
  });
  return { url: `http://127.0.0.1:${server.address().port}`, seen, server };
}

/** The AI server itself, on a free port, with these settings. */
async function aiServer(env) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [join(import.meta.dirname, 'server.mjs')], {
    env: { ...process.env, PORT: String(port), STATE_FILE: join(mkdtempSync(join(tmpdir(), 'ai-')), 'state.json'), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => d.toString().includes('AI server') && resolve());
    child.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  let n = 0;
  const ask = async (text, { device = 'device-0001' } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device': device, 'X-Forwarded-For': `10.0.0.${++n % 250}` },
      body: JSON.stringify({ system: 's', messages: [{ role: 'user', content: text }], json: true }),
    });
    return { status: response.status, body: await response.json() };
  };
  const status = async () => (await fetch(`http://127.0.0.1:${port}/v1/status`)).json();
  return { ask, status, stop: () => child.kill() };
}

const gigaEnv = (giga) => ({ GIGACHAT_AUTH_KEY: 'Basic Z2lnYTprZXk=\n', GIGACHAT_OAUTH_URL: `${giga.url}/oauth`, GIGACHAT_API_URL: giga.url });

test('GigaChat answers first; the paid API only what it declines — Sber’s filter, broken JSON, used-up tokens', async () => {
  const giga = await fakeGigachat();
  const paid = await fakePaid();
  const ai = await aiServer({ ...gigaEnv(giga), AI_BASE_URL: paid.url, AI_API_KEY: 'paid-key' });
  try {
    assert.equal((await ai.ask('украл телефон')).body.text, '{"from": "gigachat"}');
    assert.equal((await ai.ask('продавал травка у школы')).body.text, '{"from": "paid"}');
    assert.equal((await ai.ask('сломай формат')).body.text, '{"from": "paid"}');
    assert.equal((await ai.ask('лимит кончился')).body.text, '{"from": "paid"}');
    const { answered, spent } = await ai.status();
    assert.deepEqual(answered, { gigachat: 1, paid: 3, why: { blacklist: 1, format: 1, http: 1 } });
    // Only the paid answers cost anything; the key was taken once, «Basic » and the line break dropped.
    assert.ok(spent > 0);
    assert.equal(giga.seen.tokens, 1);
  } finally {
    ai.stop();
    giga.server.close();
    paid.server.close();
  }
});

test('a token about to run out is renewed before the question', async () => {
  const giga = await fakeGigachat({ life: 30_000 });
  const ai = await aiServer(gigaEnv(giga));
  try {
    await ai.ask('раз');
    await ai.ask('два');
    assert.equal(giga.seen.tokens, 2);
  } finally {
    ai.stop();
    giga.server.close();
  }
});

test('one at a time: past three waiting, a question goes straight to the paid API', async () => {
  const giga = await fakeGigachat({ delay: 300 });
  const paid = await fakePaid();
  const ai = await aiServer({ ...gigaEnv(giga), AI_BASE_URL: paid.url, AI_API_KEY: 'paid-key' });
  try {
    const answers = await Promise.all(Array.from({ length: 6 }, (_, i) => ai.ask(`вопрос ${i}`, { device: `device-000${i}` })));
    const from = answers.map((a) => JSON.parse(a.body.text).from);
    assert.equal(from.filter((f) => f === 'gigachat').length, 3);
    assert.equal(from.filter((f) => f === 'paid').length, 3);
    assert.deepEqual((await ai.status()).answered.why, { queue: 3 });
  } finally {
    ai.stop();
    giga.server.close();
    paid.server.close();
  }
});

test('with GigaChat only, a declined question is told as the AI not answering', async () => {
  const giga = await fakeGigachat();
  const ai = await aiServer({ ...gigaEnv(giga), AI_API_KEY: '' });
  try {
    assert.equal((await ai.ask('украл')).status, 200);
    const refused = await ai.ask('травка');
    assert.equal(refused.status, 502);
    assert.match(refused.body.error, /не отвечает/);
  } finally {
    ai.stop();
    giga.server.close();
  }
});
