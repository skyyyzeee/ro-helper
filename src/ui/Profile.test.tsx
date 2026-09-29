import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';

const rail = () => screen.getByRole('navigation', { name: 'Разделы' });
const settings = () => screen.getByRole('group', { name: 'Настройки' });
/** The account: the first block of the settings. */
const account = () => within(settings()).getByRole('region', { name: 'Аккаунт' });
const settingsNav = () => within(settings()).getByRole('navigation', { name: 'Разделы настроек' });
const SKYZE = { id: 'user-1', name: 'Skyze', via: 'discord' as const, avatar: 'https://cdn.discordapp.com/avatars/1/a.png' };

describe('the account, in the settings', () => {
  it('signs in with Discord, optionally: the browser opens, and the player comes back signed in', async () => {
    const { accounts, user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: 'Профиль' }));
    // A page of its own (direction C): its name in the header, no search.
    expect(document.querySelector('.brand')).toHaveTextContent('Настройки');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(within(settingsNav()).getByRole('button', { name: /Аккаунт/ })).toHaveAttribute('aria-current', 'true');
    expect(account()).toHaveTextContent('без него всё работает как раньше');

    await user.click(within(account()).getByRole('button', { name: 'Войти через Discord' }));
    expect(accounts.calls).toEqual(['signIn:discord']);
    expect(account()).toHaveTextContent('Подтвердите вход в браузере');
    expect(within(account()).queryByRole('button', { name: 'Войти через Discord' })).not.toBeInTheDocument();

    accounts.finishSignIn(SKYZE);
    expect(await within(account()).findByText('Skyze')).toBeInTheDocument();
    expect(within(account()).getByRole('img', { name: 'Аватар Skyze' })).toHaveAttribute('src', SKYZE.avatar);
    expect(account()).toHaveTextContent('SkyzeТверской · Без организации');
    // Who is signed in, on top of the settings' column and at the foot of the side column.
    expect(within(settingsNav()).getByRole('button', { name: /Skyze/ })).toHaveTextContent('SkyzeDiscord');
    expect(within(rail()).getByRole('button', { name: 'Профиль: Skyze' }).querySelector('img')).toHaveAttribute('src', SKYZE.avatar);
  });

  it('takes this computer’s settings into the account at the first sign-in, and keeps them in step', async () => {
    const { accounts, user } = await renderApp({ settings: { 'favorites:tverskoi': ['uk-65#1'] } });
    await user.click(within(rail()).getByRole('button', { name: 'Профиль' }));
    await user.click(within(account()).getByRole('button', { name: 'Войти через Discord' }));
    accounts.finishSignIn(SKYZE);

    await vi.waitFor(() => expect(accounts.table.get('profile')?.value).toEqual({ server: 'tverskoi', organization: 'none' }));
    expect(accounts.table.get('favorites:tverskoi')?.value).toEqual(['uk-65#1']);
    expect(await within(account()).findByRole('status', { name: 'Синхронизация' })).toHaveTextContent('синхронизированы · только что');

    // A change here goes to the account a moment later.
    await user.click(within(settings()).getByRole('radio', { name: 'Минимализм' }));
    await vi.waitFor(() => expect(accounts.table.get('appearance.theme')?.value).toBe('minimal'), { timeout: 4000 });
  });

  it('can give up the sign-in, and says when it failed', async () => {
    const { accounts, user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: 'Профиль' }));
    await user.click(within(account()).getByRole('button', { name: 'Войти через Discord' }));
    await user.click(within(account()).getByRole('button', { name: 'Отмена' }));
    expect(accounts.calls).toEqual(['signIn:discord', 'cancelSignIn']);
    expect(await within(account()).findByRole('button', { name: 'Войти через Discord' })).toBeInTheDocument();
    expect(account()).not.toHaveTextContent('Не удалось войти');

    await user.click(within(account()).getByRole('button', { name: 'Войти через Discord' }));
    accounts.finishSignIn('failed');
    expect(await within(account()).findByText(/Не удалось войти/)).toBeInTheDocument();
    expect(within(account()).getByRole('button', { name: 'Войти через Discord' })).toBeInTheDocument();
  });

  it('knows the player signed in before, and signs out', async () => {
    const { accounts, user } = await renderApp({ account: SKYZE });
    await user.click(await within(rail()).findByRole('button', { name: 'Профиль: Skyze' }));
    expect(account()).toHaveTextContent('Skyze');
    await user.click(within(account()).getByRole('button', { name: 'Выйти' }));
    expect(accounts.calls).toEqual(['signOut']);
    expect(await within(account()).findByRole('button', { name: 'Войти через Discord' })).toBeInTheDocument();
    expect(within(settingsNav()).getByRole('button', { name: /Аккаунт/ })).toHaveTextContent('Вход не выполнен');
    expect(within(rail()).getByRole('button', { name: 'Профиль' })).toBeInTheDocument();
  });

  it('signs in with Telegram: the bot opens, and the player presses «Start» there', async () => {
    const { accounts, user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: 'Профиль' }));
    await user.click(within(account()).getByRole('button', { name: 'Войти через Telegram' }));
    expect(accounts.calls).toEqual(['signIn:telegram']);
    expect(account()).toHaveTextContent('Нажмите «Запустить» у бота в Telegram');

    accounts.finishSignIn({ id: 'user-2', name: 'Иван', via: 'telegram', telegram: '@ivan' });
    expect(await within(account()).findByText('Иван')).toBeInTheDocument();
    expect(within(settingsNav()).getByRole('button', { name: /Иван/ })).toHaveTextContent('ИванTelegram');
    // Signed in with Telegram: nothing to join.
    expect(within(account()).queryByRole('button', { name: 'Привязать Telegram' })).not.toBeInTheDocument();
  });

  it('says when nobody pressed «Start» in time', async () => {
    const { accounts, user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: 'Профиль' }));
    await user.click(within(account()).getByRole('button', { name: 'Войти через Telegram' }));
    accounts.finishSignIn('expired');
    expect(await within(account()).findByRole('alert')).toHaveTextContent('Время на вход вышло');
  });

  it('joins Telegram to the Discord account, and says when it belongs to another one', async () => {
    const { accounts, user } = await renderApp({ account: SKYZE });
    await user.click(await within(rail()).findByRole('button', { name: 'Профиль: Skyze' }));
    await user.click(within(account()).getByRole('button', { name: 'Привязать Telegram' }));
    expect(accounts.calls).toEqual(['linkTelegram']);
    expect(account()).toHaveTextContent('Нажмите «Запустить» у бота в Telegram');
    accounts.finishSignIn('taken');
    expect(await within(account()).findByRole('alert')).toHaveTextContent('Этот Telegram уже привязан к другому аккаунту');

    await user.click(within(account()).getByRole('button', { name: 'Привязать Telegram' }));
    accounts.finishSignIn({ ...SKYZE, telegram: '@ivan' });
    expect(await within(account()).findByText('@ivan')).toBeInTheDocument();
    expect(account()).toHaveTextContent('Telegram @ivan привязан — через него тоже можно войти');
    expect(within(account()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('takes a game name and a position, if the player wants, onto their card — and into the account', async () => {
    const { platform, accounts, user } = await renderApp({ account: SKYZE, profile: { organization: 'mvd' } });
    await user.click(await within(rail()).findByRole('button', { name: 'Профиль: Skyze' }));
    const gameName = within(account()).getByRole('textbox', { name: 'Игровой ник' });
    const position = within(account()).getByRole('textbox', { name: 'Должность' });
    expect(gameName).toHaveValue('');

    await user.type(gameName, 'Ivan_Petrov{Enter}');
    await user.type(position, 'Сержант');
    await user.tab();
    expect(account()).toHaveTextContent('SkyzeТверской · МВД · СержантВ игре: Ivan_Petrov');
    expect(platform.settings.get('player')).toEqual({ gameName: 'Ivan_Petrov', position: 'Сержант' });
    await vi.waitFor(() => expect(accounts.table.get('player')?.value).toEqual({ gameName: 'Ivan_Petrov', position: 'Сержант' }), { timeout: 4000 });

    // Emptied, it is gone from the card.
    await user.clear(position);
    await user.tab();
    expect(account()).not.toHaveTextContent('Сержант');
    expect(platform.settings.get('player')).toEqual({ gameName: 'Ivan_Petrov' });
  });

  it('lists the parts of the settings in a column: the account on top, then the rest', async () => {
    const { user } = await renderApp();
    await user.click(within(rail()).getByRole('button', { name: 'Настройки' }));
    expect(within(settingsNav()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'АккаунтВход не выполнен',
      'Основное',
      'ИИ',
      'Внешний вид',
      'Закреплённые',
      'Законы и обновления',
      'Клавиши',
      'О программе',
    ]);
    await user.click(within(settingsNav()).getByRole('button', { name: 'Клавиши' }));
    expect(within(settingsNav()).getByRole('button', { name: 'Клавиши' })).toHaveAttribute('aria-current', 'true');
    expect(within(settingsNav()).getByRole('button', { name: /Аккаунт/ })).not.toHaveAttribute('aria-current');
  });

  it('opens with Ctrl+6 and closes with Esc', async () => {
    const { user } = await renderApp();
    await user.keyboard('{Control>}6{/Control}');
    expect(account()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Настройки' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск по законам' })).toHaveFocus();
  });
});
