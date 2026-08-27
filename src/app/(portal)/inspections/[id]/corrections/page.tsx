import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { canReviewEvidence } from "@/domain/authz";
import { formatDate, formatDateTime } from "@/domain/deadlines";
import { CORRECTION_STATUS_META } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, EmptyState } from "@/components/ui/misc";
import { ReviewCorrectionForm } from "./review-correction-form";

export const metadata = { title: "Corrections" };

/** Corrections on this case (§14). Reviewing is staff-only. */
export default async function CorrectionsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  const scope = await requireInspectionAccessOrNotFound(toActor(user), id);

  const corrections = await prisma.correction.findMany({
    where: { citation: { finding: { inspectionId: id } } },
    include: {
      reviewedBy: { select: { fullName: true } },
      evidence: { include: { documentVersion: true } },
      citation: {
        select: {
          citationNumber: true,
          status: true,
          finding: { select: { id: true, reference: true, title: true } },
        },
      },
    },
    orderBy: { dueAt: "asc" },
  });

  const mayReview = canReviewEvidence(toActor(user), scope);

  if (corrections.length === 0) {
    return <EmptyState title="No corrections on this case." description="Corrections are created when a citation is finalized." />;
  }

  return (
    <div className="space-y-4">
      {corrections.map((correction) => (
        <Card key={correction.id}>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>
                {correction.kind === "PLAN_OF_CORRECTION" ? "Plan of Correction" : "Attestation of Correction"} ·{" "}
                {correction.citation.citationNumber}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link
                  href={`/inspections/${id}/findings/${correction.citation.finding.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {correction.citation.finding.reference} — {correction.citation.finding.title}
                </Link>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge
                label={CORRECTION_STATUS_META[correction.status].label}
                tone={CORRECTION_STATUS_META[correction.status].tone}
              />
              {correction.dueAt ? (
                <DeadlineChip dueAt={correction.dueAt} satisfiedAt={correction.submittedAt} />
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {correction.submittedAt ? (
              <>
                <DescriptionList
                  items={[
                    { label: "How the deficiency was corrected", value: correction.howCorrected ?? "—" },
                    {
                      label: "Date correction completed",
                      value: correction.correctionCompletedAt
                        ? formatDate(correction.correctionCompletedAt)
                        : "—",
                    },
                    { label: "How it will be maintained", value: correction.howMaintained ?? "—" },
                    { label: "Responsible person", value: correction.responsiblePerson ?? "—" },
                    {
                      label: "Electronic attestation",
                      value: correction.signatureName
                        ? `${correction.signatureName}${correction.signatureTitle ? `, ${correction.signatureTitle}` : ""}`
                        : "—",
                    },
                    {
                      label: "Received by the portal",
                      value: formatDateTime(correction.submittedAt),
                    },
                  ]}
                />

                {correction.evidence.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Supporting evidence
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {correction.evidence.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={`/documents/${item.documentVersion.id}`}
                            className="underline underline-offset-2"
                          >
                            {item.documentVersion.fileName}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {correction.reviewedBy ? (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      Reviewed by {correction.reviewedBy.fullName}
                      {correction.reviewedAt ? ` on ${formatDate(correction.reviewedAt)}` : ""}
                    </p>
                    {correction.reviewNote ? <p className="mt-1">{correction.reviewNote}</p> : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The provider has not submitted this correction yet.
              </p>
            )}

            {mayReview && correction.submittedAt && correction.status !== "CORRECTED" ? (
              <ReviewCorrectionForm correctionId={correction.id} status={correction.status} />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
