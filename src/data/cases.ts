import "server-only";
import { prisma } from "@/lib/prisma";
import { assertTransition, FINDING_TRANSITIONS, INSPECTION_TRANSITIONS } from "@/domain/state-machines";
import { caseNumber, findingReference } from "@/domain/references";
import { DomainError } from "@/domain/types";
import type { FindingStatus, InspectionStatus, InspectionType, PotentialOutcome } from "@prisma/client";
import * as audit from "@/data/audit";
import { dispatchEmails, providerRecipients, queueNotifications, staffRecipients } from "@/data/notifications";
import type { SessionUser } from "@/lib/session";

/**
 * Inspection cases and findings (§5, §6, §11).
 *
 * Everything in the portal hangs off an inspection case, and every regulatory
 * issue is its own Finding record — never a paragraph inside a report. That is
 * what makes "what was requested, what was submitted, who reviewed it, what was
 * decided" answerable per issue rather than per inspection.
 */

export interface CreateInspectionInput {
  facilityId: string;
  type: InspectionType;
  startedAt: Date;
  leadInspectorId?: string | null;
  fieldManagerId?: string | null;
  summary?: string | null;
}

export async function createInspection(actor: SessionUser, input: CreateInspectionInput) {
  const facility = await prisma.facility.findUniqueOrThrow({
    where: { id: input.facilityId },
    select: { id: true, name: true, regionId: true },
  });

  const year = input.startedAt.getUTCFullYear();
  const sequence = (await prisma.inspection.count()) + 1;

  return prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.create({
      data: {
        caseNumber: caseNumber(year, sequence),
        facilityId: facility.id,
        regionId: facility.regionId,
        type: input.type,
        status: "IN_PROGRESS",
        leadInspectorId: input.leadInspectorId ?? actor.id,
        fieldManagerId: input.fieldManagerId ?? null,
        startedAt: input.startedAt,
        summary: input.summary ?? null,
      },
    });

    await tx.inspectionAssignment.create({
      data: {
        inspectionId: inspection.id,
        userId: input.leadInspectorId ?? actor.id,
        assignmentRole: "LEAD",
      },
    });

    if (input.fieldManagerId) {
      await tx.inspectionAssignment.create({
        data: { inspectionId: inspection.id, userId: input.fieldManagerId, assignmentRole: "FIELD_MANAGER" },
      });
    }

    await audit.record(
      actor,
      {
        action: "INSPECTION_CREATED",
        entityType: "Inspection",
        entityId: inspection.id,
        caseNumber: inspection.caseNumber,
        newValue: `${input.type} at ${facility.name}`,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: inspection.id,
      actorId: actor.id,
      eventType: "INSPECTION_STARTED",
      description: "Inspection started",
      occurredAt: input.startedAt,
    });

    return inspection;
  });
}

export async function setInspectionStatus(actor: SessionUser, inspectionId: string, status: InspectionStatus) {
  const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: inspectionId } });
  assertTransition(INSPECTION_TRANSITIONS, inspection.status, status, `Inspection ${inspection.caseNumber}`);

  await prisma.$transaction(async (tx) => {
    await tx.inspection.update({
      where: { id: inspection.id },
      data: { status, closedAt: status === "CLOSED" ? new Date() : inspection.closedAt },
    });

    await audit.record(
      actor,
      {
        action: status === "CLOSED" ? "CASE_CLOSED" : "INSPECTION_STATUS_CHANGED",
        entityType: "Inspection",
        entityId: inspection.id,
        caseNumber: inspection.caseNumber,
        previousValue: inspection.status,
        newValue: status,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: inspection.id,
      actorId: actor.id,
      eventType: "INSPECTION_STATUS_CHANGED",
      description: `Inspection moved to ${status.replace(/_/g, " ").toLowerCase()}`,
    });
  });
}

