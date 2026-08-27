import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { findingScope } from "@/data/scope";
import { configInt, CONFIG_KEYS } from "@/data/config";
import { formatDate } from "@/domain/deadlines";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Button } from "@/components/ui/button";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Evidence requests" };

const REQUEST_STATUS_TONE = {
  OPEN: "attention",
  PARTIALLY_RESPONDED: "attention",
  RESPONDED: "info",
  UNDER_REVIEW: "info",
  ADDITIONAL_INFO_REQUESTED: "attention",
  SATISFIED: "success",
  CANCELLED: "neutral",
} as const;

const REQUEST_STATUS_LABEL = {
  OPEN: "Awaiting your response",
  PARTIALLY_RESPONDED: "Partially responded",
  RESPONDED: "Pending review",
  UNDER_REVIEW: "Under review",
  ADDITIONAL_INFO_REQUESTED: "More information needed",
  SATISFIED: "Accepted",
  CANCELLED: "Cancelled",
} as const;

export default async function ProviderRequests() {
  const user = (await currentUser())!;
  const [requests, dueSoonDays] = await Promise.all([
    prisma.evidenceRequest.findMany({
      where: { finding: findingScope(toActor(user)) },
      include: {
        regulation: { select: { citation: true, source: true } },
        finding: { select: { id: true, reference: true, inspection: { select: { caseNumber: true } } } },
        submissions: {
          select: { id: true, reference: true, submittedAt: true, reviews: { where: { isCurrent: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    }),
    configInt(CONFIG_KEYS.evidenceDueSoonDays, 3),
  ]);

  return (
    <>
      <PageHeader
        title="Evidence requests"
        description="Every request the State has made, what you sent, and whether it has been reviewed."
      />

      <DataTable
        caption="Evidence requests for your adult family home"
        headers={["Request", "Case / finding", "Regulation", "Due", "Status", ""]}
        empty="No evidence has been requested from you."
      >
        {requests.map((request) => (
          <Row key={request.id}>
            <Cell>
              <Link href={`/provider/requests/${request.id}`} className="font-medium underline-offset-2 hover:underline">
                {request.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {request.submissions.length === 0
                  ? "Nothing submitted yet"
                  : `${request.submissions.length} submission${request.submissions.length === 1 ? "" : "s"} · ` +
                    `${request.submissions.filter((s) => s.reviews.length > 0).length} reviewed`}
              </p>
            </Cell>
            <Cell className="text-sm text-muted-foreground">
              {request.finding.inspection.caseNumber}
              <br />
              Finding {request.finding.reference}
            </Cell>
            <Cell className="text-sm">
              {request.regulation ? `${request.regulation.source} ${request.regulation.citation}` : "—"}
            </Cell>
            <Cell>
              {request.dueAt ? (
                <DeadlineChip dueAt={request.dueAt} dueSoonDays={dueSoonDays} />
              ) : (
                <span className="text-sm text-muted-foreground">No date set</span>
              )}
            </Cell>
            <Cell>
              <StatusBadge
                label={REQUEST_STATUS_LABEL[request.status]}
                tone={REQUEST_STATUS_TONE[request.status]}
              />
            </Cell>
            <Cell>
              <Button asChild size="sm" variant={request.status === "SATISFIED" ? "outline" : "default"}>
                <Link href={`/provider/requests/${request.id}`}>
                  {request.status === "SATISFIED" ? "View" : "Upload"}
                </Link>
              </Button>
            </Cell>
          </Row>
        ))}
      </DataTable>

      <p className="mt-4 text-xs text-muted-foreground">
        Requested dates shown in Pacific time. Today is {formatDate(new Date())}.
      </p>
    </>
  );
}
