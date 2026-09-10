import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('overlay', () => {
  it('opens with the brand and the cursor in the search field', async () => {
    await renderApp();
    expect(screen.getByText('РО Хелпер')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск по законам' })).toHaveFocus();
  });

  it('puts the cursor back in the search field when the overlay is shown again', async () => {
    const { platform } = await renderApp();
    const search = screen.getByRole('searchbox', { name: 'Поиск по законам' });
    search.blur();
    expect(search).not.toHaveFocus();

    await act(() => platform.showOverlay());
    expect(search).toHaveFocus();
  });

  it('hides the overlay through the platform', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Скрыть оверлей' }));
    expect(platform.state.overlayVisible).toBe(false);
  });
});
