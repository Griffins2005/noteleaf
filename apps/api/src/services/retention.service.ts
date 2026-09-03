import type { PrismaClient } from '@prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Cutoff instant: sessions last updated before this are expired. */
export function retentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/** Prisma filter for sessions that have outlived a user's retention window. */
export function expiredSessionWhere(
  userUuid: string,
  days: number,
  now = new Date(),
) {
  return {
    userUuid,
    updatedAt: { lt: retentionCutoff(days, now) },
    status: { not: 'RECORDING' },
  };
}

/** Delete expired sessions for one user. No-op when retention is forever. */
export async function purgeExpiredSessionsForUser(
  db: PrismaClient,
  userId: string,
): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { retentionDays: true },
  });
  if (!user?.retentionDays) return 0;

  const result = await db.session.deleteMany({
    where: expiredSessionWhere(userId, user.retentionDays),
  });
  return result.count;
}

/** Sweep every user who has a finite retention setting. */
export async function purgeExpiredSessions(
  db: PrismaClient,
): Promise<{ deleted: number; users: number }> {
  const users = await db.user.findMany({
    where: { retentionDays: { not: null } },
    select: { id: true, retentionDays: true },
  });

  let deleted = 0;
  for (const user of users) {
    if (!user.retentionDays) continue;
    const result = await db.session.deleteMany({
      where: expiredSessionWhere(user.id, user.retentionDays),
    });
    deleted += result.count;
  }

  return { deleted, users: users.length };
}
