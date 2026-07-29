/// <reference types="jest" />

import { parseAdminDemoSeedArgs } from './admin-demo-seed';

describe('parseAdminDemoSeedArgs', () => {
  it('uses check mode by default', () => {
    expect(parseAdminDemoSeedArgs([])).toEqual({ apply: false });
  });

  it('allows apply mode with the exact confirmation', () => {
    expect(parseAdminDemoSeedArgs(['--apply', '--confirm=demo-company'])).toEqual({ apply: true });
  });

  it('rejects apply mode without the exact confirmation', () => {
    expect(() => parseAdminDemoSeedArgs(['--apply'])).toThrow(
      'Apply requires --confirm=demo-company',
    );
  });
});
