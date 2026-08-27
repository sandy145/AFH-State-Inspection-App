import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { findingScope } from "@/data/scope";
import { formatDate } from "@/domain/deadlines";
import { FINDING_STATUS_META } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Findings" };

/**
 * The provider's view of every finding on their home, in plain language.
 * Draft findings the inspector has not shared are excluded by findingScope.
 */
export default async function ProviderFindings() {
  const user = (await currentUser())!;

  const findings = await prisma.finding.findMany({
    where: findingScope(toActor(user)),
    include: {
      regulation: { select: { citation: true, source: true, title: true } },
      inspection: { select: { caseNumber: true, startedAt: true } },
      citation: { select: { citationNumber: true, status: true } },
      _count: { select: { evidenceRequests: true, submissions: true, messages: true } },
    },
    orderBy: [{ inspection: { startedAt: "desc" } }, { reference: "asc" }],
  });

  if (findings.length === 0) {
    return (
      <>
        <PageHeader title="Findings" />
        <EmptyState title="No findings on your home." description="Findings appear here once an inspector shares them." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every issue an inspector has raised, what it relates to, and where it now stands."
      />

      <ul className="space-y-3">
        {findings.map((finding) => {
          const meta = FINDING_STATUS_META[finding.status];
          return (
            <li key={finding.id}>
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/provider/findings/${finding.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {finding.reference} — {finding.title}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {finding.inspection.caseNumber} · inspection started{" "}
                        {formatDate(finding.inspection.startedAt)}
                      </p>
                    </div>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </div>

                  {meta.hint ? <p className="text-sm">{meta.hint}</p> : null}

                  {finding.regulation ? (
                    <p className="text-sm text-muted-foreground">
                      Relates to {finding.regulation.source} {finding.regulation.citation} —{" "}
                      {finding.regulation.title}
                    </p>
                  ) : null}

                  <p className="text-xs text-muted-foreground">
                    {finding._count.evidenceRequests} evidence{" "}
                    {finding._count.evidenceRequests === 1 ? "request" : "requests"} ·{" "}
                    {finding._count.submissions}{" "}
                    {finding._count.submissions === 1 ? "submission" : "submissions"} ·{" "}
                    {finding._count.messages} {finding._count.messages === 1 ? "message" : "messages"}
                    {finding.citation ? ` · citation ${finding.citation.citationNumber}` : ""}
                  </p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
