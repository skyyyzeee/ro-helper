import { useEffect, useRef, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { CloseIcon, MenuIcon, SearchIcon, SettingsIcon } from './icons';

export function Overlay() {
  const platform = usePlatform();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  // The search field takes focus on first render and every time the overlay is shown again.
  useEffect(() => {
    searchRef.current?.focus();
    return platform.onOverlayShown(() => searchRef.current?.focus());
  }, [platform]);

  return (
    <div className="overlay glass">
      <div className="overlay__head">
        <button className="icon-btn" type="button" aria-label="Все документы" title="Все документы">
          <MenuIcon />
        </button>
        <span className="brand">РО Хелпер</span>
        <span className="sp" />
        <span className="chip">Тверской</span>
        <button className="icon-btn" type="button" aria-label="Настройки" title="Настройки">
          <SettingsIcon />
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label="Скрыть оверлей"
          title="Скрыть оверлей"
          onClick={() => void platform.hideOverlay()}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="search">
        <SearchIcon />
        <input
          ref={searchRef}
          className="search__input"
          type="search"
          aria-label="Поиск по законам"
          placeholder="Номер или слова: 65, коап 8.6, кража"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="kbd">Esc</span>
      </div>

      <div className="overlay__content" />

      <div className="overlay__foot">
        <span>
          <b>↑↓</b> выбор
        </span>
        <span>
          <b>Enter</b> в калькулятор
        </span>
        <span>
          <b>→</b> открыть
        </span>
        <span>
          <b>Esc</b> назад
        </span>
      </div>
    </div>
  );
}
