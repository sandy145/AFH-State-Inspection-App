/**
 * Authorization predicates.
 *
 * These are pure functions, and they are the single definition of who may see
 * or do what. They are called in three places on purpose:
 *
 *   1. `src/data/scope.ts` builds query filters from them, so no list query can
 *      return a row the actor may not see.
 *   2. Server actions call them again before mutating.
 *   3. The UI calls them to decide whether to render a control at all.
 *
 * The redundancy is intentional. A missed check in one layer is caught by
 * another, and a provider must never receive another provider's data.
 */
import type { Actor, InspectionScope, Role } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  PROVIDER: "Provider / Administrator",
  INSPECTOR: "Inspector / Licensor",
  FIELD_MANAGER: "Field Manager",
  RCS_ADMIN: "RCS Administrator",
  IDR_MANAGER: "IDR Program Manager",
};

/** Staff roles are DSHS employees; providers are external users. */
export const STAFF_ROLES: Role[] = ["INSPECTOR", "FIELD_MANAGER", "RCS_ADMIN", "IDR_MANAGER"];

export function isStaff(actor: Actor): boolean {
  return STAFF_ROLES.includes(actor.role);
}

export function isProvider(actor: Actor): boolean {
  return actor.role === "PROVIDER";
}

/** A provider may only ever touch facilities they are explicitly linked to. */
export function canViewFacility(actor: Actor, facilityId: string): boolean {
  switch (actor.role) {
    case "RCS_ADMIN":
      return true;
    case "PROVIDER":
      return actor.facilityIds.includes(facilityId);
    case "INSPECTOR":
    case "FIELD_MANAGER":
    case "IDR_MANAGER":
      // Staff reach facilities through cases; facility-level browse is region
      // scoped and handled by the caller supplying region-matched ids.
      return true;
    default:
      return false;
  }
}

export function canViewInspection(actor: Actor, inspection: InspectionScope): boolean {
  switch (actor.role) {
    case "RCS_ADMIN":
      return true;
    case "PROVIDER":
      return actor.facilityIds.includes(inspection.facilityId);
    case "INSPECTOR":
      // Assigned cases, plus read access to cases in the inspector's region so
      // coverage and hand-offs work. Region is required — never global.
      return (
        inspection.assignedUserIds.includes(actor.id) ||
        inspection.leadInspectorId === actor.id ||
        (actor.regionId !== null && actor.regionId === inspection.regionId)
      );
    case "FIELD_MANAGER":
      return (
        inspection.fieldManagerId === actor.id ||
        (actor.regionId !== null && actor.regionId === inspection.regionId)
      );
    case "IDR_MANAGER":
      return true;
    default:
      return false;
  }
}

/** Documenting observations and findings is inspector work. */
export function canEditInspection(actor: Actor, inspection: InspectionScope): boolean {
  if (actor.role === "RCS_ADMIN") return true;
  if (actor.role === "INSPECTOR") {
    return inspection.leadInspectorId === actor.id || inspection.assignedUserIds.includes(actor.id);
  }
  if (actor.role === "FIELD_MANAGER") {
    return canViewInspection(actor, inspection);
  }
  return false;
}

export function canRequestEvidence(actor: Actor, inspection: InspectionScope): boolean {
  return canEditInspection(actor, inspection);
}

export function canSubmitEvidence(actor: Actor, inspection: InspectionScope): boolean {
  return isProvider(actor) && actor.facilityIds.includes(inspection.facilityId);
}

export function canReviewEvidence(actor: Actor, inspection: InspectionScope): boolean {
  if (actor.role === "INSPECTOR" || actor.role === "FIELD_MANAGER") {
    return canViewInspection(actor, inspection) && canEditInspection(actor, inspection);
  }
  return actor.role === "RCS_ADMIN";
}

export function canIssueCitation(actor: Actor, inspection: InspectionScope): boolean {
  return canEditInspection(actor, inspection) && actor.role !== "RCS_ADMIN";
}

/**
 * Overriding the unreviewed-evidence guard is a Field Manager or inspector act,
 * never a provider one. Whether an inspector's override then needs a Field
 * Manager signature is a configuration decision — see `evidence.ts`.
 */
export function canOverrideEvidenceGuard(actor: Actor, inspection: InspectionScope): boolean {
  if (actor.role === "FIELD_MANAGER") return canViewInspection(actor, inspection);
  if (actor.role === "INSPECTOR") return canEditInspection(actor, inspection);
  return false;
}

export function canApproveOverride(actor: Actor, inspection: InspectionScope): boolean {
  return actor.role === "FIELD_MANAGER" && canViewInspection(actor, inspection);
}

export function canReassignInspection(actor: Actor, inspection: InspectionScope): boolean {
  if (actor.role === "RCS_ADMIN") return true;
  return actor.role === "FIELD_MANAGER" && canViewInspection(actor, inspection);
}

export function canSubmitCorrection(actor: Actor, inspection: InspectionScope): boolean {
  return canSubmitEvidence(actor, inspection);
}

export function canRequestIDR(actor: Actor, inspection: InspectionScope): boolean {
  return canSubmitEvidence(actor, inspection);
}

export function canViewInternalNotes(actor: Actor): boolean {
  return isStaff(actor);
}

export function canAdminister(actor: Actor): boolean {
  return actor.role === "RCS_ADMIN";
}

export function canViewRegionReports(actor: Actor): boolean {
  return actor.role === "FIELD_MANAGER" || actor.role === "RCS_ADMIN";
}

/** Landing page per role — used after login and by email deep links. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case "PROVIDER":
      return "/provider";
    case "INSPECTOR":
      return "/inspector";
    case "FIELD_MANAGER":
      return "/manager";
    case "RCS_ADMIN":
      return "/admin";
    case "IDR_MANAGER":
      return "/manager";
    default:
      return "/";
  }
}
