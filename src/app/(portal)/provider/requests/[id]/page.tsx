import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireFindingAccessOrNotFound } from "@/data/scope";
import { configInt, CONFIG_KEYS } from "@/data/config";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/upload-limits";
import { formatDate, formatDateTime } from "@/domain/deadlines";
import { REVIEW_OUTCOME_META, SUBMISSION_STATUS_META } from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Evidence request" };

export default async function EvidenceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;

  const request = await prisma.evidenceRequest.findUnique({
    where: { id },
    include: {
      regulation: true,
      finding: {
        select: {
          id: true,
          reference: true,
          title: true,
          observation: true,
          inspection: {
            select: { id: true, caseNumber: true, facility: { select: { name: true } }, leadInspector: { select: { fullName: true } } },
          },
        },
      },
      submissions: {
        include: {
          files: { include: { documentVersion: true } },
          reviews: { orderBy: { reviewedAt: "desc" }, include: { reviewer: { select: { fullName: true } } } },
          receipt: true,
        },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!request) notFound();
  // Authorization is re-checked here, not inherited from the list that linked in.
  await requireFindingAccessOrNotFound(toActor(user), request.finding.id);

  const dueSoonDays = await configInt(CONFIG_KEYS.evidenceDueSoonDays, 3);
  const latestSubmission = request.submissions[0];
  const awaitingReview = request.submissions.filter((s) => s.reviews.length === 0).length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/provider/requests" className="underline-offset-2 hover:underline">
            ← All evidence requests
          </Link>
        }
        title={request.title}
        description={`${request.finding.inspection.caseNumber} · Finding ${request.finding.reference} — ${request.finding.title}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>What the inspector is asking for</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm leading-relaxed">{request.instructions}</p>

              <DescriptionList
                items={[
                  { label: "Documents requested", value: request.itemsRequested },
                  {
                    label: "Regulation",
                    value: request.regulation
                      ? `${request.regulation.source} ${request.regulation.citation} — ${request.regulation.title}`
                      : "Not specified",
                  },
                  { label: "Requested", value: formatDate(request.requestedAt) },
                  {
                    label: "Due",
                    value: request.dueAt ? <DeadlineChip dueAt={request.dueAt} dueSoonDays={dueSoonDays} /> : "No date set",
                  },
                  { label: "Inspector", value: request.finding.inspection.leadInspector?.fullName ?? "Not assigned" },
                  { label: "Priority", value: request.priority.toLowerCase() },
                ]}
              />

              <div className="rounded-md border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Inspector&rsquo;s observation on this finding</p>
                <p className="mt-1 text-muted-foreground">{request.finding.observation}</p>
              </div>

              <Button asChild variant="outline" size="sm">
                <Link href={`/provider/findings/${request.finding.id}`}>Ask the inspector a question</Link>
              </Button>
            </CardContent>
          </Card>

          {request.status !== "CANCELLED" ? (
            <Card>
              <CardHeader>
                <CardTitle>{latestSubmission ? "Send more evidence" : "Upload evidence"}</CardTitle>
              </CardHeader>
              <CardContent>
                <UploadForm
                  evidenceRequestId={request.id}
                  allowMultipleFiles={request.allowMultipleFiles}
                  explanationRequired={request.explanationRequired}
                  supersedesSubmissionId={latestSubmission?.id ?? null}
                  maxUploadLabel={formatBytes(env.maxUploadBytes)}
                  maxUploadBytes={env.maxUploadBytes}
                />
              </CardContent>
            </Card>
          ) : (
            <Alert tone="neutral" title="This request was cancelled">
              You do not need to send anything for it.
            </Alert>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">What you have sent</h2>

          {awaitingReview > 0 ? (
            <Alert tone="info" title={`${awaitingReview} submission${awaitingReview === 1 ? "" : "s"} pending review`}>
              The State has your {awaitingReview === 1 ? "document" : "documents"}. The inspector has not
              recorded a determination yet.
            </Alert>
          ) : null}

          {request.submissions.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              Nothing submitted yet.
            </p>
          ) : (
            <ol className="space-y-3">
              {request.submissions.map((submission) => {
                const current = submission.reviews.find((r) => r.isCurrent);
                return (
                  <li key={submission.id}>
                    <Card>
                      <CardContent className="space-y-3 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{submission.reference}</p>
                            <p className="text-xs text-muted-foreground">
                              Received {formatDateTime(submission.submittedAt)}
                            </p>
                          </div>
                          <StatusBadge
                            label={SUBMISSION_STATUS_META[submission.status].label}
                            tone={SUBMISSION_STATUS_META[submission.status].tone}
                          />
                        </div>

                        <ul className="space-y-1 text-sm">
                          {submission.files.map((file) => (
                            <li key={file.id} className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/documents/${file.documentVersion.id}`}
                                className="underline underline-offset-2"
                              >
                                {file.documentVersion.fileName}
                              </Link>
                              <span className="text-xs text-muted-foreground">
                                version {file.documentVersion.version} ·{" "}
                                {(file.documentVersion.sizeBytes / 1024).toFixed(0)} KB
                              </span>
                            </li>
                          ))}
                        </ul>

                        {submission.providerExplanation ? (
                          <p className="rounded-md bg-muted/50 p-3 text-sm">{submission.providerExplanation}</p>
                        ) : null}

                        {current ? (
                          <div className="rounded-md border p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge
                                label={REVIEW_OUTCOME_META[current.outcome].label}
                                tone={REVIEW_OUTCOME_META[current.outcome].tone}
                              />
                              <span className="text-xs text-muted-foreground">
                                by {current.reviewer.fullName} on {formatDate(current.reviewedAt)}
                              </span>
                            </div>
                            {current.reason ? <p className="mt-2">{current.reason}</p> : null}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Not yet reviewed by the inspector.</p>
                        )}

                        {submission.receipt ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/receipts/${submission.id}`}>View receipt</Link>
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
