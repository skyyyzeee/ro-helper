import changelog from '../../CHANGELOG.md?raw';

/** What is new in one version: its «## 1.2.3» section of CHANGELOG.md. */
export interface VersionNotes {
  version: string;
  notes: string;
}

/** The version of the app the user last ran, to tell them what came out since. */
export const SEEN_VERSION_KEY = 'app.seenVersion';

/** «1.0.9» against «1.0.16»: number by number, not as text. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

/** The «## 1.2.3» sections of a changelog, in the order written: newest first. */
export function changelogSections(text: string): VersionNotes[] {
  const heads = [...text.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)];
  return heads.map((head, i) => ({
    version: head[1],
    notes: text.slice(head.index + head[0].length, heads[i + 1]?.index ?? text.length).trim(),
  }));
}

/** Every version's notes, built into the app. */
export const CHANGELOG = changelogSections(changelog);

/**
 * What came out after the version last run, up to this one, newest first. Without a version last run —
 * a copy updated from before the app remembered it — only this version's notes.
 */
export function notesSince(seen: string | undefined, current: string, sections: VersionNotes[] = CHANGELOG): VersionNotes[] {
  return sections.filter((section) => {
    if (compareVersions(section.version, current) > 0) return false;
    return seen === undefined ? compareVersions(section.version, current) === 0 : compareVersions(section.version, seen) > 0;
  });
}
