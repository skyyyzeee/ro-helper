import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { PROFILE_KEY } from './profile';

const radio = (group: string, name: string | RegExp) => within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });
const next = () => screen.getByRole('button', { name: /^(Далее|Готово|Сохранить)$/ });
/** The screen-mode notice comes over the organisation step at the first launch. */
const understood = () => screen.getByRole('button', { name: 'Понятно' });

describe('first launch', () => {
  it('walks through server, organisation and hotkey, and opens the overlay', async () => {
    const { platform, user } = await renderApp({ profile: null });

    // Server
    expect(radio('Сервер', /Тверской/)).toHaveAttribute('aria-checked', 'true');
    expect(radio('Сервер', /Арбатский/)).toBeEnabled();
    expect(radio('Сервер', /Кутузовский/)).toBeEnabled();
    expect(radio('Сервер', /Кутузовский/)).toHaveTextContent('для новичков');
    await user.click(next());

    // Organisation, by group: state services, criminal, and «Без организации» on its own
    expect(within(screen.getByRole('radiogroup', { name: 'Организация' })).getAllByRole('radio')).toHaveLength(13);
    expect(screen.getByText('Государственные')).toBeInTheDocument();
    const crime = screen.getByText('Криминальные').parentElement!;
    expect(within(crime).getAllByRole('radio').map((b) => b.textContent)).toEqual(['ОПГ']);
    expect(radio('Организация', 'Без организации')).toHaveAttribute('aria-checked', 'true');
    await user.click(radio('Организация', 'МВД'));
    expect(radio('Организация', 'МВД')).toHaveAttribute('aria-checked', 'true');
    await user.click(next());

    // The screen mode: one notice over the step, not a step of its own
    const notice = screen.getByRole('alertdialog', { name: 'Режим экрана GTA' });
    expect(notice).toHaveTextContent('Оконный без рамки');
    expect(understood()).toHaveFocus();
    await user.click(understood());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

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
    await user.click(understood());
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
    // The game is already set up: no notice the second time.
    await user.click(next());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Горячая клавиша/ }));
    await user.keyboard('{Alt>}W{/Alt}');
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

describe('another server', () => {
  it('brings its own laws and its own organisations', async () => {
    const { platform, user } = await renderApp({ profile: null });
    await user.click(radio('Сервер', /Арбатский/));
    await user.click(next());

    // Арбатский has no «Вести Москвы»; the one picked on another server goes back to «Без организации».
    expect(within(screen.getByRole('radiogroup', { name: 'Организация' })).queryByRole('radio', { name: 'Вести Москвы' })).not.toBeInTheDocument();
    await user.click(radio('Организация', 'ГИБДД'));
    await user.click(next());
    await user.click(understood());
    await user.click(next());

    expect(await screen.findByText('Арбатский · ГИБДД')).toBeInTheDocument();
    expect(platform.settings.get(PROFILE_KEY)).toMatchObject({ server: 'arbatskiy', organization: 'gibdd' });

    // Its own criminal code: ст. 6.1 «Убийство» with the term written as «на срок до 50 месяцев».
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'ук 6.1');
    const first = within(screen.getByRole('list', { name: 'Результаты поиска' })).getAllByRole('listitem')[0];
    expect(first).toHaveTextContent('ст. 6.1');
    expect(first).toHaveTextContent('Убийство');
    expect(first).toHaveTextContent('50 мес');
  });

  it('keeps an organisation both servers have when the server changes', async () => {
    const { user } = await renderApp({ profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    await user.click(radio('Сервер', /Арбатский/));
    await user.click(next());

    expect(radio('Организация', 'МВД')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('changing only the organisation', () => {
  it('is one screen in the settings: pick and it is saved, the rest untouched', async () => {
    const { platform, user } = await renderApp({ profile: { organization: 'mvd', hotkey: 'F9' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(screen.getByRole('group', { name: 'Настройки' })).toHaveTextContent('Организация: МВД');
    await user.click(screen.getByRole('button', { name: 'Сменить' }));

    const choice = screen.getByRole('region', { name: 'Ваша организация' });
    expect(screen.queryByRole('heading', { name: 'Выберите сервер' })).not.toBeInTheDocument();
    await user.click(within(choice).getByRole('radio', { name: 'ФСБ' }));

    expect(await screen.findByText('Тверской · ФСБ')).toBeInTheDocument();
    expect(platform.settings.get(PROFILE_KEY)).toEqual({ server: 'tverskoi', organization: 'fsb', hotkey: 'F9' });
    expect(screen.getByRole('searchbox', { name: 'Поиск по законам' })).toHaveFocus();
  });

  it('goes back with Esc without changing anything', async () => {
    const { platform, user } = await renderApp({ profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('button', { name: 'Сменить' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('region', { name: 'Ваша организация' })).not.toBeInTheDocument();
    expect(screen.getByText('Тверской · МВД')).toBeInTheDocument();
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
