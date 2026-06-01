import { ApiClientError } from './apiClient.js';

type Translate = (key: string, fallback: string) => string;

const tooManyRequestsCode = 'TOO_MANY_REQUESTS';
const genericLoginErrorKey = 'login.errors.generic';
const tooManyRequestsLoginErrorKey = 'login.errors.tooManyRequests';

export function getLoginErrorMessage(error: unknown, t: Translate) {
  if (!(error instanceof ApiClientError)) {
    return t(genericLoginErrorKey, 'Login failed');
  }

  if (error.status === 429 || error.code === tooManyRequestsCode) {
    return t(tooManyRequestsLoginErrorKey, 'Too many attempts. Please wait and try again.');
  }

  return error.message || t(genericLoginErrorKey, 'Login failed');
}
