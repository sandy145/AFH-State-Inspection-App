import "server-only";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/domain/types";
import type { FollowUpMethod, FollowUpResult } from "@prisma/client";
import * as audit from "@/data/audit";
import { queueNotifications, providerRecipients } from "@/data/notifications";
import type { SessionUser } from "@/lib/session";

/**
 * Follow-up verification (§16).
 *
 * After a correction is submitted, staff decide how it will be verified —
 * documents, a phone call, or a return visit — and record what they found. The
 * back-in-compliance determination lives here rather than on the paperwork,
 * because verifying is a separate act from receiving.
 */

export interface ScheduleFollowUpInput {
  inspectionId: string;
  citationId?: string | null;
  method: FollowUpMethod;
  scheduledFor?: Date | null;
  assignedToId?: string | null;
  notes?: string | null;
}

export async function scheduleFollowUp(actor: SessionUser, input: ScheduleFollowUpInput) {
  const inspection = await prisma.inspection.findUniqueOrThrow({
    where: { id: input.inspectionId },
    select: { id: true, caseNumber: true, facilityId: true, status: true },
  });

  return prisma.$transaction(async (tx) => {
    const followUp = await tx.followUp.create({
      data: {
        inspectionId: inspection.id,
        citationId: input.citationId ?? null,
        method: input.method,
        scheduledFor: input.scheduledFor ?? null,
        assignedToId: input.assignedToId ?? actor.id,
        notes: input.notes ?? null,
      },
    });

    if (inspection.status === "CORRECTION_PERIOD" || inspection.status === "REPORT_ISSUED") {
      await tx.inspection.update({ where: { id: inspection.id }, data: { status: "FOLLOW_UP" } });
    }

    await audit.record(
      actor,
      {
        action: "FOLLOW_UP_SCHEDULED",
        entityType: "FollowUp",
        entityId: followUp.id,
        caseNumber: inspection.caseNumber,
        newValue: input.method,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: inspection.id,
      actorId: actor.id,
      eventType: "FOLLOW_UP_SCHEDULED",
      description: `Follow-up scheduled — ${input.method.replace(/_/g, " ").toLowerCase()}`,
    });

    await queueNotifications(tx, {
      userIds: await providerRecipients(inspection.facilityId),
      event: "FOLLOW_UP_SCHEDULED",
      subject: `Follow-up scheduled on ${inspection.caseNumber}`,
      body: `Verification method: ${input.method.replace(/_/g, " ").toLowerCase()}.`,
      linkPath: `/provider`,
      inspectionId: inspection.id,
    });

    return followUp;
  });
}

export interface CompleteFollowUpInput {
  followUpId: string;
  result: FollowUpResult;
  backInCompliance: boolean;
  evidenceReviewed?: string | null;
  additionalDeficiencies?: string | null;
  notes?: string | null;
}

export async function completeFollowUp(actor: SessionUser, input: CompleteFollowUpInput) {
  const followUp = await prisma.followUp.findUniqueOrThrow({
    where: { id: input.followUpId },
    include: { inspection: { select: { id: true, caseNumber: true } } },
  });

  if (followUp.completedAt) {
    throw new DomainError("ALREADY_COMPLETE", "This follow-up has already been recorded.");
  }
  if (input.result === "ADDITIONAL_DEFICIENCIES" && !input.additionalDeficiencies?.trim()) {
    throw new DomainError("DETAIL_REQUIRED", "Describe the additional deficiencies identified.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.followUp.update({
      where: { id: followUp.id },
      data: {
        completedAt: new Date(),
        result: input.result,
        backInCompliance: input.backInCompliance,
        evidenceReviewed: input.evidenceReviewed?.trim() || null,
        additionalDeficiencies: input.additionalDeficiencies?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });

    await audit.record(
      actor,
      {
        action: "FOLLOW_UP_COMPLETED",
        entityType: "FollowUp",
        entityId: followUp.id,
        caseNumber: followUp.inspection.caseNumber,
        newValue: `${input.result} (back in compliance: ${input.backInCompliance ? "yes" : "no"})`,
        reason: input.notes?.trim() || null,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: followUp.inspectionId,
      actorId: actor.id,
      eventType: "FOLLOW_UP_COMPLETED",
      description: `Follow-up completed — ${input.backInCompliance ? "back in compliance" : "not back in compliance"}`,
    });
  });
}
