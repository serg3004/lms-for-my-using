import { apiRequest } from '../apiClient.js';
import type { ChecklistInstanceSummary } from './types.js';

/** PR 467: the guest side of a checklist link. No session; the token names the sheet and the pass key names one pass. */
export type PublicChecklistFront = {
  title: string;
  description: string | null;
  criteriaCount: number;
  photoRequiredCount: number;
  guestNameRequired: boolean;
  guestPhotosAllowed: boolean;
  audience: 'registered' | 'everyone';
};
export type PublicCaptcha = { challenge: string; svg: string; expiresAt: string };
export type PublicPass = { instanceId: string; passKey: string; instance: ChecklistInstanceSummary };
export type PublicItemInput = { checked?: boolean; scaleLevel?: number; photoUrl?: string; comment?: string };

const base = (token: string) => `/public/checklists/${encodeURIComponent(token)}`;
const passBase = (token: string, instanceId: string) => `${base(token)}/passes/${encodeURIComponent(instanceId)}`;
const itemBase = (token: string, instanceId: string, itemId: string) => `${passBase(token, instanceId)}/items/${encodeURIComponent(itemId)}`;
const withKey = (passKey: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'X-Guest-Pass': passKey } });
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const openPublicChecklist = (token: string) => apiRequest<PublicChecklistFront>(base(token));
export const getPublicCaptcha = (token: string) => apiRequest<PublicCaptcha>(`${base(token)}/captcha`);
export const startPublicChecklist = (token: string, input: { guestName?: string; captchaChallenge: string; captchaCode: string }) => apiRequest<PublicPass>(`${base(token)}/start`, json('POST', input));
/** A signed-in employee who followed the link: the ordinary free pass under their own account. */
export const startPublicChecklistSignedIn = (token: string) => apiRequest<ChecklistInstanceSummary>(`${base(token)}/start-signed-in`, { method: 'POST' });
export const getPublicPass = (token: string, instanceId: string, passKey: string) => apiRequest<ChecklistInstanceSummary>(passBase(token, instanceId), withKey(passKey));
export const submitPublicItem = (token: string, instanceId: string, itemId: string, passKey: string, input: PublicItemInput) => apiRequest<ChecklistInstanceSummary>(itemBase(token, instanceId, itemId), withKey(passKey, json('PATCH', input)));
export const attachPublicPhoto = (token: string, instanceId: string, itemId: string, passKey: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<ChecklistInstanceSummary>(`${itemBase(token, instanceId, itemId)}/photo`, withKey(passKey, { method: 'POST', body: form }));
};
export const finishPublicChecklist = (token: string, instanceId: string, passKey: string, input: { captchaChallenge: string; captchaCode: string }) => apiRequest<ChecklistInstanceSummary>(`${passBase(token, instanceId)}/finish`, withKey(passKey, json('POST', input)));
