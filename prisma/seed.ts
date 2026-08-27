/**
 * Demo seed (§29, §30).
 *
 * Builds a realistic but entirely fictional case load: three adult family homes,
 * four inspectors, two field managers, an administrator, and both closed and
 * active inspections. No real person, home, licence number or resident appears
 * anywhere in this file.
 *
 * Two scenarios matter most, and both are asserted at the end of this script:
 *
 *   1. AFH-2026-001284 / F-004 — the inspector cannot confirm a required element
 *      of a residency agreement, requests it, the provider uploads it, the
 *      inspector reviews and accepts it, and the finding resolves with no
 *      violation. The problem statement's exact case.
 *
 *   2. AFH-2026-001290 / F-002 — provider evidence sits unreviewed. Attempting
 *      to finalize a citation there is refused by the guard. `npm run seed`
 *      proves that refusal happens rather than merely asserting it in prose.
 *
 * Demo credentials are refused outside development and test.
 */
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { createHash, randomBytes, scrypt as scryptCallback, type ScryptOptions } from "node:crypto";
import { DEADLINE_RULES, HOLIDAYS_2026, REGULATIONS, SYSTEM_CONFIGURATION } from "./seed-data";

const prisma = new PrismaClient();

const APP_ENV = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "AfhPortal!Dev2026";

if (APP_ENV === "production") {
  throw new Error(
    "Refusing to seed demo accounts in production. Demo credentials are development-only.",
  );
}

// Mirrors src/services/identity.ts. Duplicated deliberately: the seed runs
// outside the Next.js runtime, where `server-only` modules cannot be imported.
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

