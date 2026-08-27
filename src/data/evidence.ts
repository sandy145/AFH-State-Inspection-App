import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { documentStorage } from "@/services/storage";
import { malwareScanner } from "@/services/malware-scan";
import { assertReviewValid, assertUploadAllowed } from "@/domain/evidence";
import { assertTransition, FINDING_TRANSITIONS, SUBMISSION_TRANSITIONS } from "@/domain/state-machines";
import { receiptNumber, submissionReference } from "@/domain/references";
import { REVIEW_OUTCOME_LABELS } from "@/domain/evidence";
import { DomainError } from "@/domain/types";
import type { ReviewOutcome } from "@/domain/types";
import * as audit from "@/data/audit";
import type { SessionUser } from "@/lib/session";
import { dispatchEmails, providerRecipients, queueNotifications, staffRecipients } from "@/data/notifications";
import { DEADLINE_RULE_KEYS, materializeDeadline } from "@/data/config";

/**
 * The evidence pipeline (§7, §8, §9, §10, §22, §34).
 *
 * Evidence never exists as a loose attachment. Every uploaded file is bound to a
 * facility, an inspection, a finding, an evidence request, an uploader and a
 * version, and every submission produces a receipt in the same transaction that
 * stores it. Nothing here overwrites: a replacement is a new version with a
 * pointer back to the one it supersedes.
 */

export interface UploadedFileInput {
  fileName: string;
  mimeType: string;
  body: Buffer;
  description?: string | null;
  documentType?: string | null;
}

export interface CreateEvidenceRequestInput {
  findingId: string;
  title: string;
  instructions: string;
  itemsRequested: string;
  regulationId?: string | null;
  dueAt?: Date | null;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  allowMultipleFiles?: boolean;
  explanationRequired?: boolean;
}

export async function createEvidenceRequest(actor: SessionUser, input: CreateEvidenceRequestInput) {
  const finding = await prisma.finding.findUniqueOrThrow({
    where: { id: input.findingId },
    include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } },
  });

  const existing = await prisma.evidenceRequest.count({ where: { findingId: finding.id } });
  const reference = `ER-${String(existing + 1).padStart(3, "0")}`;

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.evidenceRequest.create({
      data: {
        reference,
        findingId: finding.id,
        regulationId: input.regulationId ?? finding.regulationId,
        title: input.title,
        instructions: input.instructions,
        itemsRequested: input.itemsRequested,
        dueAt: input.dueAt ?? null,
        priority: input.priority ?? "NORMAL",
        allowMultipleFiles: input.allowMultipleFiles ?? true,
        explanationRequired: input.explanationRequired ?? false,
        requestedById: actor.id,
      },
    });

    // A due date the inspector did not set falls back to the configured rule
    // rather than to a number written into this file.
    if (!input.dueAt) {
      const dueAt = await materializeDeadline(tx, {
        ruleKey: DEADLINE_RULE_KEYS.evidenceRequestDue,
        triggeredAt: created.requestedAt,
        evidenceRequestId: created.id,
        findingId: finding.id,
        inspectionId: finding.inspectionId,
      });
      if (dueAt) await tx.evidenceRequest.update({ where: { id: created.id }, data: { dueAt } });
    }

    if (finding.status !== "EVIDENCE_REQUESTED") {
      assertTransition(FINDING_TRANSITIONS, finding.status, "EVIDENCE_REQUESTED", `Finding ${finding.reference}`);
      await tx.finding.update({
        where: { id: finding.id },
        data: { status: "EVIDENCE_REQUESTED", evidenceDueAt: input.dueAt ?? undefined },
      });
    }

    await audit.record(
      actor,
      {
        action: "EVIDENCE_REQUESTED",
        entityType: "EvidenceRequest",
        entityId: created.id,
        caseNumber: finding.inspection.caseNumber,
        newValue: `${reference}: ${input.title}`,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "EVIDENCE_REQUESTED",
      description: `${actor.fullName} requested ${input.title.toLowerCase()}`,
    });

    const recipients = await providerRecipients(finding.inspection.facilityId);
    await queueNotifications(tx, {
      userIds: recipients,
      event: "EVIDENCE_REQUESTED",
      subject: `New evidence request on inspection ${finding.inspection.caseNumber}`,
      body: `${input.title} — see the request for what to send and when it is due.`,
      linkPath: `/provider/requests/${created.id}`,
      inspectionId: finding.inspectionId,
    });

    return created;
  });

  await dispatchEmails({
    userIds: await providerRecipients(finding.inspection.facilityId),
    event: "EVIDENCE_REQUESTED",
    subject: `New evidence request on inspection ${finding.inspection.caseNumber}`,
    body: "",
    linkPath: `/provider/requests/${request.id}`,
  });

  return request;
}

