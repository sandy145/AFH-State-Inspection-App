/**
 * The evidence lifecycle against a real database (§43).
 *
 * Covers: submission produces a receipt and an audit event, evidence is never
 * overwritten, the citation guard blocks and then allows, overrides demand
 * justification, corrections work, and IDR leaves correction status alone.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildFixture, pdf, prisma, resetDatabase, type Fixture } from "./helpers";
import { createEvidenceRequest, reviewEvidence, submitEvidence } from "@/data/evidence";
import { draftCitation, finalizeCitation, approveOverride } from "@/data/citations";
import { submitCorrection } from "@/data/corrections";
import { requestIDR } from "@/data/idr";
import { DomainError } from "@/domain/types";

let fx: Fixture;

beforeEach(async () => {
  fx = await buildFixture();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

async function openRequest(overrides: Partial<Parameters<typeof createEvidenceRequest>[1]> = {}) {
  return createEvidenceRequest(fx.inspector, {
    findingId: fx.findingAId,
    title: "Residency agreement for Resident A",
    instructions: "Provide the signed agreement in effect on the date of inspection.",
    itemsRequested: "Signed residency agreement.",
    ...overrides,
  });
}

describe("evidence submission", () => {
  it("issues a receipt naming the case, finding, file and time received", async () => {
    const request = await openRequest();
    const result = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("ResidencyAgreement.pdf")],
      providerExplanation: "Section 4 on page 3.",
    });

    const receipt = await prisma.receipt.findUniqueOrThrow({ where: { submissionId: result.submissionId } });

    expect(receipt.receiptNumber).toBe(result.receiptNumber);
    expect(receipt.caseNumber).toBe("AFH-TEST-000001");
    expect(receipt.findingReference).toBe("F-001");
    expect(receipt.fileNames).toBe("ResidencyAgreement.pdf");
    expect(receipt.submittedByName).toBe("Provider A");
    expect(receipt.receivedAt).toEqual(result.receivedAt);
    // The provider gets a citable identifier for the submission itself.
    expect(result.reference).toMatch(/^EV-[0-9A-F]{7}$/);
  });

  it("writes an audit event for the upload", async () => {
    const request = await openRequest();
    const result = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("ResidencyAgreement.pdf")],
    });

    const events = await prisma.auditEvent.findMany({
      where: { action: "EVIDENCE_UPLOADED", entityId: result.submissionId },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorEmail: "prova@test.local",
      actorRole: "PROVIDER",
      entityType: "EvidenceSubmission",
      caseNumber: "AFH-TEST-000001",
    });
    expect(events[0]!.newValue).toContain("ResidencyAgreement.pdf");
  });

  it("adds a timeline entry the provider and the state both read", async () => {
    const request = await openRequest();
    await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("ResidencyAgreement.pdf")],
    });

    const events = await prisma.timelineEvent.findMany({
      where: { inspectionId: fx.inspectionAId },
      orderBy: { occurredAt: "asc" },
    });
    const types = events.map((e) => e.eventType);

    expect(types).toContain("EVIDENCE_REQUESTED");
    expect(types).toContain("EVIDENCE_UPLOADED");
    expect(types).toContain("RECEIPT_ISSUED");
  });

  it("NEVER overwrites evidence — a re-upload becomes version 2", async () => {
    const request = await openRequest();

    const first = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("MedicationRecord.pdf", "version one")],
    });
    const second = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("MedicationRecord.pdf", "version two with the order attached")],
      supersedesSubmissionId: first.submissionId,
    });

    const versions = await prisma.documentVersion.findMany({
      where: { fileName: "MedicationRecord.pdf" },
      orderBy: { version: "asc" },
    });

    expect(versions).toHaveLength(2);
    expect(versions[0]!.version).toBe(1);
    expect(versions[1]!.version).toBe(2);
    // The chain is intact and only the newest is current.
    expect(versions[1]!.previousVersionId).toBe(versions[0]!.id);
    expect(versions[0]!.isCurrent).toBe(false);
    expect(versions[1]!.isCurrent).toBe(true);
    // Different bytes produce different checksums; version 1 is still readable.
    expect(versions[0]!.checksum).not.toBe(versions[1]!.checksum);

    const superseded = await prisma.evidenceSubmission.findUniqueOrThrow({
      where: { id: first.submissionId },
    });
    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.supersededById).toBe(second.submissionId);

    // Both receipts survive: the provider can still prove the first submission.
    expect(await prisma.receipt.count()).toBe(2);
  });

  it("refuses a file type that is not on the accepted list", async () => {
    const request = await openRequest();

    await expect(
      submitEvidence(fx.providerA, {
        evidenceRequestId: request.id,
        files: [{ fileName: "payload.exe", mimeType: "application/x-msdownload", body: Buffer.from("MZ") }],
      }),
    ).rejects.toThrow(/not an accepted file type/i);

    expect(await prisma.evidenceSubmission.count()).toBe(0);
  });

  it("requires an explanation when the request asked for one", async () => {
    const request = await openRequest({ explanationRequired: true });

    await expect(
      submitEvidence(fx.providerA, { evidenceRequestId: request.id, files: [pdf("A.pdf")] }),
    ).rejects.toThrow(/written explanation/i);
  });
});

describe("evidence review", () => {
  it("records the determination and notifies the provider", async () => {
    const request = await openRequest();
    const submission = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("ResidencyAgreement.pdf")],
    });

    await reviewEvidence(fx.inspector, { submissionId: submission.submissionId, outcome: "ACCEPTED" });

    const review = await prisma.evidenceReview.findFirstOrThrow({
      where: { submissionId: submission.submissionId, isCurrent: true },
    });
    expect(review.outcome).toBe("ACCEPTED");
    expect(review.reviewerId).toBe(fx.inspector.id);

    const audits = await prisma.auditEvent.findMany({ where: { action: "EVIDENCE_REVIEWED" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.newValue).toBe("ACCEPTED");

    const notice = await prisma.notification.findFirst({
      where: { userId: fx.providerA.id, event: "EVIDENCE_REVIEWED" },
    });
    expect(notice).not.toBeNull();
  });

  it("demands a reason for anything short of acceptance", async () => {
    const request = await openRequest();
    const submission = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("Wrong.pdf")],
    });

    await expect(
      reviewEvidence(fx.inspector, { submissionId: submission.submissionId, outcome: "INSUFFICIENT" }),
    ).rejects.toThrow(DomainError);

    await reviewEvidence(fx.inspector, {
      submissionId: submission.submissionId,
      outcome: "INSUFFICIENT",
      reason: "The agreement provided is dated after the inspection.",
    });

    const review = await prisma.evidenceReview.findFirstOrThrow({
      where: { submissionId: submission.submissionId, isCurrent: true },
    });
    expect(review.reason).toBe("The agreement provided is dated after the inspection.");
  });

  it("keeps the earlier determination rather than editing it", async () => {
    const request = await openRequest();
    const submission = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("A.pdf")],
    });

    await reviewEvidence(fx.inspector, {
      submissionId: submission.submissionId,
      outcome: "INSUFFICIENT",
      reason: "Missing the signature page.",
    });
    await reviewEvidence(fx.inspector, { submissionId: submission.submissionId, outcome: "ACCEPTED" });

    const all = await prisma.evidenceReview.findMany({
      where: { submissionId: submission.submissionId },
      orderBy: { reviewedAt: "asc" },
    });

    expect(all).toHaveLength(2);
    expect(all[0]!.isCurrent).toBe(false);
    expect(all[1]!.isCurrent).toBe(true);
    expect(all[1]!.outcome).toBe("ACCEPTED");
  });
});

describe("the citation guard, end to end", () => {
  async function draftWithUnreviewedEvidence() {
    const request = await openRequest();
    await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("ResidencyAgreement.pdf")],
    });

    return draftCitation(fx.inspector, {
      findingId: fx.findingAId,
      deficientPractice: "The residency agreement did not contain required information.",
      inspectorAnalysis: "Draft.",
    });
  }

  it("BLOCKS finalization while provider evidence is unreviewed", async () => {
    const citation = await draftWithUnreviewedEvidence();

    await expect(finalizeCitation(fx.inspector, { citationId: citation.id })).rejects.toThrow(
      /has not been reviewed/i,
    );

    const after = await prisma.citation.findUniqueOrThrow({ where: { id: citation.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.citedAt).toBeNull();
  });

  it("audits the blocked attempt, because the refusal is part of the record", async () => {
    const citation = await draftWithUnreviewedEvidence();
    await finalizeCitation(fx.inspector, { citationId: citation.id }).catch(() => undefined);

    const blocked = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "CITATION_FINALIZATION_BLOCKED" },
    });
    expect(blocked.entityId).toBe(citation.id);
    expect(blocked.reason).toMatch(/1 submission\(s\) unreviewed/);
  });

  it("ALLOWS finalization once every submission has been reviewed", async () => {
    const citation = await draftWithUnreviewedEvidence();
    const submission = await prisma.evidenceSubmission.findFirstOrThrow({
      where: { findingId: fx.findingAId },
    });

    await reviewEvidence(fx.inspector, {
      submissionId: submission.id,
      outcome: "INSUFFICIENT",
      reason: "The agreement supplied is not the one in effect on the date of inspection.",
    });

    const result = await finalizeCitation(fx.inspector, {
      citationId: citation.id,
      serviceMethod: "CERTIFIED_MAIL",
      servedAt: new Date("2026-08-24T17:00:00Z"),
      receivedAt: new Date("2026-08-27T17:00:00Z"),
    });

    expect(result.overrideUsed).toBe(false);
    const after = await prisma.citation.findUniqueOrThrow({ where: { id: citation.id } });
    expect(after.status).toBe("FINALIZED");
    expect(after.overrideUsed).toBe(false);

    // A correction obligation and its deadline are created from configuration.
    expect(result.correctionDueAt).not.toBeNull();
    const correction = await prisma.correction.findFirstOrThrow({ where: { citationId: citation.id } });
    expect(correction.status).toBe("NOT_SUBMITTED");
    // 45 calendar days from receipt, per the seeded rule.
    expect(result.correctionDueAt!.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  it("refuses an override with no justification", async () => {
    const citation = await draftWithUnreviewedEvidence();

    await expect(
      finalizeCitation(fx.inspector, { citationId: citation.id, overrideJustification: "  " }),
    ).rejects.toThrow(/has not been reviewed/i);
    await expect(
      finalizeCitation(fx.inspector, { citationId: citation.id, overrideJustification: "because" }),
    ).rejects.toThrow(/at least 20 characters/i);

    expect((await prisma.citation.findUniqueOrThrow({ where: { id: citation.id } })).status).toBe("DRAFT");
  });

  it("records an override with its justification, actor and time, and holds it for approval", async () => {
    const citation = await draftWithUnreviewedEvidence();
    const justification =
      "The outstanding submission relates to a different resident and was reviewed under finding F-002.";

    const result = await finalizeCitation(fx.inspector, {
      citationId: citation.id,
      overrideJustification: justification,
    });

    expect(result.overrideUsed).toBe(true);
    // Policy in this fixture requires a Field Manager to countersign.
    expect(result.pendingFieldManagerApproval).toBe(true);

    const after = await prisma.citation.findUniqueOrThrow({ where: { id: citation.id } });
    expect(after.overrideJustification).toBe(justification);
    expect(after.overrideById).toBe(fx.inspector.id);
    expect(after.overrideAt).not.toBeNull();
    expect(after.overridePendingApproval).toBe(true);

    const override = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "ADMINISTRATIVE_OVERRIDE" },
    });
    expect(override.reason).toBe(justification);
    expect(override.previousValue).toMatch(/1 unreviewed submission/);
    expect(override.actorEmail).toBe("insp1@test.local");

    await approveOverride(fx.manager, citation.id, "Reviewed with the inspector.");
    const approved = await prisma.citation.findUniqueOrThrow({ where: { id: citation.id } });
    expect(approved.overridePendingApproval).toBe(false);
    expect(approved.overrideApprovedById).toBe(fx.manager.id);
    expect(await prisma.auditEvent.count({ where: { action: "OVERRIDE_APPROVED" } })).toBe(1);
  });

  it("does not hold a Field Manager's own override for approval", async () => {
    const citation = await draftWithUnreviewedEvidence();

    const result = await finalizeCitation(fx.manager, {
      citationId: citation.id,
      overrideJustification: "Reviewed jointly with the inspector before finalizing this citation.",
    });

    expect(result.overrideUsed).toBe(true);
    expect(result.pendingFieldManagerApproval).toBe(false);
  });
});

describe("correction and IDR", () => {
  async function finalizedCitation() {
    const request = await openRequest();
    const submission = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("A.pdf")],
    });
    await reviewEvidence(fx.inspector, {
      submissionId: submission.submissionId,
      outcome: "INSUFFICIENT",
      reason: "Does not establish compliance on the date of inspection.",
    });

    const citation = await draftCitation(fx.inspector, {
      findingId: fx.findingAId,
      deficientPractice: "The residency agreement did not contain required information.",
      inspectorAnalysis: "All provider evidence was reviewed before finalizing.",
    });

    await finalizeCitation(fx.inspector, {
      citationId: citation.id,
      serviceMethod: "CERTIFIED_MAIL",
      receivedAt: new Date("2026-08-27T17:00:00Z"),
    });

    return citation;
  }

  it("lets the provider submit an attestation of correction", async () => {
    const citation = await finalizedCitation();
    const correction = await prisma.correction.findFirstOrThrow({ where: { citationId: citation.id } });

    await submitCorrection(fx.providerA, {
      correctionId: correction.id,
      howCorrected: "All residency agreements were reviewed and the missing section added.",
      correctionCompletedAt: new Date("2026-09-05T00:00:00Z"),
      howMaintained: "The admission checklist now requires a second signature confirming each section.",
      responsiblePerson: "Provider A",
      signatureName: "Provider A",
      signatureTitle: "Provider",
      files: [pdf("UpdatedAgreement.pdf")],
    });

    const after = await prisma.correction.findUniqueOrThrow({ where: { id: correction.id } });
    expect(after.status).toBe("SUBMITTED");
    expect(after.signatureName).toBe("Provider A");
    // Attested date and portal receipt time are recorded as separate facts.
    expect(after.signedAt).not.toBeNull();
    expect(after.submittedAt).not.toBeNull();
    expect(after.submittedById).toBe(fx.providerA.id);

    expect(await prisma.correctionEvidence.count({ where: { correctionId: correction.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "CORRECTION_SUBMITTED" } })).toBe(1);

    // Meeting the deadline is recorded on the deadline, which is not rewritten.
    const deadline = await prisma.deadline.findFirstOrThrow({
      where: { citationId: citation.id, ruleKey: "ATTESTATION_OF_CORRECTION_DUE" },
    });
    expect(deadline.status).toBe("MET");
    expect(deadline.dueAt.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  it("refuses an incomplete correction", async () => {
    const citation = await finalizedCitation();
    const correction = await prisma.correction.findFirstOrThrow({ where: { citationId: citation.id } });

    await expect(
      submitCorrection(fx.providerA, {
        correctionId: correction.id,
        howCorrected: "Fixed.",
        correctionCompletedAt: new Date(),
        howMaintained: "",
        responsiblePerson: "Provider A",
        signatureName: "Provider A",
      }),
    ).rejects.toThrow(/Complete every part/i);
  });

  it("does NOT erase correction status when an IDR is opened (§15)", async () => {
    const citation = await finalizedCitation();
    const correction = await prisma.correction.findFirstOrThrow({ where: { citationId: citation.id } });

    await submitCorrection(fx.providerA, {
      correctionId: correction.id,
      howCorrected: "Agreements updated.",
      correctionCompletedAt: new Date("2026-09-05T00:00:00Z"),
      howMaintained: "Checklist updated.",
      responsiblePerson: "Provider A",
      signatureName: "Provider A",
    });

    const before = await prisma.correction.findUniqueOrThrow({ where: { id: correction.id } });
    expect(before.status).toBe("SUBMITTED");

    const idr = await requestIDR(fx.providerA, {
      citationId: citation.id,
      reason: "The agreement in effect did contain the required information.",
      requestedMethod: "DESK_REVIEW",
    });

    const after = await prisma.correction.findUniqueOrThrow({ where: { id: correction.id } });
    // The two axes are independent: the dispute is open, the correction stands.
    expect(after.status).toBe("SUBMITTED");
    expect(after.submittedAt).toEqual(before.submittedAt);
    expect(idr.status).toBe("REQUESTED");

    const finding = await prisma.finding.findUniqueOrThrow({ where: { id: fx.findingAId } });
    expect(finding.status).toBe("IDR_PENDING");

    // The IDR deadline uses working days, per the seeded rule.
    const deadline = await prisma.deadline.findFirstOrThrow({
      where: { idrRequestId: idr.id, ruleKey: "IDR_REQUEST_DUE" },
    });
    expect(deadline.computedFromEvent).toBe("CITATION_RECEIVED");
  });

  it("will not dispute a citation that was never issued", async () => {
    const citation = await draftCitation(fx.inspector, {
      findingId: fx.findingAId,
      deficientPractice: "Draft only.",
      inspectorAnalysis: "Draft only.",
    });

    await expect(
      requestIDR(fx.providerA, {
        citationId: citation.id,
        reason: "Disagree.",
        requestedMethod: "PANEL",
      }),
    ).rejects.toThrow(/only be disputed once it has been issued/i);
  });
});
