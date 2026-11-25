import type { PrismaService } from '../database/prisma.service.js';

/**
 * PR 511: what an organization allows in checklist comments (dictation, voice recording) and how one checklist
 * refines it. Defaults: dictation on, voice off. The limits of PR 509 are the upper bounds of the organization's values.
 */
export const voiceSecondsRange = { min: 5, max: 120, default: 120 } as const;
export const voicePerCommentRange = { min: 1, max: 3, default: 3 } as const;

export type ChecklistInputMode = 'inherit' | 'on' | 'off';
export const checklistInputModes = ['inherit', 'on', 'off'] as const;

export type VoicePolicy = { dictationEnabled: boolean; voiceNotesEnabled: boolean; maxSeconds: number; perComment: number; version: number };
/** What a filling screen needs: the organization's policy already combined with the checklist's mode. */
export type EffectiveVoice = { dictation: boolean; voiceNotes: boolean; maxSeconds: number; perComment: number };

export async function loadVoicePolicy(prisma: Pick<PrismaService, 'organization'>, organizationId: string): Promise<VoicePolicy> {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { dictationEnabled: true, voiceNotesEnabled: true, voiceNoteMaxSeconds: true, voiceNotesPerComment: true, voiceSettingsVersion: true },
  });
  return {
    dictationEnabled: organization?.dictationEnabled ?? true,
    voiceNotesEnabled: organization?.voiceNotesEnabled ?? false,
    maxSeconds: organization?.voiceNoteMaxSeconds ?? voiceSecondsRange.default,
    perComment: organization?.voiceNotesPerComment ?? voicePerCommentRange.default,
    version: organization?.voiceSettingsVersion ?? 1,
  };
}

/** `off` of the checklist always wins; `on` and `inherit` both need the organization to allow the mode. */
export function combineMode(organizationAllows: boolean, mode: ChecklistInputMode | null | undefined): boolean {
  return organizationAllows && mode !== 'off';
}

export function effectiveVoice(policy: VoicePolicy, modes: { dictationMode?: ChecklistInputMode | null; voiceNotesMode?: ChecklistInputMode | null }): EffectiveVoice {
  return {
    dictation: combineMode(policy.dictationEnabled, modes.dictationMode),
    voiceNotes: combineMode(policy.voiceNotesEnabled, modes.voiceNotesMode),
    maxSeconds: policy.maxSeconds,
    perComment: policy.perComment,
  };
}
