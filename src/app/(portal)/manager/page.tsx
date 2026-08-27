import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { managerDashboard, evidenceReviewIntegrity } from "@/data/reports";
import { reviewQueue } from "@/data/queries";
import { configInt, CONFIG_KEYS } from "@/data/config";
import { formatDate } from "@/domain/deadlines";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader, SectionHeading, StatCard } from "@/components/ui/misc";

export const metadata = { title: "Field Manager dashboard" };

/**
 * Field Manager dashboard (§19).
 *
 * Built to answer one operational question: which cases are falling through the
 * gaps. Ageing evidence and overdue responses come first; the case-load split by
 * inspector is there to balance assignments, not to score anyone.
 */
export default async function ManagerDashboard() {
  const user = (await currentUser())!;
  const actor = toActor(user);

  const staleAfterDays = await configInt(CONFIG_KEYS.evidenceReviewTargetDays, 3);
  const [data, integrity, stale] = await Promise.all([
    managerDashboard(actor, staleAfterDays),
    evidenceReviewIntegrity(actor),
    reviewQueue(actor, {}),
  ]);

  const staleRows = stale.filter(
    (s) => Date.now() - s.submittedAt.getTime() > staleAfterDays * 86_400_000,
  );

  return (
    <>
      <PageHeader
        title="Field Manager dashboard"
        description={
          user.regionName
            ? `${user.regionName} — cases, evidence and deadlines across your region.`
            : "Cases, evidence and deadlines across your region."
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/manager/reports">Reports</Link>
          </Button>
        }
      />

      {/* The product's headline safeguard, stated plainly (§37). */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Evidence Review Integrity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Citations finalized with evidence unreviewed"
              value={integrity.finalizedWithUnreviewedEvidence}
              hint="Target: zero"
              tone={integrity.finalizedWithUnreviewedEvidence > 0 ? "critical" : "default"}
            />
            <StatCard
              label="Findings resolved after evidence review"
              value={integrity.resolvedAfterEvidence + integrity.consultationsAfterEvidence}
              hint="Would have been citations without the evidence"
            />
            <StatCard
              label="Blocked finalization attempts"
              value={integrity.blockedAttempts}
              hint="The safeguard doing its job"
            />
          </div>

          {integrity.pendingApproval > 0 ? (
            <Alert tone="warning" title={`${integrity.pendingApproval} override awaiting your approval`}>
              An inspector finalized a citation over unreviewed evidence. Open the case to countersign
              or query it.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Inspections in progress" value={data.inProgress} href="/inspections" />
        <StatCard label="Awaiting provider evidence" value={data.awaitingProviderEvidence} />
        <StatCard
          label="Evidence awaiting review"
          value={data.awaitingReview}
          tone={data.awaitingReview > 0 ? "attention" : "default"}
          href="/inspector/review"
        />
        <StatCard
          label={`Evidence older than ${staleAfterDays} days`}
          value={data.staleEvidence}
          tone={data.staleEvidence > 0 ? "critical" : "default"}
        />
        <StatCard
          label="Overdue provider responses"
          value={data.overdueProviderResponses}
          tone={data.overdueProviderResponses > 0 ? "critical" : "default"}
        />
        <StatCard label="Citations proposed" value={data.citationsProposed} />
        <StatCard label="Consultations issued" value={data.consultationsIssued} />
        <StatCard label="Corrections outstanding" value={data.correctionsOutstanding} />
        <StatCard label="Follow-ups needed" value={data.followUpsNeeded} />
        <StatCard label="IDRs pending" value={data.idrPending} />
      </div>

      <section className="mb-8">
        <SectionHeading
          description={`Provider evidence that has been waiting longer than the ${staleAfterDays}-day operational target.`}
        >
          Ageing evidence
        </SectionHeading>

        <DataTable
          caption="Provider evidence waiting longer than the review target"
          headers={["Case", "Home", "Finding", "Inspector", "Submitted", "Waiting", ""]}
          empty="Nothing has been waiting longer than the target."
        >
          {staleRows.map((submission) => {
            const days = Math.floor((Date.now() - submission.submittedAt.getTime()) / 86_400_000);
            return (
              <Row key={submission.id}>
                <Cell className="whitespace-nowrap font-medium">
                  {submission.finding.inspection.caseNumber}
                </Cell>
                <Cell>{submission.finding.inspection.facility.name}</Cell>
                <Cell>{submission.finding.reference}</Cell>
                <Cell className="text-sm">
                  {submission.finding.inspection.leadInspector?.fullName ?? "Unassigned"}
                </Cell>
                <Cell className="whitespace-nowrap text-sm">{formatDate(submission.submittedAt)}</Cell>
                <Cell>
                  <StatusBadge label={`${days} days`} tone="critical" />
                </Cell>
                <Cell>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/inspector/review/${submission.id}`}>Open</Link>
                  </Button>
                </Cell>
              </Row>
            );
          })}
        </DataTable>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading description="Open cases by lead inspector, for balancing assignments.">
            Case load
          </SectionHeading>
          <DataTable caption="Open cases by inspector" headers={["Inspector", "Open cases"]}>
            {data.byInspector.map((row) => (
              <Row key={row.name}>
                <Cell>{row.name}</Cell>
                <Cell className="tabular-nums">{row.count}</Cell>
              </Row>
            ))}
          </DataTable>
          <p className="mt-2 text-xs text-muted-foreground">
            Workload distribution. Not a performance measure.
          </p>
        </section>

        <section>
          <SectionHeading>Cases by region</SectionHeading>
          <DataTable caption="Open cases by region" headers={["Region", "Open cases"]}>
            {data.byRegion.map((row) => (
              <Row key={row.name}>
                <Cell>{row.name}</Cell>
                <Cell className="tabular-nums">{row.count}</Cell>
              </Row>
            ))}
          </DataTable>
        </section>
      </div>
    </>
  );
}
