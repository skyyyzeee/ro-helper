import { CloseIcon, DownloadIcon } from './icons';
import type { Updates } from './updates';

/** The offer of a new version under the overlay's header: what is new (in the overlay), update now, or later. */
export function UpdateBanner({ updates, onNotes }: { updates: Updates; onNotes: () => void }) {
  const { status } = updates;
  if (!updates.offered || (status.kind !== 'available' && status.kind !== 'installing' && status.kind !== 'failed')) return null;
  const { version } = status.update;

  if (status.kind === 'installing') {
    return (
      <div className="update" role="status" aria-label="Обновление">
        <div className="update__text">
          <strong>Обновляю до версии {version}</strong>
          <span>{status.percent === undefined ? 'Загрузка…' : `Загрузка… ${status.percent}%`} Программа перезапустится сама.</span>
        </div>
        <div className="update__bar" aria-hidden="true">
          <span style={{ width: `${status.percent ?? 0}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="update" role="status" aria-label="Обновление">
      <DownloadIcon />
      <div className="update__text">
        <strong>{status.kind === 'failed' ? 'Не удалось обновить' : `Доступна версия ${version}`}</strong>
        <button className="link" type="button" onClick={onNotes}>
          Что нового
        </button>
      </div>
      <span className="sp" />
      <button className="btn btn--primary update__go" type="button" onClick={updates.install}>
        {status.kind === 'failed' ? 'Повторить' : 'Обновить'}
      </button>
      <button className="icon-btn" type="button" aria-label="Позже" title="Позже" onClick={updates.later}>
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