const at = (iso: string) => new Date(iso);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  console.info(`Seeding AFH Compliance Portal (APP_ENV=${APP_ENV})`);

  // Order matters: children before parents.
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

  // --- Reference data ------------------------------------------------------
  await prisma.regulation.createMany({ data: REGULATIONS });
  await prisma.deadlineRule.createMany({ data: DEADLINE_RULES });
  await prisma.holiday.createMany({
    data: HOLIDAYS_2026.map((h) => ({ name: h.name, date: new Date(`${h.date}T00:00:00.000Z`) })),
  });
  await prisma.systemConfiguration.createMany({ data: SYSTEM_CONFIGURATION });

  const regulations = new Map(
    (await prisma.regulation.findMany()).map((r) => [r.citation, r.id] as const),
  );

  // --- Regions -------------------------------------------------------------
  const northwest = await prisma.region.create({
    data: { name: "Region 2 — Northwest", code: "R2NW" },
  });
  const southeast = await prisma.region.create({
    data: { name: "Region 1 — Southeast", code: "R1SE" },
  });

  // --- Users ---------------------------------------------------------------
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const staff = async (
    email: string,
    fullName: string,
    role: "INSPECTOR" | "FIELD_MANAGER" | "RCS_ADMIN",
    title: string,
    regionId: string | null,
  ) =>
    prisma.user.create({
      data: { email, fullName, role, title, regionId, passwordHash, externalId: `entra|${sha(email).slice(0, 16)}` },
    });

  const janeDoe = await staff("inspector@example.com", "Jane Doe", "INSPECTOR", "Residential Care Licensor", northwest.id);
  const marcusLee = await staff("inspector2@example.com", "Marcus Lee", "INSPECTOR", "Residential Care Licensor", northwest.id);
  const priyaNatarajan = await staff("inspector3@example.com", "Priya Natarajan", "INSPECTOR", "Residential Care Licensor", southeast.id);
  const tomOkafor = await staff("inspector4@example.com", "Tom Okafor", "INSPECTOR", "Residential Care Licensor", southeast.id);
  const johnSmith = await staff("manager@example.com", "John Smith", "FIELD_MANAGER", "Field Manager", northwest.id);
  const deniseHall = await staff("manager2@example.com", "Denise Hall", "FIELD_MANAGER", "Field Manager", southeast.id);
  const admin = await staff("admin@example.com", "Alex Rivera", "RCS_ADMIN", "RCS System Administrator", null);

  // --- Provider organizations and homes ------------------------------------
  const sunriseOrg = await prisma.organization.create({
    data: { name: "Sunrise Care Group", externalId: "ORG-100241" },
  });
  const cedarOrg = await prisma.organization.create({
    data: { name: "Cedar Ridge Homes LLC", externalId: "ORG-100377" },
  });
  const harborOrg = await prisma.organization.create({
    data: { name: "Harbor View Family Care", externalId: "ORG-100512" },
  });

  const sunrise = await prisma.facility.create({
    data: {
      name: "Sunrise Adult Family Home",
      licenseNumber: "123456",
      externalId: "FAC-123456",
      syncedAt: at("2026-08-01T08:00:00Z"),
      addressLine1: "1420 Birchwood Avenue",
      city: "Bellingham",
      state: "WA",
      zip: "98225",
      county: "Whatcom",
      phone: "(360) 555-0142",
      bedCapacity: 6,
      licenseeName: "Sunrise Care Group",
      licensedAt: at("2019-04-15T00:00:00Z"),
      regionId: northwest.id,
      organizationId: sunriseOrg.id,
    },
  });

  const cedar = await prisma.facility.create({
    data: {
      name: "Cedar Ridge Adult Family Home",
      licenseNumber: "234567",
      externalId: "FAC-234567",
      syncedAt: at("2026-08-01T08:00:00Z"),
      addressLine1: "88 Cedar Ridge Lane",
      city: "Spokane Valley",
      state: "WA",
      zip: "99206",
      county: "Spokane",
      phone: "(509) 555-0188",
      bedCapacity: 6,
      licenseeName: "Cedar Ridge Homes LLC",
      licensedAt: at("2021-09-01T00:00:00Z"),
      regionId: southeast.id,
      organizationId: cedarOrg.id,
    },
  });

  const harbor = await prisma.facility.create({
    data: {
      name: "Harbor View Adult Family Home",
      licenseNumber: "345678",
      externalId: "FAC-345678",
      syncedAt: at("2026-08-01T08:00:00Z"),
      addressLine1: "77 Harbor View Drive",
      city: "Everett",
      state: "WA",
      zip: "98201",
      county: "Snohomish",
      phone: "(425) 555-0177",
      bedCapacity: 5,
      licenseeName: "Harbor View Family Care",
      licensedAt: at("2017-02-20T00:00:00Z"),
      regionId: northwest.id,
      organizationId: harborOrg.id,
    },
  });

  const provider = async (email: string, fullName: string, title: string, organizationId: string, facilityId: string) => {
    const user = await prisma.user.create({
      data: { email, fullName, role: "PROVIDER", title, organizationId, passwordHash },
    });
    await prisma.facilityUser.create({
      data: { facilityId, userId: user.id, relationship: "Provider", isPrimary: true },
    });
    return user;
  };

  const mariaSantos = await provider("provider@example.com", "Maria Santos", "Provider", sunriseOrg.id, sunrise.id);
  const _davidChen = await provider("provider2@example.com", "David Chen", "Provider", cedarOrg.id, cedar.id);
  const _ameliaWright = await provider("provider3@example.com", "Amelia Wright", "Provider", harborOrg.id, harbor.id);

  // A second contact at Sunrise, to show multi-user facility access.
  const rosaMorales = await prisma.user.create({
    data: {
      email: "provider.manager@example.com",
      fullName: "Rosa Morales",
      role: "PROVIDER",
      title: "Resident Manager",
      organizationId: sunriseOrg.id,
      passwordHash,
    },
  });
  await prisma.facilityUser.create({
    data: { facilityId: sunrise.id, userId: rosaMorales.id, relationship: "Resident Manager" },
  });

  // --- Helper builders -----------------------------------------------------
  let citationSequence = 400;

  async function audit(input: {
    actor: { id: string; email: string; role: Prisma.UserCreateInput["role"] } | null;
    action: string;
    entityType: string;
    entityId?: string;
    caseNumber?: string;
    previousValue?: string;
    newValue?: string;
    reason?: string;
    occurredAt: Date;
  }) {
    await prisma.auditEvent.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorRole: input.actor?.role ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        caseNumber: input.caseNumber ?? null,
        previousValue: input.previousValue ?? null,
        newValue: input.newValue ?? null,
        reason: input.reason ?? null,
        occurredAt: input.occurredAt,
      },
    });
  }

  async function timeline(input: {
    inspectionId: string;
    findingId?: string;
    actorId?: string;
    eventType: string;
    description: string;
    occurredAt: Date;
  }) {
    await prisma.timelineEvent.create({
      data: {
        inspectionId: input.inspectionId,
        findingId: input.findingId ?? null,
        actorId: input.actorId ?? null,
        eventType: input.eventType,
        description: input.description,
        occurredAt: input.occurredAt,
      },
    });
  }

  /** Stores a demo file as a document version without touching object storage. */
  async function demoDocument(input: {
    inspectionId: string;
    facilityId: string;
    fileName: string;
    mimeType: string;
    uploadedById: string;
    uploadedAt: Date;
    sizeBytes: number;
    version?: number;
    previousVersionId?: string | null;
    documentId?: string;
  }) {
    const documentId =
      input.documentId ??
      (
        await prisma.document.create({
          data: {
            inspectionId: input.inspectionId,
            facilityId: input.facilityId,
            title: input.fileName,
            documentType: "PROVIDER_EVIDENCE",
          },
        })
      ).id;

    if (input.previousVersionId) {
      await prisma.documentVersion.update({
        where: { id: input.previousVersionId },
        data: { isCurrent: false },
      });
    }

    return prisma.documentVersion.create({
      data: {
        documentId,
        version: input.version ?? 1,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        // Demo rows carry a deterministic pseudo-checksum. Real uploads hash
        // the bytes; there are no bytes here.
        checksum: sha(`${input.fileName}:${input.uploadedAt.toISOString()}`),
        storageKey: `seed/${sha(input.fileName).slice(0, 24)}`,
        uploadedById: input.uploadedById,
        uploadedAt: input.uploadedAt,
        isCurrent: true,
        previousVersionId: input.previousVersionId ?? null,
        scanStatus: "CLEAN",
        scannedAt: input.uploadedAt,
      },
    });
  }

  // =========================================================================
  // Scenario 1 — AFH-2026-001284: the residency agreement case (§29)
  // =========================================================================
  const sunriseCase = await prisma.inspection.create({
    data: {
      caseNumber: "AFH-2026-001284",
      facilityId: sunrise.id,
      regionId: northwest.id,
      type: "FULL_LICENSING",
      status: "EVIDENCE_REVIEW",
      leadInspectorId: janeDoe.id,
      fieldManagerId: johnSmith.id,
      startedAt: at("2026-08-20T16:14:00Z"),
      lastDataCollectionAt: at("2026-08-21T23:00:00Z"),
      exitConferenceAt: at("2026-08-21T22:30:00Z"),
      responsiblePerson: "Jane Doe",
      summary: "Full licensing inspection. Six licensed beds, five occupied on the date of inspection.",
      assignments: {
        create: [
          { userId: janeDoe.id, assignmentRole: "LEAD" },
          { userId: johnSmith.id, assignmentRole: "FIELD_MANAGER" },
        ],
      },
    },
  });

  await timeline({
    inspectionId: sunriseCase.id,
    actorId: janeDoe.id,
    eventType: "INSPECTION_STARTED",
    description: "Inspection started",
    occurredAt: at("2026-08-20T16:14:00Z"),
  });

  // Findings F-001 .. F-003 give the case body beyond the headline scenario.
  const f001 = await prisma.finding.create({
    data: {
      reference: "F-001",
      inspectionId: sunriseCase.id,
      regulationId: regulations.get("388-76-10405"),
      title: "Negotiated care plan review date",
      observation:
        "The negotiated care plan reviewed for Resident B did not show a review following a documented change in condition on July 8, 2026.",
      residentIdentifier: "Resident B",
      status: "RESOLVED_CONSULTATION",
      potentialOutcome: "POSSIBLE_CONSULTATION",
      resolvedAt: at("2026-08-22T16:10:00Z"),
    },
  });

  await prisma.consultation.create({
    data: {
      findingId: f001.id,
      regulationId: regulations.get("388-76-10405"),
      issuedById: janeDoe.id,
      issueDescription:
        "Negotiated care plan was not updated following a change in condition documented on July 8, 2026.",
      rationale:
        "First occurrence for this home, no resident harm identified, and the provider corrected the plan during the inspection. Consultation selected under RCS policy.",
      evidenceRelied: "Care plan reviewed on site; updated plan produced during the exit conference.",
      issuedAt: at("2026-08-22T16:10:00Z"),
      providerAcknowledgedAt: at("2026-08-23T15:02:00Z"),
      providerAcknowledgedById: mariaSantos.id,
    },
  });

  const f002 = await prisma.finding.create({
    data: {
      reference: "F-002",
      inspectionId: sunriseCase.id,
      regulationId: regulations.get("388-76-10530"),
      title: "Resident rights notification",
      observation: "Resident rights notification could not be located for one resident admitted in June 2026.",
      residentIdentifier: "Resident C",
      status: "RESOLVED_NO_VIOLATION",
      potentialOutcome: "LIKELY_NO_VIOLATION",
      resolvedAt: at("2026-08-21T18:40:00Z"),
      resolutionNote: "Signed notification located in the admission packet during the inspection.",
    },
  });

  const f003 = await prisma.finding.create({
    data: {
      reference: "F-003",
      inspectionId: sunriseCase.id,
      regulationId: regulations.get("388-76-10160"),
      title: "Caregiver training documentation",
      observation:
        "Training completion documentation for one caregiver was not available for review during the inspection.",
      status: "EVIDENCE_REQUESTED",
      potentialOutcome: "UNDETERMINED",
      evidenceDueAt: at("2026-08-28T00:00:00Z"),
    },
  });

  const erF003 = await prisma.evidenceRequest.create({
    data: {
      reference: "ER-001",
      findingId: f003.id,
      regulationId: regulations.get("388-76-10160"),
      title: "Caregiver training certificates",
      instructions:
        "Please provide training completion certificates for the caregiver identified during the inspection, covering the period before their first date of resident care.",
      itemsRequested: "Training completion certificates; date of first resident care.",
      dueAt: at("2026-08-28T00:00:00Z"),
      priority: "NORMAL",
      requestedById: janeDoe.id,
      requestedAt: at("2026-08-21T20:15:00Z"),
    },
  });

  await prisma.deadline.create({
    data: {
      ruleKey: "EVIDENCE_REQUEST_DUE",
      label: "Evidence due",
      dueAt: at("2026-08-28T00:00:00Z"),
      computedFrom: at("2026-08-21T20:15:00Z"),
      computedFromEvent: "EVIDENCE_REQUESTED",
      inspectionId: sunriseCase.id,
      findingId: f003.id,
      evidenceRequestId: erF003.id,
    },
  });

  // --- F-004: the scenario the product was designed around ------------------
  const f004 = await prisma.finding.create({
    data: {
      reference: "F-004",
      inspectionId: sunriseCase.id,
      regulationId: regulations.get("388-76-10506"),
      title: "Residency Agreement Requirements",
      observation:
        "Required information could not be confirmed from the residency agreement reviewed during inspection.",
      residentIdentifier: "Resident A",
      status: "EVIDENCE_REQUESTED",
      potentialOutcome: "UNDETERMINED",
      evidenceDueAt: at("2026-08-27T00:00:00Z"),
      createdAt: at("2026-08-20T21:35:00Z"),
    },
  });

  await timeline({
    inspectionId: sunriseCase.id,
    findingId: f004.id,
    actorId: janeDoe.id,
    eventType: "FINDING_CREATED",
    description: "Potential Finding F-004 created",
    occurredAt: at("2026-08-20T21:35:00Z"),
  });

  const erF004 = await prisma.evidenceRequest.create({
    data: {
      reference: "ER-002",
      findingId: f004.id,
      regulationId: regulations.get("388-76-10506"),
      title: "Residency agreement for Resident A",
      instructions:
        "Please provide the signed residency agreement in effect for Resident A on the date of inspection. If the required information appears on a page other than the first, tell us which page.",
      itemsRequested: "Signed residency agreement in effect on August 20, 2026.",
      dueAt: at("2026-08-27T00:00:00Z"),
      priority: "HIGH",
      explanationRequired: false,
      requestedById: janeDoe.id,
      requestedAt: at("2026-08-20T22:02:00Z"),
    },
  });

  await prisma.deadline.create({
    data: {
      ruleKey: "EVIDENCE_REQUEST_DUE",
      label: "Evidence due",
      dueAt: at("2026-08-27T00:00:00Z"),
      computedFrom: at("2026-08-20T22:02:00Z"),
      computedFromEvent: "EVIDENCE_REQUESTED",
      inspectionId: sunriseCase.id,
      findingId: f004.id,
      evidenceRequestId: erF004.id,
    },
  });

  await timeline({
    inspectionId: sunriseCase.id,
    findingId: f004.id,
    actorId: janeDoe.id,
    eventType: "EVIDENCE_REQUESTED",
    description: "Inspector requested the residency agreement for Resident A",
    occurredAt: at("2026-08-20T22:02:00Z"),
  });

  await prisma.findingMessage.create({
    data: {
      findingId: f004.id,
      authorId: janeDoe.id,
      body: "Please provide the signed residency agreement in effect for Resident A on the date of inspection.",
      createdAt: at("2026-08-20T22:03:00Z"),
    },
  });

  const agreementVersion = await demoDocument({
    inspectionId: sunriseCase.id,
    facilityId: sunrise.id,
    fileName: "ResidencyAgreement.pdf",
    mimeType: "application/pdf",
    uploadedById: mariaSantos.id,
    uploadedAt: at("2026-08-21T17:14:22Z"),
    sizeBytes: 412_338,
  });

  const submissionF004 = await prisma.evidenceSubmission.create({
    data: {
      reference: "EV-7A82F93",
      evidenceRequestId: erF004.id,
      findingId: f004.id,
      submittedById: mariaSantos.id,
      submittedAt: at("2026-08-21T17:14:22Z"),
      providerExplanation:
        "Signed agreement attached. The information you asked about is on page 3 under section 4, Services and Rates.",
      status: "REVIEWED",
    },
  });

  await prisma.evidenceFile.create({
    data: {
      submissionId: submissionF004.id,
      documentVersionId: agreementVersion.id,
      documentType: "Residency agreement",
      description: "Signed residency agreement in effect on the date of inspection",
    },
  });

  await prisma.receipt.create({
    data: {
      submissionId: submissionF004.id,
      receiptNumber: "RCPT-4C19E0B21",
      caseNumber: sunriseCase.caseNumber,
      facilityName: sunrise.name,
      findingReference: "F-004",
      evidenceRequestTitle: erF004.title,
      fileNames: "ResidencyAgreement.pdf",
      submittedByName: mariaSantos.fullName,
      receivedAt: at("2026-08-21T17:14:22Z"),
    },
  });

  await timeline({
    inspectionId: sunriseCase.id,
    findingId: f004.id,
    actorId: mariaSantos.id,
    eventType: "EVIDENCE_UPLOADED",
    description: "Provider uploaded ResidencyAgreement.pdf",
    occurredAt: at("2026-08-21T17:14:22Z"),
  });

  await timeline({
    inspectionId: sunriseCase.id,
    findingId: f004.id,
    eventType: "RECEIPT_ISSUED",
    description: "Evidence receipt RCPT-4C19E0B21 issued",
    occurredAt: at("2026-08-21T17:14:22Z"),
  });

  await prisma.findingMessage.create({
    data: {
      findingId: f004.id,
      authorId: mariaSantos.id,
      body: "Attached. The relevant section is on page 3.",
      createdAt: at("2026-08-21T17:15:00Z"),
    },
  });

  await prisma.evidenceReview.create({
    data: {
      submissionId: submissionF004.id,
      reviewerId: janeDoe.id,
      outcome: "ACCEPTED",
      reviewedAt: at("2026-08-22T15:47:00Z"),
    },
  });

  await prisma.evidenceRequest.update({ where: { id: erF004.id }, data: { status: "SATISFIED" } });

  await prisma.finding.update({
    where: { id: f004.id },
    data: {
      status: "RESOLVED_NO_VIOLATION",
      resolvedAt: at("2026-08-22T15:49:00Z"),
      resolutionNote:
        "The signed agreement provided by the provider contains the required information on page 3. No violation established.",
    },
  });

  for (const event of [
    { t: "2026-08-22T15:44:00Z", type: "EVIDENCE_REVIEWED", text: "Inspector reviewed evidence EV-7A82F93" },
    { t: "2026-08-22T15:47:00Z", type: "EVIDENCE_REVIEWED", text: "Evidence accepted" },
    {
      t: "2026-08-22T15:49:00Z",
      type: "FINDING_RESOLVED",
      text: "F-004 resolved — no violation established",
    },
  ]) {
    await timeline({
      inspectionId: sunriseCase.id,
      findingId: f004.id,
      actorId: janeDoe.id,
      eventType: event.type,
      description: event.text,
      occurredAt: at(event.t),
    });
  }

  for (const entry of [
    { action: "INSPECTION_CREATED", entity: "Inspection", id: sunriseCase.id, at: "2026-08-20T16:14:00Z", actor: janeDoe, newValue: "FULL_LICENSING at Sunrise Adult Family Home" },
    { action: "FINDING_CREATED", entity: "Finding", id: f004.id, at: "2026-08-20T21:35:00Z", actor: janeDoe, newValue: "F-004: Residency Agreement Requirements" },
    { action: "EVIDENCE_REQUESTED", entity: "EvidenceRequest", id: erF004.id, at: "2026-08-20T22:02:00Z", actor: janeDoe, newValue: "ER-002: Residency agreement for Resident A" },
    { action: "EVIDENCE_UPLOADED", entity: "EvidenceSubmission", id: submissionF004.id, at: "2026-08-21T17:14:22Z", actor: mariaSantos, newValue: "EV-7A82F93: ResidencyAgreement.pdf" },
    { action: "EVIDENCE_REVIEWED", entity: "EvidenceSubmission", id: submissionF004.id, at: "2026-08-22T15:47:00Z", actor: janeDoe, newValue: "ACCEPTED" },
    { action: "FINDING_STATUS_CHANGED", entity: "Finding", id: f004.id, at: "2026-08-22T15:49:00Z", actor: janeDoe, previousValue: "UNDER_INSPECTOR_REVIEW", newValue: "RESOLVED_NO_VIOLATION" },
  ]) {
    await audit({
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entity,
      entityId: entry.id,
      caseNumber: sunriseCase.caseNumber,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      occurredAt: at(entry.at),
    });
  }

  // =========================================================================
  // Scenario 2 — AFH-2026-001290: evidence sitting unreviewed (the guard)
  // =========================================================================
  const harborCase = await prisma.inspection.create({
    data: {
      caseNumber: "AFH-2026-001290",
      facilityId: harbor.id,
      regionId: northwest.id,
      type: "COMPLAINT_INVESTIGATION",
      status: "EVIDENCE_REVIEW",
      leadInspectorId: marcusLee.id,
      fieldManagerId: johnSmith.id,
      startedAt: at("2026-08-24T15:00:00Z"),
      lastDataCollectionAt: at("2026-08-24T22:00:00Z"),
      summary: "Complaint investigation regarding medication administration records.",
      assignments: {
        create: [
          { userId: marcusLee.id, assignmentRole: "LEAD" },
          { userId: johnSmith.id, assignmentRole: "FIELD_MANAGER" },
        ],
      },
    },
  });

  const harborF001 = await prisma.finding.create({
    data: {
      reference: "F-001",
      inspectionId: harborCase.id,
      regulationId: regulations.get("388-76-10870"),
      title: "Documented dietary preference",
      observation: "Two meals served did not match the documented dietary preference for one resident.",
      residentIdentifier: "Resident D",
      status: "POTENTIAL_FINDING",
      potentialOutcome: "POSSIBLE_CONSULTATION",
    },
  });

  const harborF002 = await prisma.finding.create({
    data: {
      reference: "F-002",
      inspectionId: harborCase.id,
      regulationId: regulations.get("388-76-10430"),
      title: "Medication administration record",
      observation:
        "Medication administration record for July 2026 did not show administration matching the practitioner order for one resident.",
      residentIdentifier: "Resident E",
      status: "PROVIDER_RESPONDED",
      potentialOutcome: "POSSIBLE_CITATION",
    },
  });

  const harborRequest = await prisma.evidenceRequest.create({
    data: {
      reference: "ER-001",
      findingId: harborF002.id,
      regulationId: regulations.get("388-76-10430"),
      title: "Medication administration record, July 1–31",
      instructions:
        "Please provide the medication administration record covering July 1–31, 2026, together with the practitioner order in effect for that period.",
      itemsRequested: "MAR for July 2026; practitioner order.",
      dueAt: at("2026-08-31T00:00:00Z"),
      priority: "HIGH",
      requestedById: marcusLee.id,
      requestedAt: at("2026-08-24T21:10:00Z"),
    },
  });

  const harborProvider = await prisma.user.findUniqueOrThrow({ where: { email: "provider3@example.com" } });

  // Version 1, reviewed and found insufficient.
  const marV1 = await demoDocument({
    inspectionId: harborCase.id,
    facilityId: harbor.id,
    fileName: "MedicationRecord.pdf",
    mimeType: "application/pdf",
    uploadedById: harborProvider.id,
    uploadedAt: at("2026-08-25T16:20:00Z"),
    sizeBytes: 288_411,
  });

  const harborSub1 = await prisma.evidenceSubmission.create({
    data: {
      reference: "EV-1B04C22",
      evidenceRequestId: harborRequest.id,
      findingId: harborF002.id,
      submittedById: harborProvider.id,
      submittedAt: at("2026-08-25T16:20:00Z"),
      providerExplanation: "July MAR attached.",
      status: "REVIEWED",
    },
  });

  await prisma.evidenceFile.create({
    data: { submissionId: harborSub1.id, documentVersionId: marV1.id, documentType: "MAR" },
  });

  await prisma.receipt.create({
    data: {
      submissionId: harborSub1.id,
      receiptNumber: "RCPT-9B22A7C40",
      caseNumber: harborCase.caseNumber,
      facilityName: harbor.name,
      findingReference: "F-002",
      evidenceRequestTitle: harborRequest.title,
      fileNames: "MedicationRecord.pdf",
      submittedByName: harborProvider.fullName,
      receivedAt: at("2026-08-25T16:20:00Z"),
    },
  });

  await prisma.evidenceReview.create({
    data: {
      submissionId: harborSub1.id,
      reviewerId: marcusLee.id,
      outcome: "ADDITIONAL_INFO_REQUIRED",
      reason: "The practitioner order referenced on page 14 was not included.",
      reviewedAt: at("2026-08-26T16:05:00Z"),
    },
  });

  // Version 2 — the provider answered, and NOBODY HAS REVIEWED IT. This is the
  // state the guard exists for.
  const marV2 = await demoDocument({
    inspectionId: harborCase.id,
    facilityId: harbor.id,
    documentId: marV1.documentId,
    fileName: "MedicationRecord.pdf",
    mimeType: "application/pdf",
    uploadedById: harborProvider.id,
    uploadedAt: at("2026-08-26T20:41:00Z"),
    sizeBytes: 331_902,
    version: 2,
    previousVersionId: marV1.id,
  });

  const harborSub2 = await prisma.evidenceSubmission.create({
    data: {
      reference: "EV-3F71D08",
      evidenceRequestId: harborRequest.id,
      findingId: harborF002.id,
      submittedById: harborProvider.id,
      submittedAt: at("2026-08-26T20:41:00Z"),
      providerExplanation: "Uploaded as version 2 with the physician's order included on the final page.",
      status: "SUBMITTED",
    },
  });

  await prisma.evidenceFile.create({
    data: { submissionId: harborSub2.id, documentVersionId: marV2.id, documentType: "MAR + order" },
  });

  await prisma.receipt.create({
    data: {
      submissionId: harborSub2.id,
      receiptNumber: "RCPT-1D57F9E33",
      caseNumber: harborCase.caseNumber,
      facilityName: harbor.name,
      findingReference: "F-002",
      evidenceRequestTitle: harborRequest.title,
      fileNames: "MedicationRecord.pdf",
      submittedByName: harborProvider.fullName,
      receivedAt: at("2026-08-26T20:41:00Z"),
    },
  });

  for (const event of [
    { t: "2026-08-24T15:00:00Z", type: "INSPECTION_STARTED", text: "Inspection started", finding: undefined, actor: marcusLee.id },
    { t: "2026-08-24T21:10:00Z", type: "EVIDENCE_REQUESTED", text: "Inspector requested the July medication administration record", finding: harborF002.id, actor: marcusLee.id },
    { t: "2026-08-25T16:20:00Z", type: "EVIDENCE_UPLOADED", text: "Provider uploaded MedicationRecord.pdf", finding: harborF002.id, actor: harborProvider.id },
    { t: "2026-08-26T16:05:00Z", type: "EVIDENCE_REVIEWED", text: "Inspector reviewed EV-1B04C22 — additional information required", finding: harborF002.id, actor: marcusLee.id },
    { t: "2026-08-26T20:41:00Z", type: "EVIDENCE_UPLOADED", text: "Provider uploaded MedicationRecord.pdf (version 2)", finding: harborF002.id, actor: harborProvider.id },
  ]) {
    await timeline({
      inspectionId: harborCase.id,
      findingId: event.finding,
      actorId: event.actor,
      eventType: event.type,
      description: event.text,
      occurredAt: at(event.t),
    });
  }

  // A draft citation is waiting on F-002. Finalizing it is what the guard blocks.
  citationSequence += 1;
  await prisma.citation.create({
    data: {
      citationNumber: `CIT-2026-000${citationSequence}`,
      findingId: harborF002.id,
      regulationId: regulations.get("388-76-10430"),
      deficientPractice:
        "The home did not document administration of medication in accordance with the practitioner's order for one resident during July 2026.",
      inspectorAnalysis: "Draft pending completion of evidence review.",
      riskLevel: "MODERATE",
      status: "DRAFT",
      issuedById: marcusLee.id,
    },
  });

  // =========================================================================
  // Scenario 3 — AFH-2026-001255: a closed case that ran the full lifecycle
  // =========================================================================
  const cedarCase = await prisma.inspection.create({
    data: {
      caseNumber: "AFH-2026-001255",
      facilityId: cedar.id,
      regionId: southeast.id,
      type: "FULL_LICENSING",
      status: "CORRECTION_PERIOD",
      leadInspectorId: priyaNatarajan.id,
      fieldManagerId: deniseHall.id,
      startedAt: at("2026-06-15T15:00:00Z"),
      lastDataCollectionAt: at("2026-06-16T22:00:00Z"),
      reportIssuedAt: at("2026-06-24T17:00:00Z"),
      reportReceivedAt: at("2026-06-27T17:00:00Z"),
      reportServiceMethod: "CERTIFIED_MAIL",
      portalNotifiedAt: at("2026-06-24T17:05:00Z"),
      responsiblePerson: "Priya Natarajan",
      summary: "Full licensing inspection with one citation and an open dispute.",
      assignments: {
        create: [
          { userId: priyaNatarajan.id, assignmentRole: "LEAD" },
          { userId: deniseHall.id, assignmentRole: "FIELD_MANAGER" },
        ],
      },
    },
  });

  const cedarF001 = await prisma.finding.create({
    data: {
      reference: "F-001",
      inspectionId: cedarCase.id,
      regulationId: regulations.get("388-76-10175"),
      title: "Background check before unsupervised access",
      observation:
        "One caregiver had unsupervised access to residents before the background check result was received.",
      status: "IDR_PENDING",
      potentialOutcome: "POSSIBLE_CITATION",
    },
  });

  const cedarER = await prisma.evidenceRequest.create({
    data: {
      reference: "ER-001",
      findingId: cedarF001.id,
      regulationId: regulations.get("388-76-10175"),
      title: "Background check result and schedule",
      instructions: "Provide the background check result and the caregiver's schedule for June 2026.",
      itemsRequested: "Background check result; June schedule.",
      dueAt: at("2026-06-22T00:00:00Z"),
      status: "SATISFIED",
      requestedById: priyaNatarajan.id,
      requestedAt: at("2026-06-16T18:00:00Z"),
    },
  });

  const cedarProvider = await prisma.user.findUniqueOrThrow({ where: { email: "provider2@example.com" } });

  const cedarDoc = await demoDocument({
    inspectionId: cedarCase.id,
    facilityId: cedar.id,
    fileName: "BackgroundCheckResult.pdf",
    mimeType: "application/pdf",
    uploadedById: cedarProvider.id,
    uploadedAt: at("2026-06-18T18:30:00Z"),
    sizeBytes: 96_220,
  });

  const cedarSub = await prisma.evidenceSubmission.create({
    data: {
      reference: "EV-5C93A11",
      evidenceRequestId: cedarER.id,
      findingId: cedarF001.id,
      submittedById: cedarProvider.id,
      submittedAt: at("2026-06-18T18:30:00Z"),
      status: "REVIEWED",
    },
  });

  await prisma.evidenceFile.create({
    data: { submissionId: cedarSub.id, documentVersionId: cedarDoc.id, documentType: "Background check" },
  });

  await prisma.receipt.create({
    data: {
      submissionId: cedarSub.id,
      receiptNumber: "RCPT-77B10C4A2",
      caseNumber: cedarCase.caseNumber,
      facilityName: cedar.name,
      findingReference: "F-001",
      evidenceRequestTitle: cedarER.title,
      fileNames: "BackgroundCheckResult.pdf",
      submittedByName: cedarProvider.fullName,
      receivedAt: at("2026-06-18T18:30:00Z"),
    },
  });

  await prisma.evidenceReview.create({
    data: {
      submissionId: cedarSub.id,
      reviewerId: priyaNatarajan.id,
      outcome: "ACCEPTED",
      reviewedAt: at("2026-06-19T16:00:00Z"),
    },
  });

  citationSequence += 1;
  const cedarCitation = await prisma.citation.create({
    data: {
      citationNumber: `CIT-2026-000${citationSequence}`,
      findingId: cedarF001.id,
      regulationId: regulations.get("388-76-10175"),
      deficientPractice:
        "The home permitted a caregiver to have unsupervised access to residents before receiving the background check result.",
      inspectorAnalysis:
        "The background check result the provider supplied is dated after the first shift shown on the June schedule. All submitted evidence was reviewed before this citation was finalized.",
      evidenceRelied: "Background check result dated June 10, 2026; June caregiver schedule.",
      riskLevel: "HIGH",
      status: "CORRECTION_PENDING",
      issuedById: priyaNatarajan.id,
      citedAt: at("2026-06-24T17:00:00Z"),
      serviceMethod: "CERTIFIED_MAIL",
      servedAt: at("2026-06-24T17:00:00Z"),
      receivedAt: at("2026-06-27T17:00:00Z"),
      correctionDueAt: at("2026-08-11T00:00:00Z"),
      attestationRequired: true,
    },
  });

  await prisma.correction.create({
    data: {
      citationId: cedarCitation.id,
      kind: "ATTESTATION_OF_CORRECTION",
      status: "NOT_SUBMITTED",
      dueAt: at("2026-08-11T00:00:00Z"),
    },
  });

  await prisma.deadline.createMany({
    data: [
      {
        ruleKey: "ATTESTATION_OF_CORRECTION_DUE",
        label: "Attestation of Correction due",
        dueAt: at("2026-08-11T00:00:00Z"),
        computedFrom: at("2026-06-27T17:00:00Z"),
        computedFromEvent: "INSPECTION_REPORT_RECEIVED",
        inspectionId: cedarCase.id,
        findingId: cedarF001.id,
        citationId: cedarCitation.id,
        status: "MISSED",
      },
      {
        ruleKey: "IDR_REQUEST_DUE",
        label: "IDR request due",
        dueAt: at("2026-07-13T00:00:00Z"),
        computedFrom: at("2026-06-27T17:00:00Z"),
        computedFromEvent: "CITATION_RECEIVED",
        inspectionId: cedarCase.id,
        citationId: cedarCitation.id,
        status: "MET",
        satisfiedAt: at("2026-07-06T18:00:00Z"),
      },
    ],
  });

  // An open dispute that does NOT pause the correction obligation (§15).
  await prisma.iDRRequest.create({
    data: {
      reference: "IDR-2026-000031",
      citationId: cedarCitation.id,
      requestedById: cedarProvider.id,
      reason:
        "The caregiver was supervised at all times before the result was received. The schedule reflects a shift that a second caregiver covered.",
      requestedMethod: "DESK_REVIEW",
      status: "UNDER_REVIEW",
      submittedAt: at("2026-07-06T18:00:00Z"),
      supportingEvidence: "Second caregiver's timesheet for June 8–12, 2026.",
    },
  });

  await prisma.followUp.create({
    data: {
      inspectionId: cedarCase.id,
      citationId: cedarCitation.id,
      method: "DOCUMENT_REVIEW",
      scheduledFor: at("2026-09-02T16:00:00Z"),
      assignedToId: priyaNatarajan.id,
      notes: "Verify the corrected hiring procedure once the attestation is received.",
    },
  });

  for (const event of [
    { t: "2026-06-15T15:00:00Z", type: "INSPECTION_STARTED", text: "Inspection started" },
    { t: "2026-06-16T18:00:00Z", type: "EVIDENCE_REQUESTED", text: "Inspector requested the background check result" },
    { t: "2026-06-18T18:30:00Z", type: "EVIDENCE_UPLOADED", text: "Provider uploaded BackgroundCheckResult.pdf" },
    { t: "2026-06-19T16:00:00Z", type: "EVIDENCE_REVIEWED", text: "Evidence accepted" },
    { t: "2026-06-24T17:00:00Z", type: "CITATION_FINALIZED", text: "Citation finalized on F-001" },
    { t: "2026-06-27T17:00:00Z", type: "REPORT_RECEIVED", text: "Provider received the inspection report by certified mail" },
    { t: "2026-07-06T18:00:00Z", type: "IDR_REQUESTED", text: "Provider requested Informal Dispute Resolution" },
  ]) {
    await timeline({
      inspectionId: cedarCase.id,
      findingId: cedarF001.id,
      actorId: priyaNatarajan.id,
      eventType: event.type,
      description: event.text,
      occurredAt: at(event.t),
    });
  }

  // =========================================================================
  // Additional closed cases, to give the dashboards and reports real shape
  // =========================================================================
  const closedCases = [
    {
      caseNumber: "AFH-2026-001102",
      facility: sunrise,
      region: northwest,
      inspector: janeDoe,
      manager: johnSmith,
      started: "2026-02-10T16:00:00Z",
      closed: "2026-03-20T18:00:00Z",
      type: "INITIAL_LICENSING" as const,
    },
    {
      caseNumber: "AFH-2026-001139",
      facility: harbor,
      region: northwest,
      inspector: marcusLee,
      manager: johnSmith,
      started: "2026-03-18T16:00:00Z",
      closed: "2026-04-28T18:00:00Z",
      type: "FULL_LICENSING" as const,
    },
    {
      caseNumber: "AFH-2026-001178",
      facility: cedar,
      region: southeast,
      inspector: tomOkafor,
      manager: deniseHall,
      started: "2026-04-22T16:00:00Z",
      closed: "2026-05-30T18:00:00Z",
      type: "COMPLAINT_INVESTIGATION" as const,
    },
  ];

  for (const [index, spec] of closedCases.entries()) {
    const inspection = await prisma.inspection.create({
      data: {
        caseNumber: spec.caseNumber,
        facilityId: spec.facility.id,
        regionId: spec.region.id,
        type: spec.type,
        status: "CLOSED",
        leadInspectorId: spec.inspector.id,
        fieldManagerId: spec.manager.id,
        startedAt: at(spec.started),
        lastDataCollectionAt: at(spec.started),
        reportIssuedAt: at(spec.closed),
        reportReceivedAt: at(spec.closed),
        reportServiceMethod: "US_MAIL",
        closedAt: at(spec.closed),
        summary: "Closed case retained for history and reporting.",
        assignments: { create: [{ userId: spec.inspector.id, assignmentRole: "LEAD" }] },
      },
    });

    await prisma.finding.create({
      data: {
        reference: "F-001",
        inspectionId: inspection.id,
        regulationId: regulations.get(index === 0 ? "388-76-10530" : index === 1 ? "388-76-10870" : "388-76-10405"),
        title: index === 0 ? "Resident rights posting" : index === 1 ? "Menu documentation" : "Care plan signature",
        observation: "Documented during the inspection and resolved before closure.",
        status: index === 2 ? "RESOLVED_CONSULTATION" : "RESOLVED_NO_VIOLATION",
        resolvedAt: at(spec.closed),
        resolutionNote: "Resolved after review of provider evidence.",
      },
    });

    await timeline({
      inspectionId: inspection.id,
      actorId: spec.inspector.id,
      eventType: "CASE_CLOSED",
      description: "Case closed",
      occurredAt: at(spec.closed),
    });
  }

  // --- Verify the two scenarios actually hold ------------------------------
  const { evaluateCitationGuard } = await import("../src/domain/evidence");

  const f004Submissions = await prisma.evidenceSubmission.findMany({
    where: { findingId: f004.id },
    include: { reviews: { where: { isCurrent: true } } },
  });
  const f004Guard = evaluateCitationGuard(
    f004Submissions.map((s) => ({
      id: s.id,
      reference: s.reference,
      submittedAt: s.submittedAt,
      currentReviewOutcome: s.reviews[0]?.outcome ?? null,
      withdrawn: s.status === "WITHDRAWN",
    })),
  );

  const harborSubmissions = await prisma.evidenceSubmission.findMany({
    where: { findingId: harborF002.id },
    include: { reviews: { where: { isCurrent: true } } },
  });
  const harborGuard = evaluateCitationGuard(
    harborSubmissions.map((s) => ({
      id: s.id,
      reference: s.reference,
      submittedAt: s.submittedAt,
      currentReviewOutcome: s.reviews[0]?.outcome ?? null,
      withdrawn: s.status === "WITHDRAWN",
    })),
  );

  if (!f004Guard.allowed) throw new Error("Seed inconsistent: F-004 evidence should be fully reviewed");
  if (harborGuard.allowed) throw new Error("Seed inconsistent: F-002 should have unreviewed evidence");

  const counts = {
    facilities: await prisma.facility.count(),
    users: await prisma.user.count(),
    inspections: await prisma.inspection.count(),
    findings: await prisma.finding.count(),
    submissions: await prisma.evidenceSubmission.count(),
  };

  console.info("Seed complete:", counts);
  console.info(`  Scenario 1 — ${sunriseCase.caseNumber} F-004 resolved, no violation (evidence accepted).`);
  console.info(
    `  Scenario 2 — ${harborCase.caseNumber} F-002 has ${harborGuard.summary.unreviewed} unreviewed submission(s); ` +
      `citation finalization is blocked: ${harborGuard.summary.unreviewedReferences.join(", ")}`,
  );
  console.info(`  Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
