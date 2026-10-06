// The AI server against a fake GigaChat and a fake paid API: who answers, and when the paid one takes over.
// `node --test server/` — plain Node, like the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
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
  const dir = mkdtempSync(join(tmpdir(), 'ai-'));
  const child = spawn(process.execPath, [join(import.meta.dirname, 'server.mjs')], {
    env: { ...process.env, PORT: String(port), STATE_FILE: join(dir, 'state.json'), FEEDBACK_FILE: join(dir, 'feedback.jsonl'), REVIEWS_FILE: join(dir, 'reviews.json'), CACHE_FILE: join(dir, 'cache.json'), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => d.toString().includes('AI server') && resolve());
    child.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  let n = 0;
  const ask = async (text, { device = 'device-0001', cache } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device': device, 'X-Forwarded-For': `10.0.0.${++n % 250}` },
      body: JSON.stringify({ system: 's', messages: [{ role: 'user', content: text }], json: true, ...(cache ? { cache: true, question: cache } : {}) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const status = async () => (await fetch(`http://127.0.0.1:${port}/v1/status`)).json();
  const mark = async (body, { device = 'device-0001' } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device': device },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const marks = () => readFileSync(join(dir, 'feedback.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return { ask, status, mark, marks, base: `http://127.0.0.1:${port}`, stop: () => child.kill() };
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
    assert.deepEqual(answered, { gigachat: 1, paid: 3, cached: 0, why: { blacklist: 1, format: 1, http: 1 } });
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

test('keeps a mark of an answer with no id, only its own fields cut to length; a few a day per computer', async () => {
  const giga = await fakeGigachat();
  const ai = await aiServer({ ...gigaEnv(giga), FEEDBACK_PER_DEVICE: '2' });
  try {
    const down = { vote: 'down', question: 'украли   телефон', server: 'tverskoi', app: '2.10.0', scope: 'law', status: 'confirmed', norms: ['УК ст. 65'], correction: 'это ст. 66', device: 'device-0001', nick: 'skyze' };
    assert.equal((await ai.mark(down)).status, 200);
    assert.equal((await ai.mark({ vote: 'up', question: 'обматерил полицейского', correction: 'не нужен' })).status, 200);
    const [first, second] = ai.marks();
    assert.deepEqual(Object.keys(first).sort(), ['app', 'at', 'correction', 'id', 'norms', 'question', 'scope', 'server', 'status', 'type', 'vote']);
    assert.equal(first.question, 'украли телефон');
    assert.equal(first.correction, 'это ст. 66');
    assert.equal(second.correction, undefined);
    // No id of the player or the computer is kept, whatever the request carried.
    assert.doesNotMatch(JSON.stringify(ai.marks()), /device-0001|skyze/);
    assert.equal((await ai.mark({ vote: 'up', question: 'третий' })).status, 429);
    assert.equal((await ai.mark({ vote: 'up', question: 'с другого' }, { device: 'device-0002' })).status, 200);
    assert.equal((await ai.mark({ vote: 'meh', question: 'x' }, { device: 'device-0003' })).status, 400);
    assert.equal((await ai.mark({ vote: 'up', question: '' }, { device: 'device-0003' })).status, 400);
    assert.equal((await ai.status()).marks, 3);
  } finally {
    ai.stop();
    giga.server.close();
  }
});

test('the admins read the marks with their token only — newest first, the 👎 or the corrections alone', async () => {
  const giga = await fakeGigachat();
  const token = 'a'.repeat(40);
  const ai = await aiServer({ ...gigaEnv(giga), ADMIN_TOKEN: token });
  const read = (query, auth) => fetch(`${ai.base}/v1/feedback${query}`, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
  try {
    await ai.mark({ vote: 'up', question: 'первый' });
    await ai.mark({ vote: 'down', question: 'второй' });
    await ai.mark({ vote: 'down', question: 'третий', correction: 'это ст. 66' });
    assert.equal((await read('')).status, 403);
    assert.equal((await read('', 'b'.repeat(40))).status, 403);
    const all = await (await read('', token)).json();
    assert.deepEqual(all.marks.map((m) => m.question), ['третий', 'второй', 'первый']);
    assert.equal(all.today, 3);
    assert.deepEqual((await (await read('?filter=down', token)).json()).marks.map((m) => m.question), ['третий', 'второй']);
    assert.deepEqual((await (await read('?filter=fixed&limit=5', token)).json()).marks.map((m) => m.correction), ['это ст. 66']);
  } finally {
    ai.stop();
    giga.server.close();
  }
});

test('with no admins\' token set, the marks are not read at all', async () => {
  const giga = await fakeGigachat();
  const ai = await aiServer(gigaEnv(giga));
  try {
    assert.equal((await fetch(`${ai.base}/v1/feedback`, { headers: { Authorization: 'Bearer ' } })).status, 403);
  } finally {
    ai.stop();
    giga.server.close();
  }
});

test('the admins review a mark: approved with its normal form, it joins the dictionary every app reads', async () => {
  const giga = await fakeGigachat();
  const token = 'c'.repeat(40);
  const ai = await aiServer({ ...gigaEnv(giga), ADMIN_TOKEN: token });
  const admin = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const review = (body, headers = admin) => fetch(`${ai.base}/v1/feedback/review`, { method: 'POST', headers, body: JSON.stringify(body) });
  const get = async (path, headers = {}) => (await fetch(`${ai.base}${path}`, { headers })).json();
  try {
    await ai.mark({ vote: 'down', question: 'чела приняли у отдела, что ему будет', correction: 'это задержание' });
    await ai.mark({ vote: 'up', question: 'обматерил полицейского' }, { device: 'device-0002' });
    // Newest first.
    const [plain, fixed] = (await get('/v1/feedback', admin)).marks;
    assert.equal((await review({ id: fixed.id, status: 'approved' }, { 'Content-Type': 'application/json' })).status, 403);
    assert.equal((await review({ id: fixed.id, status: 'maybe' })).status, 400);

    const ok = await review({ id: fixed.id, status: 'approved', phrase: 'Чела приняли', normalized: 'задержание', scope: 'law', intent: 'detention', expected: ['УПК 94'] });
    assert.equal(ok.status, 200);
    await review({ id: plain.id, status: 'rejected' });

    assert.deepEqual((await get('/v1/aliases')).aliases, [{ phrase: 'чела приняли', normalized: 'задержание', scope: 'law', intent: 'detention' }]);
    assert.deepEqual((await get('/v1/feedback?filter=approved', admin)).marks.map((m) => m.review.status), ['approved']);
    assert.deepEqual((await get('/v1/feedback?filter=raw', admin)).marks, []);
    assert.deepEqual((await get('/v1/examples', admin)).examples.map((e) => [e.question, e.expected]), [['чела приняли у отдела, что ему будет', ['УПК 94']]]);
    assert.equal((await fetch(`${ai.base}/v1/examples`)).status, 403);
  } finally {
    ai.stop();
    giga.server.close();
  }
});

test('a first question asked again is answered from the cache: no AI call, off anyone’s limit; a 👎 drops it', async () => {
  const giga = await fakeGigachat();
  const ai = await aiServer({ ...gigaEnv(giga), QUESTIONS_PER_DEVICE: '2' });
  try {
    const first = await ai.ask('украл телефон', { cache: 'Украл телефон?' });
    assert.equal(first.body.text, '{"from": "gigachat"}');
    assert.equal(first.body.cached, undefined);
    // Another computer, the same question: the same answer, and the AI is not asked.
    const again = await ai.ask('украл телефон', { cache: 'украл  телефон?', device: 'device-0002' });
    assert.deepEqual(again.body, { text: '{"from": "gigachat"}', cached: true });
    assert.equal(giga.seen.chats, 1);
    // Off no one's limit: the first computer still has its second question.
    assert.equal((await ai.ask('другое')).status, 200);
    assert.equal((await ai.ask('украл телефон', { cache: 'Украл телефон?' })).body.cached, true);
    // Not marked for the cache (a follow-up): asked of the AI, and nothing kept.
    await ai.ask('украл телефон', { device: 'device-0003' });
    assert.equal(giga.seen.chats, 3);
    const { answered, cache } = await ai.status();
    assert.equal(answered.cached, 2);
    assert.equal(cache, 1);
    // A 👎 to it: the next one goes to the AI again.
    assert.equal((await ai.mark({ vote: 'down', question: 'Украл телефон?' })).status, 200);
    assert.equal((await ai.ask('украл телефон', { cache: 'Украл телефон?', device: 'device-0004' })).body.cached, undefined);
    assert.equal(giga.seen.chats, 4);
  } finally {
    ai.stop();
    giga.server.close();
  }
});

test('a broken JSON answer is not kept', async () => {
  const giga = await fakeGigachat();
  const ai = await aiServer({ ...gigaEnv(giga), AI_BASE_URL: 'http://127.0.0.1:9', AI_API_KEY: '' });
  try {
    await ai.ask('сломай формат', { cache: 'сломай' });
    await ai.ask('сломай формат', { cache: 'сломай' });
    assert.equal((await ai.status()).cache, 0);
  } finally {
    ai.stop();
    giga.server.close();
  }
});
