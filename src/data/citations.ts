import "server-only";
import { prisma } from "@/lib/prisma";
import {
  assertOverrideValid,
  evaluateCitationGuard,
  UNREVIEWED_EVIDENCE_BLOCK_MESSAGE,
} from "@/domain/evidence";
import { assertTransition, CITATION_TRANSITIONS, FINDING_TRANSITIONS } from "@/domain/state-machines";
import { citationNumber } from "@/domain/references";
import { DomainError } from "@/domain/types";
import type { RiskLevel, ServiceMethod } from "@prisma/client";
import * as audit from "@/data/audit";
import { CONFIG_KEYS, DEADLINE_RULE_KEYS, configBool, materializeDeadline } from "@/data/config";
import { dispatchEmails, providerRecipients, queueNotifications } from "@/data/notifications";
import { submissionsForGuard } from "@/data/evidence";
import type { SessionUser } from "@/lib/session";

/**
 * Consultation and citation (§12, §13, §9).
 *
 * Neither outcome is ever chosen by software. An inspector decides; these
 * functions record the decision, enforce the lifecycle, and — for citations —
 * refuse to finalize while provider evidence sits unreviewed.
 */

export interface IssueConsultationInput {
  findingId: string;
  issueDescription: string;
  /** Why the inspector selected consultation. Required — policy guidance is
   *  displayed to them, but the reasoning has to be theirs and on the record. */
  rationale: string;
  evidenceRelied?: string | null;
}

export async function issueConsultation(actor: SessionUser, input: IssueConsultationInput) {
  if (!input.rationale.trim()) {
    throw new DomainError("RATIONALE_REQUIRED", "Record why consultation was selected for this finding.");
  }

  const finding = await prisma.finding.findUniqueOrThrow({
    where: { id: input.findingId },
    include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } },
  });

  assertTransition(FINDING_TRANSITIONS, finding.status, "RESOLVED_CONSULTATION", `Finding ${finding.reference}`);

  return prisma.$transaction(async (tx) => {
    const consultation = await tx.consultation.create({
      data: {
        findingId: finding.id,
        regulationId: finding.regulationId,
        issuedById: actor.id,
        issueDescription: input.issueDescription,
        rationale: input.rationale,
        evidenceRelied: input.evidenceRelied ?? null,
      },
    });

    await tx.finding.update({
      where: { id: finding.id },
      data: { status: "RESOLVED_CONSULTATION", resolvedAt: new Date() },
    });

    await audit.record(
      actor,
      {
        action: "CONSULTATION_ISSUED",
        entityType: "Consultation",
        entityId: consultation.id,
        caseNumber: finding.inspection.caseNumber,
        previousValue: finding.status,
        newValue: "RESOLVED_CONSULTATION",
        reason: input.rationale,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "CONSULTATION_ISSUED",
      description: `Consultation issued on ${finding.reference}`,
    });

    await queueNotifications(tx, {
      userIds: await providerRecipients(finding.inspection.facilityId),
      event: "EVIDENCE_REVIEWED",
      subject: `Consultation issued on ${finding.inspection.caseNumber} (${finding.reference})`,
      body: "This finding was addressed through consultation rather than a citation.",
      linkPath: `/provider/findings/${finding.id}`,
      inspectionId: finding.inspectionId,
    });

    return consultation;
  });
}

export interface DraftCitationInput {
  findingId: string;
  deficientPractice: string;
  inspectorAnalysis: string;
  evidenceRelied?: string | null;
  riskLevel?: RiskLevel;
  attestationRequired?: boolean;
  planOfCorrectionRequired?: boolean;
}

/** Creates the draft. Drafting is always allowed; finalizing is what the guard gates. */
export async function draftCitation(actor: SessionUser, input: DraftCitationInput) {
  const finding = await prisma.finding.findUniqueOrThrow({
    where: { id: input.findingId },
    include: { inspection: { select: { id: true, caseNumber: true } }, citation: true },
  });

  if (finding.citation) return finding.citation;

  const year = new Date().getUTCFullYear();
  const sequence = (await prisma.citation.count()) + 1;

  return prisma.$transaction(async (tx) => {
    const citation = await tx.citation.create({
      data: {
        citationNumber: citationNumber(year, sequence),
        findingId: finding.id,
        regulationId: finding.regulationId,
        deficientPractice: input.deficientPractice,
        inspectorAnalysis: input.inspectorAnalysis,
        evidenceRelied: input.evidenceRelied ?? null,
        riskLevel: input.riskLevel ?? "NOT_CLASSIFIED",
        attestationRequired: input.attestationRequired ?? true,
        planOfCorrectionRequired: input.planOfCorrectionRequired ?? false,
        issuedById: actor.id,
      },
    });

    await audit.record(
      actor,
      {
        action: "CITATION_CREATED",
        entityType: "Citation",
        entityId: citation.id,
        caseNumber: finding.inspection.caseNumber,
        newValue: citation.citationNumber,
      },
      tx,
    );

    return citation;
  });
}

