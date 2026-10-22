// An officer's analysis rests on the charter of their own service, not on another's (an idea borrowed from LEX v1.2):
// the charters of other services are left out of the AI's sources unless the question names that service. A player
// in no service of the state — a citizen, the defence, a gang — keeps them all: what an officer must do is in them.
import type { Organization, SearchHit, ServerPack } from '../core';

/** The words a player names a service by, beside its name: «дпс» for ГИБДД, «полиция» for МВД. */
const NAMES: Record<string, RegExp> = {
  mvd: /мвд|полици|ппс|участков/,
  gibdd: /гибдд|дпс|гаи/,
  fsb: /фсб/,
  fso: /фсо/,
  army: /арми|росгвард|военн|вс\s?ро/,
  sk: /(?:^|[^а-яё])ск(?:[^а-яё]|$)|следствен/,
  prosecutor: /прокур/,
  court: /суд(?:а|е|ья|ьи|ом)?(?:[^а-яё]|$)/,
  government: /правительств/,
  duma: /дум/,
  hospital: /больниц|медик|врач|мз(?:[^а-яё]|$)/,
  news: /вести|сми|новост|журналист/,
  media: /сми|новост|журналист/,
  advocate: /адвокат/,
};

/** Whether the question names the service: by its name or one of its words. */
function named(organization: Organization, text: string): boolean {
  const said = text.toLowerCase().replace(/ё/g, 'е');
  return said.includes(organization.name.toLowerCase().replace(/ё/g, 'е')) || !!NAMES[organization.id]?.test(said);
}

/**
 * The found articles without the charters of other services, for a member of a service of the state. A charter no
 * service lists, and one of a service the question names, stays; so does everything for a player in none.
 */
export function ownCharters(hits: SearchHit[], pack: ServerPack, organization: Organization | undefined, message: string): SearchHit[] {
  if (!organization || organization.kind !== 'state') return hits;
  const owners = new Map<string, Organization[]>();
  for (const org of pack.organizations) for (const id of org.documents) owners.set(id, [...(owners.get(id) ?? []), org]);
  return hits.filter((hit) => {
    if (hit.document.kind !== 'charter') return true;
    const of = owners.get(hit.document.id) ?? [];
    return !of.length || of.some((org) => org.id === organization.id || named(org, message));
  });
}
