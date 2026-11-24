import { screen, within } from '@testing-library/react';

/** Navigate through the visible settings menu, as a player does. */
export async function selectSettingsSection(user: { click: (element: Element) => Promise<unknown> }, section: string) {
  if (section === 'Аккаунт') {
    await user.click(within(screen.getByRole('navigation', { name: 'Разделы' })).getByRole('button', { name: 'Профиль' }));
    return;
  }
  const menu = screen.getByRole('navigation', { name: 'Разделы настроек' });
  await user.click(within(menu).getByRole('button', { name: section }));
}

