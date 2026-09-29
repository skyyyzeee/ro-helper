import type { SyncRules } from '../account/sync';
import { PACKS } from '../data';
import { ACCENT_KEY, THEME_KEY } from './appearance';
import { DEFAULT_HOTKEY, OPACITY_KEY } from './overlaySettings';
import { presetsKey, type PinPreset } from './pinPresets';
import { PLAYER_KEY } from './player';
import { DEVICES_KEY } from './stats';
import { PROFILE_KEY, type Profile } from './profile';
import { favoritesKey, RECENT_LIMIT, recentKey } from './saved';

/**
 * What follows the player between computers (Q14): the server and the faction, their game name and position,
 * the look, the favourites, the recent articles and the sets of pinned cards. Not the hotkey and the windows'
 * places — this computer's own — nor what is pinned right now (its places are on this screen), nor what this
 * copy has seen.
 */
const WHOLE = [PROFILE_KEY, PLAYER_KEY, THEME_KEY, ACCENT_KEY, OPACITY_KEY, DEVICES_KEY];
/** Per server, and the player's counts: one key a computer, written by that computer only. */
const KEYED = /^(favorites|recent|pin-presets|stats):/;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
/** One list from two, without repeats: the first's order, then what only the second has. */
const join = <T>(first: T[], second: T[], same: (a: T, b: T) => boolean) => [...first, ...second.filter((b) => !first.some((a) => same(a, b)))];

export const SYNC_RULES: SyncRules = {
  keys: () => [...WHOLE, ...Object.keys(PACKS).flatMap((server) => [favoritesKey(server), recentKey(server), presetsKey(server)])],

  isSynced: (key) => WHOLE.includes(key) || KEYED.test(key),

  toRemote(key, local) {
    if (key !== PROFILE_KEY || !local) return local;
    const { server, organization } = local as Profile;
    return { server, organization };
  },

  fromRemote(key, remote, local) {
    if (key !== PROFILE_KEY || !remote) return remote;
    return { ...(remote as Profile), hotkey: (local as Profile | undefined)?.hotkey ?? DEFAULT_HOTKEY };
  },

  merge(key, remote, local) {
    if (key.startsWith('favorites:') || key === DEVICES_KEY) return join(list(remote), list(local), (a, b) => a === b);
    if (key.startsWith('recent:')) return join(list(local), list(remote), (a, b) => a === b).slice(0, RECENT_LIMIT);
    if (key.startsWith('pin-presets:')) {
      // Sets are told apart by name; one from here gets an id the account's don't use.
      const theirs = list(remote) as PinPreset[];
      const joined = join(theirs, list(local) as PinPreset[], (a, b) => a.name.toLowerCase() === b.name.toLowerCase());
      const used = new Set(theirs.map((preset) => preset.id));
      return joined.map((preset, i) => {
        if (i < theirs.length) return preset;
        let id = preset.id;
        for (let n = joined.length; used.has(id); n++) id = `p${n}`;
        used.add(id);
        return id === preset.id ? preset : { ...preset, id };
      });
    }
    // The server, the faction and the look: the account's.
    return remote;
  },
};
