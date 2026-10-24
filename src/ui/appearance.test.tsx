import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { ACCENT_KEY, BLUR_KEY, SCALE_KEY, THEME_KEY, accentHue, organizationHue } from './appearance';

const root = () => document.documentElement;
const hue = () => root().style.getPropertyValue('--accent-hue');

afterEach(() => {
  delete root().dataset.theme;
  delete root().dataset.blur;
  root().style.removeProperty('--accent-hue');
  root().style.removeProperty('zoom');
});

async function openLook(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(screen.getByRole('button', { name: 'Настройки' }));
  return {
    themes: screen.getByRole('radiogroup', { name: 'Тема' }),
    accents: screen.getByRole('radiogroup', { name: 'Акцент' }),
  };
}

describe('the look: a theme and an accent', () => {
  it('follows the organisation: the МВД blue, the Армия green', async () => {
    await renderApp({ profile: { organization: 'mvd' } });
    await vi.waitFor(() => expect(hue()).toBe(String(organizationHue('mvd'))));
    expect(root().dataset.theme).toBeUndefined();
    cleanup();
    await renderApp({ profile: { organization: 'army' } });
    await vi.waitFor(() => expect(hue()).toBe(String(organizationHue('army'))));
    expect(organizationHue('army')).not.toBe(organizationHue('mvd'));
  });

  it('changes the theme from the settings, at once, and keeps it', async () => {
    const { platform, user } = await renderApp();
    const { themes } = await openLook(user);
    expect(within(themes).getByRole('radio', { name: 'Стекло' })).toBeChecked();
    await user.click(within(themes).getByRole('radio', { name: 'Плотная' }));
    expect(root().dataset.theme).toBe('dense');
    expect(platform.settings.get(THEME_KEY)).toBe('dense');

    // Started again: the saved theme is back.
    const settings = Object.fromEntries(platform.settings);
    cleanup();
    delete root().dataset.theme;
    await renderApp({ settings });
    await vi.waitFor(() => expect(root().dataset.theme).toBe('dense'));
  });

  it('takes a hue chosen by hand over the organisation, and gives the pinned cards the same', async () => {
    const { platform, user } = await renderApp({ profile: { organization: 'mvd' } });
    const { accents } = await openLook(user);
    expect(within(accents).getByRole('radio', { name: 'Как у организации' })).toBeChecked();
    await user.click(within(accents).getByRole('radio', { name: 'Оттенок 150' }));
    expect(hue()).toBe('150');
    expect(platform.settings.get(ACCENT_KEY)).toBe(150);
    expect(platform.calls.filter((c) => c.method === 'setPinLook').at(-1)?.args[0]).toEqual({ theme: 'glass', hue: 150, blur: true });
  });

  it('works out the hue: the organisation’s unless one was chosen; an unknown organisation gets the default blue', () => {
    expect(accentHue('organization', 'fsb')).toBe(organizationHue('fsb'));
    expect(accentHue(25, 'fsb')).toBe(25);
    expect(organizationHue('somebody')).toBe(245);
  });
});

describe('the size of the text (an idea borrowed from LEX)', () => {
  it('zooms the overlay to the size chosen, keeps it, and back to 100% leaves the page as it was', async () => {
    const { platform, user } = await renderApp();
    await openLook(user);
    const sizes = screen.getByRole('radiogroup', { name: 'Размер текста' });
    expect(within(sizes).getAllByRole('radio').map((r) => r.textContent)).toEqual(['90%', '100%', '115%', '130%']);
    expect(within(sizes).getByRole('radio', { name: '100%' })).toBeChecked();
    await user.click(within(sizes).getByRole('radio', { name: '130%' }));
    expect(root().style.getPropertyValue('zoom')).toBe('1.3');
    expect(platform.settings.get(SCALE_KEY)).toBe(1.3);
    await user.click(within(sizes).getByRole('radio', { name: '100%' }));
    expect(root().style.getPropertyValue('zoom')).toBe('');
  });
});

describe('the blur behind the glass, for the FPS', () => {
  it('turns off at once, everywhere — the pinned cards and the quick bar too — and stays off', async () => {
    const { platform, user } = await renderApp();
    await openLook(user);
    const blur = screen.getByRole('checkbox', { name: 'Размытие фона' });
    expect(blur).toBeChecked();
    expect(root().dataset.blur).toBeUndefined();
    await user.click(blur);
    expect(root().dataset.blur).toBe('off');
    expect(platform.settings.get(BLUR_KEY)).toBe(false);
    expect(platform.calls.filter((c) => c.method === 'setPinLook').at(-1)?.args[0]).toMatchObject({ blur: false });

    const settings = Object.fromEntries(platform.settings);
    cleanup();
    delete root().dataset.blur;
    await renderApp({ settings });
    await vi.waitFor(() => expect(root().dataset.blur).toBe('off'));
  });
});
