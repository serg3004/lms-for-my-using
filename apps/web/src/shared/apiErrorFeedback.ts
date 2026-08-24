import { ApiClientError } from './apiClient.js';

type Translate = (key: string, fallback: string) => string;

const tooManyRequestsCode = 'TOO_MANY_REQUESTS';
const genericLoginErrorKey = 'login.errors.generic';
const invalidCredentialsLoginErrorKey = 'login.errors.invalidCredentials';
const tooManyRequestsLoginErrorKey = 'login.errors.tooManyRequests';

export function getLoginErrorMessage(error: unknown, t: Translate) {
  if (!(error instanceof ApiClientError)) {
    return t(genericLoginErrorKey, 'Login failed');
  }

  if (error.status === 429 || error.code === tooManyRequestsCode) {
    return t(tooManyRequestsLoginErrorKey, 'Too many attempts. Please wait and try again.');
  }

  if (error.code === 'AUTH_INVALID_CREDENTIALS') {
    return t(invalidCredentialsLoginErrorKey, 'Invalid organization, email, or password.');
  }

  return t(genericLoginErrorKey, 'Login failed');
}
