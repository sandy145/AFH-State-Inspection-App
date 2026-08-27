import { currentUser, toActor } from "@/lib/session";
import { evidenceReviewIntegrity, processReports } from "@/data/reports";
import { IDR_STATUS_META } from "@/domain/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/ui/misc";

export const metadata = { title: "Reports" };

/**
 * Reporting (§36).
 *
 * Process measures only. The page says so on its face, because a report about
 * how long reviews take is one misreading away from being used as a staff
 * scorecard, and that is not what it is for.
 */
export default async function ReportsPage() {
  const user = (await currentUser())!;
  const actor = toActor(user);
  const [reports, integrity] = await Promise.all([processReports(actor), evidenceReviewIntegrity(actor)]);

  const hours = (value: number | null) =>
    value === null ? "No data yet" : value < 48 ? `${value.toFixed(1)} hours` : `${(value / 24).toFixed(1)} days`;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational measures for the cases within your scope."
      />

      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">These are process measures, not performance scores.</p>
        <p className="mt-1">
          They exist to find cases falling through administrative gaps. Review times depend on case
          complexity, competing priorities and what a provider sent — they are not a measure of an
          individual&rsquo;s work.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Evidence Review Integrity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Citations finalized while evidence was pending review"
            value={integrity.finalizedWithUnreviewedEvidence}
            hint="Target: zero"
            tone={integrity.finalizedWithUnreviewedEvidence > 0 ? "critical" : "default"}
          />
          <StatCard label="Citations finalized" value={integrity.citationsFinalized} />
          <StatCard
            label="Potential citations resolved after evidence review"
            value={integrity.resolvedAfterEvidence + integrity.consultationsAfterEvidence}
          />
          <StatCard label="Citations rescinded" value={integrity.rescindedCitations} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Throughput</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt>Average time from submission to review</dt>
                <dd className="font-medium">
                  {hours(reports.averageReviewHours)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    (n={reports.reviewSampleSize})
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt>Average inspection closure time</dt>
                <dd className="font-medium">
                  {reports.averageClosureDays === null
                    ? "No data yet"
                    : `${reports.averageClosureDays.toFixed(0)} days`}
                  <span className="ml-1 text-xs text-muted-foreground">
                    (n={reports.closureSampleSize})
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt>Evidence submissions waiting for review</dt>
                <dd className="font-medium tabular-nums">{reports.waitingForReview}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt>Outstanding provider requests</dt>
                <dd className="font-medium tabular-nums">{reports.outstandingRequests}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt>Overdue corrections</dt>
                <dd className="font-medium tabular-nums">{reports.overdueCorrections}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Follow-ups outstanding</dt>
                <dd className="font-medium tabular-nums">{reports.followUpsOutstanding}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>IDR outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            {reports.idrOutcomes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No disputes recorded.</p>
            ) : (
              <dl className="space-y-2 text-sm">
                {reports.idrOutcomes.map((row) => (
                  <div key={row.status} className="flex justify-between gap-4 border-b pb-2 last:border-0">
                    <dt>{IDR_STATUS_META[row.status].label}</dt>
                    <dd className="font-medium tabular-nums">{row.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Findings by regulation</h2>
        <DataTable
          caption="Most frequently cited regulations"
          headers={["Regulation", "Title", "Findings"]}
          empty="No findings linked to a regulation yet."
        >
          {reports.findingsByRegulation.map((row) => (
            <Row key={row.label}>
              <Cell className="font-medium">{row.label}</Cell>
              <Cell className="text-sm text-muted-foreground">{row.title}</Cell>
              <Cell className="tabular-nums">{row.count}</Cell>
            </Row>
          ))}
        </DataTable>
      </section>
    </>
  );
}
