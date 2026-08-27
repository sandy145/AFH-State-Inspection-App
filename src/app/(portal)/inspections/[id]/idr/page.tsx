import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { canReviewEvidence } from "@/domain/authz";
import { IDR_NOTICE } from "@/data/idr";
import { formatDate } from "@/domain/deadlines";
import { CORRECTION_STATUS_META, IDR_METHOD_LABELS, IDR_STATUS_META } from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, EmptyState } from "@/components/ui/misc";
import { AdvanceIDRForm } from "./advance-idr-form";

export const metadata = { title: "Informal Dispute Resolution" };

/**
 * IDR on this case (§15).
 *
 * The correction status of each disputed citation is shown right beside the
 * dispute, because the two run on separate axes: opening a dispute does not put
 * a correction on hold.
 */
export default async function IDRTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  const scope = await requireInspectionAccessOrNotFound(toActor(user), id);

  const requests = await prisma.iDRRequest.findMany({
    where: { citation: { finding: { inspectionId: id } } },
    include: {
      citation: {
        select: {
          citationNumber: true,
          status: true,
          finding: { select: { id: true, reference: true, title: true } },
          corrections: { select: { id: true, status: true, dueAt: true } },
        },
      },
      deadlines: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  const mayProcess = canReviewEvidence(toActor(user), scope);

  if (requests.length === 0) {
    return <EmptyState title="No disputes on this case." description="A provider can dispute a citation once it has been issued." />;
  }

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Correction obligations continue">
        {IDR_NOTICE}
      </Alert>

      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>
                {request.reference} · disputing {request.citation.citationNumber}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link
                  href={`/inspections/${id}/findings/${request.citation.finding.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {request.citation.finding.reference} — {request.citation.finding.title}
                </Link>
              </p>
            </div>
            <StatusBadge
              label={IDR_STATUS_META[request.status].label}
              tone={IDR_STATUS_META[request.status].tone}
            />
          </CardHeader>

          <CardContent className="space-y-4">
            <DescriptionList
              items={[
                { label: "Reason for the dispute", value: request.reason },
                { label: "Requested method", value: IDR_METHOD_LABELS[request.requestedMethod] },
                { label: "Submitted", value: formatDate(request.submittedAt) },
                { label: "Supporting evidence", value: request.supportingEvidence ?? "—" },
                {
                  label: "Scheduled",
                  value: request.scheduledAt ? formatDate(request.scheduledAt) : "Not scheduled",
                },
                { label: "Decision", value: request.decisionSummary ?? "Not decided" },
              ]}
            />

            {/* The point of this panel: correction status is unaffected. */}
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Correction status on this citation</p>
              {request.citation.corrections.length === 0 ? (
                <p className="mt-1 text-muted-foreground">No correction record.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {request.citation.corrections.map((correction) => (
                    <li key={correction.id} className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={CORRECTION_STATUS_META[correction.status].label}
                        tone={CORRECTION_STATUS_META[correction.status].tone}
                      />
                      {correction.dueAt ? (
                        <span className="text-xs text-muted-foreground">due {formatDate(correction.dueAt)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                This dispute does not change the status above.
              </p>
            </div>

            {mayProcess ? <AdvanceIDRForm idrRequestId={request.id} status={request.status} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
