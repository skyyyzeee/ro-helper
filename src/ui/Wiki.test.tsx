import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { WIKI_FORMAT, type WikiData } from '../wiki/model';
import { AUTO_KEY } from './updates';
import { WIKI_MANIFEST_URL, WIKI_URL, readWiki } from './wiki';

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

describe('the wiki’s home, articles and updates', () => {
  const openWiki = async () => {
    const app = await renderApp();
    await app.user.click(screen.getByRole('button', { name: 'Вики Russia Online' }));
    return { ...app, wiki: await screen.findByRole('region', { name: 'Вики' }, { timeout: 5000 }) };
  };

  it('opens on its home: the articles, the latest update, the catalogs in four groups that lead to them', async () => {
    const { user, wiki } = await openWiki();
    for (const group of ['Транспорт', 'Персонаж', 'Имущество', 'Предметы и крафт']) expect(within(wiki).getByRole('region', { name: group })).toBeInTheDocument();
    expect(within(within(wiki).getByRole('group', { name: 'Статьи и обновления' })).getByRole('button', { name: /^Статьи/ })).toHaveTextContent(/\d+ стат/);
    expect(within(within(wiki).getByRole('group', { name: 'Статьи и обновления' })).getByRole('button', { name: /^Обновления/ })).toHaveTextContent(/Сборка/);
    await user.click(within(within(wiki).getByRole('region', { name: 'Персонаж' })).getByRole('button', { name: 'Причёски' }));
    expect(within(wiki).getByRole('heading', { name: /^Причёски/ })).toBeInTheDocument();
  });

  it('shows the articles by the wiki’s sections, and an article as written, with the pages seen on the home after', async () => {
    const { user, wiki } = await openWiki();
    await user.click(within(within(wiki).getByRole('group', { name: 'Статьи и обновления' })).getByRole('button', { name: /^Статьи/ }));
    for (const section of ['Подготовка', 'Начало игры', 'Работы', 'Фракции']) expect(within(wiki).getByRole('region', { name: section })).toBeInTheDocument();
    await user.click(within(within(wiki).getByRole('region', { name: 'Фракции' })).getByRole('button', { name: 'МВД' }));
    const page = within(wiki).getByRole('article', { name: 'МВД' });
    expect(page).toHaveTextContent('Министерство внутренних дел');
    expect(page).toHaveTextContent(/мин чтения/);
    await user.click(within(within(wiki).getByRole('navigation', { name: 'Разделы вики' })).getByRole('button', { name: 'Главная' }));
    expect(within(within(wiki).getByRole('region', { name: 'Вы смотрели' })).getByRole('button', { name: 'МВД' })).toBeInTheDocument();
  });

  it('lists the updates with what each added, changed and fixed', async () => {
    const { user, wiki } = await openWiki();
    await user.click(within(within(wiki).getByRole('group', { name: 'Статьи и обновления' })).getByRole('button', { name: /^Обновления/ }));
    const list = within(wiki).getByRole('list', { name: 'Обновления' });
    expect(within(list).getByRole('button', { name: /Сборка 4\.3760\.2057/ })).toHaveTextContent(/добавлено 3.*изменено 3.*исправлено 15/);
  });
});

