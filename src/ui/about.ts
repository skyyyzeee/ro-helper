declare const __APP_VERSION__: string;

/** This build's version, from package.json. */
export const APP_VERSION = __APP_VERSION__;

export const AUTHOR = 'skyze';

export const LINKS = {
  repository: 'https://github.com/skyyyzeee/ro-helper',
  discord: 'https://discord.gg/VBNn86EmDd',
};

/** The GitHub release page of a version: what is new in it. */
export const releaseUrl = (version: string) => `${LINKS.repository}/releases/tag/v${version}`;
