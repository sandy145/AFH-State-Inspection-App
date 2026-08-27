/**
 * Deadline reminder job (§23).
 *
 * Notifies providers of evidence and corrections coming due or already overdue,
 * and staff of IDR deadlines approaching. Run on a schedule — a container job or
 * cron entry, hourly or daily:
 *
 *   npx tsx scripts/send-deadline-reminders.ts
 *
 * Idempotent by construction: it will not send the same reminder for the same
 * record on the same day twice, so running it more often than necessary is safe
 * and a missed run is caught by the next one.
 *
 * It only notifies. It never moves a deadline, never changes a status, and never
 * decides anything.
 */
import { PrismaClient } from "@prisma/client";
import type { NotificationEvent } from "@prisma/client";

const prisma = new PrismaClient();

const DUE_SOON_DAYS_FALLBACK = 3;
const DAY_MS = 86_400_000;

async function dueSoonDays(): Promise<number> {
  const row = await prisma.systemConfiguration.findUnique({ where: { key: "deadline.due_soon_days" } });
  const parsed = Number.parseInt(row?.value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DUE_SOON_DAYS_FALLBACK;
}

/** One reminder per recipient, per record, per calendar day. */
async function alreadySentToday(userId: string, event: NotificationEvent, linkPath: string): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const existing = await prisma.notification.findFirst({
    where: { userId, event, linkPath, createdAt: { gte: startOfDay } },
    select: { id: true },
  });
  return existing !== null;
}

async function notify(input: {
  userIds: string[];
  event: NotificationEvent;
  subject: string;
  body: string;
  linkPath: string;
  inspectionId?: string;
}): Promise<number> {
  let sent = 0;

  for (const userId of input.userIds) {
    if (await alreadySentToday(userId, input.event, input.linkPath)) continue;

    await prisma.notification.create({
      data: {
        userId,
        event: input.event,
        channel: "IN_APP",
        subject: input.subject,
        body: input.body,
        linkPath: input.linkPath,
        inspectionId: input.inspectionId ?? null,
      },
    });
    sent += 1;
  }
  return sent;
}

async function providerContacts(facilityId: string): Promise<string[]> {
  const links = await prisma.facilityUser.findMany({
    where: { facilityId, user: { isActive: true, role: "PROVIDER" } },
    select: { userId: true },
  });
  return links.map((link) => link.userId);
}

async function main() {
  const now = new Date();
  const soonThreshold = new Date(now.getTime() + (await dueSoonDays()) * DAY_MS);
  let total = 0;

  // --- Evidence requests --------------------------------------------------
  const openRequests = await prisma.evidenceRequest.findMany({
    where: {
      status: { in: ["OPEN", "PARTIALLY_RESPONDED", "ADDITIONAL_INFO_REQUESTED"] },
      dueAt: { not: null, lte: soonThreshold },
      finding: { inspection: { status: { notIn: ["CLOSED", "CANCELLED"] } } },
    },
    include: {
      finding: {
        select: {
          id: true,
          reference: true,
          inspectionId: true,
          inspection: { select: { caseNumber: true, facilityId: true } },
        },
      },
    },
  });

  for (const request of openRequests) {
    const overdue = request.dueAt! < now;
    const recipients = await providerContacts(request.finding.inspection.facilityId);

    total += await notify({
      userIds: recipients,
      event: overdue ? "EVIDENCE_OVERDUE" : "EVIDENCE_DUE_SOON",
      subject: overdue
        ? `Evidence overdue on ${request.finding.inspection.caseNumber}`
        : `Evidence due soon on ${request.finding.inspection.caseNumber}`,
      body: `${request.title} — finding ${request.finding.reference}. Sign in to upload what the inspector asked for.`,
      linkPath: `/provider/requests/${request.id}`,
      inspectionId: request.finding.inspectionId,
    });
  }

  // --- Corrections --------------------------------------------------------
  const openCorrections = await prisma.correction.findMany({
    where: {
      status: { in: ["NOT_SUBMITTED", "DRAFT", "ADDITIONAL_INFO_REQUESTED"] },
      dueAt: { not: null, lte: soonThreshold },
    },
    include: {
      citation: {
        select: {
          citationNumber: true,
          finding: {
            select: { reference: true, inspectionId: true, inspection: { select: { caseNumber: true, facilityId: true } } },
          },
        },
      },
    },
  });

  for (const correction of openCorrections) {
    const overdue = correction.dueAt! < now;
    const { finding } = correction.citation;
    const recipients = await providerContacts(finding.inspection.facilityId);

    total += await notify({
      userIds: recipients,
      event: overdue ? "CORRECTION_OVERDUE" : "CORRECTION_DUE_SOON",
      subject: overdue
        ? `Correction overdue on ${finding.inspection.caseNumber}`
        : `Correction due soon on ${finding.inspection.caseNumber}`,
      body: `${correction.citation.citationNumber} — finding ${finding.reference}.`,
      linkPath: `/provider/corrections/${correction.id}`,
      inspectionId: finding.inspectionId,
    });
  }

  // --- IDR deadlines, to the staff on the case ----------------------------
  const idrDeadlines = await prisma.deadline.findMany({
    where: {
      ruleKey: "IDR_REQUEST_DUE",
      status: "OPEN",
      dueAt: { lte: soonThreshold },
      inspectionId: { not: null },
    },
    include: {
      inspection: {
        select: {
          id: true,
          caseNumber: true,
          leadInspectorId: true,
          fieldManagerId: true,
        },
      },
    },
  });

  for (const deadline of idrDeadlines) {
    if (!deadline.inspection) continue;
    const staff = [deadline.inspection.leadInspectorId, deadline.inspection.fieldManagerId].filter(
      (id): id is string => Boolean(id),
    );

    total += await notify({
      userIds: staff,
      event: "IDR_DEADLINE_APPROACHING",
      subject: `IDR deadline approaching on ${deadline.inspection.caseNumber}`,
      body: `${deadline.label} is due ${deadline.dueAt.toISOString().slice(0, 10)}.`,
      linkPath: `/inspections/${deadline.inspection.id}/idr`,
      inspectionId: deadline.inspection.id,
    });
  }

  // Deadlines that have passed unmet are marked MISSED so dashboards and
  // reports agree with the notifications. The due date itself is never changed.
  const { count: missed } = await prisma.deadline.updateMany({
    where: { status: "OPEN", dueAt: { lt: now }, satisfiedAt: null },
    data: { status: "MISSED" },
  });

  console.info(
    `Deadline reminders: ${total} notification(s) queued, ${missed} deadline(s) marked missed.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