export interface FinalizeCitationInput {
  citationId: string;
  serviceMethod?: ServiceMethod | null;
  servedAt?: Date | null;
  receivedAt?: Date | null;
  /** Supplied only when overriding the unreviewed-evidence guard. */
  overrideJustification?: string | null;
}

export interface FinalizeResult {
  citationId: string;
  citationNumber: string;
  overrideUsed: boolean;
  pendingFieldManagerApproval: boolean;
  correctionDueAt: Date | null;
}

/**
 * Finalizes a citation — the guarded path (§9).
 *
 * With unreviewed evidence on the finding and no justification supplied, this
 * throws and records CITATION_FINALIZATION_BLOCKED. That refusal is itself part
 * of the record: it is the evidence that the safeguard did its job.
 */
export async function finalizeCitation(
  actor: SessionUser,
  input: FinalizeCitationInput,
): Promise<FinalizeResult> {
  const citation = await prisma.citation.findUniqueOrThrow({
    where: { id: input.citationId },
    include: {
      finding: { include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } } },
    },
  });

  const { finding } = citation;
  const guard = evaluateCitationGuard(await submissionsForGuard(finding.id));

  let overrideUsed = false;
  let pendingApproval = false;

  if (!guard.allowed) {
    if (!input.overrideJustification?.trim()) {
      // Refused. Audited, because a blocked finalization is exactly the event
      // the Evidence Review Integrity metric is built on.
      await audit.record(actor, {
        action: "CITATION_FINALIZATION_BLOCKED",
        entityType: "Citation",
        entityId: citation.id,
        caseNumber: finding.inspection.caseNumber,
        reason: `${guard.summary.unreviewed} submission(s) unreviewed: ${guard.summary.unreviewedReferences.join(", ")}`,
      });

      throw new DomainError("UNREVIEWED_EVIDENCE", UNREVIEWED_EVIDENCE_BLOCK_MESSAGE);
    }

    const decision = assertOverrideValid({
      justification: input.overrideJustification,
      fieldManagerApprovalRequired: await configBool(
        CONFIG_KEYS.overrideRequiresFieldManagerApproval,
        true,
      ),
      actorIsFieldManager: actor.role === "FIELD_MANAGER",
    });

    overrideUsed = true;
    pendingApproval = decision.pendingApproval;
  }

  assertTransition(CITATION_TRANSITIONS, citation.status, "FINALIZED", `Citation ${citation.citationNumber}`);

  const citedAt = new Date();

  const correctionDueAt = await prisma.$transaction(async (tx) => {
    await tx.citation.update({
      where: { id: citation.id },
      data: {
        status: "FINALIZED",
        citedAt,
        serviceMethod: input.serviceMethod ?? null,
        servedAt: input.servedAt ?? null,
        receivedAt: input.receivedAt ?? null,
        overrideUsed,
        overrideJustification: overrideUsed ? input.overrideJustification!.trim() : null,
        overrideById: overrideUsed ? actor.id : null,
        overrideAt: overrideUsed ? citedAt : null,
        overridePendingApproval: pendingApproval,
      },
    });

    assertTransition(FINDING_TRANSITIONS, finding.status, "CITATION_ISSUED", `Finding ${finding.reference}`);
    await tx.finding.update({ where: { id: finding.id }, data: { status: "CITATION_ISSUED" } });

    // The correction clock runs from receipt where one is recorded, because
    // that is what the regulation keys off — not from the portal's own timestamp.
    const due = await materializeDeadline(tx, {
      ruleKey: DEADLINE_RULE_KEYS.attestationDue,
      triggeredAt: input.receivedAt ?? input.servedAt ?? citedAt,
      citationId: citation.id,
      findingId: finding.id,
      inspectionId: finding.inspectionId,
    });

    if (due) {
      await tx.citation.update({ where: { id: citation.id }, data: { correctionDueAt: due } });
      await tx.correction.create({
        data: {
          citationId: citation.id,
          kind: citation.planOfCorrectionRequired ? "PLAN_OF_CORRECTION" : "ATTESTATION_OF_CORRECTION",
          status: "NOT_SUBMITTED",
          dueAt: due,
        },
      });
    }

    await materializeDeadline(tx, {
      ruleKey: DEADLINE_RULE_KEYS.idrRequestDue,
      triggeredAt: input.receivedAt ?? input.servedAt ?? citedAt,
      citationId: citation.id,
      findingId: finding.id,
      inspectionId: finding.inspectionId,
    });

    await audit.record(
      actor,
      {
        action: "CITATION_FINALIZED",
        entityType: "Citation",
        entityId: citation.id,
        caseNumber: finding.inspection.caseNumber,
        previousValue: citation.status,
        newValue: "FINALIZED",
      },
      tx,
    );

    if (overrideUsed) {
      await audit.record(
        actor,
        {
          action: "ADMINISTRATIVE_OVERRIDE",
          entityType: "Citation",
          entityId: citation.id,
          caseNumber: finding.inspection.caseNumber,
          previousValue: `${guard.summary.unreviewed} unreviewed submission(s): ${guard.summary.unreviewedReferences.join(", ")}`,
          newValue: pendingApproval ? "FINALIZED_PENDING_APPROVAL" : "FINALIZED",
          reason: input.overrideJustification!.trim(),
        },
        tx,
      );

      await audit.timeline(tx, {
        inspectionId: finding.inspectionId,
        findingId: finding.id,
        actorId: actor.id,
        eventType: "ADMINISTRATIVE_OVERRIDE",
        description: `Citation finalized over ${guard.summary.unreviewed} unreviewed submission(s) by ${actor.fullName}`,
      });
    }

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "CITATION_FINALIZED",
      description: `Citation ${citation.citationNumber} finalized on ${finding.reference}`,
    });

    await queueNotifications(tx, {
      userIds: await providerRecipients(finding.inspection.facilityId),
      event: "CITATION_ISSUED",
      subject: `Citation issued on ${finding.inspection.caseNumber} (${finding.reference})`,
      body: `Citation ${citation.citationNumber}. See the portal for the correction requirement and its due date.`,
      linkPath: `/provider/findings/${finding.id}`,
      inspectionId: finding.inspectionId,
    });

    return due;
  });

  await dispatchEmails({
    userIds: await providerRecipients(finding.inspection.facilityId),
    event: "CITATION_ISSUED",
    subject: `Citation issued on ${finding.inspection.caseNumber}`,
    body: "",
    linkPath: `/provider/findings/${finding.id}`,
  });

  return {
    citationId: citation.id,
    citationNumber: citation.citationNumber,
    overrideUsed,
    pendingFieldManagerApproval: pendingApproval,
    correctionDueAt,
  };
}

