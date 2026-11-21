import type { PrismaService } from '../../database/prisma.service.js';
import { passwordHistoryRange, passwordMinLengthRange, type PasswordPolicy } from '../../common/password-policy.js';
import { verifyPassword } from './passwords.js';

type PolicyDb = Pick<PrismaService, 'organization' | 'passwordHistory'>;

/** How many old hashes are ever kept per user (the policy can ask for at most this many to be remembered). */
const storedHistoryLimit = passwordHistoryRange.max;

export async function loadPasswordPolicy(db: Pick<PrismaService, 'organization'>, organizationId: string): Promise<PasswordPolicy> {
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { passwordMinLength: true, passwordHistoryCount: true } });
  return {
    minLength: organization?.passwordMinLength ?? passwordMinLengthRange.default,
    historyCount: organization?.passwordHistoryCount ?? passwordHistoryRange.default,
  };
}

/** True when `password` equals the current password or one of the previous ones, so that "the last N" includes the current one. */
export async function isPasswordReused(db: PolicyDb, user: { id: string; passwordHash: string }, password: string, historyCount: number): Promise<boolean> {
  if (historyCount <= 0) return false;
  const previous = historyCount > 1
    ? await db.passwordHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: historyCount - 1, select: { passwordHash: true } })
    : [];
  for (const hash of [user.passwordHash, ...previous.map((entry) => entry.passwordHash)]) {
    if (await verifyPassword(password, hash)) return true;
  }
  return false;
}

/** Keeps the hash that is being replaced and drops the oldest entries beyond the storage limit. */
export async function rememberReplacedPassword(db: PolicyDb, user: { id: string; organizationId: string }, replacedHash: string) {
  await db.passwordHistory.create({ data: { userId: user.id, organizationId: user.organizationId, passwordHash: replacedHash } });
  const old = await db.passwordHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, skip: storedHistoryLimit, select: { id: true } });
  if (old.length > 0) await db.passwordHistory.deleteMany({ where: { id: { in: old.map((entry) => entry.id) } } });
}
