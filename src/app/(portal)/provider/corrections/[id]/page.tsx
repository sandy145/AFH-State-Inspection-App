import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireFindingAccessOrNotFound } from "@/data/scope";
import { formatDate, formatDateTime } from "@/domain/deadlines";
import { CORRECTION_STATUS_META } from "@/domain/status";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { DeadlineChip } from "@/components/ui/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { CorrectionForm } from "./correction-form";

export const metadata = { title: "Submit correction" };

/** Plan / Attestation of Correction, provider side (§14). */
export default async function ProviderCorrectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;

  const correction = await prisma.correction.findUnique({
    where: { id },
    include: {
      evidence: { include: { documentVersion: true } },
      citation: {
        include: {
          regulation: true,
          finding: {
            select: { id: true, reference: true, title: true, inspection: { select: { caseNumber: true } } },
          },
        },
      },
    },
  });

  if (!correction) notFound();
  await requireFindingAccessOrNotFound(toActor(user), correction.citation.findingId);

  const meta = CORRECTION_STATUS_META[correction.status];
  const editable = ["NOT_SUBMITTED", "DRAFT", "ADDITIONAL_INFO_REQUESTED"].includes(correction.status);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/provider/corrections" className="underline-offset-2 hover:underline">
            ← All corrections
          </Link>
        }
        title={correction.kind === "PLAN_OF_CORRECTION" ? "Plan of Correction" : "Attestation of Correction"}
        description={`${correction.citation.citationNumber} · ${correction.citation.finding.inspection.caseNumber} · ${correction.citation.finding.reference}`}
        actions={<StatusBadge label={meta.label} tone={meta.tone} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>What was cited</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DescriptionList
                items={[
                  {
                    label: "Regulation",
                    value: correction.citation.regulation
                      ? `${correction.citation.regulation.source} ${correction.citation.regulation.citation} — ${correction.citation.regulation.title}`
                      : "—",
                  },
                  { label: "Deficient practice", value: correction.citation.deficientPractice },
                  {
                    label: "Date received",
                    value: correction.citation.receivedAt ? formatDate(correction.citation.receivedAt) : "—",
                  },
                ]}
              />

              {correction.dueAt ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due</p>
                  <div className="mt-1">
                    <DeadlineChip dueAt={correction.dueAt} satisfiedAt={correction.submittedAt} />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {correction.reviewNote ? (
            <Alert tone="attention" title="The inspector needs more from you">
              {correction.reviewNote}
            </Alert>
          ) : null}

          {correction.submittedAt ? (
            <Card>
              <CardHeader>
                <CardTitle>What you submitted</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DescriptionList
                  items={[
                    { label: "How it was corrected", value: correction.howCorrected ?? "—" },
                    {
                      label: "Date completed",
                      value: correction.correctionCompletedAt
                        ? formatDate(correction.correctionCompletedAt)
                        : "—",
                    },
                    { label: "How it will be maintained", value: correction.howMaintained ?? "—" },
                    { label: "Responsible person", value: correction.responsiblePerson ?? "—" },
                    {
                      label: "Signed",
                      value: `${correction.signatureName ?? "—"}${correction.signatureTitle ? `, ${correction.signatureTitle}` : ""}`,
                    },
                    { label: "Received by the portal", value: formatDateTime(correction.submittedAt) },
                  ]}
                />

                {correction.evidence.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {correction.evidence.map((item) => (
                      <li key={item.id}>
                        <Link href={`/documents/${item.documentVersion.id}`} className="underline underline-offset-2">
                          {item.documentVersion.fileName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {editable ? (
          <Card>
            <CardHeader>
              <CardTitle>Submit your correction</CardTitle>
            </CardHeader>
            <CardContent>
              <CorrectionForm correctionId={correction.id} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{meta.hint ?? `This correction is ${meta.label.toLowerCase()}.`}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
