import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { findingScope } from "@/data/scope";
import { formatDate } from "@/domain/deadlines";
import { CORRECTION_STATUS_META } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Corrections" };

export default async function ProviderCorrections() {
  const user = (await currentUser())!;

  const corrections = await prisma.correction.findMany({
    where: { citation: { finding: findingScope(toActor(user)) } },
    include: {
      citation: {
        select: {
          citationNumber: true,
          finding: { select: { id: true, reference: true, title: true, inspection: { select: { caseNumber: true } } } },
        },
      },
    },
    orderBy: { dueAt: "asc" },
  });

  if (corrections.length === 0) {
    return (
      <>
        <PageHeader title="Corrections" />
        <EmptyState
          title="No corrections are due."
          description="A correction appears here if a citation is issued on your home."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Corrections"
        description="What you must correct, by when, and whether the State has accepted it."
      />

      <ul className="space-y-3">
        {corrections.map((correction) => {
          const meta = CORRECTION_STATUS_META[correction.status];
          const outstanding = ["NOT_SUBMITTED", "DRAFT", "ADDITIONAL_INFO_REQUESTED"].includes(
            correction.status,
          );

          return (
            <li key={correction.id}>
              <Card>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {correction.kind === "PLAN_OF_CORRECTION"
                        ? "Plan of Correction"
                        : "Attestation of Correction"}{" "}
                      · {correction.citation.citationNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {correction.citation.finding.inspection.caseNumber} ·{" "}
                      {correction.citation.finding.reference} — {correction.citation.finding.title}
                    </p>
                    {correction.reviewNote ? (
                      <p className="text-sm">{correction.reviewNote}</p>
                    ) : null}
                    {correction.submittedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Submitted {formatDate(correction.submittedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-start gap-2">
                    <StatusBadge label={meta.label} tone={meta.tone} />
                    {correction.dueAt ? (
                      <DeadlineChip dueAt={correction.dueAt} satisfiedAt={correction.submittedAt} />
                    ) : null}
                    <Button asChild size="sm" variant={outstanding ? "default" : "outline"}>
                      <Link href={`/provider/corrections/${correction.id}`}>
                        {outstanding ? "Submit correction" : "View"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
