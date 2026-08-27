import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { formatDate } from "@/domain/deadlines";
import { FINDING_STATUS_META, SERVICE_METHOD_LABELS } from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, SectionHeading } from "@/components/ui/misc";

export const metadata = { title: "Inspection overview" };

export default async function InspectionOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  await requireInspectionAccessOrNotFound(toActor(user), id);

  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      facility: true,
      region: { select: { name: true } },
      findings: {
        orderBy: { reference: "asc" },
        include: {
          regulation: { select: { citation: true, source: true } },
          submissions: { include: { reviews: { where: { isCurrent: true } } } },
        },
      },
      deadlines: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" } },
    },
  });

  if (!inspection) notFound();

  const unreviewed = inspection.findings.flatMap((finding) =>
    finding.submissions.filter((s) => s.reviews.length === 0 && s.status !== "WITHDRAWN"),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        {unreviewed.length > 0 ? (
          <Alert
            tone="critical"
            title={`${unreviewed.length} provider submission${unreviewed.length === 1 ? "" : "s"} on this case have not been reviewed`}
          >
            <Link href="/inspector/review" className="underline">
              Open the review queue
            </Link>{" "}
            — a citation cannot be finalized on a finding while evidence attached to it is unreviewed.
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Case</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: "Adult family home", value: inspection.facility.name },
                { label: "Licence number", value: inspection.facility.licenseNumber },
                {
                  label: "Address",
                  value: `${inspection.facility.addressLine1}, ${inspection.facility.city}, ${inspection.facility.state} ${inspection.facility.zip}`,
                },
                { label: "Region", value: inspection.region?.name ?? "—" },
                { label: "Licensed beds", value: inspection.facility.bedCapacity },
                { label: "Inspection started", value: formatDate(inspection.startedAt) },
                {
                  label: "Last date of data collection",
                  value: inspection.lastDataCollectionAt ? formatDate(inspection.lastDataCollectionAt) : "—",
                },
                {
                  label: "Exit conference",
                  value: inspection.exitConferenceAt ? formatDate(inspection.exitConferenceAt) : "—",
                },
                { label: "Responsible person", value: inspection.responsiblePerson ?? "—" },
              ]}
            />
          </CardContent>
        </Card>

        {/* Service tracking is recorded explicitly: the portal runs alongside
            the legally required method of delivery, it does not replace it. */}
        <Card>
          <CardHeader>
            <CardTitle>Report and service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DescriptionList
              items={[
                {
                  label: "Report issued",
                  value: inspection.reportIssuedAt ? formatDate(inspection.reportIssuedAt) : "Not yet issued",
                },
                {
                  label: "Method of service",
                  value: inspection.reportServiceMethod
                    ? SERVICE_METHOD_LABELS[inspection.reportServiceMethod]
                    : "—",
                },
                {
                  label: "Date received by provider",
                  value: inspection.reportReceivedAt ? formatDate(inspection.reportReceivedAt) : "Not recorded",
                },
                {
                  label: "Portal notification sent",
                  value: inspection.portalNotifiedAt ? formatDate(inspection.portalNotifiedAt) : "—",
                },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Portal notification does not replace any legally required method of service. Regulatory
              deadlines are computed from the date recorded as received.
            </p>
          </CardContent>
        </Card>

        <section>
          <SectionHeading>Findings</SectionHeading>
          <ul className="space-y-2">
            {inspection.findings.map((finding) => {
              const pending = finding.submissions.filter(
                (s) => s.reviews.length === 0 && s.status !== "WITHDRAWN",
              ).length;

              return (
                <li key={finding.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div>
                        <Link
                          href={`/inspections/${id}/findings/${finding.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {finding.reference} — {finding.title}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {finding.regulation
                            ? `${finding.regulation.source} ${finding.regulation.citation}`
                            : "No regulation linked"}
                          {finding.residentIdentifier ? ` · ${finding.residentIdentifier}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {pending > 0 ? (
                          <StatusBadge label={`${pending} unreviewed`} tone="critical" />
                        ) : null}
                        <StatusBadge
                          label={FINDING_STATUS_META[finding.status].label}
                          tone={FINDING_STATUS_META[finding.status].tone}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Open deadlines</CardTitle>
          </CardHeader>
          <CardContent>
            {inspection.deadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open deadlines on this case.</p>
            ) : (
              <ul className="space-y-3">
                {inspection.deadlines.map((deadline) => (
                  <li key={deadline.id} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium">{deadline.label}</p>
                    <DeadlineChip dueAt={deadline.dueAt} />
                    <p className="text-xs text-muted-foreground">
                      Rule {deadline.ruleKey}, computed from {formatDate(deadline.computedFrom)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
