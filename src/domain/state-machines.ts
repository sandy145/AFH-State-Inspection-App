/**
 * State machines (§6, §13, §14, §15).
 *
 * Transitions are declared as tables rather than scattered through the code, so
 * the legal lifecycle of a case is readable in one place and an illegal move
 * fails loudly before anything is written. Every applied transition is expected
 * to emit a timeline event and an audit event in the same transaction as the
 * status change — see `src/data/transitions.ts`.
 *
 * Note that IDR is deliberately absent from the correction machine. A citation
 * can be in CORRECTION_PENDING while an IDR request is open; those are separate
 * axes and must never be folded into one status field.
 */
import { DomainError } from "./types";
import type {
  CitationStatus,
  CorrectionStatus,
  FindingStatus,
  IDRStatus,
  InspectionStatus,
  SubmissionStatus,
} from "./types";

export type TransitionTable<S extends string> = Record<S, readonly S[]>;

export const INSPECTION_TRANSITIONS: TransitionTable<InspectionStatus> = {
  DRAFT: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["EVIDENCE_REVIEW", "PENDING_REPORT", "CANCELLED"],
  EVIDENCE_REVIEW: ["IN_PROGRESS", "PENDING_REPORT", "CANCELLED"],
  PENDING_REPORT: ["REPORT_ISSUED", "EVIDENCE_REVIEW", "CANCELLED"],
  REPORT_ISSUED: ["CORRECTION_PERIOD", "FOLLOW_UP", "CLOSED"],
  CORRECTION_PERIOD: ["FOLLOW_UP", "CLOSED"],
  FOLLOW_UP: ["CORRECTION_PERIOD", "CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const FINDING_TRANSITIONS: TransitionTable<FindingStatus> = {
  DRAFT: ["POTENTIAL_FINDING", "CLOSED"],
  POTENTIAL_FINDING: [
    "EVIDENCE_REQUESTED",
    "UNDER_INSPECTOR_REVIEW",
    "RESOLVED_NO_VIOLATION",
    "RESOLVED_CONSULTATION",
    "CITATION_ISSUED",
    "CLOSED",
  ],
  EVIDENCE_REQUESTED: ["PROVIDER_RESPONDED", "UNDER_INSPECTOR_REVIEW", "POTENTIAL_FINDING", "CLOSED"],
  // CITATION_ISSUED is reachable here only through an authorized override: the
  // provider has responded and nobody has reviewed it yet. The transition table
  // describes which lifecycle moves exist; it is `evaluateCitationGuard` in
  // domain/evidence.ts, not this table, that refuses the unreviewed case. Keep
  // the two concerns apart — encoding the guard here as well would make the
  // override path unrepresentable rather than exceptional.
  PROVIDER_RESPONDED: ["UNDER_INSPECTOR_REVIEW", "EVIDENCE_REQUESTED", "CITATION_ISSUED"],
  UNDER_INSPECTOR_REVIEW: [
    "ADDITIONAL_INFO_REQUESTED",
    "RESOLVED_NO_VIOLATION",
    "RESOLVED_CONSULTATION",
    "CITATION_ISSUED",
    "EVIDENCE_REQUESTED",
  ],
  ADDITIONAL_INFO_REQUESTED: ["PROVIDER_RESPONDED", "UNDER_INSPECTOR_REVIEW", "CLOSED"],
  RESOLVED_NO_VIOLATION: ["CLOSED", "UNDER_INSPECTOR_REVIEW"],
  RESOLVED_CONSULTATION: ["CLOSED", "UNDER_INSPECTOR_REVIEW"],
  CITATION_ISSUED: ["CORRECTION_PENDING", "IDR_PENDING", "CITATION_RESCINDED", "CLOSED"],
  CORRECTION_PENDING: ["CORRECTION_UNDER_REVIEW", "IDR_PENDING", "CITATION_RESCINDED"],
  CORRECTION_UNDER_REVIEW: [
    "CORRECTED_BACK_IN_COMPLIANCE",
    "CORRECTION_PENDING",
    "IDR_PENDING",
    "CITATION_RESCINDED",
  ],
  CORRECTED_BACK_IN_COMPLIANCE: ["CLOSED", "IDR_PENDING"],
  IDR_PENDING: [
    "MODIFIED_FOLLOWING_IDR",
    "CITATION_RESCINDED",
    "CITATION_ISSUED",
    "CORRECTION_PENDING",
    "CORRECTION_UNDER_REVIEW",
    "CORRECTED_BACK_IN_COMPLIANCE",
  ],
  MODIFIED_FOLLOWING_IDR: ["CORRECTION_PENDING", "CORRECTED_BACK_IN_COMPLIANCE", "CLOSED"],
  CITATION_RESCINDED: ["CLOSED"],
  CLOSED: [],
};

export const SUBMISSION_TRANSITIONS: TransitionTable<SubmissionStatus> = {
  SUBMITTED: ["UNDER_REVIEW", "REVIEWED", "SUPERSEDED", "WITHDRAWN"],
  UNDER_REVIEW: ["REVIEWED", "SUPERSEDED"],
  REVIEWED: ["UNDER_REVIEW", "SUPERSEDED"],
  SUPERSEDED: [],
  WITHDRAWN: [],
};

export const CITATION_TRANSITIONS: TransitionTable<CitationStatus> = {
  DRAFT: ["FINALIZED", "RESCINDED"],
  FINALIZED: ["CORRECTION_PENDING", "RESCINDED", "MODIFIED"],
  CORRECTION_PENDING: ["CORRECTION_UNDER_REVIEW", "RESCINDED", "MODIFIED"],
  CORRECTION_UNDER_REVIEW: ["CORRECTED", "CORRECTION_PENDING", "RESCINDED", "MODIFIED"],
  CORRECTED: ["RESCINDED", "MODIFIED"],
  RESCINDED: [],
  MODIFIED: ["CORRECTION_PENDING", "CORRECTION_UNDER_REVIEW", "CORRECTED", "RESCINDED"],
};

export const CORRECTION_TRANSITIONS: TransitionTable<CorrectionStatus> = {
  NOT_SUBMITTED: ["DRAFT", "SUBMITTED"],
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["ACCEPTED", "ADDITIONAL_INFO_REQUESTED", "CORRECTION_VERIFICATION_REQUIRED"],
  ADDITIONAL_INFO_REQUESTED: ["SUBMITTED", "DRAFT"],
  ACCEPTED: ["CORRECTION_VERIFICATION_REQUIRED", "CORRECTED"],
  CORRECTION_VERIFICATION_REQUIRED: ["CORRECTED", "ADDITIONAL_INFO_REQUESTED"],
  CORRECTED: [],
};

export const IDR_TRANSITIONS: TransitionTable<IDRStatus> = {
  REQUESTED: ["ACCEPTED_FOR_REVIEW", "DENIED_UNTIMELY", "WITHDRAWN"],
  ACCEPTED_FOR_REVIEW: ["SCHEDULED", "UNDER_REVIEW", "WITHDRAWN"],
  SCHEDULED: ["UNDER_REVIEW", "WITHDRAWN"],
  UNDER_REVIEW: ["COMPLETED_UPHELD", "COMPLETED_MODIFIED", "COMPLETED_RESCINDED", "WITHDRAWN"],
  COMPLETED_UPHELD: [],
  COMPLETED_MODIFIED: [],
  COMPLETED_RESCINDED: [],
  WITHDRAWN: [],
  DENIED_UNTIMELY: [],
};

export function canTransition<S extends string>(table: TransitionTable<S>, from: S, to: S): boolean {
  if (from === to) return true; // a no-op write is not an illegal move
  return (table[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(
  table: TransitionTable<S>,
  from: S,
  to: S,
  entity: string,
): void {
  if (!canTransition(table, from, to)) {
    throw new DomainError(
      "ILLEGAL_TRANSITION",
      `${entity} cannot move from ${from} to ${to}.`,
    );
  }
}

/**
 * An IDR request never rewrites correction state. This is asserted rather than
 * merely documented because conflating the two is the exact mistake §15 warns
 * against.
 */
export function correctionStatusAfterIDR(current: CorrectionStatus): CorrectionStatus {
  return current;
}
