const authTokenStorageKey = 'lms.accessToken';

export type AuthTokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getBrowserStorage(): AuthTokenStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function getAuthToken(storage = getBrowserStorage()) {
  return storage?.getItem(authTokenStorageKey) ?? null;
}

export function setAuthToken(accessToken: string, storage = getBrowserStorage()) {
  storage?.setItem(authTokenStorageKey, accessToken);
}

export function clearAuthToken(storage = getBrowserStorage()) {
  storage?.removeItem(authTokenStorageKey);
}
