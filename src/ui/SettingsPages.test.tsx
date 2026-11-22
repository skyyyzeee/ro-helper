import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { selectSettingsSection } from '../test/settings';
import { AI_CUSTOM_SETTING } from './ai';

const menu = () => screen.getByRole('navigation', { name: 'Разделы настроек' });
afterEach(() => document.documentElement.style.removeProperty('--glass-alpha'));

describe('settings pages', () => {
  it('opens the general page and keeps other pages out of the accessible screen', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(within(menu()).getByRole('button', { name: 'Основное' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('region', { name: 'Сервер и организация' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Тема' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Аккаунт' })).not.toBeInTheDocument();
    await selectSettingsSection(user, 'Внешний вид');
    expect(screen.getByRole('radiogroup', { name: 'Тема' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Сервер и организация' })).not.toBeInTheDocument();
  });

  it('keeps a saved appearance change when switching pages', async () => {
    const { user, platform } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await selectSettingsSection(user, 'Внешний вид');
    fireEvent.change(screen.getByRole('slider', { name: 'Прозрачность фона' }), { target: { value: '60' } });
    await selectSettingsSection(user, 'Основное');
    await selectSettingsSection(user, 'Внешний вид');
    expect(screen.getByRole('slider', { name: 'Прозрачность фона' })).toHaveValue('60');
    expect(platform.settings.get('overlay.opacity')).toBe(0.4);
  });

  it('preserves an unsaved custom endpoint while visiting another page', async () => {
    const { user, platform } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await selectSettingsSection(user, 'ИИ');
    await user.click(screen.getByRole('radio', { name: 'Свой ИИ' }));
    const url = screen.getByRole('textbox', { name: 'Адрес API' });
    await user.clear(url);
    await user.type(url, 'http://localhost:1234/v1');
    await selectSettingsSection(user, 'Клавиши');
    expect(screen.queryByRole('textbox', { name: 'Адрес API' })).not.toBeInTheDocument();
    await selectSettingsSection(user, 'ИИ');
    expect(screen.getByRole('textbox', { name: 'Адрес API' })).toHaveValue('http://localhost:1234/v1');
    expect(platform.settings.get(AI_CUSTOM_SETTING)).toBeUndefined();
  });

  it('returns from version history to About and opens the account through the profile shortcut', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await selectSettingsSection(user, 'О программе');
    await user.click(screen.getByRole('button', { name: 'История версий' }));
    expect(screen.getByRole('article', { name: 'История версий' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(within(menu()).getByRole('button', { name: 'О программе' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'История версий' })).toBeInTheDocument();
    await user.keyboard('{Control>}6{/Control}');
    expect(screen.getByRole('region', { name: 'Аккаунт' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Сервер и организация' })).not.toBeInTheDocument();
  });
});
