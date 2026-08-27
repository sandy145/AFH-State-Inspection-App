import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canViewInspection } from "@/domain/authz";
import type { Actor, InspectionScope } from "@/domain/types";

/**
 * Authorization-scoped data access.
 *
 * Every list query for case data goes through a `where` clause built here. There
 * is no unscoped read path: a caller cannot ask for "all inspections", only for
 * "the inspections this actor may see". The predicates in `domain/authz.ts`
 * decide the shape; this module translates them into Prisma filters and then
 * re-checks each single-record fetch against the same predicate.
 */

/**
 * A filter that matches nothing.
 *
 * `id: { in: [] }` rather than a sentinel string: the id columns are `uuid`, so
 * a placeholder like "__none__" makes PostgreSQL raise a cast error instead of
 * returning an empty set — turning "this provider has no homes" into a 500.
 */
const MATCHES_NOTHING = { in: [] as string[] };

/** Filter restricting inspections to what the actor may see. */
export function inspectionScope(actor: Actor): Prisma.InspectionWhereInput {
  switch (actor.role) {
    case "RCS_ADMIN":
    case "IDR_MANAGER":
      return {};
    case "PROVIDER":
      // An empty facility list must match nothing, not everything.
      return { facilityId: actor.facilityIds.length ? { in: actor.facilityIds } : MATCHES_NOTHING };
    case "INSPECTOR":
      return {
        OR: [
          { leadInspectorId: actor.id },
          { assignments: { some: { userId: actor.id, unassignedAt: null } } },
          ...(actor.regionId ? [{ regionId: actor.regionId }] : []),
        ],
      };
    case "FIELD_MANAGER":
      return {
        OR: [
          { fieldManagerId: actor.id },
          ...(actor.regionId ? [{ regionId: actor.regionId }] : []),
        ],
      };
    default:
      return { id: MATCHES_NOTHING };
  }
}

export function facilityScope(actor: Actor): Prisma.FacilityWhereInput {
  switch (actor.role) {
    case "RCS_ADMIN":
      return {};
    case "PROVIDER":
      return { id: actor.facilityIds.length ? { in: actor.facilityIds } : MATCHES_NOTHING };
    case "INSPECTOR":
    case "FIELD_MANAGER":
    case "IDR_MANAGER":
      return actor.regionId ? { regionId: actor.regionId } : {};
    default:
      return { id: MATCHES_NOTHING };
  }
}

/** Findings inherit their inspection's scope. */
export function findingScope(actor: Actor): Prisma.FindingWhereInput {
  const scope: Prisma.FindingWhereInput = { inspection: inspectionScope(actor) };
  // Providers never see a finding the inspector has not shared yet.
  if (actor.role === "PROVIDER") return { ...scope, status: { not: "DRAFT" } };
  return scope;
}

export function submissionScope(actor: Actor): Prisma.EvidenceSubmissionWhereInput {
  return { finding: findingScope(actor) };
}

const SCOPE_SELECT = {
  id: true,
  facilityId: true,
  regionId: true,
  leadInspectorId: true,
  fieldManagerId: true,
  assignments: { where: { unassignedAt: null }, select: { userId: true } },
} satisfies Prisma.InspectionSelect;

/**
 * Loads the authorization slice of an inspection. Returns null when the case
 * does not exist — callers must not distinguish "absent" from "not yours" in any
 * message they render.
 */
export async function loadInspectionScope(inspectionId: string): Promise<InspectionScope | null> {
  const row = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: SCOPE_SELECT,
  });
  if (!row) return null;

  return {
    id: row.id,
    facilityId: row.facilityId,
    regionId: row.regionId,
    leadInspectorId: row.leadInspectorId,
    fieldManagerId: row.fieldManagerId,
    assignedUserIds: row.assignments.map((a) => a.userId),
  };
}

export async function loadInspectionScopeForFinding(findingId: string): Promise<InspectionScope | null> {
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    select: { inspection: { select: SCOPE_SELECT } },
  });
  if (!finding) return null;

  const row = finding.inspection;
  return {
    id: row.id,
    facilityId: row.facilityId,
    regionId: row.regionId,
    leadInspectorId: row.leadInspectorId,
    fieldManagerId: row.fieldManagerId,
    assignedUserIds: row.assignments.map((a) => a.userId),
  };
}

/**
 * Fetch-and-check for a single case. Used by every detail page and every server
 * action, so a direct URL to another provider's case is refused even though the
 * list that would have shown it never included it.
 */
export async function requireInspectionAccess(
  actor: Actor,
  inspectionId: string,
): Promise<InspectionScope> {
  const scope = await loadInspectionScope(inspectionId);
  if (!scope || !canViewInspection(actor, scope)) {
    throw new AccessDeniedError();
  }
  return scope;
}

export async function requireFindingAccess(actor: Actor, findingId: string): Promise<InspectionScope> {
  const scope = await loadInspectionScopeForFinding(findingId);
  if (!scope || !canViewInspection(actor, scope)) {
    throw new AccessDeniedError();
  }
  return scope;
}

/**
 * Deliberately says nothing about whether the record exists. Confirming
 * existence to an unauthorized caller leaks the shape of another provider's
 * case load.
 */
export class AccessDeniedError extends Error {
  readonly code = "ACCESS_DENIED";

  constructor() {
    super("You do not have access to this record.");
    this.name = "AccessDeniedError";
  }
}

/**
 * Page-level variants that render the not-found page instead of throwing.
 *
 * A page uses these; a server action uses the `require*Access` functions above
 * and reports the refusal in its own result. Both paths deliberately behave the
 * same whether the record is missing or simply not the caller's — see
 * AccessDeniedError.
 */
export async function requireInspectionAccessOrNotFound(
  actor: Actor,
  inspectionId: string,
): Promise<InspectionScope> {
  try {
    return await requireInspectionAccess(actor, inspectionId);
  } catch {
    notFound();
  }
}

export async function requireFindingAccessOrNotFound(
  actor: Actor,
  findingId: string,
): Promise<InspectionScope> {
  try {
    return await requireFindingAccess(actor, findingId);
  } catch {
    notFound();
  }
}
