import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { PROFILE_KEY } from './profile';

const radio = (group: string, name: string | RegExp) => within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });
const next = () => screen.getByRole('button', { name: /^(Далее|Готово|Сохранить)$/ });

describe('first launch', () => {
  it('walks through server, organisation, hotkey and the screen-mode hint, then opens the overlay', async () => {
    const { platform, user } = await renderApp({ profile: null });

    // Server
    expect(radio('Сервер', /Тверской/)).toHaveAttribute('aria-checked', 'true');
    expect(radio('Сервер', /Арбатский/)).toBeDisabled();
    expect(radio('Сервер', /Арбатский/)).toHaveTextContent('скоро');
    expect(radio('Сервер', /Кутузовский/)).toHaveTextContent('скоро · для новичков');
    await user.click(next());

    // Organisation
    expect(within(screen.getByRole('radiogroup', { name: 'Организация' })).getAllByRole('radio')).toHaveLength(13);
    expect(radio('Организация', 'Без организации')).toHaveAttribute('aria-checked', 'true');
    await user.click(radio('Организация', 'МВД'));
    expect(radio('Организация', 'МВД')).toHaveAttribute('aria-checked', 'true');
    await user.click(next());

    // Hotkey
    const field = screen.getByRole('button', { name: /Горячая клавиша/ });
    expect(field).toHaveAccessibleName('Горячая клавиша: Alt + Q');
    await user.click(field);
    expect(platform.state.hotkey).toBeNull(); // released while recording
    await user.keyboard('{Control>}{Shift>}L{/Shift}{/Control}');
    expect(field).toHaveAccessibleName('Горячая клавиша: Ctrl + Shift + L');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(field);
    await user.keyboard('[F9]');
    expect(field).toHaveAccessibleName('Горячая клавиша: F9');
    expect(screen.getByRole('alert')).toHaveTextContent('Без Ctrl, Alt или Shift');
    await user.click(next());

    // Screen mode
    expect(screen.getByRole('heading', { name: 'Режим экрана GTA' })).toBeInTheDocument();
    expect(screen.getByText(/Тверской · МВД · F9\. Всё это можно поменять в настройках/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    expect(await screen.findByRole('searchbox', { name: 'Поиск по законам' })).toBeInTheDocument();
    expect(screen.getByText('Тверской · МВД')).toBeInTheDocument();
    expect(platform.settings.get(PROFILE_KEY)).toEqual({ server: 'tverskoi', organization: 'mvd', hotkey: 'F9' });
    expect(platform.state.hotkey).toBe('F9');
  });

  it('keeps the old hotkey when recording is cancelled with Esc, and goes back a step with «Назад»', async () => {
    const { platform, user } = await renderApp({ profile: null });
    await user.click(next());
    await user.click(next());
    const field = screen.getByRole('button', { name: /Горячая клавиша/ });
    await user.click(field);
    await user.keyboard('{Escape}');
    expect(field).toHaveAccessibleName('Горячая клавиша: Alt + Q');
    expect(platform.state.hotkey).toBe('Alt+Q');

    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByRole('heading', { name: 'Ваша организация' })).toBeInTheDocument();
  });

  it('is skipped once a profile is saved', async () => {
    await renderApp({ profile: { organization: 'fso' } });
    expect(screen.queryByRole('heading', { name: 'Выберите сервер' })).not.toBeInTheDocument();
    expect(screen.getByText('Тверской · ФСО')).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('reopen the same steps, save the new choice and re-register the hotkey at once', async () => {
    const { platform, user } = await renderApp({ profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('button', { name: 'Изменить' }));

    expect(screen.getByText('Настройки')).toBeInTheDocument();
    await user.click(next());
    await user.click(radio('Организация', 'ГИБДД'));
    await user.click(next());
    await user.click(screen.getByRole('button', { name: /Горячая клавиша/ }));
    await user.keyboard('{Alt>}W{/Alt}');
    await user.click(next());
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Тверской · ГИБДД')).toBeInTheDocument();
    expect(platform.settings.get(PROFILE_KEY)).toEqual({ server: 'tverskoi', organization: 'gibdd', hotkey: 'Alt+W' });
    expect(platform.state.hotkey).toBe('Alt+W');
  });

  it('leave without saving on «Отмена» or Esc', async () => {
    const { platform, user } = await renderApp({ profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    await user.click(next());
    await user.click(radio('Организация', 'ОПГ'));
    await user.keyboard('{Escape}');

    expect(await screen.findByText('Тверской · МВД')).toBeInTheDocument();
    expect(platform.settings.get(PROFILE_KEY)).toMatchObject({ organization: 'mvd' });
  });
});

describe('organisation in search', () => {
  it('lifts the organisation’s documents', async () => {
    // «Оскорбление» is a title in both УК 104 and КоАП 5.4; ГИБДД works with КоАП.
    const first = async (organization: string) => {
      const { user } = await renderApp({ profile: { organization } });
      await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'оскорбление ');
      const text = within(screen.getByRole('list', { name: 'Результаты поиска' })).getAllByRole('listitem')[0].textContent;
      document.body.innerHTML = '';
      return text;
    };
    expect(await first('mvd')).toContain('ст. 104');
    expect(await first('gibdd')).toContain('ст. 5.4 ч. 1');
  });
});
