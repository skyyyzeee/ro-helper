import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PACKS } from '../data/bundled';
import { FavoriteIcon, OrganizationIcon, organizationSymbol, SearchIcon } from './icons';

describe('icons', () => {
  it('draws Material Symbols in the current colour, at the size asked', () => {
    const { container } = render(<SearchIcon size={24} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 -960 960 960');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it('gives every organisation of every server a badge of its own', () => {
    for (const pack of Object.values(PACKS)) {
      for (const organization of pack.organizations) {
        if (organization.id === 'none') continue;
        expect({ server: pack.server.id, id: organization.id, symbol: organizationSymbol(organization.id) }).not.toMatchObject({ symbol: 'person' });
      }
    }
    const { container } = render(<OrganizationIcon id="mvd" />);
    expect(container.querySelector('path')).toBeInTheDocument();
  });

  it('keeps the outline and the filled star of a favourite, for CSS to show one', () => {
    const { container } = render(<FavoriteIcon />);
    expect([...container.querySelectorAll('path')].map((p) => p.getAttribute('class'))).toEqual(['icon-off', 'icon-on']);
  });
});
