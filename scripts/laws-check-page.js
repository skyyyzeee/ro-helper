// Runs on a page of forum.russia.online — from the bookmark «Проверить законы» or pasted into the browser's
// console — after http://127.0.0.1:8787/check (npm run laws:check) has put the list of threads into window.name.
//
// The forum lets a person's browser in and not a server, so the threads are read here, in the person's own
// session: each is fetched like a page they open (one at a time, with a pause), its text taken the way a snapshot
// takes it — the longest post of the thread's author, as the browser lays it out — and compared with ours by its
// checksum. Only the changed texts go back to 127.0.0.1:8787, in window.name, which survives the navigation (the
// forum forbids its pages to call another address).
(async () => {
  const PAUSE_MS = 400;
  let job;
  try {
    job = JSON.parse(window.name || 'null');
  } catch {
    job = null;
  }
  if (!job || job.kind !== 'laws-check') {
    alert('Сначала запустите «npm run laws:check» и откройте http://127.0.0.1:8788/check — оттуда браузер сам перейдёт на форум.');
    return;
  }
  if (location.hostname !== 'forum.russia.online') {
    alert('Откройте любую страницу forum.russia.online и нажмите закладку там.');
    return;
  }

  const fnv = (text) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 'n' + h;
  };

  // Laid out off screen with the forum's own styles, so innerText is what the page itself shows.
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:-100000px;top:0;width:900px';
  document.body.appendChild(box);
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;z-index:99999;right:16px;bottom:16px;padding:14px 18px;border-radius:12px;background:#15151a;color:#fff;font:14px/1.4 sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);max-width:360px';
  document.body.appendChild(panel);
  const say = (text) => (panel.textContent = text);

  /** A text's lines as our side samples them: trimmed, no empty ones. */
  const linesOf = (text) => text.split('\n').map((line) => line.trim()).filter((line) => line.length > 3);

  /** The posts of the thread's author, each as a snapshot takes it — laid out by the browser — with its edit time. */
  async function read(thread) {
    const response = await fetch(`/threads/${thread}/`, { credentials: 'include' });
    if (!response.ok) throw new Error(`код ${response.status}`);
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const posts = [...page.querySelectorAll('article.message')];
    if (!posts.length) throw new Error('нет сообщений — форум не пустил или тема пуста');
    const author = posts[0].getAttribute('data-author');
    const own = [];
    for (const post of posts) {
      if (post.getAttribute('data-author') !== author) continue;
      const wrapper = post.querySelector('.bbWrapper');
      if (!wrapper) continue;
      box.replaceChildren(document.importNode(wrapper, true));
      const raw = box.innerText.replace(/\r\n/g, '\n');
      if (!raw.trim()) continue;
      const text = raw.endsWith('\n') ? raw : `${raw}\n`;
      own.push({ text, fnv: fnv(text), lines: new Set(linesOf(text).map(fnv)), edited: post.querySelector('.message-lastEdit time')?.getAttribute('datetime') ?? null });
    }
    if (!own.length) throw new Error('пустой текст');
    return own;
  }

  /**
   * Which post is our document, and whether it changed: the one holding most of our lines. The same text — nothing
   * to do; most lines kept — its new edition; few — a draft, a «было / стало» or a new thread layout: told, not taken.
   */
  function judge(doc, posts) {
    if (posts.some((post) => post.fnv === doc.fnv)) return { same: true };
    const score = (post) => (doc.sample.length ? doc.sample.filter((h) => post.lines.has(h)).length / doc.sample.length : 0);
    const scored = posts.map((post) => ({ post, score: score(post) }));
    const top = Math.max(...scored.map((s) => s.score));
    if (top < 0.5) return { unsure: `совпадает строк ${Math.round(top * 100)}% — нужный пост не найден` };
    // Nearly as close as the closest, the earlier post: a draft or a «было / стало» posted after it holds our lines too.
    const best = scored.find((s) => s.score >= top - 0.1);
    // A draft is not the law yet: «Проект редакции…» at its head is told, not taken.
    if (/проект/i.test(best.post.text.slice(0, 300))) return { unsure: 'похоже на проект редакции, а не на действующий текст' };
    return { post: best.post, score: best.score };
  }

  const changed = [];
  const failed = [];
  const unsure = [];
  const threads = [...new Set(job.docs.map((d) => d.thread))];
  for (const [i, thread] of threads.entries()) {
    say(`Проверяю законы на форуме: ${i + 1} из ${threads.length}…\nНайдено изменений: ${changed.length}`);
    let posts = null;
    let error = null;
    try {
      posts = await read(thread);
    } catch (e) {
      error = String(e.message ?? e);
    }
    for (const doc of job.docs.filter((d) => d.thread === thread)) {
      if (error) {
        failed.push({ server: doc.server, doc: doc.doc, error });
        continue;
      }
      const verdict = judge(doc, posts);
      if (verdict.unsure) unsure.push({ server: doc.server, doc: doc.doc, why: verdict.unsure });
      else if (verdict.post) changed.push({ server: doc.server, doc: doc.doc, text: verdict.post.text, fnv: verdict.post.fnv, edited: verdict.post.edited, kept: Math.round(verdict.score * 100) });
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  box.remove();
  say(`Готово: проверено ${threads.length}, изменилось ${changed.length}${unsure.length + failed.length ? `, проверить вручную ${unsure.length + failed.length}` : ''}. Отправляю в программу…`);
  window.name = JSON.stringify({ kind: 'laws-result', checked: threads.length, changed, failed, unsure });
  location.href = job.back;
})();
