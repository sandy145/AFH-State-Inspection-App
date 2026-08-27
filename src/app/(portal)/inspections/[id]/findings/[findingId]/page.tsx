import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireFindingAccessOrNotFound } from "@/data/scope";
import { submissionsForGuard } from "@/data/evidence";
import { evaluateCitationGuard, UNREVIEWED_EVIDENCE_BANNER } from "@/domain/evidence";
import { canIssueCitation, canOverrideEvidenceGuard } from "@/domain/authz";
import { configBool, CONFIG_KEYS } from "@/data/config";
import { formatDate, formatDateTime } from "@/domain/deadlines";
import {
  CITATION_STATUS_META,
  FINDING_STATUS_META,
  REVIEW_OUTCOME_META,
  SERVICE_METHOD_LABELS,
} from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DescriptionList } from "@/components/ui/misc";
import { MessageForm } from "@/components/message-form";
import { markFindingMessagesRead } from "@/data/cases";
import {
  ConsultationForm,
  DraftCitationForm,
  FinalizeCitationForm,
  RequestEvidenceForm,
  ResolveFindingForm,
} from "./outcome-forms";

export const metadata = { title: "Finding" };

/**
 * Finding detail (§6, §9, §12, §13).
 *
 * One screen holds the observation, the regulation, everything requested,
 * everything submitted, the conversation, and the outcome controls. The citation
 * guard is rendered here as a banner and as a disabled button with its reason in
 * text — a reviewer should never have to guess why they cannot proceed.
 */
