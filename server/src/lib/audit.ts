import { Prisma, PrismaClient } from "@prisma/client";

// Section 15.1(c) — "an AuditLog row written in the same transaction as the
// mutation (never fire-and-forget after the response is sent)". Every
// caller passes its open `tx`, never the top-level `prisma` singleton,
// except for genuinely read-only actions which don't call this at all.
export async function writeAuditLog(
  client: PrismaClient | Prisma.TransactionClient,
  params: { actorId: string; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue }
): Promise<void> {
  await client.auditLog.create({ data: params });
}
