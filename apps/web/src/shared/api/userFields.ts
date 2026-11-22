import { apiRequest } from '../apiClient.js';

/** PR 500: custom user fields as the API of PR 499 returns them. */
export const FIELD_LANGUAGES = ['ru', 'en', 'kk', 'zh'] as const;
export type FieldLanguage = (typeof FIELD_LANGUAGES)[number];
export type FieldLabels = Record<FieldLanguage, string>;
export type FieldType = 'text' | 'number' | 'date' | 'list' | 'phone' | 'boolean';
export type FieldOption = { key: string; labels: FieldLabels; archived?: boolean };
export type FieldViewer = 'manager' | 'self';

/** What the settings page shows: the definition with its rights lists and how many people hold a value. */
export type UserFieldDefinition = {
  id: string; key: string; labels: FieldLabels; type: FieldType; required: boolean; unique: boolean; searchable: boolean;
  options: FieldOption[] | null; visibleTo: FieldViewer[]; editableBy: FieldViewer[]; sortOrder: number; archived: boolean; valueCount?: number;
};

/** What a form, a list or an import sees: the same fields, where `editable` (absent for an administrator = true) says whether the caller may change the value. */
export type UserFieldView = {
  key: string; labels: FieldLabels; type: FieldType; required: boolean; unique: boolean; searchable: boolean;
  options: FieldOption[] | null; sortOrder: number; editable?: boolean;
};

export type CustomFieldValues = Record<string, string | number | boolean>;
export type UserFieldInput = {
  key?: string; type?: FieldType; labels: FieldLabels; required: boolean; unique: boolean; searchable: boolean;
  options?: FieldOption[]; visibleTo: FieldViewer[]; editableBy: FieldViewer[];
};

export const listUserFields = (includeArchived: boolean) => apiRequest<{ items: UserFieldDefinition[] }>(`/user-fields?includeArchived=${includeArchived}`);
export const createUserField = (input: UserFieldInput) => apiRequest<UserFieldDefinition>('/user-fields', { method: 'POST', body: JSON.stringify(input) });
export const updateUserField = (key: string, input: Omit<UserFieldInput, 'key' | 'type'>) => apiRequest<UserFieldDefinition>(`/user-fields/${key}`, { method: 'PATCH', body: JSON.stringify(input) });
export const archiveUserField = (key: string) => apiRequest<UserFieldDefinition>(`/user-fields/${key}/archive`, { method: 'POST', body: JSON.stringify({}) });
export const restoreUserField = (key: string) => apiRequest<UserFieldDefinition>(`/user-fields/${key}/restore`, { method: 'POST', body: JSON.stringify({}) });
export const deleteUserField = (key: string) => apiRequest<{ deleted: boolean; valueCount: number }>(`/user-fields/${key}`, { method: 'DELETE' });
export const reorderUserFields = (keys: string[]) => apiRequest<unknown>('/user-fields/order', { method: 'PUT', body: JSON.stringify({ keys }) });
export const applyUserFieldTemplate = () => apiRequest<{ created: string[] }>('/user-fields/template', { method: 'POST', body: JSON.stringify({}) });
export const getVisibleUserFields = () => apiRequest<{ items: UserFieldView[] }>('/user-fields/visible');
export const getUserFieldsForUsers = () => apiRequest<{ items: UserFieldView[] }>('/user-fields/for-users');
