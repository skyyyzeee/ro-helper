import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { PROFILE_KEY } from './profile';

const switcher = () => screen.getByRole('button', { name: 'Сервер и организация' });
const screenOf = () => screen.getByRole('region', { name: 'Сервер и организация' });

describe('the server and the organisation, from the header', () => {
  it('shows the server with its mark and the organisation, and opens both choices on one screen', async () => {
    const { user } = await renderApp({ profile: { organization: 'mvd' } });
    expect(switcher()).toHaveAttribute('title', 'Тверской · МВД');
    expect(switcher()).toHaveTextContent('МВД');
    expect(switcher().querySelector('svg')).toBeInTheDocument();
    await user.click(switcher());
    const view = screenOf();
    expect(within(view).getByRole('radiogroup', { name: 'Сервер' })).toBeInTheDocument();
    expect(within(view).getByRole('radio', { name: /МВД/ })).toBeChecked();
    // Every organisation has its badge.
    for (const option of within(within(view).getByRole('radiogroup', { name: 'Организация' })).getAllByRole('radio')) {
      expect(option.querySelector('svg')).toBeInTheDocument();
    }
  });

  it('changes the server at once and keeps the screen for the organisation, which closes it', async () => {
    const { platform, user } = await renderApp({ profile: { organization: 'mvd' } });
    await user.click(switcher());
    await user.click(within(screenOf()).getByRole('radio', { name: /Арбатский/ }));
    expect(platform.settings.get(PROFILE_KEY)).toMatchObject({ server: 'arbatskiy', organization: 'mvd' });
    expect(screenOf()).toBeInTheDocument();
    await user.click(within(screenOf()).getByRole('radio', { name: /ФСБ/ }));
    expect(platform.settings.get(PROFILE_KEY)).toMatchObject({ server: 'arbatskiy', organization: 'fsb' });
    expect(screen.queryByRole('region', { name: 'Сервер и организация' })).not.toBeInTheDocument();
    expect(switcher()).toHaveAttribute('title', 'Арбатский · ФСБ');
  });

  it('closes with Esc, back to the search', async () => {
    const { user } = await renderApp();
    await user.click(switcher());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Сервер и организация' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск по законам' })).toBeInTheDocument();
  });

  it('is a popover over the search: servers as tiles, factions in a grid, and a click beside it closes it', async () => {
    const { user } = await renderApp();
    await user.click(switcher());
    expect(within(screenOf()).getByRole('radiogroup', { name: 'Сервер' })).toHaveClass('ob__options--tiles');
    expect(within(screenOf()).getByRole('radiogroup', { name: 'Организация' })).toHaveClass('ob__orgs--grid');
    // The search stays under it.
    expect(screen.getByRole('searchbox', { name: 'Поиск по законам' })).toBeInTheDocument();
    await user.click(document.querySelector('.switch-pop__backdrop')!);
    expect(screen.queryByRole('region', { name: 'Сервер и организация' })).not.toBeInTheDocument();
  });
});
