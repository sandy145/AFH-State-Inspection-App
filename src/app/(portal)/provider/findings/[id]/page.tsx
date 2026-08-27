import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireFindingAccessOrNotFound } from "@/data/scope";
import { IDR_NOTICE } from "@/data/idr";
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
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { MessageForm } from "@/components/message-form";
import { DisputeForm } from "./dispute-form";

export const metadata = { title: "Finding" };

/**
 * The provider's finding page.
 *
 * Written to answer, without jargon: what was raised, what you sent, whether it
 * was reviewed, what was decided, and what you have to do next.
 */
export default async function ProviderFindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  await requireFindingAccessOrNotFound(toActor(user), id);

  const finding = await prisma.finding.findUnique({
    where: { id },
    include: {
      regulation: true,
      inspection: { select: { caseNumber: true, startedAt: true, leadInspector: { select: { fullName: true } } } },
      evidenceRequests: {
        orderBy: { requestedAt: "asc" },
        include: {
          submissions: {
            orderBy: { submittedAt: "desc" },
            include: {
              files: { include: { documentVersion: true } },
              reviews: { where: { isCurrent: true }, include: { reviewer: { select: { fullName: true } } } },
            },
          },
        },
      },
      // Internal staff notes are never included in a provider's query.
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { fullName: true, role: true } } },
      },
      consultation: true,
      citation: { include: { corrections: true, idrRequests: true } },
    },
  });

  if (!finding) notFound();
  const meta = FINDING_STATUS_META[finding.status];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/provider/findings" className="underline-offset-2 hover:underline">
            ← All findings
          </Link>
        }
        title={`${finding.reference} — ${finding.title}`}
        description={`${finding.inspection.caseNumber} · Inspector ${finding.inspection.leadInspector?.fullName ?? "unassigned"}`}
        actions={<StatusBadge label={meta.label} tone={meta.tone} />}
      />

      {meta.hint ? (
        <Alert tone={meta.tone === "critical" ? "critical" : "info"} title={meta.label} className="mb-6">
          {meta.hint}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>What the inspector observed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">{finding.observation}</p>

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
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-block text-xs underline"
                    >
                      Read the published rule
                    </a>
                  ) : null}
                </div>
              ) : null}

              {finding.resolutionNote ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-medium">Outcome</p>
                  <p className="mt-1">{finding.resolutionNote}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What you sent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {finding.evidenceRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing has been requested from you on this finding.
                </p>
              ) : (
                finding.evidenceRequests.map((request) => (
                  <div key={request.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{request.title}</p>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/provider/requests/${request.id}`}>Open request</Link>
                      </Button>
                    </div>

                    <ul className="mt-3 space-y-2">
                      {request.submissions.length === 0 ? (
                        <li className="text-sm text-muted-foreground">Nothing submitted yet.</li>
                      ) : (
                        request.submissions.map((submission) => {
                          const review = submission.reviews[0];
                          return (
                            <li key={submission.id} className="rounded-md bg-muted/40 p-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium">{submission.reference}</span>
                                {review ? (
                                  <StatusBadge
                                    label={REVIEW_OUTCOME_META[review.outcome].label}
                                    tone={REVIEW_OUTCOME_META[review.outcome].tone}
                                  />
                                ) : (
                                  <StatusBadge label="Pending review" tone="attention" />
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Received {formatDateTime(submission.submittedAt)} ·{" "}
                                {submission.files.map((f) => f.documentVersion.fileName).join(", ")}
                              </p>
                              {review?.reason ? <p className="mt-1">{review.reason}</p> : null}
                              {review ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Reviewed by {review.reviewer.fullName} on {formatDate(review.reviewedAt)}
                                </p>
                              ) : null}
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
              <CardTitle>Messages with your inspector</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {finding.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <ol className="space-y-3">
                  {finding.messages.map((message) => (
                    <li key={message.id} className="rounded-md border p-3 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {message.author.role === "PROVIDER" ? "You" : message.author.fullName} ·{" "}
                        {formatDateTime(message.createdAt)}
                      </p>
                      <p className="mt-1">{message.body}</p>
                    </li>
                  ))}
                </ol>
              )}

              <MessageForm findingId={finding.id} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {finding.consultation ? (
            <Card>
              <CardHeader>
                <CardTitle>Consultation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  This finding was addressed through consultation rather than a citation.
                </p>
                <DescriptionList
                  items={[
                    { label: "Issue", value: finding.consultation.issueDescription },
                    { label: "Issued", value: formatDate(finding.consultation.issuedAt) },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}

          {finding.citation && finding.citation.status !== "DRAFT" ? (
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
                    {
                      label: "Cited",
                      value: finding.citation.citedAt ? formatDate(finding.citation.citedAt) : "—",
                    },
                    {
                      label: "How it was served",
                      value: finding.citation.serviceMethod
                        ? SERVICE_METHOD_LABELS[finding.citation.serviceMethod]
                        : "—",
                    },
                    {
                      label: "Correction due",
                      value: finding.citation.correctionDueAt
                        ? formatDate(finding.citation.correctionDueAt)
                        : "—",
                    },
                  ]}
                />

                {finding.citation.corrections.length > 0 ? (
                  <Button asChild className="w-full">
                    <Link href={`/provider/corrections/${finding.citation.corrections[0]!.id}`}>
                      Submit your correction
                    </Link>
                  </Button>
                ) : null}

                {finding.citation.idrRequests.length === 0 ? (
                  <div className="border-t pt-4">
                    <p className="mb-2 font-medium">Disagree with this citation?</p>
                    <Alert tone="info" title="Before you dispute">
                      {IDR_NOTICE}
                    </Alert>
                    <div className="mt-3">
                      <DisputeForm citationId={finding.citation.id} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">Dispute submitted</p>
                    {finding.citation.idrRequests.map((request) => (
                      <p key={request.id} className="mt-1 text-muted-foreground">
                        {request.reference} · submitted {formatDate(request.submittedAt)} ·{" "}
                        {request.status.replace(/_/g, " ").toLowerCase()}
                      </p>
                    ))}
                    <p className="mt-2 text-xs text-muted-foreground">{IDR_NOTICE}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
