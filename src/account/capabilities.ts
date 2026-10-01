import type { Organization } from '../core';
import type { Role } from './roles';

/**
 * What a player may do in the assistant (roadmap 1А, docs/adr/0001). The interface asks for one of these
 * instead of checking roles itself; what it shows is only what it shows — the database's rules and the AI
 * server decide what is allowed. A capability comes in with the feature that reads it.
 */
export type Capability =
  /** Reading the memos of their faction. */
  | 'memos.read'
  /** Writing them: the leader and the deputies. */
  | 'memos.write'
  /** Removing anyone's: the leader (anyone removes their own). */
  | 'memos.moderate'
  /** The leader's panel: naming deputies. */
  | 'faction.deputies'
  /** Asking to be the leader of their faction, when they have no role in it. */
  | 'faction.lead-request'
  /** The admin's part of the settings. */
  | 'admin'
  /** The AI's analysis of a situation in the laws. */
  | 'ai.analysis'
  /** The AI's analysis in the rules of the server. */
  | 'ai.server_rules'
  /** The trainer. */
  | 'ai.practice'
  /** Writing a document with the AI. */
  | 'ai.documents'
  /** Checking an officer's actions — the lawyer's demands, the detention review: the state's services. */
  | 'ai.check'
  /** The AI's inner workings on screen: the admin. */
  | 'ai.debug';

export interface CapabilityInput {
  signedIn: boolean;
  /** Every role known for the player; only the ones at their server and faction count. */
  roles: Role[];
  admin: boolean;
  server: string;
  organization?: Organization;
}

/** A faction is an organisation of a group, state or crime: «Без организации» is in neither. */
export const isFaction = (organization?: Organization): organization is Organization => !!organization?.kind;

/** What the player may do where they are: signed out, nothing. */
export function capabilitiesOf({ signedIn, roles, admin, server, organization }: CapabilityInput): ReadonlySet<Capability> {
  const can = new Set<Capability>();
  if (!signedIn) return can;
  if (admin) can.add('admin');
  if (!isFaction(organization)) return can;

  can.add('memos.read');
  const role = roles.find((r) => r.server === server && r.organization === organization.id)?.role;
  if (role) can.add('memos.write');
  if (role === 'leader') {
    can.add('memos.moderate');
    can.add('faction.deputies');
  }
  if (!role) can.add('faction.lead-request');
  return can;
}

/** Who the player is for the AI: what it may do for them and from which side it sees a case. */
export type AiProfile = 'citizen' | 'state' | 'crime';

/** The profile from the organisation chosen in the profile; no faction is a citizen. */
export const aiProfileOf = (organization?: Organization): AiProfile => (isFaction(organization) ? organization.kind! : 'citizen');

/**
 * What the AI may do for the player. The organisation is the player's own choice, confirmed by no one (decision
 * 1а, .scratch/ai-closed-loop/spec.md): these are training tools, little harm in trusting it. Signed in or not —
 * the AI works without an account. To move to confirmed membership, this is the one place to change.
 */
export function aiCapabilitiesOf({ admin, organization }: Pick<CapabilityInput, 'admin' | 'organization'>): ReadonlySet<Capability> {
  const can = new Set<Capability>(['ai.analysis', 'ai.server_rules', 'ai.practice', 'ai.documents']);
  if (aiProfileOf(organization) === 'state') can.add('ai.check');
  if (admin) can.add('ai.debug');
  return can;
}
