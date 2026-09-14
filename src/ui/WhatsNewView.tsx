import { BackIcon } from './icons';
import { Markdown } from './Markdown';
import type { VersionNotes } from './whatsNew';

/** «1.0.14–1.0.16», or one version on its own. */
const span = (sections: VersionNotes[]) =>
  sections.length > 1 ? `${sections.at(-1)!.version}–${sections[0].version}` : (sections[0]?.version ?? '');

/**
 * What is new, version by version, newest first: after an update, every version since the one last run;
 * from the settings, the whole history.
 */
export function WhatsNewView({
  title,
  sections,
  backLabel,
  onBack,
}: {
  title: string;
  sections: VersionNotes[];
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <article className="art md" aria-label={title}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>{backLabel}</span>
      </button>
      <h2 className="art__title">{title}</h2>
      {sections.length > 1 && <p className="md__when">Изменения в версиях {span(sections)}</p>}
      {sections.map((section) => (
        <section key={section.version} className="md__version" aria-label={`Версия ${section.version}`}>
          <h3 className="md__h">Версия {section.version}</h3>
          <Markdown text={section.notes} />
        </section>
      ))}
    </article>
  );
}
