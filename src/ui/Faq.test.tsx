import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('«Частые вопросы»', () => {
  it('are a part of the settings; a question opens its answer', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const settings = screen.getByRole('group', { name: 'Настройки' });
    expect(within(within(settings).getByRole('navigation', { name: 'Разделы настроек' })).getByRole('button', { name: 'Частые вопросы' })).toBeInTheDocument();

    const faq = within(settings).getByRole('region', { name: 'Частые вопросы' });
    const question = within(faq).getByText('Почему ассистента не видно поверх игры?');
    const item = question.closest('details')!;
    expect(item).not.toHaveAttribute('open');
    await user.click(question);
    expect(item).toHaveAttribute('open');
    expect(item).toHaveTextContent('Оконный без рамки');
  });

  it('end with the way to ask the rest: the Discord server, opened in the browser', async () => {
    const { user, platform } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const faq = within(screen.getByRole('group', { name: 'Настройки' })).getByRole('region', { name: 'Частые вопросы' });
    expect(faq).toHaveTextContent('Не нашли ответа');
    await user.click(within(faq).getByRole('button', { name: 'Написать в Discord' }));
    expect(platform.calls.at(-1)).toEqual({ method: 'openExternal', args: ['https://discord.gg/VBNn86EmDd'] });
  });
});
