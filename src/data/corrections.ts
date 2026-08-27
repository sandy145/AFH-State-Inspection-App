import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { documentStorage } from "@/services/storage";
import { malwareScanner } from "@/services/malware-scan";
import { assertUploadAllowed } from "@/domain/evidence";
import { assertTransition, CORRECTION_TRANSITIONS, FINDING_TRANSITIONS } from "@/domain/state-machines";
import { DomainError } from "@/domain/types";
import * as audit from "@/data/audit";
import { dispatchEmails, providerRecipients, queueNotifications, staffRecipients } from "@/data/notifications";
import type { UploadedFileInput } from "@/data/evidence";
import type { SessionUser } from "@/lib/session";

/**
 * Plan / Attestation of Correction (§14).
 *
 * The provider states what was corrected, when, how it will be maintained and
 * who is responsible, then signs electronically. The portal stamps its own
 * receipt time — the signature date the provider types and the time the system
 * received it are recorded separately, because they are different facts.
 */

export interface SubmitCorrectionInput {
  correctionId: string;
  howCorrected: string;
  correctionCompletedAt: Date;
  howMaintained: string;
  responsiblePerson: string;
  signatureName: string;
  signatureTitle?: string | null;
  files?: UploadedFileInput[];
}

export async function submitCorrection(actor: SessionUser, input: SubmitCorrectionInput) {
  const correction = await prisma.correction.findUniqueOrThrow({
    where: { id: input.correctionId },
    include: {
      citation: {
        include: {
          finding: {
            include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } },
          },
        },
      },
    },
  });

  for (const field of ["howCorrected", "howMaintained", "responsiblePerson", "signatureName"] as const) {
    if (!input[field]?.trim()) {
      throw new DomainError("INCOMPLETE_CORRECTION", "Complete every part of the correction before submitting.");
    }
  }

  assertTransition(
    CORRECTION_TRANSITIONS,
    correction.status,
    "SUBMITTED",
    "Correction",
  );

  const { finding } = correction.citation;
  const storage = documentStorage();
  const scanner = malwareScanner();

  const stored = await Promise.all(
    (input.files ?? []).map(async (file) => {
      assertUploadAllowed(file.fileName, file.mimeType, file.body.byteLength, env.maxUploadBytes);
      return { file, object: await storage.put({ body: file.body, fileName: file.fileName, mimeType: file.mimeType }) };
    }),
  );

  const submittedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.correction.update({
      where: { id: correction.id },
      data: {
        status: "SUBMITTED",
        howCorrected: input.howCorrected.trim(),
        correctionCompletedAt: input.correctionCompletedAt,
        howMaintained: input.howMaintained.trim(),
        responsiblePerson: input.responsiblePerson.trim(),
        signatureName: input.signatureName.trim(),
        signatureTitle: input.signatureTitle?.trim() || null,
        // What the provider attested to, and when the portal received it.
        signedAt: submittedAt,
        submittedAt,
        submittedById: actor.id,
      },
    });

    for (const { file, object } of stored) {
      const document = await tx.document.create({
        data: {
          inspectionId: finding.inspectionId,
          facilityId: finding.inspection.facilityId,
          title: file.fileName,
          documentType: "CORRECTION_EVIDENCE",
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          version: 1,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: object.sizeBytes,
          checksum: object.checksum,
          storageKey: object.storageKey,
          uploadedById: actor.id,
          scanStatus: await scanner.scan({
            storageKey: object.storageKey,
            fileName: file.fileName,
            sizeBytes: object.sizeBytes,
          }),
        },
      });

      await tx.correctionEvidence.create({
        data: {
          correctionId: correction.id,
          documentVersionId: version.id,
          description: file.description ?? null,
        },
      });
    }

    if (finding.status === "CITATION_ISSUED" || finding.status === "CORRECTION_PENDING") {
      await tx.finding.update({ where: { id: finding.id }, data: { status: "CORRECTION_UNDER_REVIEW" } });
    }
    await tx.citation.update({
      where: { id: correction.citationId },
      data: { status: "CORRECTION_UNDER_REVIEW" },
    });

    // Meeting the correction deadline is recorded here; the deadline row itself
    // is never rewritten.
    await tx.deadline.updateMany({
      where: { citationId: correction.citationId, ruleKey: "ATTESTATION_OF_CORRECTION_DUE", status: "OPEN" },
      data: { status: "MET", satisfiedAt: submittedAt },
    });

    await audit.record(
      actor,
      {
        action: "CORRECTION_SUBMITTED",
        entityType: "Correction",
        entityId: correction.id,
        caseNumber: finding.inspection.caseNumber,
        previousValue: correction.status,
        newValue: "SUBMITTED",
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "CORRECTION_SUBMITTED",
      description: `Provider submitted the correction for ${correction.citation.citationNumber}, signed by ${input.signatureName.trim()}`,
      occurredAt: submittedAt,
    });

    await queueNotifications(tx, {
      userIds: await staffRecipients(finding.inspectionId),
      event: "CORRECTION_ACCEPTED",
      subject: `Correction submitted on ${finding.inspection.caseNumber}`,
      body: `${correction.citation.citationNumber} — the provider's correction is ready for review.`,
      linkPath: `/inspector/corrections/${correction.id}`,
      inspectionId: finding.inspectionId,
    });
  });

  await dispatchEmails({
    userIds: await staffRecipients(finding.inspectionId),
    event: "CORRECTION_ACCEPTED",
    subject: `Correction submitted on ${finding.inspection.caseNumber}`,
    body: "",
    linkPath: `/inspector/corrections/${correction.id}`,
  });
}

