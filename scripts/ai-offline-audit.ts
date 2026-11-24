import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { articleText } from '../src/core';
import { PACKS } from '../src/data/bundled';
import { analyse } from '../src/protocol/pipeline';
import { validateAnswer } from '../src/protocol/validate';
import { confirmedHallucinations } from '../src/protocol/grade';
import { matchesRef } from '../src/protocol/grade';
import type { AiRequest } from '../src/protocol/provider';

// A network-free context audit, not a model evaluation. Search phrases are deliberately empty.
const raw = readFileSync(new URL('../eval/cases.json', import.meta.url), 'utf8');
const { cases } = JSON.parse(raw) as { cases: { server?: string; situation: string; category?: string; mode?: string; followUp?: string; expect?: string[] }[] };
const rows = [];
for (const [index, c] of cases.entries()) {
  if (c.followUp || (c.mode && c.mode !== 'analysis') || !c.expect?.length || !['LAW', 'SERVER_RULE', 'MIXED'].includes(c.category ?? '')) continue;
  const pack = PACKS[c.server ?? 'tverskoi'];
  for (const depth of ['quick', 'full'] as const) {
    let sent: AiRequest | undefined;
    const analysis = await analyse({
      pack, message: c.situation, depth, terms: [],
      scope: c.category === 'MIXED' ? 'mixed' : c.category === 'SERVER_RULE' ? 'server_rule' : 'law',
      provider: { complete: async (request) => {
        sent = request;
        return JSON.stringify({ situation: 'Offline context audit only', norms: [], facts: [], assumptions: [], procedure: [], questions: [], uncertainty: [], notFound: true });
      } },
    });
    const hits = analysis.sources.map((s) => s.hit);
    const clipped = analysis.sources.filter((s) => articleText(s.hit.article).length > 1800);
    rows.push({ case: index + 1, server: c.server ?? 'tverskoi', category: c.category, depth,
      expected: c.expect, missing: c.expect.filter((ref) => !matchesRef(ref, hits)),
      sourceCount: hits.length, clippedArticles: clipped.map((s) => ({ id: s.hit.article.id, fullChars: articleText(s.hit.article).length })),
      requestChars: (sent?.system.length ?? 0) + (sent?.turns.flatMap((t) => t.parts).reduce((n, p) => n + ('text' in p ? p.text.length : 0), 0) ?? 0),
    });
  }
}
const percentile = (items: number[], p: number) => [...items].sort((a,b) => a-b)[Math.max(0, Math.ceil(items.length*p)-1)] ?? 0;
const summary = ['quick', 'full'].map((depth) => {
  const selected = rows.filter((r) => r.depth === depth);
  return { depth, cases: selected.length, allExpectedRetrieved: selected.filter((r) => !r.missing.length).length,
    casesWithClippedArticle: selected.filter((r) => r.clippedArticles.length).length,
    sourceOccurrences: selected.reduce((n,r) => n+r.sourceCount,0), clippedSourceOccurrences: selected.reduce((n,r) => n+r.clippedArticles.length,0),
    requestCharsP50: percentile(selected.map((r) => r.requestChars), .5), requestCharsP95: percentile(selected.map((r) => r.requestChars), .95),
  };
});
// An intentionally false qualitative claim can satisfy reference/number checks.
const probePack = PACKS.tverskoi;
const probeBase = await analyse({ pack: probePack, message: 'Игрок тайком украл телефон', depth: 'quick', terms: [], provider: { complete: async () => JSON.stringify({ situation: 'Audit', norms: [], notFound: true }) } });
const theft = probeBase.sources.find((s) => s.hit.article.number === '87' && s.hit.document.short === 'УК');
if (!theft) throw new Error('The audit probe requires УК 87 in the current pack');
const wrongAnswer = { ...probeBase.answer, norms: [{ source: theft.id, ref: 'УК ст. 87', why: 'тайное хищение чужого имущества', fit: 'direct' as const, charge: true, stage: 'done' as const }],
  violation: { text: 'Кража чужого имущества разрешена.', sources: [theft.id] }, notFound: false };
const wrongValidation = validateAnswer(probePack, probeBase.sources, wrongAnswer, 'law');
const semanticProbe = { deliberatelyFalseClaim: wrongAnswer.violation.text, validatorStatus: wrongValidation.status,
  issues: wrongValidation.issues, existingHallucinationGateFindings: confirmedHallucinations({ ...probeBase, answer: wrongAnswer, validation: wrongValidation }),
  interpretation: 'This probe only demonstrates missing semantic entailment checking. It is not a model output or a measured model hallucination rate.' };
const report = { semanticProbe, packSha256: Object.fromEntries(Object.entries(PACKS).map(([id, pack]) => [id, createHash('sha256').update(JSON.stringify(pack)).digest('hex')])), date: '2026-11-24', datasetSha256: createHash('sha256').update(raw).digest('hex'),
  limitations: 'No model, network, classifier, generated search phrases, organization, perspective or follow-ups. Explicit scope from case category. Recall is article presence only, not evidence completeness or answer quality. Character counts are not token counts. Existing cases are not a held-out benchmark.',
  summary, byCategory: ['LAW', 'SERVER_RULE', 'MIXED'].flatMap((category) => ['quick', 'full'].map((depth) => {
    const selected = rows.filter((row) => row.category === category && row.depth === depth);
    return { category, depth, cases: selected.length, allExpectedRetrieved: selected.filter((row) => !row.missing.length).length };
  })), rows };
const output = process.argv[2];
if (!output) throw new Error('Pass an output JSON path');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, summary }, null, 2));
