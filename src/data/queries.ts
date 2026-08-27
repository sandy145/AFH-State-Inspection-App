import "server-only";
import { prisma } from "@/lib/prisma";
import { inspectionScope, findingScope } from "@/data/scope";
import type { Actor } from "@/domain/types";

/**
 * Read models for the dashboards and lists.
 *
 * Every query here takes an actor and starts from a scope filter. There is no
 * "get everything" helper in this file by design — see data/scope.ts.
 */

export async function providerOverview(actor: Actor) {
  const scope = inspectionScope(actor);

  const [inspections, openRequests, corrections, unreadMessages, notifications] = await Promise.all([
    prisma.inspection.findMany({
      where: { ...scope, status: { notIn: ["CLOSED", "CANCELLED"] } },
      include: {
        facility: { select: { name: true, licenseNumber: true } },
        leadInspector: { select: { fullName: true } },
        _count: { select: { findings: true } },
      },
      orderBy: { startedAt: "desc" },
    }),

    prisma.evidenceRequest.findMany({
      where: {
        finding: findingScope(actor),
        status: { in: ["OPEN", "PARTIALLY_RESPONDED", "ADDITIONAL_INFO_REQUESTED"] },
      },
      include: {
        finding: {
          select: {
            id: true,
            reference: true,
            title: true,
            inspection: { select: { id: true, caseNumber: true } },
          },
        },
        regulation: { select: { citation: true, title: true, source: true } },
      },
      orderBy: [{ dueAt: "asc" }],
    }),

    prisma.correction.findMany({
      where: {
        status: { in: ["NOT_SUBMITTED", "DRAFT", "ADDITIONAL_INFO_REQUESTED"] },
        citation: { finding: findingScope(actor) },
      },
      include: {
        citation: {
          select: {
            citationNumber: true,
            finding: {
              select: { id: true, reference: true, inspection: { select: { caseNumber: true } } },
            },
          },
        },
      },
      orderBy: { dueAt: "asc" },
    }),

    prisma.findingMessage.count({
      where: { finding: findingScope(actor), isInternal: false, readAt: null, author: { role: { not: "PROVIDER" } } },
    }),

    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);

  return { inspections, openRequests, corrections, unreadMessages, notifications };
}

export async function inspectorOverview(actor: Actor) {
  const scope = inspectionScope(actor);
  const assigned = { ...scope, leadInspectorId: actor.id };

  const [
    assignedCount,
    awaitingReview,
    respondedToday,
    overdueRequests,
    followUps,
    recentlyClosed,
    inProgress,
  ] = await Promise.all([
    prisma.inspection.count({ where: { ...assigned, status: { notIn: ["CLOSED", "CANCELLED"] } } }),

    prisma.evidenceSubmission.findMany({
      where: { finding: { inspection: scope }, reviews: { none: { isCurrent: true } }, status: { not: "WITHDRAWN" } },
      include: {
        submittedBy: { select: { fullName: true } },
        evidenceRequest: { select: { title: true, dueAt: true, priority: true } },
        finding: {
          select: {
            id: true,
            reference: true,
            title: true,
            inspection: {
              select: { id: true, caseNumber: true, facility: { select: { name: true } }, leadInspectorId: true },
            },
          },
        },
        _count: { select: { files: true } },
      },
      orderBy: { submittedAt: "asc" },
    }),

    prisma.evidenceSubmission.count({
      where: {
        finding: { inspection: scope },
        submittedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),

    prisma.evidenceRequest.count({
      where: {
        finding: { inspection: scope },
        status: { in: ["OPEN", "PARTIALLY_RESPONDED", "ADDITIONAL_INFO_REQUESTED"] },
        dueAt: { lt: new Date() },
      },
    }),

    prisma.followUp.findMany({
      where: { inspection: scope, completedAt: null },
      include: { inspection: { select: { id: true, caseNumber: true, facility: { select: { name: true } } } } },
      orderBy: { scheduledFor: "asc" },
      take: 10,
    }),

    prisma.inspection.findMany({
      where: { ...scope, status: "CLOSED" },
      include: { facility: { select: { name: true } } },
      orderBy: { closedAt: "desc" },
      take: 5,
    }),

    prisma.inspection.findMany({
      where: { ...scope, status: { notIn: ["CLOSED", "CANCELLED"] } },
      include: {
        facility: { select: { name: true, licenseNumber: true } },
        leadInspector: { select: { fullName: true } },
        _count: { select: { findings: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  return { assignedCount, awaitingReview, respondedToday, overdueRequests, followUps, recentlyClosed, inProgress };
}

/** Everything the review queue shows, filtered to what the actor may see (§10). */
export async function reviewQueue(
  actor: Actor,
  filters: { mine?: boolean; overdue?: boolean; needsReview?: boolean } = {},
) {
  const scope = inspectionScope(actor);

  return prisma.evidenceSubmission.findMany({
    where: {
      finding: {
        inspection: filters.mine ? { ...scope, leadInspectorId: actor.id } : scope,
      },
      status: { not: "WITHDRAWN" },
      ...(filters.needsReview === false ? {} : { reviews: { none: { isCurrent: true } } }),
      ...(filters.overdue
        ? { evidenceRequest: { dueAt: { lt: new Date() } } }
        : {}),
    },
    include: {
      submittedBy: { select: { fullName: true } },
      evidenceRequest: { select: { id: true, title: true, dueAt: true, priority: true, reference: true } },
      reviews: { where: { isCurrent: true }, select: { outcome: true, reviewedAt: true } },
      finding: {
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          inspection: {
            select: {
              id: true,
              caseNumber: true,
              facility: { select: { name: true } },
              leadInspector: { select: { fullName: true } },
            },
          },
        },
      },
      _count: { select: { files: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
}

export async function inspectionList(actor: Actor, filters: { status?: string; q?: string } = {}) {
  return prisma.inspection.findMany({
    where: {
      ...inspectionScope(actor),
      ...(filters.status && filters.status !== "ALL"
        ? { status: filters.status as never }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { caseNumber: { contains: filters.q, mode: "insensitive" as const } },
              { facility: { name: { contains: filters.q, mode: "insensitive" as const } } },
              { facility: { licenseNumber: { contains: filters.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: {
      facility: { select: { name: true, licenseNumber: true, city: true } },
      leadInspector: { select: { fullName: true } },
      fieldManager: { select: { fullName: true } },
      _count: { select: { findings: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
}
