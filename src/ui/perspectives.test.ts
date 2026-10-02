import { describe, expect, it } from 'vitest';
import type { Organization } from '../core';
import { perspectivesFor } from './ai';

const org = (kind?: 'state' | 'crime'): Organization => ({ id: kind ?? 'none', name: '', ...(kind ? { kind } : {}), documents: [] });

describe('the side a case is seen from follows the profile', () => {
  it('its own side first; an officer\'s powers for the state, the crime\'s view for the crime', () => {
    expect(perspectivesFor(org())).toEqual(['citizen', 'lawyer']);
    expect(perspectivesFor(org('state'))).toEqual(['state', 'lawyer', 'citizen']);
    expect(perspectivesFor(org('crime'))).toEqual(['crime', 'lawyer', 'citizen']);
  });
});
