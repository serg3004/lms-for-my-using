import { apiRequest } from '../apiClient.js';

import type { CurrentUser } from './types.js';

/** PR 506: the QR badge of an employee. The first scan asks whether a PIN is needed; the second one carries it. */
export type BadgeLoginAnswer = { status: 'pinRequired' } | { status: 'ok'; accessToken: string; user: CurrentUser };
export type OwnBadge = { badge: { issuedAt: string; lastUsedAt: string | null } | null; pinRequired: boolean };
export type IssuedBadge = { userId: string; token: string; pin: string; firstName: string; lastName: string; middleName: string | null; employeeNumber: string | null };
export type BadgeState = { badge: { state: 'active' | 'revoked' | 'lost'; issuedAt: string; revokedAt: string | null; lastUsedAt: string | null; pinLockedUntil: string | null } | null };
export type BadgePolicy = { pinRequired: boolean; idleMinutes: number };

const send = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const badgeLogin = (token: string, pin?: string) => apiRequest<BadgeLoginAnswer>('/auth/badge/login', send('POST', pin === undefined ? { token } : { token, pin }));
export const getOwnBadge = () => apiRequest<OwnBadge>('/auth/me/badge');
export const reportOwnBadgeLost = () => apiRequest<{ lost: true }>('/auth/me/badge/lost', send('POST'));
export const changeOwnBadgePin = (pin: string) => apiRequest<{ changed: true }>('/auth/me/badge/pin', send('PUT', { pin }));

export const issueBadges = (userIds: string[]) => apiRequest<{ items: IssuedBadge[]; skipped: number }>('/users/badges', send('POST', { userIds }));
export const getBadgeState = (userId: string) => apiRequest<BadgeState>(`/users/${encodeURIComponent(userId)}/badge`);
export const revokeBadge = (userId: string) => apiRequest<{ closed: boolean }>(`/users/${encodeURIComponent(userId)}/badge`, send('DELETE'));
export const resetBadgePin = (userId: string) => apiRequest<{ pin: string }>(`/users/${encodeURIComponent(userId)}/badge/pin-reset`, send('POST'));

export const getBadgePolicy = (organizationId: string) => apiRequest<BadgePolicy>(`/organizations/${encodeURIComponent(organizationId)}/badge`);
export const saveBadgePolicy = (organizationId: string, policy: BadgePolicy) =>
  apiRequest<BadgePolicy>(`/organizations/${encodeURIComponent(organizationId)}/badge`, send('PATCH', policy));
