import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WikiPicture } from './WikiPicture';

describe('wiki media states', () => {
  it('explains absent media and distinguishes video previews', () => {
    const { rerender } = render(<WikiPicture className="wiki__img" alt="" />);
    expect(screen.getByRole('img', { name: 'Нет изображения' })).toBeInTheDocument();
    rerender(<WikiPicture src="https://example.test/move.webm" className="wiki__img" alt="" />);
    expect(screen.getByRole('img', { name: 'Анимация' })).toBeInTheDocument();
  });
  it('shows loading, reports a failed image and recovers when its source changes', () => {
    const failed = vi.fn();
    const { rerender } = render(<WikiPicture src="https://example.test/a.png" className="wiki__img" alt="Фото" onUnavailable={failed} />);
    expect(screen.getByText('Загрузка изображения…')).toBeInTheDocument();
    fireEvent.error(screen.getByRole('img', { name: 'Фото' }));
    expect(screen.getByRole('img', { name: 'Фото: Изображение недоступно' })).toBeInTheDocument();
    expect(failed).toHaveBeenCalledTimes(1);
    rerender(<WikiPicture src="https://example.test/b.png" className="wiki__img" alt="Фото" onUnavailable={failed} />);
    fireEvent.load(screen.getByRole('img', { name: 'Фото' }));
    expect(screen.queryByText('Загрузка изображения…')).not.toBeInTheDocument();
    expect(screen.queryByText('Изображение недоступно')).not.toBeInTheDocument();
  });
});
