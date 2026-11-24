// Local UI-only provider. It is deliberately not a model and never forwards requests.
import { createServer } from 'node:http';
import { analysisOf, isAnalysis, sourceIn } from '../src/test/fakeAi';

const port = 18429;
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
  if (request.method === 'POST' && request.url === '/shutdown') { response.end('stopped'); server.close(); return; }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return; }
  try {
    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 2_000_000) { response.writeHead(413).end(); return; }
    }
    const body = JSON.parse(raw) as { model?: string; messages?: { role: string; content: string }[] };
    if (body.model !== 'workspace-qa') { response.writeHead(400).end('Use the workspace-qa fixture model'); return; }
    const system = body.messages?.filter((m) => m.role === 'system').map((m) => m.content).join('\n') ?? '';
    const context = body.messages?.at(-1)?.content ?? '';
    let content: string;
    if (context.includes('Ответ игрока.') && context.includes('Эталонный ответ:')) {
      content = JSON.stringify({ verdict: 'right', feedback: 'Локальная проверка интерфейса: ответ получен.' });
    } else if (system.includes('ЗАДАЧА: ты экзаменатор')) {
      content = JSON.stringify({ question: 'Локальная проверка: перескажите содержание приведённой статьи.', answer: 'Тестовый ответ для проверки интерфейса.' });
    } else if (isAnalysis(system)) {
      const found = sourceIn(context, /^УК ст\. 87$/) ?? sourceIn(context);
      content = analysisOf(context, {
        situation: 'Локальная проверка интерфейса: тестовый разбор кражи телефона.',
        procedure: Array.from({ length: 36 }, () => ({ text: 'Тестовый пункт длинного ответа. Сверьте обстоятельства с указанной статьёй.', sources: found ? [found.id] : [] })),
        uncertainty: ['Это фиксированный тестовый ответ, а не ответ живой модели.'],
      });
    } else content = JSON.stringify({ phrases: ['кража'] });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
  } catch { response.writeHead(400).end('Invalid fixture request'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`UI fixture: http://127.0.0.1:${port}/v1; model workspace-qa; no key; no external requests\n`));
