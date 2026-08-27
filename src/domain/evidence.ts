/**
 * Evidence rules, including the citation finalization guard (§9).
 *
 * This is the reason the product exists: provider evidence that was submitted
 * must not be sitting unreviewed at the moment a citation is finalized. The
 * guard below is the single definition of that rule. The server action, the
 * disabled state of the button, and the banner on the finding page all read it.
 */
import { DomainError } from "./types";
import type { ReviewOutcome } from "./types";

export const REVIEW_OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  ACCEPTED: "Accepted",
  PARTIALLY_ACCEPTED: "Partially accepted",
  INSUFFICIENT: "Insufficient",
  WRONG_DOCUMENT: "Wrong document",
  ADDITIONAL_INFO_REQUIRED: "Additional information required",
  SUPERSEDED: "Superseded",
  NOT_APPLICABLE: "Not applicable",
};

/**
 * Every outcome except a clean acceptance has to say why. The provider is
 * entitled to know what was wrong with what they sent.
 */
export function reviewRequiresReason(outcome: ReviewOutcome): boolean {
  return outcome !== "ACCEPTED";
}

export interface ReviewInput {
  outcome: ReviewOutcome;
  reason?: string | null;
}

export function assertReviewValid(input: ReviewInput): void {
  if (reviewRequiresReason(input.outcome) && !input.reason?.trim()) {
    throw new DomainError(
      "REVIEW_REASON_REQUIRED",
      `A documented reason is required when the outcome is "${REVIEW_OUTCOME_LABELS[input.outcome]}".`,
    );
  }
}

/** The slice of a submission the guard needs. */
export interface SubmissionForGuard {
  id: string;
  reference: string;
  submittedAt: Date;
  /** Null when no reviewer has recorded a determination yet. */
  currentReviewOutcome: ReviewOutcome | null;
  /** Withdrawn submissions are out of scope for the guard. */
  withdrawn?: boolean;
}

export interface EvidenceReviewSummary {
  totalSubmissions: number;
  reviewed: number;
  unreviewed: number;
  accepted: number;
  insufficient: number;
  /** References of everything still awaiting a determination. */
  unreviewedReferences: string[];
}

export function summarizeEvidenceReview(submissions: SubmissionForGuard[]): EvidenceReviewSummary {
  const inScope = submissions.filter((s) => !s.withdrawn);
  const unreviewed = inScope.filter((s) => s.currentReviewOutcome === null);

  return {
    totalSubmissions: inScope.length,
    reviewed: inScope.length - unreviewed.length,
    unreviewed: unreviewed.length,
    accepted: inScope.filter((s) => s.currentReviewOutcome === "ACCEPTED").length,
    insufficient: inScope.filter(
      (s) => s.currentReviewOutcome === "INSUFFICIENT" || s.currentReviewOutcome === "WRONG_DOCUMENT",
    ).length,
    unreviewedReferences: unreviewed.map((s) => s.reference),
  };
}

export const UNREVIEWED_EVIDENCE_BANNER = "PROVIDER EVIDENCE SUBMITTED — REVIEW REQUIRED";

export const UNREVIEWED_EVIDENCE_BLOCK_MESSAGE =
  "Provider evidence related to this finding has not been reviewed. " +
  "Review all submitted evidence before finalizing this citation.";

export interface CitationGuardResult {
  /** True when finalization may proceed by the normal path. */
  allowed: boolean;
  /** True when an authorized override is the only remaining route. */
  requiresOverride: boolean;
  reason: string | null;
  summary: EvidenceReviewSummary;
}

/**
 * The guard. Finalization is blocked while any non-withdrawn submission on the
 * finding lacks a current review determination.
 */
export function evaluateCitationGuard(submissions: SubmissionForGuard[]): CitationGuardResult {
  const summary = summarizeEvidenceReview(submissions);

  if (summary.unreviewed > 0) {
    return {
      allowed: false,
      requiresOverride: true,
      reason: UNREVIEWED_EVIDENCE_BLOCK_MESSAGE,
      summary,
    };
  }
  return { allowed: true, requiresOverride: false, reason: null, summary };
}

export interface OverrideInput {
  justification?: string | null;
  /** From SystemConfiguration; policy may require a second signature. */
  fieldManagerApprovalRequired: boolean;
  /** True when the actor overriding is themselves a Field Manager. */
  actorIsFieldManager: boolean;
}

export interface OverrideDecision {
  /** The citation is finalized now, or held pending a Field Manager signature. */
  pendingApproval: boolean;
}

/**
 * Validates an override of the guard. An override is an exceptional act: it must
 * carry a written explanation, and it is always audited by the caller as
 * ADMINISTRATIVE_OVERRIDE.
 */
export function assertOverrideValid(input: OverrideInput): OverrideDecision {
  const justification = input.justification?.trim() ?? "";

  if (justification.length < 20) {
    throw new DomainError(
      "OVERRIDE_JUSTIFICATION_REQUIRED",
      "A written explanation of at least 20 characters is required to finalize a citation " +
        "while provider evidence remains unreviewed.",
    );
  }

  // A Field Manager overriding is already the approving authority.
  const pendingApproval = input.fieldManagerApprovalRequired && !input.actorIsFieldManager;
  return { pendingApproval };
}

/** Files a provider may upload (§8). Anything else is refused at the seam. */
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/tiff": [".tif", ".tiff"],
  "image/heic": [".heic"],
  "text/plain": [".txt"],
};

export const ALLOWED_UPLOAD_EXTENSIONS = Object.values(ALLOWED_UPLOAD_TYPES).flat();

export function isAllowedUpload(fileName: string, mimeType: string): boolean {
  const lower = fileName.toLowerCase();
  const extension = lower.slice(lower.lastIndexOf("."));
  const allowedForType = ALLOWED_UPLOAD_TYPES[mimeType];

  // Both the declared type and the extension have to be on the list, and they
  // have to agree with each other.
  if (!allowedForType) return false;
  return allowedForType.includes(extension);
}

export function assertUploadAllowed(fileName: string, mimeType: string, sizeBytes: number, maxBytes: number): void {
  if (!isAllowedUpload(fileName, mimeType)) {
    throw new DomainError(
      "FILE_TYPE_NOT_ALLOWED",
      `"${fileName}" is not an accepted file type. Accepted types: ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")}.`,
    );
  }
  if (sizeBytes <= 0) {
    throw new DomainError("FILE_EMPTY", `"${fileName}" is empty.`);
  }
  if (sizeBytes > maxBytes) {
    const limitMb = Math.floor(maxBytes / (1024 * 1024));
    throw new DomainError("FILE_TOO_LARGE", `"${fileName}" exceeds the ${limitMb} MB limit.`);
  }
}
