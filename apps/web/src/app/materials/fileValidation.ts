export const MAX_MATERIAL_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const ACCEPTED_MATERIAL_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export type MaterialFileValidationError = 'unsupported-type' | 'empty' | 'too-large';

export function validateMaterialFile(file: File): MaterialFileValidationError | null {
  if (!ACCEPTED_MATERIAL_FILE_TYPES.includes(file.type as (typeof ACCEPTED_MATERIAL_FILE_TYPES)[number])) {
    return 'unsupported-type';
  }
  if (file.size === 0) return 'empty';
  if (file.size > MAX_MATERIAL_FILE_SIZE_BYTES) return 'too-large';
  return null;
}
