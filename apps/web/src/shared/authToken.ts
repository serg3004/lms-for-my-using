const cookieAuthCompatibilityToken = 'cookie-auth';

export function getAuthToken() {
  return cookieAuthCompatibilityToken;
}

export function setAuthToken(token?: string | null) {
  void token;
  // Access tokens are handled by HttpOnly cookies set by the API.
}

export function clearAuthToken() {
  // Kept as a no-op for compatibility with older imports.
}
