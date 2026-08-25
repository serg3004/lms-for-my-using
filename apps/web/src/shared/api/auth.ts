import { apiRequest } from '../apiClient.js';

import type {
  CurrentUser,
  LoginInput,
  LoginResponse,
  PasswordResetAcceptedResponse,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  UserPreferencesInput,
} from './types.js';

export function login(input: LoginInput) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCurrentUser() {
  return apiRequest<CurrentUser>('/auth/me');
}

export function updateCurrentUserPreferences(input: UserPreferencesInput) {
  return apiRequest<CurrentUser>('/auth/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function requestPasswordReset(input: PasswordResetRequestInput) {
  return apiRequest<PasswordResetAcceptedResponse>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmPasswordReset(input: PasswordResetConfirmInput) {
  return apiRequest<PasswordResetAcceptedResponse>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
