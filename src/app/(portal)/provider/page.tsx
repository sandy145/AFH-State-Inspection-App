import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { providerOverview } from "@/data/queries";
import { configInt, CONFIG_KEYS } from "@/data/config";
import { formatDate } from "@/domain/deadlines";
import {
  FINDING_STATUS_META,
  INSPECTION_STATUS_META,
  INSPECTION_TYPE_LABELS,
  PROVIDER_PROGRESS_STEPS,
  providerProgressIndex,
} from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionHeading, StatCard } from "@/components/ui/misc";

export const metadata = { title: "Your home" };

/**
 * Provider dashboard (§17).
 *
 * The whole page answers one question: what does the State need from me, and by
 * when. Anything that does not help answer it stays off this screen.
 */
export default async function ProviderDashboard() {
  const user = (await currentUser())!;
  const actor = toActor(user);
  const [{ inspections, openRequests, corrections, unreadMessages }, dueSoonDays] = await Promise.all([
    providerOverview(actor),
    configInt(CONFIG_KEYS.evidenceDueSoonDays, 3),
  ]);

  const activeInspection = inspections[0];
  const overdueRequests = openRequests.filter((r) => r.dueAt && r.dueAt < new Date());
  const actionCount = openRequests.length + corrections.length;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName.split(" ")[0]}`}
        description="Everything the State has asked for, and where each item stands."
      />

      {actionCount > 0 ? (
        <Alert tone="attention" title="Action required" className="mb-6">
          <ul className="ml-4 list-disc space-y-1">
            {openRequests.length > 0 ? (
              <li>
                <Link href="/provider/requests" className="font-medium underline">
                  {openRequests.length} evidence {openRequests.length === 1 ? "request" : "requests"} outstanding
                </Link>
                {overdueRequests.length > 0 ? ` — ${overdueRequests.length} overdue` : null}
              </li>
            ) : null}
            {corrections.map((correction) => (
              <li key={correction.id}>
                <Link href={`/provider/corrections/${correction.id}`} className="font-medium underline">
                  Correction due for {correction.citation.citationNumber}
                </Link>
                {correction.dueAt ? ` — due ${formatDate(correction.dueAt)}` : null}
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="success" title="Nothing is outstanding" className="mb-6">
          You have no open evidence requests or corrections due.
        </Alert>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active inspections"
          value={inspections.length}
          hint={activeInspection ? activeInspection.caseNumber : "None open"}
        />
        <StatCard
          label="Evidence requests"
          value={openRequests.length}
          tone={overdueRequests.length > 0 ? "critical" : openRequests.length > 0 ? "attention" : "default"}
          hint={overdueRequests.length > 0 ? `${overdueRequests.length} overdue` : "Outstanding"}
          href="/provider/requests"
        />
        <StatCard
          label="Corrections due"
          value={corrections.length}
          tone={corrections.length > 0 ? "attention" : "default"}
          href="/provider/corrections"
        />
        <StatCard label="Unread messages" value={unreadMessages} href="/provider/findings" />
      </div>

      {activeInspection ? (
        <section className="mb-8">
          <SectionHeading>Current inspection</SectionHeading>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle>{INSPECTION_TYPE_LABELS[activeInspection.type] ?? activeInspection.type}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeInspection.caseNumber} · started {formatDate(activeInspection.startedAt)} ·{" "}
                  Inspector: {activeInspection.leadInspector?.fullName ?? "Not yet assigned"}
                </p>
              </div>
              <StatusBadge
                label={INSPECTION_STATUS_META[activeInspection.status].label}
                tone={INSPECTION_STATUS_META[activeInspection.status].tone}
              />
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm">
                {INSPECTION_STATUS_META[activeInspection.status].hint ??
                  "Your inspector will let you know if anything further is needed."}
              </p>

              {/* Progress rail: an ordered list so it reads correctly aloud. */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Where this inspection stands
                </p>
                <ol className="flex flex-wrap gap-2">
                  {PROVIDER_PROGRESS_STEPS.map((step, index) => {
                    const current = providerProgressIndex(activeInspection.status);
                    const state = index < current ? "done" : index === current ? "current" : "upcoming";
                    return (
                      <li key={step}>
                        <span
                          className={
                            state === "current"
                              ? "inline-flex items-center rounded-md border border-primary bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                              : state === "done"
                                ? "inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm text-emerald-900"
                                : "inline-flex items-center rounded-md border border-dashed px-3 py-1 text-sm text-muted-foreground"
                          }
                        >
                          {state === "done" ? "✓ " : null}
                          {step}
                          {state === "current" ? <span className="sr-only"> (current step)</span> : null}
                          {state === "done" ? <span className="sr-only"> (completed)</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <Button asChild variant="outline" size="sm">
                <Link href="/provider/findings">View findings on this inspection</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionHeading description="Each request tells you what to send and when it is due.">
          What the State is asking for
        </SectionHeading>

        {openRequests.length === 0 ? (
          <EmptyState title="No open evidence requests" description="You will be notified if the inspector asks for anything." />
        ) : (
          <ul className="space-y-3">
            {openRequests.map((request) => (
              <li key={request.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="min-w-[16rem] space-y-1">
                      <Link href={`/provider/requests/${request.id}`} className="font-medium underline-offset-2 hover:underline">
                        {request.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {request.finding.inspection.caseNumber} · Finding {request.finding.reference}
                        {request.regulation ? ` · ${request.regulation.source ?? ""} ${request.regulation.citation}` : ""}
                      </p>
                      <p className="text-sm">{request.itemsRequested}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      {request.dueAt ? <DeadlineChip dueAt={request.dueAt} dueSoonDays={dueSoonDays} /> : null}
                      <div className="flex gap-2">
                        <Button asChild size="sm">
                          <Link href={`/provider/requests/${request.id}`}>Upload evidence</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/provider/findings/${request.finding.id}`}>Ask a question</Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inspections.length > 0 ? (
        <section className="mt-8">
          <SectionHeading>Your inspections</SectionHeading>
          <ul className="grid gap-3 md:grid-cols-2">
            {inspections.map((inspection) => (
              <li key={inspection.id}>
                <Card>
                  <CardContent className="space-y-2 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{inspection.caseNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {INSPECTION_TYPE_LABELS[inspection.type]} · {inspection.facility.name}
                        </p>
                      </div>
                      <StatusBadge
                        label={INSPECTION_STATUS_META[inspection.status].label}
                        tone={INSPECTION_STATUS_META[inspection.status].tone}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {inspection._count.findings} {inspection._count.findings === 1 ? "finding" : "findings"} ·
                      started {formatDate(inspection.startedAt)}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="sr-only">
        Statuses in this portal are shown with an icon and a label as well as colour.
        {" "}
        {Object.values(FINDING_STATUS_META).length} finding statuses are in use.
      </p>
    </>
  );
}
