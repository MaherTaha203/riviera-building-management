import { db, auditLogTable } from "@workspace/db";
import { JwtPayload } from "./auth";

export async function logAction(
  user: JwtPayload,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string
): Promise<void> {
  await db.insert(auditLogTable).values({
    action,
    entityType,
    entityId: entityId ?? null,
    userId: user.userId,
    userName: user.name,
    details: details ?? null,
  });
}
