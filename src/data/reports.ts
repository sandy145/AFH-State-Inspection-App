import "server-only";
import { prisma } from "@/lib/prisma";
import { inspectionScope } from "@/data/scope";
import type { Actor } from "@/domain/types";

/**
 * Operational reporting (§19, §36, §37).
 *
 * These are workload and process measures, meant to surface cases falling
 * through administrative gaps. They are explicitly NOT employee performance
 * scores, and nothing here is per-person except the case-load counts a manager
 * needs to balance assignments.
 */

const dayMs = 86_400_000;

export async function managerDashboard(actor: Actor, staleAfterDays = 3) {
  const scope = inspectionScope(actor);
  const staleBefore = new Date(Date.now() - staleAfterDays * dayMs);
  const now = new Date();

  const [
    inProgress,
    awaitingProviderEvidence,
    awaitingReview,
    staleEvidence,
    overdueProviderResponses,
    citationsProposed,
    consultationsIssued,
    correctionsOutstanding,
    followUpsNeeded,
    idrPending,
    byInspector,
    byRegion,
  ] = await Promise.all([
    prisma.inspection.count({ where: { ...scope, status: { notIn: ["CLOSED", "CANCELLED"] } } }),

    prisma.evidenceRequest.count({
      where: {
        finding: { inspection: scope },
        status: { in: ["OPEN", "PARTIALLY_RESPONDED", "ADDITIONAL_INFO_REQUESTED"] },
      },
    }),

    prisma.evidenceSubmission.count({
      where: { finding: { inspection: scope }, reviews: { none: { isCurrent: true } }, status: { not: "WITHDRAWN" } },
    }),

    // The number a Field Manager actually acts on: evidence that has been
    // sitting unreviewed longer than the configured operational target.
    prisma.evidenceSubmission.count({
      where: {
        finding: { inspection: scope },
        reviews: { none: { isCurrent: true } },
        status: { not: "WITHDRAWN" },
        submittedAt: { lt: staleBefore },
      },
    }),

    prisma.evidenceRequest.count({
      where: {
        finding: { inspection: scope },
        status: { in: ["OPEN", "PARTIALLY_RESPONDED", "ADDITIONAL_INFO_REQUESTED"] },
        dueAt: { lt: now },
      },
    }),

    prisma.citation.count({ where: { finding: { inspection: scope }, status: "DRAFT" } }),
    prisma.consultation.count({ where: { finding: { inspection: scope } } }),

    prisma.correction.count({
      where: {
        citation: { finding: { inspection: scope } },
        status: { in: ["NOT_SUBMITTED", "DRAFT", "SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUESTED"] },
      },
    }),

    prisma.followUp.count({ where: { inspection: scope, completedAt: null } }),

    prisma.iDRRequest.count({
      where: {
        citation: { finding: { inspection: scope } },
        status: { in: ["REQUESTED", "ACCEPTED_FOR_REVIEW", "SCHEDULED", "UNDER_REVIEW"] },
      },
    }),

    prisma.inspection.groupBy({
      by: ["leadInspectorId"],
      where: { ...scope, status: { notIn: ["CLOSED", "CANCELLED"] } },
      _count: { _all: true },
    }),

    prisma.inspection.groupBy({
      by: ["regionId"],
      where: { ...scope, status: { notIn: ["CLOSED", "CANCELLED"] } },
      _count: { _all: true },
    }),
  ]);

  const inspectorNames = await prisma.user.findMany({
    where: { id: { in: byInspector.map((r) => r.leadInspectorId).filter((v): v is string => Boolean(v)) } },
    select: { id: true, fullName: true },
  });
  const regionNames = await prisma.region.findMany({
    where: { id: { in: byRegion.map((r) => r.regionId).filter((v): v is string => Boolean(v)) } },
    select: { id: true, name: true },
  });

  return {
    inProgress,
    awaitingProviderEvidence,
    awaitingReview,
    staleEvidence,
    staleAfterDays,
    overdueProviderResponses,
    citationsProposed,
    consultationsIssued,
    correctionsOutstanding,
    followUpsNeeded,
    idrPending,
    byInspector: byInspector.map((row) => ({
      name: inspectorNames.find((u) => u.id === row.leadInspectorId)?.fullName ?? "Unassigned",
      count: row._count._all,
    })),
    byRegion: byRegion.map((row) => ({
      name: regionNames.find((r) => r.id === row.regionId)?.name ?? "No region",
      count: row._count._all,
    })),
  };
}

/**
 * Evidence Review Integrity (§37).
 *
 * The headline number is citations finalized while provider evidence was still
 * unreviewed. The target is zero. Its companion — potential citations resolved
 * after evidence review — is what the safeguard buys.
 */