/** A Field Manager signing off on an inspector's override. */
export async function approveOverride(actor: SessionUser, citationId: string, note?: string) {
  const citation = await prisma.citation.findUniqueOrThrow({
    where: { id: citationId },
    include: { finding: { include: { inspection: { select: { caseNumber: true, id: true } } } } },
  });

  if (!citation.overridePendingApproval) {
    throw new DomainError("NOT_PENDING", "This citation is not waiting for override approval.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.citation.update({
      where: { id: citation.id },
      data: {
        overridePendingApproval: false,
        overrideApprovedById: actor.id,
        overrideApprovedAt: new Date(),
      },
    });

    await audit.record(
      actor,
      {
        action: "OVERRIDE_APPROVED",
        entityType: "Citation",
        entityId: citation.id,
        caseNumber: citation.finding.inspection.caseNumber,
        reason: note ?? null,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: citation.finding.inspectionId,
      findingId: citation.findingId,
      actorId: actor.id,
      eventType: "OVERRIDE_APPROVED",
      description: `${actor.fullName} approved the evidence-guard override on ${citation.citationNumber}`,
    });
  });
}

export async function rescindCitation(actor: SessionUser, citationId: string, reason: string) {
  if (!reason.trim()) {
    throw new DomainError("REASON_REQUIRED", "Record why the citation is being rescinded.");
  }

  const citation = await prisma.citation.findUniqueOrThrow({
    where: { id: citationId },
    include: { finding: { include: { inspection: { select: { caseNumber: true, id: true, facilityId: true } } } } },
  });

  assertTransition(CITATION_TRANSITIONS, citation.status, "RESCINDED", `Citation ${citation.citationNumber}`);

  await prisma.$transaction(async (tx) => {
    await tx.citation.update({
      where: { id: citation.id },
      data: { status: "RESCINDED", rescindedAt: new Date(), rescissionReason: reason.trim() },
    });

    await tx.finding.update({ where: { id: citation.findingId }, data: { status: "CITATION_RESCINDED" } });

    await audit.record(
      actor,
      {
        action: "CITATION_RESCINDED",
        entityType: "Citation",
        entityId: citation.id,
        caseNumber: citation.finding.inspection.caseNumber,
        previousValue: citation.status,
        newValue: "RESCINDED",
        reason: reason.trim(),
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: citation.finding.inspectionId,
      findingId: citation.findingId,
      actorId: actor.id,
      eventType: "CITATION_RESCINDED",
      description: `Citation ${citation.citationNumber} rescinded`,
    });
  });
}
