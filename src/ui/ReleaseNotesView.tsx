import { usePlatform } from '../platform/PlatformContext';
import type { AppUpdate } from '../platform/types';
import { releaseUrl } from './about';
import { BackIcon } from './icons';
import { formatDate } from './lawBits';
import { Markdown } from './Markdown';

/**
 * What is new in a release, from its notes: the «## Что нового» section when there is one (the rest —
 * how to install — is for the release page). Nothing but a placeholder «…» counts as no notes.
 */
export function whatsNew(notes: string | undefined): string {
  if (!notes) return '';
  const section = notes.match(/^## Что нового\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  const text = (section ? section[1] : notes).trim();
  return /^[-\s.…]*$/.test(text) ? '' : text;
}

/** «Что нового» of the version on offer, inside the overlay: the notes, and updating from here. */
export function ReleaseNotesView({ update, onBack, onInstall }: { update: AppUpdate; onBack: () => void; onInstall: () => void }) {
  const platform = usePlatform();
  const notes = whatsNew(update.notes);
  return (
    <article className="art md" aria-label={`Что нового в версии ${update.version}`}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>Назад</span>
      </button>
      <h2 className="art__title">Что нового в версии {update.version}</h2>
      {update.date && <p className="md__when">Вышла {formatDate(update.date)}</p>}
      {notes ? <Markdown text={notes} /> : <p className="md__p">Список изменений есть на странице релиза.</p>}
      <div className="art__actions">
        <button className="btn btn--primary art__grow" type="button" onClick={onInstall}>
          Обновить до {update.version}
        </button>
      </div>
      <button className="link md__release" type="button" onClick={() => void platform.openExternal(releaseUrl(update.version))}>
        Страница релиза на GitHub
      </button>
    </article>
  );
}