describe('a newer wiki without a new version of the app', () => {
  const newer = async () => {
    const bundled = (await import('../data/wiki.json')).default as unknown as WikiData;
    const entry = { ...bundled.entries.find((e) => e.catalog === 'vehicles')!, id: 'vehicles:fresh-car', title: 'Свежая машина' };
    const data: WikiData = { ...bundled, takenAt: '2099-01-01T00:00:00.000Z', entries: [entry, ...bundled.entries] };
    return { text: JSON.stringify(data), manifest: JSON.stringify({ format: WIKI_FORMAT, takenAt: data.takenAt, count: data.entries.length }) };
  };

  it('is downloaded when the repository has one, kept for the next launch, and shown', async () => {
    const { text, manifest } = await newer();
    const { platform, user } = await renderApp({ platform: { remote: { [WIKI_MANIFEST_URL]: manifest, [WIKI_URL]: text } } });
    await user.click(screen.getByRole('button', { name: 'Вики Russia Online' }));
    const wiki = await screen.findByRole('region', { name: 'Вики' }, { timeout: 5000 });
    await user.click(within(within(wiki).getByRole('navigation', { name: 'Разделы вики' })).getByRole('button', { name: /^Транспорт/ }));
    expect(await within(wiki).findByRole('button', { name: 'Свежая машина' }, { timeout: 5000 })).toBeInTheDocument();
    expect(platform.state.laws.get('wiki')).toBe(text);
  });

  it('is not downloaded with the app\'s updates off, nor when it is no newer, nor taken broken', async () => {
    const { text, manifest } = await newer();
    const off = await renderApp({ settings: { [AUTO_KEY]: false }, platform: { remote: { [WIKI_MANIFEST_URL]: manifest, [WIKI_URL]: text } } });
    await off.user.click(screen.getByRole('button', { name: 'Вики Russia Online' }));
    await screen.findByRole('region', { name: 'Вики' }, { timeout: 5000 });
    expect(off.platform.calls.some((c) => c.method === 'download' && String(c.args[0]).includes('wiki'))).toBe(false);

    expect(readWiki(text)).toBeDefined();
    expect(readWiki(text.replace('"tags":[', '"tags":null,"x":['))).toBeUndefined();
    expect(readWiki(JSON.stringify({ ...JSON.parse(text), format: 99 }))).toBeUndefined();
    expect(readWiki('not json')).toBeUndefined();
  });
});

describe('earning on the wiki: the jobs and the calculators (data of the wiki)', () => {
  const openWiki = async () => {
    const app = await renderApp();
    await app.user.click(screen.getByRole('button', { name: 'Вики Russia Online' }));
    return { ...app, wiki: await screen.findByRole('region', { name: 'Вики' }, { timeout: 5000 }) };
  };

  it('lists the jobs a level opens, filters them by the law, and keeps the level', async () => {
    const { user, wiki, platform } = await openWiki();
    const jobs = within(wiki).getByRole('region', { name: 'Работы' });
    const open = () => within(within(jobs).getByRole('list', { name: 'Доступно' })).getAllByRole('button').map((b) => b.querySelector('.wiki__jobs-name')?.textContent);
    expect(open()).toEqual(expect.arrayContaining(['Шахтёр', 'Строитель', 'Собиратель']));
    expect(open()).not.toContain('Дальнобойщик');
    await user.click(within(jobs).getByRole('combobox', { name: 'Мой уровень' }));
    await user.click(screen.getByRole('option', { name: '10+' }));
    expect(open()).toContain('Дальнобойщик');
    expect(platform.settings.get('wiki.level')).toBe(10);
    await user.click(within(jobs).getByRole('radio', { name: 'Нелегальные' }));
    expect(open().sort()).toEqual(['Грабитель', 'Закладчик', 'Угонщик']);
  });

  it('counts a recipe for as many as wanted: the batches, every ingredient, the time', async () => {
    const { user, wiki } = await openWiki();
    await user.type(within(wiki).getByRole('searchbox', { name: 'Поиск по вики' }), 'картофель фри');
    // The dish is an item too: the recipe's card is the one under «Рецепты».
    await user.click((await within(wiki).findAllByRole('button', { name: 'Картофель Фри' })).find((card) => card.textContent?.includes('Рецепты'))!);
    const calc = within(wiki).getByRole('region', { name: 'Калькулятор' });
    const wanted = within(calc).getByRole('textbox', { name: 'Сколько нужно' });
    await user.clear(wanted);
    await user.type(wanted, '35');
    expect(calc).toHaveTextContent('4 раза · выйдет 40 шт. · 12 ч');
    expect(within(within(calc).getByRole('list', { name: 'Понадобится' })).getByText('Картошка').parentElement).toHaveTextContent('× 12');
  });
});
