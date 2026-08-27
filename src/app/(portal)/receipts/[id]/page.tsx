import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireFindingAccessOrNotFound } from "@/data/scope";
import { formatDateTime } from "@/domain/deadlines";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Evidence submission receipt" };

/**
 * Proof of submission (§34).
 *
 * This page exists so a provider never has to argue about whether something was
 * sent. Every fact on it is denormalized onto the receipt row at submission
 * time, so it still reads correctly years later. It is styled to print cleanly.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;

  const submission = await prisma.evidenceSubmission.findUnique({
    where: { id },
    include: { receipt: true, files: { include: { documentVersion: true } } },
  });

  if (!submission?.receipt) notFound();
  await requireFindingAccessOrNotFound(toActor(user), submission.findingId);

  const { receipt } = submission;

  const rows: [string, string][] = [
    ["Inspection", receipt.caseNumber],
    ["Adult family home", receipt.facilityName],
    ["Finding", receipt.findingReference],
    ["Evidence request", receipt.evidenceRequestTitle],
    ["File(s)", receipt.fileNames],
    ["Received", formatDateTime(receipt.receivedAt)],
    ["Submission ID", submission.reference],
    ["Receipt number", receipt.receiptNumber],
    ["Submitted by", receipt.submittedByName],
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2 text-emerald-800 no-print">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        <p className="font-medium">Your evidence was received.</p>
      </div>

      <article className="rounded-lg border bg-card p-8 shadow-sm">
        <header className="border-b pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Washington State DSHS · Residential Care Services
          </p>
          <h1 className="mt-1 text-xl font-semibold">Evidence Submission Receipt</h1>
        </header>

        <dl className="mt-6 space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[10rem_1fr] gap-4 border-b border-dashed pb-3 text-sm">
              <dt className="font-medium text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          This receipt confirms that the portal received the file(s) listed above at the time shown. It
          does not indicate that the evidence has been reviewed, and it is not a determination about
          compliance. This is a prototype system and this receipt is not an official state record.
        </p>
      </article>

      <div className="mt-6 flex flex-wrap gap-2 no-print">
        <PrintButton />
        <Button asChild variant="outline">
          <Link href="/provider/requests">Back to evidence requests</Link>
        </Button>
      </div>
    </div>
  );
}
