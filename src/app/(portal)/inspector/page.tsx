import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { inspectorOverview } from "@/data/queries";
import { formatDate, formatDateTime } from "@/domain/deadlines";
import { INSPECTION_STATUS_META, INSPECTION_TYPE_LABELS, FOLLOW_UP_METHOD_LABELS } from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { EmptyState, PageHeader, SectionHeading, StatCard } from "@/components/ui/misc";

export const metadata = { title: "Inspector dashboard" };

/**
 * Inspector dashboard (§18).
 *
 * "Needs my attention" comes first, and unreviewed provider evidence sits at the
 * very top — it is the thing that goes missing in an email thread and the thing
 * that blocks a citation.
 */
export default async function InspectorDashboard() {
  const user = (await currentUser())!;
  const data = await inspectorOverview(toActor(user));

  const oldest = data.awaitingReview[0];
  const ageDays = oldest
    ? Math.floor((Date.now() - oldest.submittedAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <>
      <PageHeader
        title={`Good day, ${user.fullName.split(" ")[0]}`}
        description="Cases assigned to you, and everything waiting on a decision."
        actions={
          <Button asChild>
            <Link href="/inspector/review">Open evidence review queue</Link>
          </Button>
        }
      />

      {data.awaitingReview.length > 0 ? (
        <Alert
          tone="attention"
          title={`${data.awaitingReview.length} provider submission${data.awaitingReview.length === 1 ? "" : "s"} awaiting your review`}
          className="mb-6"
        >
          The oldest has been waiting {ageDays} {ageDays === 1 ? "day" : "days"}. A citation cannot be
          finalized on a finding while evidence attached to it is unreviewed.
        </Alert>
      ) : (
        <Alert tone="success" title="No provider evidence is waiting for review" className="mb-6">
          Everything submitted on your cases has a recorded determination.
        </Alert>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Assigned inspections" value={data.assignedCount} href="/inspections" />
        <StatCard
          label="Evidence awaiting review"
          value={data.awaitingReview.length}
          tone={data.awaitingReview.length > 0 ? "attention" : "default"}
          href="/inspector/review"
        />
        <StatCard label="Responses today" value={data.respondedToday} />
        <StatCard
          label="Overdue provider responses"
          value={data.overdueRequests}
          tone={data.overdueRequests > 0 ? "critical" : "default"}
        />
        <StatCard label="Follow-ups required" value={data.followUps.length} />
        <StatCard label="Recently closed" value={data.recentlyClosed.length} />
      </div>

      <section className="mb-8">
        <SectionHeading description="Oldest first. Open one to see the request beside what the provider sent.">
          Needs my attention
        </SectionHeading>

        {data.awaitingReview.length === 0 ? (
          <EmptyState title="Nothing is waiting on you." />
        ) : (
          <DataTable
            caption="Provider submissions awaiting inspector review"
            headers={["Case", "Home", "Finding", "Evidence request", "Submitted", "Waiting", ""]}
          >
            {data.awaitingReview.slice(0, 12).map((submission) => {
              const days = Math.floor((Date.now() - submission.submittedAt.getTime()) / 86_400_000);
              return (
                <Row key={submission.id}>
                  <Cell className="whitespace-nowrap font-medium">
                    {submission.finding.inspection.caseNumber}
                  </Cell>
                  <Cell>{submission.finding.inspection.facility.name}</Cell>
                  <Cell>
                    {submission.finding.reference} — {submission.finding.title}
                  </Cell>
                  <Cell>
                    {submission.evidenceRequest.title}
                    <p className="text-xs text-muted-foreground">
                      {submission._count.files} {submission._count.files === 1 ? "file" : "files"} from{" "}
                      {submission.submittedBy.fullName}
                    </p>
                  </Cell>
                  <Cell className="whitespace-nowrap text-sm">{formatDate(submission.submittedAt)}</Cell>
                  <Cell>
                    <StatusBadge
                      label={`${days} ${days === 1 ? "day" : "days"}`}
                      tone={days >= 3 ? "critical" : days >= 1 ? "attention" : "neutral"}
                    />
                  </Cell>
                  <Cell>
                    <Button asChild size="sm">
                      <Link href={`/inspector/review/${submission.id}`}>Review</Link>
                    </Button>
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
        )}
      </section>

      <section className="mb-8">
        <SectionHeading>Inspections in progress</SectionHeading>
        <DataTable
          caption="Inspections currently open"
          headers={["Case", "Home", "Type", "Findings", "Status", "Started"]}
          empty="You have no open inspections."
        >
          {data.inProgress.map((inspection) => (
            <Row key={inspection.id}>
              <Cell className="whitespace-nowrap">
                <Link href={`/inspections/${inspection.id}`} className="font-medium underline-offset-2 hover:underline">
                  {inspection.caseNumber}
                </Link>
              </Cell>
              <Cell>
                {inspection.facility.name}
                <p className="text-xs text-muted-foreground">Licence {inspection.facility.licenseNumber}</p>
              </Cell>
              <Cell className="text-sm">{INSPECTION_TYPE_LABELS[inspection.type]}</Cell>
              <Cell className="tabular-nums">{inspection._count.findings}</Cell>
              <Cell>
                <StatusBadge
                  label={INSPECTION_STATUS_META[inspection.status].label}
                  tone={INSPECTION_STATUS_META[inspection.status].tone}
                />
              </Cell>
              <Cell className="whitespace-nowrap text-sm">{formatDate(inspection.startedAt)}</Cell>
            </Row>
          ))}
        </DataTable>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading>Upcoming follow-ups</SectionHeading>
          {data.followUps.length === 0 ? (
            <EmptyState title="No follow-up visits outstanding." />
          ) : (
            <ul className="space-y-2">
              {data.followUps.map((followUp) => (
                <li key={followUp.id} className="rounded-lg border bg-card p-4 text-sm">
                  <p className="font-medium">{followUp.inspection.facility.name}</p>
                  <p className="text-muted-foreground">
                    {followUp.inspection.caseNumber} · {FOLLOW_UP_METHOD_LABELS[followUp.method]}
                    {followUp.scheduledFor ? ` · ${formatDate(followUp.scheduledFor)}` : " · not yet scheduled"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading>Recently closed</SectionHeading>
          {data.recentlyClosed.length === 0 ? (
            <EmptyState title="No recently closed cases." />
          ) : (
            <ul className="space-y-2">
              {data.recentlyClosed.map((inspection) => (
                <li key={inspection.id} className="rounded-lg border bg-card p-4 text-sm">
                  <Link href={`/inspections/${inspection.id}`} className="font-medium underline-offset-2 hover:underline">
                    {inspection.caseNumber}
                  </Link>
                  <p className="text-muted-foreground">
                    {inspection.facility.name}
                    {inspection.closedAt ? ` · closed ${formatDateTime(inspection.closedAt)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
