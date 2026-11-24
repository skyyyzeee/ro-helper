// Read only forum indexes reached from the three observed organisation categories.
(async () => {
  if (location.hostname !== 'forum.russia.online') return alert('Откройте форум и нажмите закладку там.');
  const queue = [
    { server: 'tverskoi', url: '/categories/organizatsii.1528/', depth: 0 },
    { server: 'arbatskiy', url: '/categories/organizatsii.1465/', depth: 0 },
    { server: 'kutuzovskiy', url: '/categories/organizatsii.1594/', depth: 0 },
  ];
  const visited = new Set();
  const pages = [];
  const candidates = [];
  const failed = [];
  const wanted = /устав|регламент|структур|дисциплин|компетен|редакцион|собственн.*безопасност/i;
  const section = /основн|важн|документ|информаци|подраздел|отдел|структур|устав|регламент|государствен|МВД|ГИБДД|ФСБ|ФСО|больниц|медицин|комитет|Вести|СМИ/i;
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;z-index:99999;right:16px;bottom:16px;padding:16px;background:#15151a;color:white;font:14px sans-serif;max-width:360px';
  document.body.appendChild(panel);
  while (queue.length && visited.size < 80) {
    const job = queue.shift();
    const url = new URL(job.url, location.origin);
    if (url.origin !== location.origin || visited.has(url.href)) continue;
    visited.add(url.href);
    panel.textContent = `Ищу перенесённые уставы: разделов ${visited.size}, тем ${candidates.length}…`;
    try {
      const response = await fetch(url.href, { credentials: 'include' });
      if (!response.ok) throw new Error(`код ${response.status}`);
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nodes = [...page.querySelectorAll('.node-title a')].map(a => ({ title: a.textContent.trim(), url: new URL(a.getAttribute('href'), url).href }));
      const threads = [...page.querySelectorAll('.structItem-title a')].map(a => ({ title: a.textContent.trim(), url: new URL(a.getAttribute('href'), url).href })).filter(a => /\/threads\//.test(a.url));
      pages.push({ server: job.server, url: url.href, title: page.querySelector('h1')?.textContent.trim(), nodes });
      for (const thread of threads) if (wanted.test(thread.title)) candidates.push({ server: job.server, parent: url.href, ...thread });
      for (const node of nodes) {
        const next = new URL(node.url);
        if (next.origin === location.origin && /\/(forums|categories)\//.test(next.pathname) && job.depth < 3 && (job.depth === 0 || section.test(node.title))) queue.push({ server: job.server, url: node.url, depth: job.depth + 1 });
      }
    } catch (error) { failed.push({ ...job, error: String(error.message ?? error) }); }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  const result = { kind: 'laws-discovery', pages, candidates, failed, capped: queue.length > 0 };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: 'application/json' }));
  link.download = 'laws-discovery.json'; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  panel.textContent = `Готово: разделов ${pages.length}, подходящих тем ${candidates.length}, ошибок ${failed.length}. Скачан laws-discovery.json.`;
})();
