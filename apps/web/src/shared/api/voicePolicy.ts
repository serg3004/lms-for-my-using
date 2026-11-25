import { apiRequest } from '../apiClient.js';

/** PR 511: what the organization allows in checklist comments. `version` is the one the administrator saw (409 when stale). */
export type VoicePolicy = { dictationEnabled: boolean; voiceNotesEnabled: boolean; maxSeconds: number; perComment: number; version: number };
/** The same without the version, for the checklist builder (anyone who edits checklists). */
export type ChecklistInputPolicy = Omit<VoicePolicy, 'version'>;
export type ChecklistInputMode = 'inherit' | 'on' | 'off';

export const getVoicePolicy = (organizationId: string) => apiRequest<VoicePolicy>(`/organizations/${encodeURIComponent(organizationId)}/voice`);
export const saveVoicePolicy = (organizationId: string, policy: VoicePolicy) =>
  apiRequest<VoicePolicy>(`/organizations/${encodeURIComponent(organizationId)}/voice`, { method: 'PATCH', body: JSON.stringify(policy) });
export const getChecklistInputPolicy = () => apiRequest<ChecklistInputPolicy>('/checklists/input-policy');
