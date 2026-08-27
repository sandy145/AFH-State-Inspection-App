/**
 * Tenant isolation against a real database (§24, §43).
 *
 * The domain tests prove the predicates are right. These prove the query layer
 * actually applies them — that provider A's scoped queries return nothing of
 * provider B's, and that a direct fetch by id is refused even though the list
 * never offered it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildFixture, pdf, prisma, resetDatabase, type Fixture } from "./helpers";
import {
  AccessDeniedError,
  facilityScope,
  findingScope,
  inspectionScope,
  requireFindingAccess,
  requireInspectionAccess,
  submissionScope,
} from "@/data/scope";
import { createEvidenceRequest, submitEvidence } from "@/data/evidence";
import { postMessage } from "@/data/cases";
import type { Actor } from "@/domain/types";

let fx: Fixture;

const actor = (u: Fixture["providerA"]): Actor => ({
  id: u.id,
  role: u.role,
  regionId: u.regionId,
  facilityIds: u.facilityIds,
});

beforeEach(async () => {
  fx = await buildFixture();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("provider A cannot reach provider B", () => {
  it("sees only its own facility in a scoped facility query", async () => {
    const rows = await prisma.facility.findMany({ where: facilityScope(actor(fx.providerA)) });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(fx.facilityAId);
  });

  it("sees only its own inspections", async () => {
    const rows = await prisma.inspection.findMany({ where: inspectionScope(actor(fx.providerA)) });
    expect(rows.map((r) => r.id)).toEqual([fx.inspectionAId]);

    const bRows = await prisma.inspection.findMany({ where: inspectionScope(actor(fx.providerB)) });
    expect(bRows.map((r) => r.id)).toEqual([fx.inspectionBId]);
  });

  it("is refused a direct fetch of the other provider's case", async () => {
    await expect(requireInspectionAccess(actor(fx.providerB), fx.inspectionAId)).rejects.toThrow(
      AccessDeniedError,
    );
    await expect(requireFindingAccess(actor(fx.providerB), fx.findingAId)).rejects.toThrow(
      AccessDeniedError,
    );
    // And the message gives nothing away about whether the record exists.
    await expect(requireInspectionAccess(actor(fx.providerB), fx.inspectionAId)).rejects.toThrow(
      /do not have access/i,
    );
  });

  it("gets the same refusal for a case that does not exist at all", async () => {
    await expect(
      requireInspectionAccess(actor(fx.providerA), "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/do not have access/i);
  });

  it("cannot see the other provider's documents through a scoped submission query", async () => {
    const request = await createEvidenceRequest(fx.inspector, {
      findingId: fx.findingAId,
      title: "Residency agreement",
      instructions: "Provide the agreement.",
      itemsRequested: "Agreement.",
    });
    await submitEvidence(fx.providerA, {
      evidenceRequestId: request.id,
      files: [pdf("ResidencyAgreement.pdf")],
    });

    const mine = await prisma.evidenceSubmission.findMany({ where: submissionScope(actor(fx.providerA)) });
    expect(mine).toHaveLength(1);

    const theirs = await prisma.evidenceSubmission.findMany({ where: submissionScope(actor(fx.providerB)) });
    expect(theirs).toHaveLength(0);
  });

  it("gets nothing when a provider account has no facility links at all", async () => {
    const orphan = await prisma.user.create({
      data: { email: "orphan@test.local", fullName: "Orphan", role: "PROVIDER" },
    });
    const orphanActor: Actor = { id: orphan.id, role: "PROVIDER", regionId: null, facilityIds: [] };

    // The empty-list case must match nothing, not everything.
    expect(await prisma.inspection.findMany({ where: inspectionScope(orphanActor) })).toHaveLength(0);
    expect(await prisma.facility.findMany({ where: facilityScope(orphanActor) })).toHaveLength(0);
  });

  it("never shows a provider a draft finding", async () => {
    await prisma.finding.create({
      data: {
        reference: "F-002",
        inspectionId: fx.inspectionAId,
        title: "Not yet shared",
        observation: "Inspector working notes.",
        status: "DRAFT",
      },
    });

    const providerView = await prisma.finding.findMany({ where: findingScope(actor(fx.providerA)) });
    expect(providerView.map((f) => f.reference)).toEqual(["F-001"]);

    const inspectorView = await prisma.finding.findMany({ where: findingScope(actor(fx.inspector)) });
    expect(inspectorView.map((f) => f.reference).sort()).toEqual(["F-001", "F-002"]);
  });

  it("never shows a provider an internal staff note", async () => {
    await postMessage(fx.inspector, fx.findingAId, "Internal: check the July schedule too.", true);
    await postMessage(fx.inspector, fx.findingAId, "Please send the signed agreement.", false);

    const providerVisible = await prisma.findingMessage.findMany({
      where: { findingId: fx.findingAId, isInternal: false },
    });
    expect(providerVisible).toHaveLength(1);
    expect(providerVisible[0]!.body).toContain("signed agreement");
  });

  it("refuses to let a provider post an internal note", async () => {
    await expect(postMessage(fx.providerA, fx.findingAId, "Trying to write internally.", true)).rejects.toThrow(
      /cannot post internal notes/i,
    );
  });
});

describe("inspector scoping", () => {
  it("reaches an assigned case", async () => {
    await expect(requireInspectionAccess(actor(fx.inspector), fx.inspectionAId)).resolves.toMatchObject({
      id: fx.inspectionAId,
    });
  });

  it("is refused a case outside its assignment and region", async () => {
    await expect(requireInspectionAccess(actor(fx.otherInspector), fx.inspectionAId)).rejects.toThrow(
      AccessDeniedError,
    );

    const rows = await prisma.inspection.findMany({ where: inspectionScope(actor(fx.otherInspector)) });
    expect(rows).toHaveLength(0);
  });

  it("lets a field manager see the region without being assigned", async () => {
    const rows = await prisma.inspection.findMany({ where: inspectionScope(actor(fx.manager)) });
    expect(rows.map((r) => r.id).sort()).toEqual([fx.inspectionAId, fx.inspectionBId].sort());
  });
});

describe("audit trail integrity", () => {
  it("records the actor's identity and role on every case action", async () => {
    const request = await createEvidenceRequest(fx.inspector, {
      findingId: fx.findingAId,
      title: "Residency agreement",
      instructions: "Provide it.",
      itemsRequested: "Agreement.",
    });
    await submitEvidence(fx.providerA, { evidenceRequestId: request.id, files: [pdf("A.pdf")] });

    const events = await prisma.auditEvent.findMany({ orderBy: { occurredAt: "asc" } });
    expect(events.length).toBeGreaterThanOrEqual(2);

    for (const event of events) {
      expect(event.actorEmail).toBeTruthy();
      expect(event.actorRole).toBeTruthy();
      expect(event.caseNumber).toBe("AFH-TEST-000001");
      // Captured from the request, so a reader can see where an action came from.
      expect(event.ipAddress).toBe("203.0.113.10");
    }
  });

  it("has no update or delete path exposed by the audit module", async () => {
    const auditModule = await import("@/data/audit");
    const exported = Object.keys(auditModule);

    expect(exported).toContain("record");
    // Nothing that could rewrite history should ever appear here.
    expect(exported.some((name) => /update|delete|remove|edit/i.test(name))).toBe(false);
  });
});
