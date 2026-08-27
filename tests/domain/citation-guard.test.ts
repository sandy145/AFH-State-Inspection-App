/**
 * The rule this product exists to enforce (§9, §37).
 *
 * A citation must not be finalized while provider evidence attached to the
 * finding is still sitting unreviewed.
 */
import { describe, expect, it } from "vitest";
import {
  assertOverrideValid,
  assertReviewValid,
  assertUploadAllowed,
  evaluateCitationGuard,
  isAllowedUpload,
  reviewRequiresReason,
  summarizeEvidenceReview,
  UNREVIEWED_EVIDENCE_BLOCK_MESSAGE,
} from "@/domain/evidence";
import type { SubmissionForGuard } from "@/domain/evidence";
import { DomainError } from "@/domain/types";

const submission = (over: Partial<SubmissionForGuard> = {}): SubmissionForGuard => ({
  id: crypto.randomUUID(),
  reference: "EV-0000001",
  submittedAt: new Date("2026-08-21T17:14:22.000Z"),
  currentReviewOutcome: null,
  ...over,
});

describe("citation finalization guard", () => {
  it("allows finalization when the finding has no provider evidence at all", () => {
    const result = evaluateCitationGuard([]);
    expect(result.allowed).toBe(true);
    expect(result.requiresOverride).toBe(false);
  });

  it("BLOCKS finalization while any submission is unreviewed", () => {
    const result = evaluateCitationGuard([
      submission({ reference: "EV-7A82F93", currentReviewOutcome: "ACCEPTED" }),
      submission({ reference: "EV-1B04C22", currentReviewOutcome: null }),
    ]);

    expect(result.allowed).toBe(false);
    expect(result.requiresOverride).toBe(true);
    expect(result.reason).toBe(UNREVIEWED_EVIDENCE_BLOCK_MESSAGE);
    expect(result.summary.unreviewedReferences).toEqual(["EV-1B04C22"]);
  });

  it("names every unreviewed submission so the inspector knows what to open", () => {
    const result = evaluateCitationGuard([
      submission({ reference: "EV-AAA0001" }),
      submission({ reference: "EV-BBB0002" }),
      submission({ reference: "EV-CCC0003", currentReviewOutcome: "INSUFFICIENT" }),
    ]);
    expect(result.summary.unreviewedReferences).toEqual(["EV-AAA0001", "EV-BBB0002"]);
    expect(result.summary.unreviewed).toBe(2);
  });

  it("ALLOWS finalization once every submission has been reviewed", () => {
    const result = evaluateCitationGuard([
      submission({ currentReviewOutcome: "ACCEPTED" }),
      submission({ currentReviewOutcome: "INSUFFICIENT" }),
      submission({ currentReviewOutcome: "NOT_APPLICABLE" }),
    ]);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("does not count withdrawn submissions against the guard", () => {
    const result = evaluateCitationGuard([
      submission({ currentReviewOutcome: "ACCEPTED" }),
      submission({ currentReviewOutcome: null, withdrawn: true }),
    ]);
    expect(result.allowed).toBe(true);
    expect(result.summary.totalSubmissions).toBe(1);
  });

  it("still blocks when a submission was reviewed and a newer one was not", () => {
    // The realistic failure mode: an inspector reviews version 1, the provider
    // sends version 2, and the case moves to citation without a second look.
    const result = evaluateCitationGuard([
      submission({ reference: "EV-V1", currentReviewOutcome: "INSUFFICIENT" }),
      submission({ reference: "EV-V2", currentReviewOutcome: null }),
    ]);
    expect(result.allowed).toBe(false);
    expect(result.summary.unreviewedReferences).toEqual(["EV-V2"]);
  });
});

describe("evidence review summary shown before citation creation (§13)", () => {
  it("counts files, reviews, acceptances and rejections", () => {
    const summary = summarizeEvidenceReview([
      submission({ currentReviewOutcome: "ACCEPTED" }),
      submission({ currentReviewOutcome: "ACCEPTED" }),
      submission({ currentReviewOutcome: "ACCEPTED" }),
      submission({ currentReviewOutcome: "INSUFFICIENT" }),
    ]);

    expect(summary).toMatchObject({
      totalSubmissions: 4,
      reviewed: 4,
      unreviewed: 0,
      accepted: 3,
      insufficient: 1,
    });
  });
});

describe("review determinations", () => {
  it("requires a documented reason for every outcome except acceptance", () => {
    expect(reviewRequiresReason("ACCEPTED")).toBe(false);
    for (const outcome of [
      "PARTIALLY_ACCEPTED",
      "INSUFFICIENT",
      "WRONG_DOCUMENT",
      "ADDITIONAL_INFO_REQUIRED",
      "SUPERSEDED",
      "NOT_APPLICABLE",
    ] as const) {
      expect(reviewRequiresReason(outcome)).toBe(true);
      expect(() => assertReviewValid({ outcome })).toThrow(DomainError);
      expect(() => assertReviewValid({ outcome, reason: "   " })).toThrow(/documented reason/i);
      expect(() => assertReviewValid({ outcome, reason: "Page 14 is missing." })).not.toThrow();
    }
  });

  it("accepts an acceptance with no reason", () => {
    expect(() => assertReviewValid({ outcome: "ACCEPTED" })).not.toThrow();
  });
});

describe("override of the guard", () => {
  const base = { fieldManagerApprovalRequired: false, actorIsFieldManager: false };

  it("refuses an override with no justification", () => {
    expect(() => assertOverrideValid({ ...base })).toThrow(DomainError);
    expect(() => assertOverrideValid({ ...base, justification: "" })).toThrow(/written explanation/i);
  });

  it("refuses a token justification", () => {
    expect(() => assertOverrideValid({ ...base, justification: "ok" })).toThrow(/at least 20/i);
  });

  it("accepts a substantive justification", () => {
    const decision = assertOverrideValid({
      ...base,
      justification: "Evidence relates to a different resident and was reviewed under finding F-002.",
    });
    expect(decision.pendingApproval).toBe(false);
  });

  it("holds an inspector override for Field Manager approval when policy requires it", () => {
    const decision = assertOverrideValid({
      justification: "Evidence relates to a different resident and was reviewed under finding F-002.",
      fieldManagerApprovalRequired: true,
      actorIsFieldManager: false,
    });
    expect(decision.pendingApproval).toBe(true);
  });

  it("does not ask a Field Manager to approve their own override", () => {
    const decision = assertOverrideValid({
      justification: "Evidence relates to a different resident and was reviewed under finding F-002.",
      fieldManagerApprovalRequired: true,
      actorIsFieldManager: true,
    });
    expect(decision.pendingApproval).toBe(false);
  });
});

describe("upload validation", () => {
  it("accepts the document types providers actually send", () => {
    expect(isAllowedUpload("ResidencyAgreement.pdf", "application/pdf")).toBe(true);
    expect(isAllowedUpload("MedicationRecord.JPG", "image/jpeg")).toBe(true);
    expect(
      isAllowedUpload(
        "Roster.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
  });

  it("refuses executables and mismatched declarations", () => {
    expect(isAllowedUpload("payload.exe", "application/x-msdownload")).toBe(false);
    // A .exe renamed to .pdf still has to match its declared type.
    expect(isAllowedUpload("payload.exe", "application/pdf")).toBe(false);
    expect(isAllowedUpload("agreement.pdf", "application/x-msdownload")).toBe(false);
  });

  it("enforces the size limit and rejects empty files", () => {
    const max = 25 * 1024 * 1024;
    expect(() => assertUploadAllowed("a.pdf", "application/pdf", 1024, max)).not.toThrow();
    expect(() => assertUploadAllowed("a.pdf", "application/pdf", 0, max)).toThrow(/empty/i);
    expect(() => assertUploadAllowed("a.pdf", "application/pdf", max + 1, max)).toThrow(/25 MB limit/);
    expect(() => assertUploadAllowed("a.exe", "application/pdf", 10, max)).toThrow(/not an accepted file type/i);
  });
});
