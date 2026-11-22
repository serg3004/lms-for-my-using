import { apiDownloadRequest, apiRequest } from '../apiClient.js';

/** PR 507: the employee card opened by a badge scan. The badge token travels in the body, never in an address. */
export type CardBlock = 'courses' | 'certificates' | 'checklists' | 'clearance';
export type InspectorVisible = 'photo' | 'position' | 'department' | 'employeeNumber' | CardBlock;
export type DatedStatus = 'done' | 'overdue' | 'open';

export type EmployeeCard = {
  level: 'self' | 'admin' | 'manager' | 'peer' | 'inspector';
  detail: boolean;
  blocks: CardBlock[];
  subject: { name: string; hasPhoto: boolean; position?: string | null; department?: string | null; employeeNumber?: string | null; email?: string | null; phone?: string | null };
  clearance?: { ok: boolean; overdueCourses?: number; overdueChecklists?: number; revokedCertificates?: number };
  courses?: Array<{ title: string; status: DatedStatus; dueAt?: string }>;
  certificates?: Array<{ title: string; status: 'valid' | 'revoked'; issuedAt: string }>;
  checklists?: Array<{ title: string; status: DatedStatus; passed?: boolean; percentage?: number }>;
};
export type InspectorItem = { userId: string; name: string; email: string; visible: InspectorVisible[]; accessUntil: string; createdAt: string; state: 'active' | 'invited' | 'expired' | 'revoked' };

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const send = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const openEmployeeCard = (token: string) => apiRequest<EmployeeCard>('/employee-card/open', post({ token }));
export const markEmployeeCardChecked = (token: string) => apiRequest<{ checked: true; at: string }>('/employee-card/checked', post({ token }));
export const recordAnonymousScan = (token: string) => apiRequest<{ recorded: true }>('/employee-card/anonymous-scan', post({ token }));
export async function loadEmployeeCardPhoto(token: string): Promise<string> {
  const { blob } = await apiDownloadRequest('/employee-card/photo', undefined, post({ token }));
  return URL.createObjectURL(blob);
}
export const listCardViews = () => apiRequest<{ items: Array<{ viewer: string | null; at: string }> }>('/employee-card/views');

export const getCardPolicy = (organizationId: string) => apiRequest<{ blocks: CardBlock[] }>(`/employee-card/policy/${encodeURIComponent(organizationId)}`);
export const saveCardPolicy = (organizationId: string, blocks: CardBlock[]) => apiRequest<{ blocks: CardBlock[] }>(`/employee-card/policy/${encodeURIComponent(organizationId)}`, send('PATCH', { blocks }));

export const listInspectors = () => apiRequest<{ items: InspectorItem[] }>('/employee-card/inspectors');
export const createInspector = (input: { email: string; firstName: string; lastName: string; visible: InspectorVisible[]; accessUntil: string }) => apiRequest<unknown>('/employee-card/inspectors', send('POST', input));
export const revokeInspector = (userId: string) => apiRequest<{ revoked: true }>(`/employee-card/inspectors/${encodeURIComponent(userId)}`, send('DELETE'));
