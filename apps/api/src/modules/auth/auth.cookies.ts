import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const accessTokenCookieName = 'lms_access_token';
export const csrfTokenCookieName = 'lms_csrf_token';
export const csrfHeaderName = 'x-csrf-token';

const cookiePath = '/api/v1';
const accessTokenCookieMaxAgeMs = 60 * 60 * 1000;
const csrfTokenByteLength = 32;
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

type HeaderValue = string | string[] | undefined;

export type AuthHeaders = {
  authorization?: HeaderValue;
  cookie?: HeaderValue;
  [csrfHeaderName]?: HeaderValue;
};

export type AuthCookieResponse = {
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
};

export type AccessTokenSource = 'bearer' | 'cookie';

export type ResolvedAccessToken = {
  token: string;
  source: AccessTokenSource;
};

function getFirstHeaderValue(value: HeaderValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parseCookieHeader(cookieHeader: HeaderValue) {
  const cookie = getFirstHeaderValue(cookieHeader);

  if (!cookie) {
    return new Map<string, string>();
  }

  return new Map(
    cookie
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');

        if (separatorIndex === -1) {
          return [part, ''] as const;
        }

        return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)] as const;
      }),
  );
}

function parseBearerToken(authorizationHeader: HeaderValue) {
  const authorization = getFirstHeaderValue(authorizationHeader);
  const bearerPrefix = 'Bearer ';

  if (!authorization?.startsWith(bearerPrefix)) {
    return undefined;
  }

  const token = authorization.slice(bearerPrefix.length).trim();

  return token || undefined;
}

function getCookieValue(cookieHeader: HeaderValue, cookieName: string) {
  return parseCookieHeader(cookieHeader).get(cookieName);
}

function hasMatchingCsrfToken(headers: AuthHeaders) {
  const headerToken = getFirstHeaderValue(headers[csrfHeaderName]);
  const cookieToken = getCookieValue(headers.cookie, csrfTokenCookieName);

  if (!headerToken || !cookieToken) {
    return false;
  }

  const headerTokenBuffer = Buffer.from(headerToken);
  const cookieTokenBuffer = Buffer.from(cookieToken);

  return headerTokenBuffer.length === cookieTokenBuffer.length && timingSafeEqual(headerTokenBuffer, cookieTokenBuffer);
}

export function createCsrfToken() {
  return randomBytes(csrfTokenByteLength).toString('hex');
}

export function resolveAccessToken(headers: AuthHeaders): ResolvedAccessToken {
  const bearerToken = parseBearerToken(headers.authorization);

  if (bearerToken) {
    return { token: bearerToken, source: 'bearer' };
  }

  const cookieToken = getCookieValue(headers.cookie, accessTokenCookieName);

  if (cookieToken) {
    return { token: cookieToken, source: 'cookie' };
  }

  throw new UnauthorizedException('Missing bearer token');
}

export function assertValidCsrf(headers: AuthHeaders, method: string | undefined, tokenSource: AccessTokenSource) {
  if (tokenSource !== 'cookie' || safeMethods.has(method ?? 'GET')) {
    return;
  }

  if (!hasMatchingCsrfToken(headers)) {
    throw new ForbiddenException('Missing or invalid CSRF token');
  }
}

export function setAuthCookies(response: AuthCookieResponse, accessToken: string, csrfToken: string) {
  response.cookie(accessTokenCookieName, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: cookiePath,
    maxAge: accessTokenCookieMaxAgeMs,
  });
  response.cookie(csrfTokenCookieName, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: true,
    path: cookiePath,
    maxAge: accessTokenCookieMaxAgeMs,
  });
}

export function clearAuthCookies(response: AuthCookieResponse) {
  const options = {
    sameSite: 'lax',
    secure: true,
    path: cookiePath,
  };

  response.clearCookie(accessTokenCookieName, { ...options, httpOnly: true });
  response.clearCookie(csrfTokenCookieName, { ...options, httpOnly: false });
}
