/**
 * Tenant isolation (§24, §43). The rule that matters most: one provider must
 * never see another provider's home, case, finding or document.
 */
import { describe, expect, it } from "vitest";
import {
  canApproveOverride,
  canEditInspection,
  canIssueCitation,
  canOverrideEvidenceGuard,
  canReassignInspection,
  canRequestIDR,
  canReviewEvidence,
  canSubmitCorrection,
  canSubmitEvidence,
  canViewFacility,
  canViewInspection,
  canViewInternalNotes,
  homePathForRole,
} from "@/domain/authz";
import type { Actor, InspectionScope } from "@/domain/types";

const REGION_NW = "11111111-1111-4111-8111-111111111111";
const REGION_SE = "22222222-2222-4222-8222-222222222222";
const SUNRISE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CEDAR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const providerA: Actor = { id: "prov-a", role: "PROVIDER", regionId: null, facilityIds: [SUNRISE] };
const providerB: Actor = { id: "prov-b", role: "PROVIDER", regionId: null, facilityIds: [CEDAR] };
const inspector: Actor = { id: "insp-1", role: "INSPECTOR", regionId: REGION_NW, facilityIds: [] };
const otherRegionInspector: Actor = { id: "insp-2", role: "INSPECTOR", regionId: REGION_SE, facilityIds: [] };
const manager: Actor = { id: "fm-1", role: "FIELD_MANAGER", regionId: REGION_NW, facilityIds: [] };
const admin: Actor = { id: "adm-1", role: "RCS_ADMIN", regionId: null, facilityIds: [] };

const sunriseCase: InspectionScope = {
  id: "case-1",
  facilityId: SUNRISE,
  regionId: REGION_NW,
  leadInspectorId: inspector.id,
  fieldManagerId: manager.id,
  assignedUserIds: [inspector.id, manager.id],
};

const cedarCase: InspectionScope = {
  id: "case-2",
  facilityId: CEDAR,
  regionId: REGION_SE,
  leadInspectorId: otherRegionInspector.id,
  fieldManagerId: null,
  assignedUserIds: [otherRegionInspector.id],
};

describe("provider isolation", () => {
  it("lets a provider see their own home", () => {
    expect(canViewFacility(providerA, SUNRISE)).toBe(true);
  });

  it("does NOT let provider A see provider B's home", () => {
    expect(canViewFacility(providerA, CEDAR)).toBe(false);
    expect(canViewFacility(providerB, SUNRISE)).toBe(false);
  });

  it("does NOT let provider A see provider B's inspection", () => {
    expect(canViewInspection(providerA, sunriseCase)).toBe(true);
    expect(canViewInspection(providerA, cedarCase)).toBe(false);
    expect(canViewInspection(providerB, sunriseCase)).toBe(false);
  });

  it("does NOT let provider A submit evidence into provider B's case", () => {
    expect(canSubmitEvidence(providerA, sunriseCase)).toBe(true);
    expect(canSubmitEvidence(providerA, cedarCase)).toBe(false);
  });

  it("does NOT let provider A submit a correction or IDR on provider B's case", () => {
    expect(canSubmitCorrection(providerA, cedarCase)).toBe(false);
    expect(canRequestIDR(providerA, cedarCase)).toBe(false);
    expect(canSubmitCorrection(providerA, sunriseCase)).toBe(true);
    expect(canRequestIDR(providerA, sunriseCase)).toBe(true);
  });

  it("never lets a provider act as a reviewer or issue an outcome", () => {
    expect(canReviewEvidence(providerA, sunriseCase)).toBe(false);
    expect(canIssueCitation(providerA, sunriseCase)).toBe(false);
    expect(canEditInspection(providerA, sunriseCase)).toBe(false);
    expect(canOverrideEvidenceGuard(providerA, sunriseCase)).toBe(false);
  });

  it("never shows a provider internal staff notes", () => {
    expect(canViewInternalNotes(providerA)).toBe(false);
    expect(canViewInternalNotes(inspector)).toBe(true);
  });

  it("gives a provider with no facility links access to nothing", () => {
    const orphan: Actor = { id: "prov-c", role: "PROVIDER", regionId: null, facilityIds: [] };
    expect(canViewInspection(orphan, sunriseCase)).toBe(false);
    expect(canViewInspection(orphan, cedarCase)).toBe(false);
  });
});

describe("inspector scoping", () => {
  it("can access an assigned case", () => {
    expect(canViewInspection(inspector, sunriseCase)).toBe(true);
    expect(canEditInspection(inspector, sunriseCase)).toBe(true);
  });

  it("cannot access a case outside their assignment and region", () => {
    expect(canViewInspection(inspector, cedarCase)).toBe(false);
    expect(canEditInspection(inspector, cedarCase)).toBe(false);
    expect(canReviewEvidence(inspector, cedarCase)).toBe(false);
  });

  it("can read a case in their own region without being assigned to it", () => {
    const colleague: Actor = { id: "insp-3", role: "INSPECTOR", regionId: REGION_NW, facilityIds: [] };
    expect(canViewInspection(colleague, sunriseCase)).toBe(true);
    // Reading is not editing: an unassigned inspector may not document on it.
    expect(canEditInspection(colleague, sunriseCase)).toBe(false);
  });

  it("gives an inspector with no region no cross-region reach", () => {
    const regionless: Actor = { id: "insp-4", role: "INSPECTOR", regionId: null, facilityIds: [] };
    expect(canViewInspection(regionless, sunriseCase)).toBe(false);
  });

  it("may issue a citation on its own case but may not reassign it", () => {
    expect(canIssueCitation(inspector, sunriseCase)).toBe(true);
    expect(canReassignInspection(inspector, sunriseCase)).toBe(false);
  });
});

describe("field manager scoping", () => {
  it("sees and reassigns cases in their region", () => {
    expect(canViewInspection(manager, sunriseCase)).toBe(true);
    expect(canReassignInspection(manager, sunriseCase)).toBe(true);
  });

  it("does not reach another region", () => {
    expect(canViewInspection(manager, cedarCase)).toBe(false);
    expect(canReassignInspection(manager, cedarCase)).toBe(false);
    expect(canApproveOverride(manager, cedarCase)).toBe(false);
  });

  it("is the approving authority for an override in their region", () => {
    expect(canApproveOverride(manager, sunriseCase)).toBe(true);
    expect(canApproveOverride(inspector, sunriseCase)).toBe(false);
    expect(canApproveOverride(admin, sunriseCase)).toBe(false);
  });
});

describe("administrator", () => {
  it("reaches system-wide records but does not issue citations", () => {
    expect(canViewInspection(admin, cedarCase)).toBe(true);
    expect(canReassignInspection(admin, cedarCase)).toBe(true);
    // Regulatory determinations belong to inspection staff, not to IT admins.
    expect(canIssueCitation(admin, cedarCase)).toBe(false);
  });
});

describe("post-login routing", () => {
  it("sends each role to its own workspace", () => {
    expect(homePathForRole("PROVIDER")).toBe("/provider");
    expect(homePathForRole("INSPECTOR")).toBe("/inspector");
    expect(homePathForRole("FIELD_MANAGER")).toBe("/manager");
    expect(homePathForRole("RCS_ADMIN")).toBe("/admin");
  });
});
