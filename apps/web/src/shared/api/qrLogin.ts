import { apiRequest } from '../apiClient.js';

import type { CurrentUser } from './types.js';

/** PR 505: sign-in on a device without a password, confirmed on a phone that is already signed in. */
export type QrStart = { code: string; pollToken: string; expiresAt: string };
export type QrStatus = { status: 'pending' | 'denied' | 'expired' } | { status: 'approved'; accessToken: string; user: CurrentUser };
export type QrRequestInfo = { deviceLabel: string | null; ipMasked: string | null; createdAt: string; expiresAt: string };
export type QrLoginPolicy = { enabled: boolean; sessionHours: number; roles: string[] };

const send = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export const startQrLogin = () => apiRequest<QrStart>('/auth/qr/start', send({}));
export const getQrLoginStatus = (pollToken: string, signal?: AbortSignal) => apiRequest<QrStatus>('/auth/qr/status', { ...send({ pollToken }), ...(signal ? { signal } : {}) });
export const inspectQrLogin = (code: string) => apiRequest<QrRequestInfo>('/auth/qr/inspect', send({ code }));
export const approveQrLogin = (code: string) => apiRequest<{ approved: true }>('/auth/qr/approve', send({ code }));
export const denyQrLogin = (code: string) => apiRequest<{ denied: true }>('/auth/qr/deny', send({ code }));

export const getQrLoginPolicy = (organizationId: string) => apiRequest<QrLoginPolicy>(`/organizations/${encodeURIComponent(organizationId)}/qr-login`);
export const saveQrLoginPolicy = (organizationId: string, policy: QrLoginPolicy) =>
  apiRequest<QrLoginPolicy>(`/organizations/${encodeURIComponent(organizationId)}/qr-login`, { method: 'PATCH', body: JSON.stringify(policy) });
