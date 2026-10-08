// Which charter digests of «Отдел» (src/data/charters.json) are behind their charters: a charter edited on the forum
// after its digest was written. The app flags such a card by itself; this lists them, to write the digest again.
//
//   npm run charters:check
import digests from '../src/data/charters.json';
import { PACKS } from '../src/data';
import { charterCards, type CharterDigest } from '../src/core/charter';

let stale = 0;
for (const [server, digest] of Object.entries(digests as unknown as Record<string, CharterDigest>)) {
  const pack = PACKS[server];
  for (const organization of Object.keys(digest.organizations)) {
    for (const card of charterCards(pack, digest, organization)) {
      const lost = card.points.length - card.articles.length;
      if (!card.stale && !lost) continue;
      stale += 1;
      const why = [card.stale ? `устав правили ${card.source.source.lastEdited.slice(0, 10)}, выжимка от ${digest.edited[card.source.id].slice(0, 10)}` : '', lost ? `пропало пунктов: ${lost}` : '']
        .filter(Boolean)
        .join('; ');
      console.log(`${server} · ${organization} · ${card.kind} (${card.source.id}): ${why}`);
    }
  }
}
console.log(stale ? `\nУстарело карточек: ${stale}. Перечитайте пункты и обновите src/data/charters.json (и даты в «edited»).` : 'Все выжимки уставов актуальны.');
