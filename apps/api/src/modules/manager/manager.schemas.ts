import { z } from 'zod';

export const managerReminderMaxItems = 50;

export const sendManagerRemindersSchema = z.object({
  assignmentIds: z.array(z.string().uuid()).min(1).max(managerReminderMaxItems),
});

export type SendManagerRemindersInput = z.infer<typeof sendManagerRemindersSchema>;