export async function evidenceReviewIntegrity(actor: Actor) {
  const scope = inspectionScope(actor);

  const [
    citationsFinalized,
    finalizedWithUnreviewedEvidence,
    blockedAttempts,
    pendingApproval,
    resolvedAfterEvidence,
    consultationsAfterEvidence,
    rescindedCitations,
  ] = await Promise.all([
    prisma.citation.count({
      where: { finding: { inspection: scope }, status: { not: "DRAFT" } },
    }),

    // The metric itself: an override is the only way this count moves.
    prisma.citation.count({ where: { finding: { inspection: scope }, overrideUsed: true } }),

    prisma.auditEvent.count({ where: { action: "CITATION_FINALIZATION_BLOCKED" } }),

    prisma.citation.count({ where: { finding: { inspection: scope }, overridePendingApproval: true } }),

    // Findings that had provider evidence and ended without a violation.
    prisma.finding.count({
      where: {
        inspection: scope,
        status: "RESOLVED_NO_VIOLATION",
        submissions: { some: {} },
      },
    }),

    prisma.finding.count({
      where: { inspection: scope, status: "RESOLVED_CONSULTATION", submissions: { some: {} } },
    }),

    prisma.citation.count({ where: { finding: { inspection: scope }, status: "RESCINDED" } }),
  ]);

  return {
    citationsFinalized,
    finalizedWithUnreviewedEvidence,
    blockedAttempts,
    pendingApproval,
    resolvedAfterEvidence,
    consultationsAfterEvidence,
    rescindedCitations,
  };
}

/** Process measures for the reports page (§36). */
export async function processReports(actor: Actor) {
  const scope = inspectionScope(actor);

  const reviewed = await prisma.evidenceReview.findMany({
    where: { submission: { finding: { inspection: scope } }, isCurrent: true },
    select: { reviewedAt: true, submission: { select: { submittedAt: true } } },
  });

  const reviewHours = reviewed.map(
    (r) => (r.reviewedAt.getTime() - r.submission.submittedAt.getTime()) / 3_600_000,
  );
  const averageReviewHours =
    reviewHours.length > 0 ? reviewHours.reduce((a, b) => a + b, 0) / reviewHours.length : null;

  const closed = await prisma.inspection.findMany({
    where: { ...scope, status: "CLOSED", closedAt: { not: null } },
    select: { startedAt: true, closedAt: true },
  });
  const closureDays = closed.map((c) => (c.closedAt!.getTime() - c.startedAt.getTime()) / dayMs);
  const averageClosureDays =
    closureDays.length > 0 ? closureDays.reduce((a, b) => a + b, 0) / closureDays.length : null;

  const findingsByRegulation = await prisma.finding.groupBy({
    by: ["regulationId"],
    where: { inspection: scope, regulationId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { regulationId: "desc" } },
    take: 10,
  });

  const regulations = await prisma.regulation.findMany({
    where: { id: { in: findingsByRegulation.map((r) => r.regulationId!).filter(Boolean) } },
    select: { id: true, citation: true, source: true, title: true },
  });

  const [waitingForReview, overdueCorrections, outstandingRequests, followUpsOutstanding, idrOutcomes] =
    await Promise.all([
      prisma.evidenceSubmission.count({
        where: { finding: { inspection: scope }, reviews: { none: { isCurrent: true } }, status: { not: "WITHDRAWN" } },
      }),
      prisma.correction.count({
        where: {
          citation: { finding: { inspection: scope } },
          status: { in: ["NOT_SUBMITTED", "DRAFT"] },
          dueAt: { lt: new Date() },
        },
      }),
      prisma.evidenceRequest.count({
        where: { finding: { inspection: scope }, status: { in: ["OPEN", "PARTIALLY_RESPONDED"] } },
      }),
      prisma.followUp.count({ where: { inspection: scope, completedAt: null } }),
      prisma.iDRRequest.groupBy({
        by: ["status"],
        where: { citation: { finding: { inspection: scope } } },
        _count: { _all: true },
      }),
    ]);

  return {
    averageReviewHours,
    averageClosureDays,
    reviewSampleSize: reviewHours.length,
    closureSampleSize: closureDays.length,
    findingsByRegulation: findingsByRegulation.map((row) => {
      const regulation = regulations.find((r) => r.id === row.regulationId);
      return {
        label: regulation ? `${regulation.source} ${regulation.citation}` : "Unlinked",
        title: regulation?.title ?? "",
        count: row._count._all,
      };
    }),
    waitingForReview,
    overdueCorrections,
    outstandingRequests,
    followUpsOutstanding,
    idrOutcomes: idrOutcomes.map((row) => ({ status: row.status, count: row._count._all })),
  };
}
