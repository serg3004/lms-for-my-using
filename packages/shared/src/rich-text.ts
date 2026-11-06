import { z } from 'zod';
import { DESCRIPTION_MARKUP_LIMIT, descriptionText, sanitizeDescription } from './checklist-description.js';

export const plainText = descriptionText;
/** Shared wire contract: clean first, count visible characters, bound markup independently. */
export const richTextSchema = (limit: number, minimum = 0) => z.string().trim()
  .max(DESCRIPTION_MARKUP_LIMIT).transform(sanitizeDescription)
  .refine((value) => value.length <= DESCRIPTION_MARKUP_LIMIT && plainText(value).trim().length >= minimum && plainText(value).length <= limit,
    `Text must contain ${minimum}–${limit} visible characters`);
