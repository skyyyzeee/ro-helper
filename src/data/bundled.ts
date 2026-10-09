// Every server's pack at once, read when this module is: for the tests, the scripts (the exam, the charters check)
// and the checks of the packs themselves. The app does not import it — it loads one server's pack when it is used
// (`loadPack` in ./index), so it does not carry three servers' laws into every window at start.
import type { ServerPack } from '../core';
import arbatskiy from './arbatskiy.json';
import kutuzovskiy from './kutuzovskiy.json';
import tverskoi from './tverskoi.json';

export const TVERSKOI_PACK = tverskoi as unknown as ServerPack;
export const ARBATSKIY_PACK = arbatskiy as unknown as ServerPack;
export const KUTUZOVSKIY_PACK = kutuzovskiy as unknown as ServerPack;

/** Every server the app has laws for, by id; the first one is what a new profile starts on. */
export const PACKS: Record<string, ServerPack> = {
  tverskoi: TVERSKOI_PACK,
  arbatskiy: ARBATSKIY_PACK,
  kutuzovskiy: KUTUZOVSKIY_PACK,
};

/** The pack of a server, or the first one for a profile that names a server the app no longer has. */
export const packFor = (server: string): ServerPack => PACKS[server] ?? TVERSKOI_PACK;