export default async function FindingPage({
  params,
}: {
  params: Promise<{ id: string; findingId: string }>;
}) {
  const { id, findingId } = await params;
  const user = (await currentUser())!;
  const scope = await requireFindingAccessOrNotFound(toActor(user), findingId);
  await markFindingMessagesRead(user, findingId);

  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: {
      regulation: true,
      inspection: { select: { id: true, caseNumber: true, facility: { select: { name: true } } } },
      evidenceRequests: {
        orderBy: { requestedAt: "asc" },
        include: {
          submissions: {
            orderBy: { submittedAt: "desc" },
            include: {
              submittedBy: { select: { fullName: true } },
              reviews: { where: { isCurrent: true }, include: { reviewer: { select: { fullName: true } } } },
              _count: { select: { files: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { fullName: true, role: true } } },
      },
      consultation: { include: { issuedBy: { select: { fullName: true } } } },
      citation: {
        include: {
          issuedBy: { select: { fullName: true } },
          overrideApprovedBy: { select: { fullName: true } },
          corrections: true,
          idrRequests: true,
        },
      },
    },
  });

  if (!finding) notFound();

  const guard = evaluateCitationGuard(await submissionsForGuard(finding.id));
  const actor = toActor(user);
  const mayCite = canIssueCitation(actor, scope);
  const mayOverride = canOverrideEvidenceGuard(actor, scope);
  const overrideNeedsApproval =
    (await configBool(CONFIG_KEYS.overrideRequiresFieldManagerApproval, true)) &&
    user.role !== "FIELD_MANAGER";

  const resolved = [
    "RESOLVED_NO_VIOLATION",
    "RESOLVED_CONSULTATION",
    "CITATION_RESCINDED",
    "CLOSED",
  ].includes(finding.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>
                {finding.reference} — {finding.title}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {finding.inspection.caseNumber} · {finding.inspection.facility.name}
              </p>
            </div>
            <StatusBadge
              label={FINDING_STATUS_META[finding.status].label}
              tone={FINDING_STATUS_META[finding.status].tone}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {finding.regulation ? (
              <div className="rounded-md border bg-muted/40 p-4 text-sm">
                <p className="font-medium">
                  {finding.regulation.source} {finding.regulation.citation} — {finding.regulation.title}
                </p>
                {finding.regulation.summary ? (
                  <p className="mt-1 text-muted-foreground">{finding.regulation.summary}</p>
                ) : null}
                {finding.regulation.url ? (
                  <a
                    href={finding.regulation.url}
                    className="mt-2 inline-block text-xs underline"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Read the published rule
                  </a>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Inspector observation
              </p>
              <p className="mt-1 text-sm leading-relaxed">{finding.observation}</p>
            </div>

            <DescriptionList
              items={[
                { label: "Potential outcome", value: finding.potentialOutcome.replace(/_/g, " ").toLowerCase() },
                { label: "Resident reference", value: finding.residentIdentifier ?? "Not applicable" },
                {
                  label: "Evidence due",
                  value: finding.evidenceDueAt ? formatDate(finding.evidenceDueAt) : "—",
                },
                { label: "Resolved", value: finding.resolvedAt ? formatDate(finding.resolvedAt) : "Open" },
              ]}
            />

            {finding.resolutionNote ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-medium">Resolution</p>
                <p className="mt-1">{finding.resolutionNote}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence requests and submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {finding.evidenceRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has been requested on this finding yet.</p>
            ) : (
              finding.evidenceRequests.map((request) => (
                <div key={request.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {request.reference} — {request.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested {formatDate(request.requestedAt)}
                        {request.dueAt ? ` · due ${formatDate(request.dueAt)}` : ""}
                      </p>
                    </div>
                    <StatusBadge label={request.status.replace(/_/g, " ").toLowerCase()} tone="neutral" />
                  </div>

                  <p className="mt-2 text-sm">{request.itemsRequested}</p>

                  <ul className="mt-3 space-y-2">
                    {request.submissions.length === 0 ? (
                      <li className="text-sm text-muted-foreground">Nothing submitted yet.</li>
                    ) : (
                      request.submissions.map((submission) => {
                        const review = submission.reviews[0];
                        return (
                          <li
                            key={submission.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm"
                          >
                            <div>
                              <Link
                                href={`/inspector/review/${submission.id}`}
                                className="font-medium underline-offset-2 hover:underline"
                              >
                                {submission.reference}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {submission._count.files}{" "}
                                {submission._count.files === 1 ? "file" : "files"} from{" "}
                                {submission.submittedBy.fullName} ·{" "}
                                {formatDateTime(submission.submittedAt)}
                              </p>
                            </div>
                            {review ? (
                              <StatusBadge
                                label={REVIEW_OUTCOME_META[review.outcome].label}
                                tone={REVIEW_OUTCOME_META[review.outcome].tone}
                                title={review.reason ?? undefined}
                              />
                            ) : (
                              <StatusBadge label="Needs review" tone="critical" />
                            )}
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {finding.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages on this finding yet.</p>
            ) : (
              <ol className="space-y-3">
                {finding.messages.map((message) => (
                  <li
                    key={message.id}
                    className={
                      message.isInternal
                        ? "rounded-md border border-dashed bg-muted/40 p-3 text-sm"
                        : "rounded-md border p-3 text-sm"
                    }
                  >
                    <p className="text-xs text-muted-foreground">
                      {message.author.fullName} · {formatDateTime(message.createdAt)}
                      {message.isInternal ? " · internal note, not visible to the provider" : ""}
                    </p>
                    <p className="mt-1">{message.body}</p>
                  </li>
                ))}
              </ol>
            )}

            <MessageForm findingId={finding.id} allowInternal />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {guard.summary.unreviewed > 0 ? (
          <Alert tone="critical" title={UNREVIEWED_EVIDENCE_BANNER}>
            {guard.summary.unreviewed} submission(s) on this finding have no determination:{" "}
            {guard.summary.unreviewedReferences.join(", ")}.{" "}
            <Link href="/inspector/review" className="underline">
              Review them
            </Link>
            .
          </Alert>
        ) : null}

        {finding.consultation ? (
          <Card>
            <CardHeader>
              <CardTitle>Consultation</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Issued by", value: finding.consultation.issuedBy.fullName },
                  { label: "Issued", value: formatDate(finding.consultation.issuedAt) },
                  { label: "Issue", value: finding.consultation.issueDescription },
                  { label: "Reason consultation was selected", value: finding.consultation.rationale },
                  { label: "Evidence relied upon", value: finding.consultation.evidenceRelied ?? "—" },
                  {
                    label: "Provider acknowledged",
                    value: finding.consultation.providerAcknowledgedAt
                      ? formatDate(finding.consultation.providerAcknowledgedAt)
                      : "Not yet",
                  },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}

        {finding.citation ? (
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle>Citation {finding.citation.citationNumber}</CardTitle>
              <StatusBadge
                label={CITATION_STATUS_META[finding.citation.status].label}
                tone={CITATION_STATUS_META[finding.citation.status].tone}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <DescriptionList
                items={[
                  { label: "Deficient practice", value: finding.citation.deficientPractice },
                  { label: "Inspector analysis", value: finding.citation.inspectorAnalysis },
                  { label: "Evidence relied upon", value: finding.citation.evidenceRelied ?? "—" },
                  { label: "Risk", value: finding.citation.riskLevel.replace(/_/g, " ").toLowerCase() },
                  { label: "Issued by", value: finding.citation.issuedBy?.fullName ?? "—" },
                  {
                    label: "Cited",
                    value: finding.citation.citedAt ? formatDate(finding.citation.citedAt) : "Draft",
                  },
                  {
                    label: "Method of service",
                    value: finding.citation.serviceMethod
                      ? SERVICE_METHOD_LABELS[finding.citation.serviceMethod]
                      : "—",
                  },
                  {
                    label: "Received by provider",
                    value: finding.citation.receivedAt ? formatDate(finding.citation.receivedAt) : "—",
                  },
                  {
                    label: "Correction due",
                    value: finding.citation.correctionDueAt
                      ? formatDate(finding.citation.correctionDueAt)
                      : "—",
                  },
                ]}
              />

              {finding.citation.overrideUsed ? (
                <Alert tone="warning" title="Finalized using an evidence-guard override">
                  <p>{finding.citation.overrideJustification}</p>
                  <p className="mt-1 text-xs">
                    Recorded {finding.citation.overrideAt ? formatDateTime(finding.citation.overrideAt) : ""}.
                    {finding.citation.overridePendingApproval
                      ? " Waiting for Field Manager approval."
                      : finding.citation.overrideApprovedBy
                        ? ` Approved by ${finding.citation.overrideApprovedBy.fullName}.`
                        : ""}
                  </p>
                </Alert>
              ) : null}

              {finding.citation.status === "DRAFT" && mayCite ? (
                <FinalizeCitationForm
                  citationId={finding.citation.id}
                  summary={guard.summary}
                  blocked={!guard.allowed}
                  blockReason={guard.reason}
                  canOverride={mayOverride}
                  overrideNeedsApproval={overrideNeedsApproval}
                />
              ) : null}

              {finding.citation.idrRequests.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {finding.citation.idrRequests.length} dispute(s) on this citation —{" "}
                  <Link href={`/inspections/${id}/idr`} className="underline">
                    see IDR
                  </Link>
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {mayCite && !resolved ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Request evidence</CardTitle>
              </CardHeader>
              <CardContent>
                <RequestEvidenceForm findingId={finding.id} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resolve — no violation</CardTitle>
              </CardHeader>
              <CardContent>
                <ResolveFindingForm findingId={finding.id} />
              </CardContent>
            </Card>

            {!finding.consultation ? (
              <Card>
                <CardHeader>
                  <CardTitle>Issue a consultation</CardTitle>
                </CardHeader>
                <CardContent>
                  <ConsultationForm findingId={finding.id} />
                </CardContent>
              </Card>
            ) : null}

            {!finding.citation ? (
              <Card>
                <CardHeader>
                  <CardTitle>Proceed to citation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Drafting is always available. Finalizing is what requires every submission on this
                    finding to have been reviewed.
                  </p>
                  <DraftCitationForm findingId={finding.id} />
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}

        <Button asChild variant="outline" className="w-full">
          <Link href={`/inspections/${id}/timeline`}>View case timeline</Link>
        </Button>
      </div>
    </div>
  );
}
