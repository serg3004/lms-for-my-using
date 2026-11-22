import type { ActivationQr } from './types.js';
import { apiRequest } from '../apiClient.js';

import type {
  CurrentUser,
  EmployeeLoginInput,
  IdentityActivationInput,
  LoginInput,
  LoginResponse,
  PasswordResetAcceptedResponse,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  UserPreferencesInput,
} from './types.js';

export function login(input: LoginInput | EmployeeLoginInput) {
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

export function inspectActivationQr(qr: ActivationQr, signal: AbortSignal) {
  return apiRequest<{ organizationId: string; organizationName: string }>('/auth/activate/qr', {
    method: 'POST',
    body: JSON.stringify(qr),
    signal,
  });
}

/** PR 501: public; any mismatch answers "data not found" (400). */
export function activateByIdentity(input: IdentityActivationInput) {
  return apiRequest<PasswordResetAcceptedResponse>('/auth/activate', {
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

/** PR 496: the fields a person edits in their own profile; `version` is the one last read (a different one is a 409). */
export type OwnProfile = { phone: string | null; locale: string; timezone: string; aboutMe: string | null; hasPhoto: boolean; version: number; /** PR 500: custom field values the person may see. */ customFields?: Record<string, string | number | boolean> };

export function getOwnProfile() {
  return apiRequest<OwnProfile>('/auth/me/profile');
}

export function updateOwnProfile(input: { version: number; phone?: string | null; timezone?: string; aboutMe?: string | null; customFields?: Record<string, string | boolean | null> }) {
  return apiRequest<OwnProfile>('/auth/me/profile', { method: 'PATCH', body: JSON.stringify(input) });
}

export function uploadOwnPhoto(file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<OwnProfile>('/auth/me/photo', { method: 'POST', body: form });
}

export function removeOwnPhoto() {
  return apiRequest<OwnProfile>('/auth/me/photo', { method: 'DELETE' });
}
