import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { guestLabel, instancePersonLabel } from './guestLabel.js';

// A translator that fills the fallback, like the app does when a key has no text yet.
const t = ((key: string, fallback: string, options?: Record<string, string>) => fallback.replace('{{name}}', options?.name ?? '')) as unknown as TFunction;

describe('guestLabel (PR 468)', () => {
  it('reads "Guest: name" when the guest gave a name', () => {
    expect(guestLabel(t, 'Айдос Нурланов')).toBe('Guest: Айдос Нурланов');
  });
  it.each([null, undefined, '', '   '])('reads "Guest" without a name (%j)', (name) => {
    expect(guestLabel(t, name)).toBe('Guest');
  });
  it('uses the guest label for a guest and the fallback for an employee', () => {
    expect(instancePersonLabel(t, { isGuest: true, guestName: 'Айдос' }, () => 'user-1')).toBe('Guest: Айдос');
    expect(instancePersonLabel(t, { isGuest: false, guestName: null }, () => 'user-1')).toBe('user-1');
    expect(instancePersonLabel(t, {}, () => 'user-1')).toBe('user-1');
  });
});
