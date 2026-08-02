import { slugify } from '../../shared/slugify.js';

export type MaterialKind = 'file' | 'link';
export type MaterialStatus = 'active' | 'archived';

export type MaterialForm = {
  title: string;
  kind: MaterialKind;
  fileUrl: string;
  fileName: string;
  description: string;
};

export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'success' }
  | { status: 'error'; message: string };

export type UploadAction =
  | { type: 'start' }
  | { type: 'progress'; progress: number }
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'reset' };

export const EMPTY_MATERIAL_FORM: MaterialForm = {
  title: '', kind: 'link', fileUrl: '', fileName: '', description: '',
};

export function validateMaterialForm(form: MaterialForm): { title?: string; fileUrl?: string } {
  const errors: { title?: string; fileUrl?: string } = {};
  if (!form.title.trim() || !slugify(form.title)) errors.title = 'invalid';
  if (!form.fileUrl.trim()) errors.fileUrl = 'required';
  return errors;
}

export function uploadReducer(_state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'start': return { status: 'uploading', progress: 0 };
    case 'progress': return { status: 'uploading', progress: Math.max(0, Math.min(100, action.progress)) };
    case 'success': return { status: 'success' };
    case 'error': return { status: 'error', message: action.message };
    case 'reset': return { status: 'idle' };
  }
}

