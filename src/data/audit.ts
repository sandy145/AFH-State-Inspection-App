import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIpAddress } from "@/lib/session";
import type { SessionUser } from "@/lib/session";

/**
 * Audit log writer (§21).
 *
 * The audit table is append-only. This module offers `record` and nothing else:
 * there is no update or delete helper anywhere in the codebase, and none should
 * be added. Audit rows outlive the records they describe, so they carry the
 * actor's email, role and the case number denormalized — a row must still be
 * readable if surrounding records change.
 */
export type AuditAction =
  | "USER_SIGNED_IN"
  | "USER_SIGN_IN_FAILED"
  | "USER_SIGNED_OUT"
  | "INSPECTION_CREATED"
  | "INSPECTION_STATUS_CHANGED"
  | "INSPECTION_REASSIGNED"
  | "FINDING_CREATED"
  | "FINDING_STATUS_CHANGED"
  | "EVIDENCE_REQUESTED"
  | "EVIDENCE_REQUEST_CANCELLED"
  | "EVIDENCE_UPLOADED"
  | "EVIDENCE_VIEWED"
  | "EVIDENCE_DOWNLOADED"
  | "EVIDENCE_REVIEWED"
  | "MESSAGE_POSTED"
  | "CONSULTATION_ISSUED"
  | "CITATION_CREATED"
  | "CITATION_FINALIZED"
  | "CITATION_MODIFIED"
  | "CITATION_RESCINDED"
  | "CITATION_FINALIZATION_BLOCKED"
  | "ADMINISTRATIVE_OVERRIDE"
  | "OVERRIDE_APPROVED"
  | "CORRECTION_SUBMITTED"
  | "CORRECTION_REVIEWED"
  | "IDR_REQUESTED"
  | "IDR_STATUS_CHANGED"
  | "FOLLOW_UP_SCHEDULED"
  | "FOLLOW_UP_COMPLETED"
  | "DEADLINE_MODIFIED"
  | "DEADLINE_RULE_MODIFIED"
  | "CONFIGURATION_CHANGED"
  | "USER_CREATED"
  | "USER_MODIFIED"
  | "CASE_CLOSED";

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  caseNumber?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
}

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Writes an audit row. Pass the transaction client when auditing alongside a
 * state change so the two commit together — an audited action that rolled back,
 * or a change with no audit row, are both wrong.
 */
export async function record(
  actor: SessionUser | null,
  input: AuditInput,
  client: Client = prisma,
): Promise<void> {
  await client.auditEvent.create({
    data: {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: actor?.role ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      caseNumber: input.caseNumber ?? null,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue ?? null,
      reason: input.reason ?? null,
      ipAddress: await clientIpAddress().catch(() => null),
      userAgent: null,
    },
  });
}

/**
 * Audits an action taken with no session — a failed sign-in, a scheduled job.
 * `actorEmail` is recorded as supplied, which for a failed sign-in is an
 * unverified claim; treat it as such when reading the log.
 */
export async function recordAnonymous(
  input: AuditInput & { attemptedEmail?: string },
  client: Client = prisma,
): Promise<void> {
  await client.auditEvent.create({
    data: {
      actorId: null,
      actorEmail: input.attemptedEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      caseNumber: input.caseNumber ?? null,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue ?? null,
      reason: input.reason ?? null,
      ipAddress: await clientIpAddress().catch(() => null),
    },
  });
}

/** Timeline entries are the human-readable companion to the audit row (§20). */
export async function timeline(
  client: Client,
  input: {
    inspectionId: string;
    findingId?: string | null;
    actorId?: string | null;
    eventType: string;
    description: string;
    occurredAt?: Date;
  },
): Promise<void> {
  await client.timelineEvent.create({
    data: {
      inspectionId: input.inspectionId,
      findingId: input.findingId ?? null,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      description: input.description,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}
