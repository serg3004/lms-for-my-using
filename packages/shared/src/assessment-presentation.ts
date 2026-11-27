import { z } from 'zod';
import { richTextSchema } from './rich-text.js';

export const assessmentFonts = {
  system: 'system-ui, sans-serif',
  arial: 'Arial, sans-serif',
  georgia: 'Georgia, serif',
  verdana: 'Verdana, sans-serif',
} as const;

export const assessmentFontSchema = z.enum(['system', 'arial', 'georgia', 'verdana']);

export const assessmentThemeSchema = z.object({
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  headingFont: assessmentFontSchema.optional(),
  bodyFont: assessmentFontSchema.optional(),
}).strict();

export const assessmentPresentationSchema = z.object({
  titleScreen: z.boolean().optional(),
  finalScreen: z.enum(['results', 'message', 'none']).optional(),
  completionMessage: richTextSchema(2000).nullable().optional(),
  theme: assessmentThemeSchema.optional(),
}).strict();

export type AssessmentPresentation = z.infer<typeof assessmentPresentationSchema>;
export type AssessmentTheme = z.infer<typeof assessmentThemeSchema>;

export function assessmentAccentContrast(hex: string) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  const white = 1.05 / (luminance + 0.05);
  const black = (luminance + 0.05) / 0.05;
  return { white, foreground: white >= black ? '#fff' : '#000' };
}
