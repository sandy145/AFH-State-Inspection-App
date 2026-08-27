/**
 * Integration test harness.
 *
 * These tests run against a real PostgreSQL database — the business rules they
 * cover are about transactions, versioning and audit rows, and a mocked client
 * would prove nothing about any of them.
 *
 * Set TEST_DATABASE_URL (or DATABASE_URL) before running. Each test file builds
 * its own isolated fixture and tears it down afterwards.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL to run integration tests.");
process.env.DATABASE_URL = url;

export const prisma = new PrismaClient({ datasources: { db: { url } } });

/** Deletes everything, children first. Used before and after each fixture. */
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.timelineEvent.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.deadline.deleteMany(),
    prisma.receipt.deleteMany(),
    prisma.evidenceReview.deleteMany(),
    prisma.evidenceFile.deleteMany(),
    prisma.evidenceSubmission.deleteMany(),
    prisma.evidenceRequest.deleteMany(),
    prisma.correctionEvidence.deleteMany(),
    prisma.correction.deleteMany(),
    prisma.iDRRequest.deleteMany(),
    prisma.followUp.deleteMany(),
    prisma.citation.deleteMany(),
    prisma.consultation.deleteMany(),
    prisma.findingMessage.deleteMany(),
    prisma.finding.deleteMany(),
    prisma.documentVersion.deleteMany(),
    prisma.document.deleteMany(),
    prisma.inspectionAssignment.deleteMany(),
    prisma.inspection.deleteMany(),
    prisma.facilityUser.deleteMany(),
    prisma.facility.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.region.deleteMany(),
    prisma.regulation.deleteMany(),
    prisma.deadlineRule.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.systemConfiguration.deleteMany(),
  ]);
}

export interface Fixture {
  regionId: string;
  facilityAId: string;
  facilityBId: string;
  inspector: SessionLike;
  otherInspector: SessionLike;
  manager: SessionLike;
  providerA: SessionLike;
  providerB: SessionLike;
  inspectionAId: string;
  inspectionBId: string;
  findingAId: string;
  regulationId: string;
}

export interface SessionLike {
  id: string;
  email: string;
  fullName: string;
  role: "PROVIDER" | "INSPECTOR" | "FIELD_MANAGER" | "RCS_ADMIN" | "IDR_MANAGER";
  title: string | null;
  regionId: string | null;
  regionName: string | null;
  mfaEnrolled: boolean;
  facilityIds: string[];
}

/**
 * Two providers, two homes, two cases. Almost every isolation test is a question
 * about whether one side can reach the other.
 */
export async function buildFixture(): Promise<Fixture> {
  await resetDatabase();

  const region = await prisma.region.create({ data: { name: "Test Region", code: "TEST" } });

  const regulation = await prisma.regulation.create({
    data: {
      citation: "388-76-10506",
      source: "WAC",
      title: "Residency agreement — Required information",
      summary: "Test regulation.",
    },
  });

  await prisma.deadlineRule.createMany({
    data: [
      {
        key: "EVIDENCE_REQUEST_DUE",
        label: "Evidence due",
        trigger: "EVIDENCE_REQUESTED",
        offset: 7,
        unit: "CALENDAR_DAYS",
      },
      {
        key: "ATTESTATION_OF_CORRECTION_DUE",
        label: "Attestation of Correction due",
        trigger: "INSPECTION_REPORT_RECEIVED",
        offset: 45,
        unit: "CALENDAR_DAYS",
        authority: "WAC 388-76-10930",
      },
      {
        key: "IDR_REQUEST_DUE",
        label: "IDR request due",
        trigger: "CITATION_RECEIVED",
        offset: 10,
        unit: "WORKING_DAYS",
        authority: "WAC 388-76-10990",
      },
    ],
  });

  await prisma.systemConfiguration.create({
    data: {
      key: "override.requires_field_manager_approval",
      value: "true",
      valueType: "boolean",
      label: "Field Manager approval for overrides",
      category: "policy",
    },
  });

  const facilityA = await prisma.facility.create({
    data: {
      name: "Sunrise Test Home",
      licenseNumber: "T-100001",
      addressLine1: "1 Test Way",
      city: "Bellingham",
      zip: "98225",
      regionId: region.id,
    },
  });

  const facilityB = await prisma.facility.create({
    data: {
      name: "Cedar Test Home",
      licenseNumber: "T-100002",
      addressLine1: "2 Test Way",
      city: "Spokane",
      zip: "99206",
      regionId: region.id,
    },
  });

  const makeUser = async (
    email: string,
    fullName: string,
    role: SessionLike["role"],
    regionId: string | null,
    facilityId?: string,
  ): Promise<SessionLike> => {
    const user = await prisma.user.create({ data: { email, fullName, role, regionId } });
    if (facilityId) {
      await prisma.facilityUser.create({ data: { facilityId, userId: user.id } });
    }
    return {
      id: user.id,
      email,
      fullName,
      role,
      title: null,
      regionId,
      regionName: null,
      mfaEnrolled: false,
      facilityIds: facilityId ? [facilityId] : [],
    };
  };

  const inspector = await makeUser("insp1@test.local", "Test Inspector", "INSPECTOR", region.id);
  const otherInspector = await makeUser("insp2@test.local", "Other Inspector", "INSPECTOR", null);
  const manager = await makeUser("fm@test.local", "Test Manager", "FIELD_MANAGER", region.id);
  const providerA = await makeUser("prova@test.local", "Provider A", "PROVIDER", null, facilityA.id);
  const providerB = await makeUser("provb@test.local", "Provider B", "PROVIDER", null, facilityB.id);

  const inspectionA = await prisma.inspection.create({
    data: {
      caseNumber: "AFH-TEST-000001",
      facilityId: facilityA.id,
      regionId: region.id,
      type: "FULL_LICENSING",
      status: "EVIDENCE_REVIEW",
      leadInspectorId: inspector.id,
      fieldManagerId: manager.id,
      startedAt: new Date("2026-08-20T16:00:00Z"),
      assignments: { create: [{ userId: inspector.id, assignmentRole: "LEAD" }] },
    },
  });

  const inspectionB = await prisma.inspection.create({
    data: {
      caseNumber: "AFH-TEST-000002",
      facilityId: facilityB.id,
      regionId: region.id,
      type: "FULL_LICENSING",
      status: "IN_PROGRESS",
      leadInspectorId: inspector.id,
      startedAt: new Date("2026-08-21T16:00:00Z"),
      assignments: { create: [{ userId: inspector.id, assignmentRole: "LEAD" }] },
    },
  });

  const findingA = await prisma.finding.create({
    data: {
      reference: "F-001",
      inspectionId: inspectionA.id,
      regulationId: regulation.id,
      title: "Residency Agreement Requirements",
      observation: "Required information could not be confirmed during inspection.",
      residentIdentifier: "Resident A",
      status: "POTENTIAL_FINDING",
    },
  });

  return {
    regionId: region.id,
    facilityAId: facilityA.id,
    facilityBId: facilityB.id,
    inspector,
    otherInspector,
    manager,
    providerA,
    providerB,
    inspectionAId: inspectionA.id,
    inspectionBId: inspectionB.id,
    findingAId: findingA.id,
    regulationId: regulation.id,
  };
}

export function pdf(name: string, contents = "%PDF-1.4 test document") {
  return {
    fileName: name,
    mimeType: "application/pdf",
    body: Buffer.from(contents, "utf8"),
  };
}
