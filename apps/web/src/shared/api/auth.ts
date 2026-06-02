import { apiRequest } from '../apiClient.js';

import type { CurrentUser, LoginInput, LoginResponse } from './types.js';

export function login(input: LoginInput) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCurrentUser() {
  return apiRequest<CurrentUser>('/auth/me');
}
