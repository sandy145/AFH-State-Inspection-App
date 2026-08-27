import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { formatDate } from "@/domain/deadlines";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Cell, DataTable, Row } from "@/components/ui/table";

export const metadata = { title: "Evidence requests" };

export default async function EvidenceTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  await requireInspectionAccessOrNotFound(toActor(user), id);

  const requests = await prisma.evidenceRequest.findMany({
    where: { finding: { inspectionId: id } },
    include: {
      finding: { select: { id: true, reference: true, title: true } },
      submissions: { include: { reviews: { where: { isCurrent: true } } } },
    },
    orderBy: { requestedAt: "asc" },
  });

  return (
    <DataTable
      caption="Evidence requests on this inspection"
      headers={["Request", "Finding", "Requested", "Due", "Submissions", "Unreviewed", "Status"]}
      empty="No evidence has been requested on this case."
    >
      {requests.map((request) => {
        const unreviewed = request.submissions.filter(
          (s) => s.reviews.length === 0 && s.status !== "WITHDRAWN",
        ).length;

        return (
          <Row key={request.id}>
            <Cell>
              <span className="font-medium">{request.reference}</span> — {request.title}
              <p className="text-xs text-muted-foreground">{request.itemsRequested}</p>
            </Cell>
            <Cell className="text-sm">
              <Link
                href={`/inspections/${id}/findings/${request.finding.id}`}
                className="underline-offset-2 hover:underline"
              >
                {request.finding.reference}
              </Link>
            </Cell>
            <Cell className="whitespace-nowrap text-sm">{formatDate(request.requestedAt)}</Cell>
            <Cell>{request.dueAt ? <DeadlineChip dueAt={request.dueAt} /> : "—"}</Cell>
            <Cell className="tabular-nums">{request.submissions.length}</Cell>
            <Cell>
              {unreviewed > 0 ? (
                <StatusBadge label={`${unreviewed} unreviewed`} tone="critical" />
              ) : request.submissions.length > 0 ? (
                <StatusBadge label="All reviewed" tone="success" />
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </Cell>
            <Cell className="text-sm">{request.status.replace(/_/g, " ").toLowerCase()}</Cell>
          </Row>
        );
      })}
    </DataTable>
  );
}
