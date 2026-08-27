import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { canEditInspection } from "@/domain/authz";
import { formatDate } from "@/domain/deadlines";
import { FINDING_STATUS_META } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateFindingForm } from "./create-finding-form";

export const metadata = { title: "Findings" };

export default async function FindingsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  const scope = await requireInspectionAccessOrNotFound(toActor(user), id);

  const [findings, regulations] = await Promise.all([
    prisma.finding.findMany({
      where: { inspectionId: id },
      include: {
        regulation: { select: { citation: true, source: true } },
        submissions: { include: { reviews: { where: { isCurrent: true } } } },
        _count: { select: { evidenceRequests: true } },
      },
      orderBy: { reference: "asc" },
    }),
    prisma.regulation.findMany({
      where: { isActive: true },
      select: { id: true, citation: true, source: true, title: true },
      orderBy: [{ source: "asc" }, { citation: "asc" }],
    }),
  ]);

  const mayEdit = canEditInspection(toActor(user), scope);

  return (
    <div className="space-y-6">
      <DataTable
        caption="Findings on this inspection"
        headers={["Finding", "Regulation", "Resident", "Requests", "Unreviewed evidence", "Status", "Resolved"]}
        empty="No findings recorded on this case."
      >
        {findings.map((finding) => {
          const unreviewed = finding.submissions.filter(
            (s) => s.reviews.length === 0 && s.status !== "WITHDRAWN",
          ).length;

          return (
            <Row key={finding.id}>
              <Cell>
                <Link
                  href={`/inspections/${id}/findings/${finding.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {finding.reference} — {finding.title}
                </Link>
              </Cell>
              <Cell className="text-sm">
                {finding.regulation ? `${finding.regulation.source} ${finding.regulation.citation}` : "—"}
              </Cell>
              <Cell className="text-sm">{finding.residentIdentifier ?? "—"}</Cell>
              <Cell className="tabular-nums">{finding._count.evidenceRequests}</Cell>
              <Cell>
                {unreviewed > 0 ? (
                  <StatusBadge label={`${unreviewed} unreviewed`} tone="critical" />
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
              </Cell>
              <Cell>
                <StatusBadge
                  label={FINDING_STATUS_META[finding.status].label}
                  tone={FINDING_STATUS_META[finding.status].tone}
                />
              </Cell>
              <Cell className="whitespace-nowrap text-sm">
                {finding.resolvedAt ? formatDate(finding.resolvedAt) : "Open"}
              </Cell>
            </Row>
          );
        })}
      </DataTable>

      {mayEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Document a new finding</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateFindingForm inspectionId={id} regulations={regulations} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