export async function reassignInspection(
  actor: SessionUser,
  inspectionId: string,
  newLeadInspectorId: string,
  reason: string,
) {
  if (!reason.trim()) {
    throw new DomainError("REASON_REQUIRED", "Record why the case is being reassigned.");
  }

  const inspection = await prisma.inspection.findUniqueOrThrow({
    where: { id: inspectionId },
    include: { leadInspector: { select: { fullName: true } } },
  });

  const next = await prisma.user.findUniqueOrThrow({
    where: { id: newLeadInspectorId },
    select: { id: true, fullName: true, role: true },
  });

  if (next.role !== "INSPECTOR" && next.role !== "FIELD_MANAGER") {
    throw new DomainError("INVALID_ASSIGNEE", "A case can only be led by an inspector or a field manager.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.inspectionAssignment.updateMany({
      where: { inspectionId: inspection.id, assignmentRole: "LEAD", unassignedAt: null },
      data: { unassignedAt: new Date() },
    });

    await tx.inspectionAssignment.create({
      data: { inspectionId: inspection.id, userId: next.id, assignmentRole: "LEAD" },
    });

    await tx.inspection.update({ where: { id: inspection.id }, data: { leadInspectorId: next.id } });

    await audit.record(
      actor,
      {
        action: "INSPECTION_REASSIGNED",
        entityType: "Inspection",
        entityId: inspection.id,
        caseNumber: inspection.caseNumber,
        previousValue: inspection.leadInspector?.fullName ?? null,
        newValue: next.fullName,
        reason: reason.trim(),
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: inspection.id,
      actorId: actor.id,
      eventType: "INSPECTION_REASSIGNED",
      description: `Case reassigned to ${next.fullName}`,
    });
  });
}

export interface CreateFindingInput {
  inspectionId: string;
  title: string;
  observation: string;
  regulationId?: string | null;
  /** A redacted identifier such as "Resident A" — never a resident's name (§24). */
  residentIdentifier?: string | null;
  potentialOutcome?: PotentialOutcome;
  /** Draft findings stay invisible to the provider until shared. */
  share?: boolean;
}

export async function createFinding(actor: SessionUser, input: CreateFindingInput) {
  const inspection = await prisma.inspection.findUniqueOrThrow({
    where: { id: input.inspectionId },
    select: { id: true, caseNumber: true },
  });

  const existing = await prisma.finding.count({ where: { inspectionId: inspection.id } });
  const reference = findingReference(existing + 1);

  return prisma.$transaction(async (tx) => {
    const finding = await tx.finding.create({
      data: {
        reference,
        inspectionId: inspection.id,
        regulationId: input.regulationId ?? null,
        title: input.title,
        observation: input.observation,
        residentIdentifier: input.residentIdentifier ?? null,
        potentialOutcome: input.potentialOutcome ?? "UNDETERMINED",
        status: input.share === false ? "DRAFT" : "POTENTIAL_FINDING",
      },
    });

    await audit.record(
      actor,
      {
        action: "FINDING_CREATED",
        entityType: "Finding",
        entityId: finding.id,
        caseNumber: inspection.caseNumber,
        newValue: `${reference}: ${input.title}`,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: inspection.id,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "FINDING_CREATED",
      description: `Potential Finding ${reference} created`,
    });

    return finding;
  });
}

/**
 * Resolves a finding without a citation or consultation — the outcome when
 * provider evidence answered the question (§29).
 */
export async function resolveFinding(
  actor: SessionUser,
  findingId: string,
  status: Extract<FindingStatus, "RESOLVED_NO_VIOLATION" | "CLOSED">,
  note: string,
) {
  if (!note.trim()) {
    throw new DomainError("NOTE_REQUIRED", "Record the basis for resolving this finding.");
  }

  const finding = await prisma.finding.findUniqueOrThrow({
    where: { id: findingId },
    include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } },
  });

  assertTransition(FINDING_TRANSITIONS, finding.status, status, `Finding ${finding.reference}`);

  await prisma.$transaction(async (tx) => {
    await tx.finding.update({
      where: { id: finding.id },
      data: { status, resolvedAt: new Date(), resolutionNote: note.trim() },
    });

    await audit.record(
      actor,
      {
        action: "FINDING_STATUS_CHANGED",
        entityType: "Finding",
        entityId: finding.id,
        caseNumber: finding.inspection.caseNumber,
        previousValue: finding.status,
        newValue: status,
        reason: note.trim(),
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "FINDING_RESOLVED",
      description: `${finding.reference} resolved — ${status === "RESOLVED_NO_VIOLATION" ? "no violation" : "closed"}`,
    });

    await queueNotifications(tx, {
      userIds: await providerRecipients(finding.inspection.facilityId),
      event: "EVIDENCE_REVIEWED",
      subject: `Finding ${finding.reference} resolved on ${finding.inspection.caseNumber}`,
      body: "No violation was established for this finding.",
      linkPath: `/provider/findings/${finding.id}`,
      inspectionId: finding.inspectionId,
    });
  });
}

