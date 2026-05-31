export function getAuthToken() {
  return null;
}

export function setAuthToken(_accessToken: string) {
  // Access tokens are handled by HttpOnly cookies set by the API.
}

export function clearAuthToken() {
  // Kept as a no-op for compatibility with older imports.
}
