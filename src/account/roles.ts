/** What a player may be in a faction on a server (ticket 15; deputies come with ticket 16). */
export type RoleName = 'leader' | 'deputy';

export interface Role {
  server: string;
  organization: string;
  role: RoleName;
}

/** A player's «I'm the leader» request, and what the admin made of it. */
export interface LeaderRequest {
  id: number;
  server: string;
  organization: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

/** What a signed-in player publishes of themselves, for the admin (and, later, their leader) to find them by. */
export interface PublicCard {
  name: string;
  gameName?: string;
  position?: string;
  server?: string;
  organization?: string;
}

/** A player as the admin sees them: their card and their roles. */
export interface PlayerRecord extends PublicCard {
  userId: string;
  roles: Role[];
}

/** As long as a memo may be, markup included: what the memos table holds (supabase: memos.text, 1–3000 characters). */
export const MEMO_TEXT_MAX = 3000;

/** A memo of a faction (ticket 17): written by its leader or a deputy, read by its players until it runs out. */
export interface Memo {
  id: number;
  server: string;
  organization: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  /** When it runs out and goes to the archive. */
  until: string;
}

/** Where the signed-in player stands. */
export interface MyRoles {
  roles: Role[];
  admin: boolean;
  /** Their latest request to be a leader, if any. */
  request: LeaderRequest | null;
}

/** Roles and requests on the server, behind its rules: a player reads their own, the admin everything. */
export interface RolesApi {
  publish(card: PublicCard): Promise<void>;
  mine(): Promise<MyRoles>;
  requestLeader(server: string, organization: string, note: string): Promise<void>;
  /** The leader's (ticket 16): the players of their faction, and deputies made of them or not. */
  faction: {
    members(server: string, organization: string): Promise<PlayerRecord[]>;
    setDeputy(userId: string, deputy: boolean): Promise<void>;
  };
  /** A faction's memos (ticket 17): read by its players, written by its leader and deputies. */
  memos: {
    /** The ones still running and those run out in the last 30 days, newest first. */
    list(server: string, organization: string): Promise<Memo[]>;
    post(memo: { server: string; organization: string; authorName: string; text: string; until: string }): Promise<void>;
    remove(id: number): Promise<void>;
  };
  /** The admin's; the server refuses anyone else. */
  admin: {
    requests(): Promise<(LeaderRequest & { player: PlayerRecord })[]>;
    decide(id: number, approve: boolean): Promise<void>;
    search(query: string): Promise<PlayerRecord[]>;
    grant(userId: string, role: Role): Promise<void>;
    revoke(userId: string, server: string, organization: string): Promise<void>;
  };
}
