import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('the wiki of Russia Online', () => {
  it('opens from the side column: its catalogs, a search of the whole wiki, a thing\'s page with its source', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Вики Russia Online' }));
    const wiki = await screen.findByRole('region', { name: 'Вики' }, { timeout: 5000 });
    expect(within(wiki).getByRole('navigation', { name: 'Разделы вики' })).toHaveTextContent('Транспорт');
    expect(within(wiki).getByRole('heading', { name: /^Транспорт/ })).toBeInTheDocument();

    await user.type(within(wiki).getByRole('searchbox', { name: 'Поиск по вики' }), 'samara');
    await user.click(await within(wiki).findByRole('button', { name: 'TAZ 2114' }));
    const page = within(wiki).getByRole('article', { name: 'TAZ 2114' });
    expect(page).toHaveTextContent('LADA Samara');
    expect(page).toHaveTextContent('Гос. стоимость');
    expect(page).toHaveTextContent('Данные и изображения: вики Russia Online. Все права принадлежат Russia Online.');
    await user.click(within(page).getByRole('button', { name: /Открыть на вики/ }));
    expect(platform.calls.at(-1)).toEqual({ method: 'openExternal', args: ['https://wiki.russia.online/ru/vehicles/car/samara'] });
  });
});
