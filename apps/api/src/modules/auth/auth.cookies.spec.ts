import {
  AuthCookieResponse,
  accessTokenCookieName,
  clearAuthCookies,
  csrfTokenCookieName,
  setAuthCookies,
} from './auth.cookies';

type CookieCall = [name: string, value: string, options: Record<string, unknown>];
type ClearCookieContainerContainer = [name: string, options: Record<string, unknown>];

function createResponse() {
  const cookieCalls: CookieCall[] = [];
  const clearCookieContainerContainers: ClearCookieContainerContainer[] = [];
  const response = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      cookieCalls.push([name, value, options]);
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      clearCookieContainerContainers.push([name, options]);
    },
  } satisfies AuthCookieResponse;

  return { response, cookieCalls, clearCookieContainerContainers };
}

describe('auth cookies', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('allows auth cookies over local HTTP outside production', () => {
    process.env.NODE_ENV = 'development';
    const { response, cookieCalls } = createResponse();

    setAuthCookies(response, 'access-token', 'csrf-token');

    expect(cookieCalls).toContainEqual([
      accessTokenCookieName,
      'access-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1',
        sameSite: 'lax',
        secure: false,
      }),
    ]);
    expect(cookieCalls).toContainEqual([
      csrfTokenCookieName,
      'csrf-token',
      expect.objectContaining({}),
    ]);
  });

  it('uses secure auth cookies in production', () => {
    process.env.NODE_ENV = 'production';
    const { response, cookieCalls } = createResponse();

    setAuthCookies(response, 'access-token', 'csrf-token');

    expect(cookieCalls).toContainEqual([
      accessTokenCookieName,
      'access-token',
      expect.objectContaining({ secure: true }),
    ]);
    expect(cookieCalls).toContainEqual([
      csrfTokenCookieName,
      'csrf-token',
      expect.objectContaining({ secure: true }),
    ]);
  });

  it('clears auth cookies with matching paths', () => {
    process.env.NODE_ENV = 'development';
    const { response, clearCookieContainerContainers } = createResponse();

    clearAuthCookies(response);

    expect(clearCookieContainerContainers).toContainEqual([
      accessTokenCookieName,
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1',
        secure: false,
      }),
    ]);
    expect(clearCookieContainerContainers).toContainEqual([
      csrfTokenCookieName,
      expect.objectContaining({
        httpOnly: false,
        path: '/',
        secure: false,
      }),
    ]);
  });
});
