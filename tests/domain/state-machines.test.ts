import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  CITATION_TRANSITIONS,
  CORRECTION_TRANSITIONS,
  correctionStatusAfterIDR,
  FINDING_TRANSITIONS,
  IDR_TRANSITIONS,
  INSPECTION_TRANSITIONS,
  SUBMISSION_TRANSITIONS,
} from "@/domain/state-machines";
import { DomainError } from "@/domain/types";

describe("finding lifecycle", () => {
  it("walks the evidence path described in §6", () => {
    const path = [
      "DRAFT",
      "POTENTIAL_FINDING",
      "EVIDENCE_REQUESTED",
      "PROVIDER_RESPONDED",
      "UNDER_INSPECTOR_REVIEW",
      "RESOLVED_NO_VIOLATION",
      "CLOSED",
    ] as const;

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(FINDING_TRANSITIONS, path[i], path[i + 1])).toBe(true);
    }
  });

  it("walks the citation path through correction to compliance", () => {
    const path = [
      "UNDER_INSPECTOR_REVIEW",
      "CITATION_ISSUED",
      "CORRECTION_PENDING",
      "CORRECTION_UNDER_REVIEW",
      "CORRECTED_BACK_IN_COMPLIANCE",
      "CLOSED",
    ] as const;

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(FINDING_TRANSITIONS, path[i], path[i + 1])).toBe(true);
    }
  });

  it("refuses to jump straight from draft to a citation", () => {
    expect(canTransition(FINDING_TRANSITIONS, "DRAFT", "CITATION_ISSUED")).toBe(false);
    expect(() => assertTransition(FINDING_TRANSITIONS, "DRAFT", "CITATION_ISSUED", "Finding")).toThrow(
      DomainError,
    );
  });

  it("treats a closed finding as terminal", () => {
    expect(FINDING_TRANSITIONS.CLOSED).toHaveLength(0);
    expect(canTransition(FINDING_TRANSITIONS, "CLOSED", "POTENTIAL_FINDING")).toBe(false);
  });

  it("allows a no-op write", () => {
    expect(canTransition(FINDING_TRANSITIONS, "EVIDENCE_REQUESTED", "EVIDENCE_REQUESTED")).toBe(true);
  });

  it("names both states when it throws", () => {
    expect(() => assertTransition(FINDING_TRANSITIONS, "CLOSED", "DRAFT", "Finding F-004")).toThrow(
      /Finding F-004 cannot move from CLOSED to DRAFT/,
    );
  });
});

describe("IDR runs on its own axis (§15)", () => {
  it("does not erase correction status", () => {
    for (const status of ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "NOT_SUBMITTED"] as const) {
      expect(correctionStatusAfterIDR(status)).toBe(status);
    }
  });

  it("lets a finding in correction move to IDR and back into the correction flow", () => {
    expect(canTransition(FINDING_TRANSITIONS, "CORRECTION_PENDING", "IDR_PENDING")).toBe(true);
    expect(canTransition(FINDING_TRANSITIONS, "IDR_PENDING", "CORRECTION_PENDING")).toBe(true);
    expect(canTransition(FINDING_TRANSITIONS, "IDR_PENDING", "CORRECTED_BACK_IN_COMPLIANCE")).toBe(true);
  });

  it("ends every IDR in a terminal outcome", () => {
    for (const terminal of [
      "COMPLETED_UPHELD",
      "COMPLETED_MODIFIED",
      "COMPLETED_RESCINDED",
      "WITHDRAWN",
      "DENIED_UNTIMELY",
    ] as const) {
      expect(IDR_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });

  it("cannot decide an IDR that was never reviewed", () => {
    expect(canTransition(IDR_TRANSITIONS, "REQUESTED", "COMPLETED_UPHELD")).toBe(false);
  });
});

describe("citation lifecycle", () => {
  it("requires a draft before finalization", () => {
    expect(canTransition(CITATION_TRANSITIONS, "DRAFT", "FINALIZED")).toBe(true);
    expect(canTransition(CITATION_TRANSITIONS, "CORRECTED", "DRAFT")).toBe(false);
  });

  it("allows rescission from any live state and treats it as terminal", () => {
    for (const from of ["DRAFT", "FINALIZED", "CORRECTION_PENDING", "CORRECTED"] as const) {
      expect(canTransition(CITATION_TRANSITIONS, from, "RESCINDED")).toBe(true);
    }
    expect(CITATION_TRANSITIONS.RESCINDED).toHaveLength(0);
  });
});

describe("correction lifecycle", () => {
  it("cannot be accepted before it is reviewed", () => {
    expect(canTransition(CORRECTION_TRANSITIONS, "SUBMITTED", "ACCEPTED")).toBe(false);
    expect(canTransition(CORRECTION_TRANSITIONS, "SUBMITTED", "UNDER_REVIEW")).toBe(true);
    expect(canTransition(CORRECTION_TRANSITIONS, "UNDER_REVIEW", "ACCEPTED")).toBe(true);
  });

  it("can be sent back to the provider for more information", () => {
    expect(canTransition(CORRECTION_TRANSITIONS, "UNDER_REVIEW", "ADDITIONAL_INFO_REQUESTED")).toBe(true);
    expect(canTransition(CORRECTION_TRANSITIONS, "ADDITIONAL_INFO_REQUESTED", "SUBMITTED")).toBe(true);
  });
});

describe("submission and inspection lifecycles", () => {
  it("never un-supersedes a submission", () => {
    expect(SUBMISSION_TRANSITIONS.SUPERSEDED).toHaveLength(0);
    expect(canTransition(SUBMISSION_TRANSITIONS, "SUPERSEDED", "SUBMITTED")).toBe(false);
  });

  it("allows a reviewed submission to be reopened for a second look", () => {
    expect(canTransition(SUBMISSION_TRANSITIONS, "REVIEWED", "UNDER_REVIEW")).toBe(true);
  });

  it("cannot reopen a closed inspection", () => {
    expect(INSPECTION_TRANSITIONS.CLOSED).toHaveLength(0);
    expect(canTransition(INSPECTION_TRANSITIONS, "CLOSED", "IN_PROGRESS")).toBe(false);
  });

  it("cannot issue a report before one is pending", () => {
    expect(canTransition(INSPECTION_TRANSITIONS, "IN_PROGRESS", "REPORT_ISSUED")).toBe(false);
    expect(canTransition(INSPECTION_TRANSITIONS, "PENDING_REPORT", "REPORT_ISSUED")).toBe(true);
  });
});
