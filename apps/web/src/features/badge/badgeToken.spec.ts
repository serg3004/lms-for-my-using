import { describe, expect, it } from 'vitest';

import { badgeLink, badgeTokenFrom } from './badgeToken';

const token = 'T'.repeat(43);

describe('badgeTokenFrom', () => {
  it('takes a bare token, a link with the token after #, and trims spaces and a scanner line end', () => {
    expect(badgeTokenFrom(token)).toBe(token);
    expect(badgeTokenFrom(` ${token}\n`)).toBe(token);
    expect(badgeTokenFrom(`https://lms.example/badge#${token}`)).toBe(token);
  });

  it('refuses anything that is not a badge token', () => {
    expect(badgeTokenFrom('')).toBeNull();
    expect(badgeTokenFrom('short')).toBeNull();
    expect(badgeTokenFrom(`${token}!`)).toBeNull();
    expect(badgeTokenFrom(`https://lms.example/badge?x=${token}`)).toBeNull();
  });

  it('builds the link with the token after # so it never reaches a server log', () => {
    expect(badgeLink(token, 'https://lms.example')).toBe(`https://lms.example/badge#${token}`);
  });
});
