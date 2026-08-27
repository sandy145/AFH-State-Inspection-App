/**
 * "Every important status change produces an audit event" (§43).
 *
 * Rather than assert this one action at a time, this walks a case through its
 * whole lifecycle and then checks the audit log tells the same story — that no
 * step happened silently.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildFixture, pdf, prisma, resetDatabase, type Fixture } from "./helpers";
import { createEvidenceRequest, reviewEvidence, submitEvidence } from "@/data/evidence";
import { draftCitation, finalizeCitation, issueConsultation, rescindCitation } from "@/data/citations";
import { submitCorrection, reviewCorrection } from "@/data/corrections";
import { advanceIDR, requestIDR } from "@/data/idr";
import { completeFollowUp, scheduleFollowUp } from "@/data/followups";
import { createFinding, postMessage, reassignInspection, resolveFinding, setInspectionStatus } from "@/data/cases";

let fx: Fixture;

beforeEach(async () => {
  fx = await buildFixture();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

async function auditActions(): Promise<string[]> {
  const events = await prisma.auditEvent.findMany({ orderBy: { occurredAt: "asc" } });
  return events.map((e) => e.action);
}

describe("the audit log records the whole lifecycle", () => {
  it("captures every step from evidence request to back in compliance", async () => {
    const request = await createEvidenceRequest(fx.inspector, {
      findingId: fx.findingAId,
      title: "Residency agreement",
      instructions: "Provide the signed agreement in effect on the date of inspection.",
      itemsRequested: "Signed agreement.",
    });

    const submission = await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("Agreement.pdf")],
    });

    await reviewEvidence(fx.inspector, {
      submissionId: submission.submissionId,
      outcome: "INSUFFICIENT",
      reason: "The agreement provided is dated after the inspection.",
    });

    const citation = await draftCitation(fx.inspector, {
      findingId: fx.findingAId,
      deficientPractice: "The residency agreement did not contain required information.",
      inspectorAnalysis: "All submitted evidence was reviewed before finalizing.",
    });

    await finalizeCitation(fx.inspector, {
      citationId: citation.id,
      serviceMethod: "CERTIFIED_MAIL",
      receivedAt: new Date("2026-08-27T17:00:00Z"),
    });

    const correction = await prisma.correction.findFirstOrThrow({ where: { citationId: citation.id } });

    await submitCorrection(fx.providerA, {
      correctionId: correction.id,
      howCorrected: "Every agreement was reviewed and the missing section added.",
      correctionCompletedAt: new Date("2026-09-05T00:00:00Z"),
      howMaintained: "The admission checklist now requires a second signature.",
      responsiblePerson: "Provider A",
      signatureName: "Provider A",
    });

    await reviewCorrection(fx.inspector, { correctionId: correction.id, decision: "ACCEPTED" });

    const followUp = await scheduleFollowUp(fx.inspector, {
      inspectionId: fx.inspectionAId,
      citationId: citation.id,
      method: "DOCUMENT_REVIEW",
    });

    await completeFollowUp(fx.inspector, {
      followUpId: followUp.id,
      result: "BACK_IN_COMPLIANCE",
      backInCompliance: true,
    });

    const actions = await auditActions();

    // Each of these is a moment someone might later need to account for.
    for (const expected of [
      "EVIDENCE_REQUESTED",
      "EVIDENCE_UPLOADED",
      "EVIDENCE_REVIEWED",
      "CITATION_CREATED",
      "CITATION_FINALIZED",
      "CORRECTION_SUBMITTED",
      "CORRECTION_REVIEWED",
      "FOLLOW_UP_SCHEDULED",
      "FOLLOW_UP_COMPLETED",
    ]) {
      expect(actions, `missing audit event ${expected}`).toContain(expected);
    }
  });

  it("records who did what, on which case, with previous and new values", async () => {
    await resolveFinding(
      fx.inspector,
      fx.findingAId,
      "RESOLVED_NO_VIOLATION",
      "The agreement produced during the inspection contains the required information.",
    );

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "FINDING_STATUS_CHANGED" },
    });

    expect(event).toMatchObject({
      actorEmail: "insp1@test.local",
      actorRole: "INSPECTOR",
      entityType: "Finding",
      caseNumber: "AFH-TEST-000001",
      previousValue: "POTENTIAL_FINDING",
      newValue: "RESOLVED_NO_VIOLATION",
    });
    expect(event.reason).toContain("required information");
  });

  it("records consultation with the inspector's own reasoning", async () => {
    await issueConsultation(fx.inspector, {
      findingId: fx.findingAId,
      issueDescription: "The agreement was missing a required section.",
      rationale: "First occurrence, no resident harm, corrected during the inspection.",
    });

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: "CONSULTATION_ISSUED" } });
    expect(event.reason).toContain("First occurrence");
    expect(event.newValue).toBe("RESOLVED_CONSULTATION");
  });

  it("records a reassignment with who it moved from and to", async () => {
    const replacement = await prisma.user.create({
      data: { email: "insp9@test.local", fullName: "Replacement Inspector", role: "INSPECTOR", regionId: fx.regionId },
    });

    await reassignInspection(fx.manager, fx.inspectionAId, replacement.id, "Original inspector is on leave.");

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: "INSPECTION_REASSIGNED" } });
    expect(event.previousValue).toBe("Test Inspector");
    expect(event.newValue).toBe("Replacement Inspector");
    expect(event.reason).toBe("Original inspector is on leave.");
  });

  it("records a rescission and a dispute", async () => {
    const finding = await createFinding(fx.inspector, {
      inspectionId: fx.inspectionAId,
      title: "Background check timing",
      observation: "Unsupervised access appears to precede the result date.",
    });

    const citation = await draftCitation(fx.inspector, {
      findingId: finding.id,
      deficientPractice: "Unsupervised access before the background check result.",
      inspectorAnalysis: "No provider evidence was submitted on this finding.",
    });

    await finalizeCitation(fx.inspector, {
      citationId: citation.id,
      receivedAt: new Date("2026-08-27T17:00:00Z"),
    });

    const idr = await requestIDR(fx.providerA, {
      citationId: citation.id,
      reason: "The caregiver was supervised throughout.",
      requestedMethod: "DESK_REVIEW",
    });

    await advanceIDR(fx.manager, { idrRequestId: idr.id, status: "ACCEPTED_FOR_REVIEW" });
    await rescindCitation(fx.inspector, citation.id, "Timesheet confirms supervision throughout.");

    const actions = await auditActions();
    expect(actions).toContain("IDR_REQUESTED");
    expect(actions).toContain("IDR_STATUS_CHANGED");
    expect(actions).toContain("CITATION_RESCINDED");

    const rescission = await prisma.auditEvent.findFirstOrThrow({ where: { action: "CITATION_RESCINDED" } });
    expect(rescission.reason).toBe("Timesheet confirms supervision throughout.");
  });

  it("records case status changes and closure", async () => {
    await setInspectionStatus(fx.inspector, fx.inspectionAId, "PENDING_REPORT");
    await setInspectionStatus(fx.inspector, fx.inspectionAId, "REPORT_ISSUED");
    await setInspectionStatus(fx.inspector, fx.inspectionAId, "CLOSED");

    const actions = await auditActions();
    expect(actions.filter((a) => a === "INSPECTION_STATUS_CHANGED")).toHaveLength(2);
    expect(actions).toContain("CASE_CLOSED");
  });

  it("records messages without putting their content in the audit row", async () => {
    await postMessage(fx.inspector, fx.findingAId, "Please send the July medication record.", false);

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: "MESSAGE_POSTED" } });
    // The audit log says a message was posted, not what it said — the message
    // itself lives on the finding, where access is scoped.
    expect(event.newValue).toBe("message to provider");
    expect(event.newValue).not.toContain("medication");
  });

  it("builds a timeline that matches the audit trail", async () => {
    const request = await createEvidenceRequest(fx.inspector, {
      findingId: fx.findingAId,
      title: "Residency agreement",
      instructions: "Provide the agreement.",
      itemsRequested: "Agreement.",
    });
    await submitEvidence(fx.providerA, { evidenceRequestId: request.id, files: [pdf("A.pdf")] });

    const timeline = await prisma.timelineEvent.findMany({
      where: { inspectionId: fx.inspectionAId },
      orderBy: { occurredAt: "asc" },
    });

    const types = timeline.map((t) => t.eventType);
    expect(types).toEqual(["EVIDENCE_REQUESTED", "EVIDENCE_UPLOADED", "RECEIPT_ISSUED"]);
    // Timeline entries are written for people to read, not machine keys alone.
    expect(timeline[1]!.description).toContain("A.pdf");
  });
});
