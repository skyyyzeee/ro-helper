declare const __APP_VERSION__: string;

/** This build's version, from package.json. */
export const APP_VERSION = __APP_VERSION__;

export const AUTHOR = 'skyze';

export const LINKS = {
  repository: 'https://github.com/skyyyzeee/ro-helper',
  discord: 'https://discord.gg/VBNn86EmDd',
};

/**
 * The AI server (server/ in the repository): it holds the AI key, so players need none. Empty until one is set up —
 * meanwhile the AI works with the player's own Gemini key.
 */
export const AI_SERVER = '';

/** The GitHub release page of a version: what is new in it. */
export const releaseUrl = (version: string) => `${LINKS.repository}/releases/tag/v${version}`;
