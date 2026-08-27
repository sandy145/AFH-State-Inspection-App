import "server-only";
import { prisma } from "@/lib/prisma";
import { assertTransition, FINDING_TRANSITIONS, IDR_TRANSITIONS } from "@/domain/state-machines";
import { idrReference } from "@/domain/references";
import { DomainError } from "@/domain/types";
import type { IDRMethod, IDRStatus } from "@prisma/client";
import * as audit from "@/data/audit";
import { DEADLINE_RULE_KEYS, materializeDeadline } from "@/data/config";
import { queueNotifications, staffRecipients } from "@/data/notifications";
import type { SessionUser } from "@/lib/session";

/**
 * Informal Dispute Resolution (§15) — RCW 70.128.167, WAC 388-76-10990.
 *
 * IDR is a separate axis from correction, and this module is careful never to
 * touch correction state. A citation can be in CORRECTION_PENDING while an IDR
 * is open; conflating the two would tell a provider their correction obligation
 * had paused, which is not this software's call to make.
 *
 * The data model anticipates a separate IDR team taking this over: an IDRRequest
 * carries its own status, method, schedule and decision, and nothing here
 * assumes the reviewing inspector processes it.
 */

export const IDR_NOTICE =
  "Requesting Informal Dispute Resolution does not delay correction obligations " +
  "except where applicable under law or DSHS policy.";

export interface RequestIDRInput {
  citationId: string;
  reason: string;
  requestedMethod: IDRMethod;
  supportingEvidence?: string | null;
}

export async function requestIDR(actor: SessionUser, input: RequestIDRInput) {
  if (!input.reason.trim()) {
    throw new DomainError("REASON_REQUIRED", "Explain why you disagree with the citation.");
  }

  const citation = await prisma.citation.findUniqueOrThrow({
    where: { id: input.citationId },
    include: {
      finding: { include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } } },
      corrections: { select: { id: true, status: true } },
    },
  });

  if (citation.status === "DRAFT") {
    throw new DomainError("CITATION_NOT_ISSUED", "A citation can only be disputed once it has been issued.");
  }

  const year = new Date().getUTCFullYear();
  const sequence = (await prisma.iDRRequest.count()) + 1;
  const { finding } = citation;

  return prisma.$transaction(async (tx) => {
    const request = await tx.iDRRequest.create({
      data: {
        reference: idrReference(year, sequence),
        citationId: citation.id,
        requestedById: actor.id,
        reason: input.reason.trim(),
        requestedMethod: input.requestedMethod,
        supportingEvidence: input.supportingEvidence?.trim() || null,
      },
    });

    await materializeDeadline(tx, {
      ruleKey: DEADLINE_RULE_KEYS.idrRequestDue,
      triggeredAt: request.submittedAt,
      idrRequestId: request.id,
      citationId: citation.id,
      inspectionId: finding.inspectionId,
    });

    // The finding shows IDR_PENDING; correction records are deliberately
    // untouched. See correctionStatusAfterIDR in domain/state-machines.ts.
    if (finding.status !== "IDR_PENDING") {
      assertTransition(FINDING_TRANSITIONS, finding.status, "IDR_PENDING", `Finding ${finding.reference}`);
      await tx.finding.update({ where: { id: finding.id }, data: { status: "IDR_PENDING" } });
    }

    await audit.record(
      actor,
      {
        action: "IDR_REQUESTED",
        entityType: "IDRRequest",
        entityId: request.id,
        caseNumber: finding.inspection.caseNumber,
        newValue: `${request.reference} (${input.requestedMethod})`,
        reason: input.reason.trim(),
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "IDR_REQUESTED",
      description: `Provider requested Informal Dispute Resolution on ${citation.citationNumber}`,
    });

    await queueNotifications(tx, {
      userIds: await staffRecipients(finding.inspectionId),
      event: "IDR_STATUS_CHANGED",
      subject: `IDR requested on ${finding.inspection.caseNumber}`,
      body: `${request.reference} disputes citation ${citation.citationNumber}.`,
      linkPath: `/inspections/${finding.inspectionId}/idr`,
      inspectionId: finding.inspectionId,
    });

    return request;
  });
}