export interface SubmitEvidenceInput {
  evidenceRequestId: string;
  files: UploadedFileInput[];
  providerExplanation?: string | null;
  /** Set when this submission replaces an earlier one (§22). */
  supersedesSubmissionId?: string | null;
}

export interface SubmissionResult {
  submissionId: string;
  reference: string;
  receiptNumber: string;
  receivedAt: Date;
}

/**
 * Provider evidence submission.
 *
 * Files are written to storage first — a failed upload must not leave a
 * half-recorded submission — then the submission, versions, receipt, audit rows,
 * timeline entry and notifications are committed together.
 */
export async function submitEvidence(
  actor: SessionUser,
  input: SubmitEvidenceInput,
): Promise<SubmissionResult> {
  if (input.files.length === 0) {
    throw new DomainError("NO_FILES", "Attach at least one file before submitting.");
  }

  const request = await prisma.evidenceRequest.findUniqueOrThrow({
    where: { id: input.evidenceRequestId },
    include: {
      finding: {
        include: {
          inspection: { select: { id: true, caseNumber: true, facilityId: true, facility: { select: { name: true } } } },
        },
      },
    },
  });

  if (request.status === "CANCELLED") {
    throw new DomainError("REQUEST_CANCELLED", "This evidence request was cancelled and no longer accepts files.");
  }
  if (!request.allowMultipleFiles && input.files.length > 1) {
    throw new DomainError("SINGLE_FILE_ONLY", "This request accepts a single file.");
  }
  if (request.explanationRequired && !input.providerExplanation?.trim()) {
    throw new DomainError("EXPLANATION_REQUIRED", "This request asks for a written explanation as well as a file.");
  }

  for (const file of input.files) {
    assertUploadAllowed(file.fileName, file.mimeType, file.body.byteLength, env.maxUploadBytes);
  }

  // Storage happens outside the transaction so a slow upload does not hold a
  // database lock. Orphaned objects are harmless; an orphaned record is not.
  const storage = documentStorage();
  const scanner = malwareScanner();
  const stored = await Promise.all(
    input.files.map(async (file) => ({
      file,
      object: await storage.put({ body: file.body, fileName: file.fileName, mimeType: file.mimeType }),
    })),
  );

  const reference = submissionReference();
  const receiptNo = receiptNumber();
  const receivedAt = new Date();
  const { finding } = request;

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.evidenceSubmission.create({
      data: {
        reference,
        evidenceRequestId: request.id,
        findingId: finding.id,
        submittedById: actor.id,
        submittedAt: receivedAt,
        providerExplanation: input.providerExplanation?.trim() || null,
      },
    });

    for (const { file, object } of stored) {
      // One Document per logical file name within the case, so a re-send of the
      // same document chains as version 2 rather than replacing version 1.
      const document = await findOrCreateDocument(tx, {
        inspectionId: finding.inspectionId,
        facilityId: finding.inspection.facilityId,
        fileName: file.fileName,
        documentType: file.documentType ?? null,
      });

      const previous = await tx.documentVersion.findFirst({
        where: { documentId: document.id, isCurrent: true },
        orderBy: { version: "desc" },
      });

      if (previous) {
        await tx.documentVersion.update({ where: { id: previous.id }, data: { isCurrent: false } });
      }

      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          version: (previous?.version ?? 0) + 1,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: object.sizeBytes,
          checksum: object.checksum,
          storageKey: object.storageKey,
          uploadedById: actor.id,
          isCurrent: true,
          previousVersionId: previous?.id ?? null,
          scanStatus: await scanner.scan({
            storageKey: object.storageKey,
            fileName: file.fileName,
            sizeBytes: object.sizeBytes,
          }),
        },
      });

      await tx.evidenceFile.create({
        data: {
          submissionId: submission.id,
          documentVersionId: version.id,
          documentType: file.documentType ?? null,
          description: file.description ?? null,
        },
      });
    }

    // Proof of submission, denormalized so it still reads correctly years later.
    await tx.receipt.create({
      data: {
        submissionId: submission.id,
        receiptNumber: receiptNo,
        caseNumber: finding.inspection.caseNumber,
        facilityName: finding.inspection.facility.name,
        findingReference: finding.reference,
        evidenceRequestTitle: request.title,
        fileNames: input.files.map((f) => f.fileName).join(", "),
        submittedByName: actor.fullName,
        receivedAt,
      },
    });

    if (input.supersedesSubmissionId) {
      const previousSubmission = await tx.evidenceSubmission.findUnique({
        where: { id: input.supersedesSubmissionId },
      });
      if (previousSubmission && previousSubmission.findingId === finding.id) {
        assertTransition(
          SUBMISSION_TRANSITIONS,
          previousSubmission.status,
          "SUPERSEDED",
          `Submission ${previousSubmission.reference}`,
        );
        await tx.evidenceSubmission.update({
          where: { id: previousSubmission.id },
          data: { status: "SUPERSEDED", supersededById: submission.id },
        });
      }
    }

    await tx.evidenceRequest.update({
      where: { id: request.id },
      data: { status: "RESPONDED" },
    });

    if (["EVIDENCE_REQUESTED", "ADDITIONAL_INFO_REQUESTED"].includes(finding.status)) {
      await tx.finding.update({ where: { id: finding.id }, data: { status: "PROVIDER_RESPONDED" } });
    }

    await audit.record(
      actor,
      {
        action: "EVIDENCE_UPLOADED",
        entityType: "EvidenceSubmission",
        entityId: submission.id,
        caseNumber: finding.inspection.caseNumber,
        newValue: `${reference}: ${input.files.map((f) => f.fileName).join(", ")}`,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "EVIDENCE_UPLOADED",
      description: `Provider uploaded ${input.files.map((f) => f.fileName).join(", ")}`,
      occurredAt: receivedAt,
    });

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      eventType: "RECEIPT_ISSUED",
      description: `Evidence receipt ${receiptNo} issued`,
      occurredAt: receivedAt,
    });

    await queueNotifications(tx, {
      userIds: await staffRecipients(finding.inspectionId),
      event: "EVIDENCE_UPLOADED",
      subject: `Provider evidence submitted on ${finding.inspection.caseNumber} (${finding.reference})`,
      body: `${finding.inspection.facility.name} responded to "${request.title}". Review required.`,
      linkPath: `/inspector/review/${submission.id}`,
      inspectionId: finding.inspectionId,
    });

    return { submissionId: submission.id, reference, receiptNumber: receiptNo, receivedAt };
  });

  await dispatchEmails({
    userIds: await staffRecipients(finding.inspectionId),
    event: "EVIDENCE_UPLOADED",
    subject: `Provider evidence submitted on ${finding.inspection.caseNumber}`,
    body: "",
    linkPath: `/inspector/review/${result.submissionId}`,
  });

  return result;
}

