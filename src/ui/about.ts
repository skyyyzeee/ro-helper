declare const __APP_VERSION__: string;

/** This build's version, from package.json. */
export const APP_VERSION = __APP_VERSION__;

/** Who made it: skyze, and AidenArokij — the AI helper and its server. */
export const AUTHORS = ['skyze', 'AidenArokij'];

export const LINKS = {
  repository: 'https://github.com/skyyyzeee/ro-helper',
  discord: 'https://discord.gg/VBNn86EmDd',
};

/**
 * The AI server (server/ in the repository): it holds the AI key, so players need none — AidenArokij's, for now.
 * Empty, the AI works only with the player's own Gemini key.
 */
export const AI_SERVER = 'https://2-26-228-23.sslip.io';

/** The GitHub release page of a version: what is new in it. */
export const releaseUrl = (version: string) => `${LINKS.repository}/releases/tag/v${version}`;
