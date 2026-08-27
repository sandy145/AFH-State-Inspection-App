/**
 * Presentation metadata for every status in the system.
 *
 * Each entry carries a label, a short explanation aimed at a non-technical
 * provider, and a `tone`. Tone drives colour *and* is always accompanied by an
 * icon and the text label in the UI, because status must never be communicated
 * by colour alone (WCAG 2.1 AA, 1.4.1).
 */
import type {
  CitationStatus,
  CorrectionStatus,
  FindingStatus,
  IDRStatus,
  InspectionStatus,
  ReviewOutcome,
  SubmissionStatus,
} from "./types";

export type Tone = "neutral" | "info" | "attention" | "warning" | "critical" | "success";

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Plain-language description shown to providers. */
  hint?: string;
}

export const INSPECTION_STATUS_META: Record<InspectionStatus, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info", hint: "The inspection is underway." },
  EVIDENCE_REVIEW: {
    label: "Evidence review",
    tone: "attention",
    hint: "The inspector is requesting and reviewing evidence.",
  },
  PENDING_REPORT: { label: "Pending report", tone: "info" },
  REPORT_ISSUED: { label: "Report issued", tone: "info" },
  CORRECTION_PERIOD: { label: "Correction period", tone: "warning" },
  FOLLOW_UP: { label: "Follow-up", tone: "attention" },
  CLOSED: { label: "Closed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const FINDING_STATUS_META: Record<FindingStatus, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral", hint: "Not yet shared with the provider." },
  POTENTIAL_FINDING: {
    label: "Potential finding",
    tone: "info",
    hint: "The inspector has documented a possible issue. No decision has been made.",
  },
  EVIDENCE_REQUESTED: {
    label: "Evidence requested",
    tone: "attention",
    hint: "The inspector is waiting for documents from you.",
  },
  PROVIDER_RESPONDED: {
    label: "Provider responded",
    tone: "info",
    hint: "Your evidence was received and is waiting for review.",
  },
  UNDER_INSPECTOR_REVIEW: { label: "Under inspector review", tone: "info" },
  ADDITIONAL_INFO_REQUESTED: {
    label: "Additional information requested",
    tone: "attention",
    hint: "The inspector needs something further from you.",
  },
  RESOLVED_NO_VIOLATION: {
    label: "Resolved — no violation",
    tone: "success",
    hint: "No violation was established.",
  },
  RESOLVED_CONSULTATION: {
    label: "Resolved — consultation",
    tone: "success",
    hint: "Addressed through consultation rather than a citation.",
  },
  CITATION_ISSUED: { label: "Citation issued", tone: "critical" },
  CORRECTION_PENDING: { label: "Correction pending", tone: "warning" },
  CORRECTION_UNDER_REVIEW: { label: "Correction under review", tone: "info" },
  CORRECTED_BACK_IN_COMPLIANCE: { label: "Corrected — back in compliance", tone: "success" },
  IDR_PENDING: { label: "IDR pending", tone: "attention" },
  MODIFIED_FOLLOWING_IDR: { label: "Modified following IDR", tone: "info" },
  CITATION_RESCINDED: { label: "Citation rescinded", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const SUBMISSION_STATUS_META: Record<SubmissionStatus, StatusMeta> = {
  SUBMITTED: { label: "Pending review", tone: "attention", hint: "Received. Not yet reviewed." },
  UNDER_REVIEW: { label: "Under review", tone: "info" },
  REVIEWED: { label: "Reviewed", tone: "success" },
  SUPERSEDED: { label: "Superseded", tone: "neutral", hint: "Replaced by a newer submission." },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

export const REVIEW_OUTCOME_META: Record<ReviewOutcome, StatusMeta> = {
  ACCEPTED: { label: "Accepted", tone: "success" },
  PARTIALLY_ACCEPTED: { label: "Partially accepted", tone: "warning" },
  INSUFFICIENT: { label: "Insufficient", tone: "critical" },
  WRONG_DOCUMENT: { label: "Wrong document", tone: "critical" },
  ADDITIONAL_INFO_REQUIRED: { label: "Additional information required", tone: "attention" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
  NOT_APPLICABLE: { label: "Not applicable", tone: "neutral" },
};

export const CITATION_STATUS_META: Record<CitationStatus, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  FINALIZED: { label: "Finalized", tone: "critical" },
  CORRECTION_PENDING: { label: "Correction pending", tone: "warning" },
  CORRECTION_UNDER_REVIEW: { label: "Correction under review", tone: "info" },
  CORRECTED: { label: "Corrected", tone: "success" },
  RESCINDED: { label: "Rescinded", tone: "success" },
  MODIFIED: { label: "Modified", tone: "info" },
};

export const CORRECTION_STATUS_META: Record<CorrectionStatus, StatusMeta> = {
  NOT_SUBMITTED: { label: "Not submitted", tone: "warning" },
  DRAFT: { label: "Draft", tone: "neutral", hint: "Saved but not sent to the inspector." },
  SUBMITTED: { label: "Submitted", tone: "info" },
  UNDER_REVIEW: { label: "Under review", tone: "info" },
  ADDITIONAL_INFO_REQUESTED: { label: "Additional information requested", tone: "attention" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  CORRECTION_VERIFICATION_REQUIRED: { label: "Verification required", tone: "attention" },
  CORRECTED: { label: "Corrected", tone: "success" },
};

export const IDR_STATUS_META: Record<IDRStatus, StatusMeta> = {
  REQUESTED: { label: "Requested", tone: "info" },
  ACCEPTED_FOR_REVIEW: { label: "Accepted for review", tone: "info" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  UNDER_REVIEW: { label: "Under review", tone: "info" },
  COMPLETED_UPHELD: { label: "Completed — citation upheld", tone: "neutral" },
  COMPLETED_MODIFIED: { label: "Completed — citation modified", tone: "info" },
  COMPLETED_RESCINDED: { label: "Completed — citation rescinded", tone: "success" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  DENIED_UNTIMELY: { label: "Denied — untimely", tone: "critical" },
};

export const INSPECTION_TYPE_LABELS: Record<string, string> = {
  INITIAL_LICENSING: "Initial Licensing Inspection",
  FULL_LICENSING: "Full Licensing Inspection",
  COMPLAINT_INVESTIGATION: "Complaint Investigation",
  FOLLOW_UP: "Follow-Up Visit",
  MONITORING: "Monitoring Visit",
};

export const SERVICE_METHOD_LABELS: Record<string, string> = {
  US_MAIL: "U.S. Mail",
  CERTIFIED_MAIL: "Certified Mail",
  HAND_DELIVERY: "Hand delivery",
  EMAIL: "Email",
  FAX: "Fax",
  PORTAL_ONLY: "Portal only",
};

export const IDR_METHOD_LABELS: Record<string, string> = {
  TRADITIONAL: "Traditional",
  PANEL: "Panel",
  DESK_REVIEW: "Desk review",
  TELEPHONE: "Telephone",
  FACE_TO_FACE: "Face-to-face",
};

export const FOLLOW_UP_METHOD_LABELS: Record<string, string> = {
  DOCUMENT_REVIEW: "Document review",
  TELEPHONE_VERIFICATION: "Telephone verification",
  ON_SITE: "On-site follow-up",
};

/** Progress rail shown on the provider dashboard (§17). */
export const PROVIDER_PROGRESS_STEPS = [
  "Inspection",
  "Evidence requests",
  "Findings",
  "Corrections",
  "Follow-up",
  "Closed",
] as const;

export function providerProgressIndex(status: InspectionStatus): number {
  switch (status) {
    case "DRAFT":
    case "IN_PROGRESS":
      return 0;
    case "EVIDENCE_REVIEW":
      return 1;
    case "PENDING_REPORT":
    case "REPORT_ISSUED":
      return 2;
    case "CORRECTION_PERIOD":
      return 3;
    case "FOLLOW_UP":
      return 4;
    case "CLOSED":
    case "CANCELLED":
      return 5;
    default:
      return 0;
  }
}
