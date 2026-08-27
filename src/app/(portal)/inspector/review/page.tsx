import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { reviewQueue } from "@/data/queries";
import { formatDate } from "@/domain/deadlines";
import { REVIEW_OUTCOME_META } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Button } from "@/components/ui/button";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Evidence review queue" };

const FILTERS = [
  { key: "needs-review", label: "Needs review" },
  { key: "mine", label: "My inspections" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All submissions" },
] as const;

/**
 * Evidence review queue (§10).
 *
 * Deliberately an inbox: oldest first, one row per submission, and a single
 * action per row. Filters are links rather than JavaScript so the queue works
 * without client state and every view is a shareable URL.
 */
export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "needs-review" } = await searchParams;
  const user = (await currentUser())!;

  const rows = await reviewQueue(toActor(user), {
    mine: filter === "mine",
    overdue: filter === "overdue",
    needsReview: filter === "all" ? false : true,
  });

  return (
    <>
      <PageHeader
        title="Evidence review queue"
        description="Provider submissions waiting on a determination. Oldest first."
      />

      <nav aria-label="Queue filters" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const active = option.key === filter;
            return (
              <li key={option.key}>
                <Link
                  href={`/inspector/review?filter=${option.key}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "inline-block rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      : "inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                  }
                >
                  {option.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {rows.length} {rows.length === 1 ? "submission" : "submissions"} shown.
      </p>

      <DataTable
        caption="Provider evidence submissions"
        headers={["Case", "Home", "Finding", "Evidence request", "Provider", "Submitted", "Due", "Status", "Age", ""]}
        empty="Nothing in this view."
      >
        {rows.map((submission) => {
          const days = Math.floor((Date.now() - submission.submittedAt.getTime()) / 86_400_000);
          const current = submission.reviews[0];

          return (
            <Row key={submission.id}>
              <Cell className="whitespace-nowrap font-medium">{submission.finding.inspection.caseNumber}</Cell>
              <Cell>{submission.finding.inspection.facility.name}</Cell>
              <Cell>
                {submission.finding.reference}
                <p className="text-xs text-muted-foreground">{submission.finding.title}</p>
              </Cell>
              <Cell>
                {submission.evidenceRequest.title}
                <p className="text-xs text-muted-foreground">
                  {submission.reference} · {submission._count.files}{" "}
                  {submission._count.files === 1 ? "file" : "files"}
                </p>
              </Cell>
              <Cell className="text-sm">{submission.submittedBy.fullName}</Cell>
              <Cell className="whitespace-nowrap text-sm">{formatDate(submission.submittedAt)}</Cell>
              <Cell>
                {submission.evidenceRequest.dueAt ? (
                  <DeadlineChip dueAt={submission.evidenceRequest.dueAt} />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </Cell>
              <Cell>
                {current ? (
                  <StatusBadge
                    label={REVIEW_OUTCOME_META[current.outcome].label}
                    tone={REVIEW_OUTCOME_META[current.outcome].tone}
                  />
                ) : (
                  <StatusBadge label="Needs review" tone="attention" />
                )}
              </Cell>
              <Cell>
                <span className="tabular-nums text-sm">
                  {days} {days === 1 ? "day" : "days"}
                </span>
              </Cell>
              <Cell>
                <Button asChild size="sm" variant={current ? "outline" : "default"}>
                  <Link href={`/inspector/review/${submission.id}`}>{current ? "Open" : "Review"}</Link>
                </Button>
              </Cell>
            </Row>
          );
        })}
      </DataTable>
    </>
  );
}