export interface ReviewCorrectionInput {
  correctionId: string;
  decision: "ACCEPTED" | "ADDITIONAL_INFO_REQUESTED" | "CORRECTION_VERIFICATION_REQUIRED";
  note?: string | null;
}

export async function reviewCorrection(actor: SessionUser, input: ReviewCorrectionInput) {
  const correction = await prisma.correction.findUniqueOrThrow({
    where: { id: input.correctionId },
    include: {
      citation: {
        include: {
          finding: { include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } } },
        },
      },
    },
  });

  if (input.decision !== "ACCEPTED" && !input.note?.trim()) {
    throw new DomainError("NOTE_REQUIRED", "Explain what the provider still needs to do.");
  }

  // The provider's submission moves through UNDER_REVIEW before a decision, so
  // the record shows that someone actually opened it.
  if (correction.status === "SUBMITTED") {
    assertTransition(CORRECTION_TRANSITIONS, correction.status, "UNDER_REVIEW", "Correction");
  }
  assertTransition(CORRECTION_TRANSITIONS, "UNDER_REVIEW", input.decision, "Correction");

  const { finding } = correction.citation;

  await prisma.$transaction(async (tx) => {
    await tx.correction.update({
      where: { id: correction.id },
      data: {
        status: input.decision,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: input.note?.trim() || null,
      },
    });

    if (input.decision === "ADDITIONAL_INFO_REQUESTED") {
      await tx.citation.update({ where: { id: correction.citationId }, data: { status: "CORRECTION_PENDING" } });
      await tx.finding.update({ where: { id: finding.id }, data: { status: "CORRECTION_PENDING" } });
    }

    await audit.record(
      actor,
      {
        action: "CORRECTION_REVIEWED",
        entityType: "Correction",
        entityId: correction.id,
        caseNumber: finding.inspection.caseNumber,
        previousValue: correction.status,
        newValue: input.decision,
        reason: input.note?.trim() || null,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "CORRECTION_REVIEWED",
      description: `${actor.fullName} reviewed the correction for ${correction.citation.citationNumber}`,
    });

    await queueNotifications(tx, {
      userIds: await providerRecipients(finding.inspection.facilityId),
      event: input.decision === "ACCEPTED" ? "CORRECTION_ACCEPTED" : "ADDITIONAL_INFO_REQUESTED",
      subject: `Correction reviewed on ${finding.inspection.caseNumber}`,
      body:
        input.decision === "ACCEPTED"
          ? "Your correction was accepted."
          : "The inspector needs more information about your correction.",
      linkPath: `/provider/findings/${finding.id}`,
      inspectionId: finding.inspectionId,
    });
  });
}

/**
 * Records a back-in-compliance determination. Only a follow-up verification puts
 * a finding here — accepting the paperwork alone does not.
 */
export async function markBackInCompliance(actor: SessionUser, correctionId: string, note?: string) {
  const correction = await prisma.correction.findUniqueOrThrow({
    where: { id: correctionId },
    include: {
      citation: { include: { finding: { include: { inspection: { select: { id: true, caseNumber: true } } } } } },
    },
  });

  assertTransition(CORRECTION_TRANSITIONS, correction.status, "CORRECTED", "Correction");
  const { finding } = correction.citation;

  await prisma.$transaction(async (tx) => {
    await tx.correction.update({ where: { id: correction.id }, data: { status: "CORRECTED" } });
    await tx.citation.update({ where: { id: correction.citationId }, data: { status: "CORRECTED" } });

    assertTransition(
      FINDING_TRANSITIONS,
      finding.status,
      "CORRECTED_BACK_IN_COMPLIANCE",
      `Finding ${finding.reference}`,
    );
    await tx.finding.update({
      where: { id: finding.id },
      data: { status: "CORRECTED_BACK_IN_COMPLIANCE", resolvedAt: new Date() },
    });

    await audit.record(
      actor,
      {
        action: "CORRECTION_REVIEWED",
        entityType: "Correction",
        entityId: correction.id,
        caseNumber: finding.inspection.caseNumber,
        newValue: "CORRECTED",
        reason: note ?? null,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "BACK_IN_COMPLIANCE",
      description: `${finding.reference} determined back in compliance`,
    });
  });
}
