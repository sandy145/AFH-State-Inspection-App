import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireFindingAccessOrNotFound } from "@/data/scope";
import { submissionsForGuard } from "@/data/evidence";
import { evaluateCitationGuard, UNREVIEWED_EVIDENCE_BANNER } from "@/domain/evidence";
import { formatDate, formatDateTime } from "@/domain/deadlines";
import { FINDING_STATUS_META, REVIEW_OUTCOME_META, SUBMISSION_STATUS_META } from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { EvidenceViewer } from "@/components/evidence-viewer";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Review evidence" };

/**
 * Side-by-side evidence review (§10).
 *
 * Left: what was asked and why. Right: what arrived. Everything an inspector
 * needs to decide is on one screen, so the decision is never made from memory
 * of an email.
 */
export default async function ReviewSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;

  const submission = await prisma.evidenceSubmission.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { fullName: true, title: true } },
      files: { include: { documentVersion: { include: { uploadedBy: { select: { fullName: true } } } } } },
      receipt: true,
      reviews: { orderBy: { reviewedAt: "desc" }, include: { reviewer: { select: { fullName: true } } } },
      evidenceRequest: { include: { regulation: true } },
      finding: {
        include: {
          regulation: true,
          inspection: {
            select: {
              id: true,
              caseNumber: true,
              facility: { select: { name: true, licenseNumber: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { fullName: true, role: true } } },
          },
        },
      },
    },
  });

  if (!submission) notFound();
  await requireFindingAccessOrNotFound(toActor(user), submission.findingId);

  const { finding, evidenceRequest } = submission;
  const guard = evaluateCitationGuard(await submissionsForGuard(finding.id));
  const currentReview = submission.reviews.find((r) => r.isCurrent);

  // Every other submission on this finding, so the reviewer can see the history
  // without leaving the page.
  const siblings = await prisma.evidenceSubmission.findMany({
    where: { findingId: finding.id, id: { not: submission.id } },
    include: { reviews: { where: { isCurrent: true } }, _count: { select: { files: true } } },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/inspector/review" className="underline-offset-2 hover:underline">
            ← Evidence review queue
          </Link>
        }
        title={evidenceRequest.title}
        description={
          <>
            {finding.inspection.caseNumber} · {finding.inspection.facility.name} (licence{" "}
            {finding.inspection.facility.licenseNumber}) · Finding {finding.reference}
          </>
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/inspections/${finding.inspection.id}/findings/${finding.id}`}>Open finding</Link>
          </Button>
        }
      />

      {!currentReview ? (
        <Alert tone="critical" title={UNREVIEWED_EVIDENCE_BANNER} className="mb-6">
          This submission has no recorded determination. While it stands, a citation on{" "}
          {finding.reference} cannot be finalized by the normal path.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT — the ask */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle>Finding {finding.reference}</CardTitle>
              <StatusBadge
                label={FINDING_STATUS_META[finding.status].label}
                tone={FINDING_STATUS_META[finding.status].tone}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-medium">{finding.title}</p>

              {finding.regulation ? (
                <div className="rounded-md border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">
                    {finding.regulation.source} {finding.regulation.citation} — {finding.regulation.title}
                  </p>
                  {finding.regulation.summary ? (
                    <p className="mt-1 text-muted-foreground">{finding.regulation.summary}</p>
                  ) : null}
                  {finding.regulation.inspectorGuidance ? (
                    <p className="mt-2 text-muted-foreground">
                      <span className="font-medium text-foreground">Guidance: </span>
                      {finding.regulation.inspectorGuidance}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Inspector observation
                </p>
                <p className="mt-1 text-sm leading-relaxed">{finding.observation}</p>
                {finding.residentIdentifier ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Resident reference: {finding.residentIdentifier}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence request {evidenceRequest.reference}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm leading-relaxed">{evidenceRequest.instructions}</p>
              <DescriptionList
                items={[
                  { label: "Documents requested", value: evidenceRequest.itemsRequested },
                  { label: "Requested", value: formatDate(evidenceRequest.requestedAt) },
                  {
                    label: "Due",
                    value: evidenceRequest.dueAt ? <DeadlineChip dueAt={evidenceRequest.dueAt} /> : "No date set",
                  },
                  { label: "Priority", value: evidenceRequest.priority.toLowerCase() },
                ]}
              />
            </CardContent>
          </Card>

          {finding.messages.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Conversation on this finding</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {finding.messages.map((message) => (
                    <li key={message.id} className="rounded-md border p-3 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {message.author.fullName} · {formatDateTime(message.createdAt)}
                        {message.isInternal ? " · internal note" : ""}
                      </p>
                      <p className="mt-1">{message.body}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* RIGHT — what arrived */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Submission {submission.reference}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {submission.submittedBy.fullName}
                  {submission.submittedBy.title ? ` (${submission.submittedBy.title})` : ""} ·{" "}
                  received {formatDateTime(submission.submittedAt)}
                </p>
              </div>
              <StatusBadge
                label={SUBMISSION_STATUS_META[submission.status].label}
                tone={SUBMISSION_STATUS_META[submission.status].tone}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <EvidenceViewer
                files={submission.files.map((file) => ({
                  id: file.documentVersion.id,
                  fileName: file.documentVersion.fileName,
                  mimeType: file.documentVersion.mimeType,
                  version: file.documentVersion.version,
                  sizeBytes: file.documentVersion.sizeBytes,
                }))}
              />

              <ul className="space-y-2">
                {submission.files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <Link
                          href={`/documents/${file.documentVersion.id}`}
                          className="text-sm font-medium underline underline-offset-2"
                        >
                          {file.documentVersion.fileName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Version {file.documentVersion.version} ·{" "}
                          {(file.documentVersion.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                          uploaded by {file.documentVersion.uploadedBy.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SHA-256 {file.documentVersion.checksum.slice(0, 16)}…
                        </p>
                      </div>
                    </div>
                    <StatusBadge
                      label={
                        file.documentVersion.scanStatus === "CLEAN"
                          ? "Scanned"
                          : file.documentVersion.scanStatus === "PENDING"
                            ? "Scan pending"
                            : file.documentVersion.scanStatus
                      }
                      tone={
                        file.documentVersion.scanStatus === "CLEAN"
                          ? "success"
                          : file.documentVersion.scanStatus === "INFECTED"
                            ? "critical"
                            : "neutral"
                      }
                    />
                  </li>
                ))}
              </ul>

              {submission.providerExplanation ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Provider explanation
                  </p>
                  <p className="mt-1 rounded-md bg-muted/50 p-3 text-sm">{submission.providerExplanation}</p>
                </div>
              ) : null}

              {submission.receipt ? (
                <p className="text-xs text-muted-foreground">
                  Receipt {submission.receipt.receiptNumber} was issued to the provider at{" "}
                  {formatDateTime(submission.receipt.receivedAt)}.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{currentReview ? "Change the determination" : "Record your determination"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentReview ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={REVIEW_OUTCOME_META[currentReview.outcome].label}
                      tone={REVIEW_OUTCOME_META[currentReview.outcome].tone}
                    />
                    <span className="text-xs text-muted-foreground">
                      {currentReview.reviewer.fullName} · {formatDateTime(currentReview.reviewedAt)}
                    </span>
                  </div>
                  {currentReview.reason ? <p className="mt-2">{currentReview.reason}</p> : null}
                </div>
              ) : null}

              <ReviewForm submissionId={submission.id} />

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/inspections/${finding.inspection.id}/findings/${finding.id}`}>
                    Resolve finding, consult, or cite
                  </Link>
                </Button>
              </div>

              {!guard.allowed ? (
                <p className="text-sm text-muted-foreground">
                  {guard.summary.unreviewed} submission(s) on this finding still need a determination:{" "}
                  {guard.summary.unreviewedReferences.join(", ")}.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {submission.reviews.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Determination history</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm">
                  {submission.reviews.map((review) => (
                    <li key={review.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={REVIEW_OUTCOME_META[review.outcome].label}
                          tone={REVIEW_OUTCOME_META[review.outcome].tone}
                        />
                        {review.isCurrent ? <span className="text-xs font-medium">(current)</span> : null}
                        <span className="text-xs text-muted-foreground">
                          {review.reviewer.fullName} · {formatDateTime(review.reviewedAt)}
                        </span>
                      </div>
                      {review.reason ? <p className="mt-1">{review.reason}</p> : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}

          {siblings.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Other submissions on this finding</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {siblings.map((sibling) => (
                    <li key={sibling.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                      <div>
                        <Link href={`/inspector/review/${sibling.id}`} className="font-medium underline-offset-2 hover:underline">
                          {sibling.reference}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(sibling.submittedAt)} · {sibling._count.files}{" "}
                          {sibling._count.files === 1 ? "file" : "files"}
                        </p>
                      </div>
                      {sibling.reviews[0] ? (
                        <StatusBadge
                          label={REVIEW_OUTCOME_META[sibling.reviews[0].outcome].label}
                          tone={REVIEW_OUTCOME_META[sibling.reviews[0].outcome].tone}
                        />
                      ) : (
                        <StatusBadge label="Needs review" tone="attention" />
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
