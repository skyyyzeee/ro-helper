import policy from '../../PRIVACY.md?raw';
import { BackIcon } from './icons';
import { Markdown } from './Markdown';

/** The Russian part of PRIVACY.md: everything before the English one, after the line «---». */
export const PRIVACY_TEXT = policy.split(/\r?\n---\r?\n/)[0];

/** The privacy policy inside the app, from the same file as on GitHub. */
export function PrivacyView({ backLabel = 'Назад', onBack }: { backLabel?: string; onBack: () => void }) {
  return (
    <article className="art md" aria-label="Политика конфиденциальности">
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>{backLabel}</span>
      </button>
      <Markdown text={PRIVACY_TEXT} />
    </article>
  );
}
