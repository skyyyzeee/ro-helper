import type { CSSProperties } from 'react';
import type { Organization, ServerPack } from '../core';
import { organizationHue } from './appearance';
import { OrganizationIcon } from './icons';

/** The groups the organisations are chosen from; «Без организации» belongs to none and stands apart. */
const GROUPS: { kind: NonNullable<Organization['kind']>; title: string }[] = [
  { kind: 'state', title: 'Государственные' },
  { kind: 'crime', title: 'Криминальные' },
];

/** Picking an organisation: at the first launch and from the settings, the same list. */
/** `compact`: all in one grid, without the group titles, for the switcher over the search (direction C). */
export function OrganizationChoice({
  pack,
  value,
  onPick,
  compact = false,
}: {
  pack: ServerPack;
  value: string;
  onPick: (id: string) => void;
  compact?: boolean;
}) {
  const option = (org: Organization) => (
    <button
      key={org.id}
      type="button"
      role="radio"
      aria-checked={value === org.id}
      className={value === org.id ? 'ob__org ob__org--on' : 'ob__org'}
      onClick={() => onPick(org.id)}
    >
      <span className="ob__org-mark" style={{ '--org-hue': organizationHue(org.id) } as CSSProperties}>
        <OrganizationIcon id={org.id} size={20} />
      </span>
      <span>{org.name}</span>
    </button>
  );

  if (compact) {
    return (
      <div className="ob__orgs ob__orgs--grid" role="radiogroup" aria-label="Организация">
        {pack.organizations.map(option)}
      </div>
    );
  }

  return (
    <div className="ob__groups" role="radiogroup" aria-label="Организация">
      {GROUPS.map(({ kind, title }) => {
        const group = pack.organizations.filter((org) => org.kind === kind);
        return group.length === 0 ? null : (
          <div key={kind} className="ob__group">
            <div className="sec-t">{title}</div>
            <div className="ob__orgs">{group.map(option)}</div>
          </div>
        );
      })}
      <div className="ob__orgs">{pack.organizations.filter((org) => !org.kind).map(option)}</div>
    </div>
  );
}