/**
 * A message on a finding (§11). Not a chat product: a message cannot exist
 * outside a finding, and it becomes part of the case history.
 */
export async function postMessage(
  actor: SessionUser,
  findingId: string,
  body: string,
  isInternal = false,
) {
  if (!body.trim()) throw new DomainError("EMPTY_MESSAGE", "Write a message before sending.");
  if (isInternal && actor.role === "PROVIDER") {
    throw new DomainError("NOT_PERMITTED", "Providers cannot post internal notes.");
  }

  const finding = await prisma.finding.findUniqueOrThrow({
    where: { id: findingId },
    include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } },
  });

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.findingMessage.create({
      data: { findingId: finding.id, authorId: actor.id, body: body.trim(), isInternal },
    });

    await audit.record(
      actor,
      {
        action: "MESSAGE_POSTED",
        entityType: "FindingMessage",
        entityId: created.id,
        caseNumber: finding.inspection.caseNumber,
        newValue: isInternal ? "internal note" : "message to provider",
      },
      tx,
    );

    if (!isInternal) {
      const recipients =
        actor.role === "PROVIDER"
          ? await staffRecipients(finding.inspectionId)
          : await providerRecipients(finding.inspection.facilityId);

      await queueNotifications(tx, {
        userIds: recipients,
        event: "NEW_MESSAGE",
        subject: `New message on ${finding.inspection.caseNumber} (${finding.reference})`,
        body: "A message was posted on this finding. Sign in to read it.",
        linkPath:
          actor.role === "PROVIDER"
            ? `/inspections/${finding.inspectionId}/findings/${finding.id}`
            : `/provider/findings/${finding.id}`,
        inspectionId: finding.inspectionId,
      });
    }

    return created;
  });

  if (!isInternal) {
    const recipients =
      actor.role === "PROVIDER"
        ? await staffRecipients(finding.inspectionId)
        : await providerRecipients(finding.inspection.facilityId);

    await dispatchEmails({
      userIds: recipients,
      event: "NEW_MESSAGE",
      subject: `New message on ${finding.inspection.caseNumber}`,
      body: "",
      linkPath: `/inspections/${finding.inspectionId}/findings/${finding.id}`,
    });
  }

  return message;
}

/**
 * Marks the other side's messages on a finding as read.
 *
 * Called when someone opens the finding. Only messages written by the *other*
 * party are marked, so the unread badge means "waiting on you" rather than
 * "exists". Internal notes are excluded for providers by the same filter that
 * hides them.
 */
export async function markFindingMessagesRead(actor: SessionUser, findingId: string): Promise<void> {
  await prisma.findingMessage.updateMany({
    where: {
      findingId,
      readAt: null,
      isInternal: false,
      author: actor.role === "PROVIDER" ? { role: { not: "PROVIDER" } } : { role: "PROVIDER" },
    },
    data: { readAt: new Date() },
  });
}

/**
 * A provider acknowledging a consultation (§12).
 *
 * Acknowledgement records that the provider saw it. It is not agreement, and it
 * has no bearing on the consultation itself — which is why it writes a timestamp
 * and an audit row and changes nothing else.
 */
export async function acknowledgeConsultation(actor: SessionUser, findingId: string): Promise<void> {
  if (actor.role !== "PROVIDER") {
    throw new DomainError("NOT_PERMITTED", "Only the provider can acknowledge a consultation.");
  }

  const consultation = await prisma.consultation.findUniqueOrThrow({
    where: { findingId },
    include: {
      finding: { select: { reference: true, inspectionId: true, inspection: { select: { caseNumber: true } } } },
    },
  });

  if (consultation.providerAcknowledgedAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.consultation.update({
      where: { id: consultation.id },
      data: { providerAcknowledgedAt: new Date(), providerAcknowledgedById: actor.id },
    });

    await audit.record(
      actor,
      {
        action: "CONSULTATION_ISSUED",
        entityType: "Consultation",
        entityId: consultation.id,
        caseNumber: consultation.finding.inspection.caseNumber,
        newValue: "provider acknowledged",
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: consultation.finding.inspectionId,
      actorId: actor.id,
      eventType: "CONSULTATION_ACKNOWLEDGED",
      description: `Provider acknowledged the consultation on ${consultation.finding.reference}`,
    });
  });
}