export interface AdvanceIDRInput {
  idrRequestId: string;
  status: IDRStatus;
  decisionSummary?: string | null;
  scheduledAt?: Date | null;
}

export async function advanceIDR(actor: SessionUser, input: AdvanceIDRInput) {
  const request = await prisma.iDRRequest.findUniqueOrThrow({
    where: { id: input.idrRequestId },
    include: {
      citation: {
        include: {
          finding: { include: { inspection: { select: { id: true, caseNumber: true } } } },
          corrections: { select: { id: true, status: true } },
        },
      },
    },
  });

  assertTransition(IDR_TRANSITIONS, request.status, input.status, `IDR ${request.reference}`);

  const terminal = ["COMPLETED_UPHELD", "COMPLETED_MODIFIED", "COMPLETED_RESCINDED"];
  if (terminal.includes(input.status) && !input.decisionSummary?.trim()) {
    throw new DomainError("DECISION_REQUIRED", "Record the IDR decision before completing the request.");
  }

  const { citation } = request;
  const { finding } = citation;
  // Captured before the transaction so the assertion below compares against the
  // state as it stood, not against anything this function wrote.
  const correctionStatusesBefore = citation.corrections.map((c) => `${c.id}:${c.status}`).sort();

  await prisma.$transaction(async (tx) => {
    await tx.iDRRequest.update({
      where: { id: request.id },
      data: {
        status: input.status,
        scheduledAt: input.scheduledAt ?? request.scheduledAt,
        decisionSummary: input.decisionSummary?.trim() || request.decisionSummary,
        decidedAt: terminal.includes(input.status) ? new Date() : request.decidedAt,
      },
    });

    if (input.status === "COMPLETED_RESCINDED") {
      await tx.citation.update({
        where: { id: citation.id },
        data: { status: "RESCINDED", rescindedAt: new Date(), rescissionReason: input.decisionSummary!.trim() },
      });
      await tx.finding.update({ where: { id: finding.id }, data: { status: "CITATION_RESCINDED" } });
    } else if (input.status === "COMPLETED_MODIFIED") {
      await tx.citation.update({ where: { id: citation.id }, data: { status: "MODIFIED" } });
      await tx.finding.update({ where: { id: finding.id }, data: { status: "MODIFIED_FOLLOWING_IDR" } });
    } else if (input.status === "COMPLETED_UPHELD") {
      // The citation stands and the correction picks up exactly where it was.
      await tx.finding.update({
        where: { id: finding.id },
        data: { status: citation.status === "CORRECTED" ? "CORRECTED_BACK_IN_COMPLIANCE" : "CORRECTION_PENDING" },
      });
    }

    await audit.record(
      actor,
      {
        action: "IDR_STATUS_CHANGED",
        entityType: "IDRRequest",
        entityId: request.id,
        caseNumber: finding.inspection.caseNumber,
        previousValue: request.status,
        newValue: input.status,
        reason: input.decisionSummary?.trim() || null,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "IDR_STATUS_CHANGED",
      description: `IDR ${request.reference} moved to ${input.status.replace(/_/g, " ").toLowerCase()}`,
    });
  });

  // Belt and braces on the rule §15 is emphatic about: advancing an IDR must not
  // have rewritten any correction record.
  const after = await prisma.correction.findMany({
    where: { citationId: citation.id },
    select: { id: true, status: true },
  });
  const correctionStatusesAfter = after.map((c) => `${c.id}:${c.status}`).sort();
  if (JSON.stringify(correctionStatusesBefore) !== JSON.stringify(correctionStatusesAfter)) {
    throw new Error("IDR processing must not modify correction status");
  }
}
