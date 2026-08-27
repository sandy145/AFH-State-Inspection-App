/**
 * Domain-level type aliases.
 *
 * The domain layer is deliberately free of runtime dependencies on Prisma: it
 * imports *types* only, so every rule in this folder can be unit tested without
 * a database, a generated client, or a running server. Nothing in `src/domain`
 * may import a value from `@prisma/client`.
 */
import type {
  CitationStatus,
  CorrectionStatus,
  DeadlineTrigger,
  DeadlineUnit,
  FindingStatus,
  IDRStatus,
  InspectionStatus,
  ReviewOutcome,
  Role,
  SubmissionStatus,
} from "@prisma/client";

export type {
  CitationStatus,
  CorrectionStatus,
  DeadlineTrigger,
  DeadlineUnit,
  FindingStatus,
  IDRStatus,
  InspectionStatus,
  ReviewOutcome,
  Role,
  SubmissionStatus,
};

/** The minimum an authorization decision needs to know about the actor. */
export interface Actor {
  id: string;
  role: Role;
  regionId: string | null;
  /** Facility ids the actor is linked to. Providers only. */
  facilityIds: string[];
}

/** The minimum an authorization decision needs to know about a case. */
export interface InspectionScope {
  id: string;
  facilityId: string;
  regionId: string | null;
  leadInspectorId: string | null;
  fieldManagerId: string | null;
  /** Ids of every user assigned to the inspection, lead included. */
  assignedUserIds: string[];
}

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