/**
 * Matching on title within the case is what makes a second upload of
 * "MedicationRecord.pdf" chain as version 2 rather than become a new document.
 */
async function findOrCreateDocument(
  tx: Prisma.TransactionClient,
  input: { inspectionId: string; facilityId: string; fileName: string; documentType: string | null },
): Promise<{ id: string }> {
  const existing = await tx.document.findFirst({
    where: { inspectionId: input.inspectionId, title: input.fileName },
    select: { id: true },
  });
  if (existing) return existing;

  return tx.document.create({
    data: {
      inspectionId: input.inspectionId,
      facilityId: input.facilityId,
      title: input.fileName,
      documentType: input.documentType,
    },
    select: { id: true },
  });
}

export interface ReviewEvidenceInput {
  submissionId: string;
  outcome: ReviewOutcome;
  reason?: string | null;
}

/**
 * Inspector determination on one submission (§10).
 *
 * Anything other than ACCEPTED must carry a reason — the provider is entitled to
 * know what was wrong with what they sent. Earlier determinations are retained
 * and marked not-current rather than edited.
 */
export async function reviewEvidence(actor: SessionUser, input: ReviewEvidenceInput) {
  assertReviewValid({ outcome: input.outcome, reason: input.reason });

  const submission = await prisma.evidenceSubmission.findUniqueOrThrow({
    where: { id: input.submissionId },
    include: {
      finding: { include: { inspection: { select: { id: true, caseNumber: true, facilityId: true } } } },
      reviews: { where: { isCurrent: true } },
    },
  });

  const previousOutcome = submission.reviews[0]?.outcome ?? null;
  const { finding } = submission;

  await prisma.$transaction(async (tx) => {
    await tx.evidenceReview.updateMany({
      where: { submissionId: submission.id, isCurrent: true },
      data: { isCurrent: false },
    });

    await tx.evidenceReview.create({
      data: {
        submissionId: submission.id,
        reviewerId: actor.id,
        outcome: input.outcome,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.evidenceSubmission.update({ where: { id: submission.id }, data: { status: "REVIEWED" } });

    if (finding.status === "PROVIDER_RESPONDED") {
      await tx.finding.update({ where: { id: finding.id }, data: { status: "UNDER_INSPECTOR_REVIEW" } });
    }

    if (input.outcome === "ADDITIONAL_INFO_REQUIRED") {
      await tx.evidenceRequest.update({
        where: { id: submission.evidenceRequestId },
        data: { status: "ADDITIONAL_INFO_REQUESTED" },
      });
      await tx.finding.update({
        where: { id: finding.id },
        data: { status: "ADDITIONAL_INFO_REQUESTED" },
      });
    } else if (input.outcome === "ACCEPTED") {
      await tx.evidenceRequest.update({
        where: { id: submission.evidenceRequestId },
        data: { status: "SATISFIED" },
      });
    }

    await audit.record(
      actor,
      {
        action: "EVIDENCE_REVIEWED",
        entityType: "EvidenceSubmission",
        entityId: submission.id,
        caseNumber: finding.inspection.caseNumber,
        previousValue: previousOutcome,
        newValue: input.outcome,
        reason: input.reason?.trim() || null,
      },
      tx,
    );

    await audit.timeline(tx, {
      inspectionId: finding.inspectionId,
      findingId: finding.id,
      actorId: actor.id,
      eventType: "EVIDENCE_REVIEWED",
      description: `${actor.fullName} reviewed ${submission.reference} — ${REVIEW_OUTCOME_LABELS[input.outcome].toLowerCase()}`,
    });

    await queueNotifications(tx, {
      userIds: await providerRecipients(finding.inspection.facilityId),
      event: input.outcome === "ADDITIONAL_INFO_REQUIRED" ? "ADDITIONAL_INFO_REQUESTED" : "EVIDENCE_REVIEWED",
      subject: `Evidence reviewed on ${finding.inspection.caseNumber} (${finding.reference})`,
      body: `Your submission ${submission.reference} was marked "${REVIEW_OUTCOME_LABELS[input.outcome]}".`,
      linkPath: `/provider/findings/${finding.id}`,
      inspectionId: finding.inspectionId,
    });
  });

  await dispatchEmails({
    userIds: await providerRecipients(finding.inspection.facilityId),
    event: "EVIDENCE_REVIEWED",
    subject: `Evidence reviewed on ${finding.inspection.caseNumber}`,
    body: "",
    linkPath: `/provider/findings/${finding.id}`,
  });
}

/** The guard's view of a finding: every live submission and its current outcome. */
export async function submissionsForGuard(findingId: string) {
  const submissions = await prisma.evidenceSubmission.findMany({
    where: { findingId },
    include: { reviews: { where: { isCurrent: true }, select: { outcome: true } } },
    orderBy: { submittedAt: "asc" },
  });

  return submissions.map((s) => ({
    id: s.id,
    reference: s.reference,
    submittedAt: s.submittedAt,
    currentReviewOutcome: s.reviews[0]?.outcome ?? null,
    withdrawn: s.status === "WITHDRAWN",
  }));
}
