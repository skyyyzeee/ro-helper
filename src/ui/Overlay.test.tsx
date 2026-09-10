import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakePlatform } from '../platform/fake';
import { PlatformProvider } from '../platform/PlatformContext';
import { App } from './App';

function renderApp() {
  const platform = createFakePlatform();
  render(
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>,
  );
  return platform;
}

describe('overlay', () => {
  it('opens with the brand and the cursor in the search field', () => {
    renderApp();
    expect(screen.getByText('РО Хелпер')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск по законам' })).toHaveFocus();
  });

  it('puts the cursor back in the search field when the overlay is shown again', async () => {
    const platform = renderApp();
    const search = screen.getByRole('searchbox', { name: 'Поиск по законам' });
    search.blur();
    expect(search).not.toHaveFocus();

    await act(() => platform.showOverlay());
    expect(search).toHaveFocus();
  });

  it('hides the overlay through the platform', async () => {
    const platform = renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Скрыть оверлей' }));
    expect(platform.state.overlayVisible).toBe(false);
  });
});
