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

export function acceptInvitation(input: PasswordResetConfirmInput) {
  return apiRequest<PasswordResetAcceptedResponse>('/auth/invitation/accept', {
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

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiRequest<unknown>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** PR 494: the person's own open sessions ("my devices") and the sign-in journal an administrator reads. */
export type DeviceSession = { id: string; deviceLabel: string | null; ipMasked: string | null; createdAt: string; lastActiveAt: string; current?: boolean };
export type LoginEvent = { id: string; outcome: 'success' | 'failed' | 'blocked' | 'locked'; deviceLabel: string | null; ipMasked: string | null; createdAt: string };

export function listOwnSessions() {
  return apiRequest<DeviceSession[]>('/auth/me/sessions');
}

export function revokeOwnSession(sessionId: string) {
  return apiRequest<{ revoked: boolean }>(`/auth/me/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export function logoutEverywhere() {
  return apiRequest<{ accepted: boolean }>('/auth/logout-all', { method: 'POST', body: JSON.stringify({}) });
}

export function getUserLoginHistory(userId: string) {
  return apiRequest<{ events: LoginEvent[]; sessions: DeviceSession[] }>(`/users/${encodeURIComponent(userId)}/login-history`);
}

export function revokeUserSession(userId: string, sessionId: string) {
  return apiRequest<{ revoked: number }>(`/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export function revokeAllUserSessions(userId: string) {
  return apiRequest<{ revoked: number }>(`/users/${encodeURIComponent(userId)}/sessions/revoke`, { method: 'POST', body: JSON.stringify({}) });
}
