import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * Notification deep links point here; corrections are reviewed on the case
 * record, so this resolves the correction to its inspection and forwards.
 */
export default async function CorrectionRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const correction = await prisma.correction.findUnique({
    where: { id },
    select: { citation: { select: { finding: { select: { inspectionId: true } } } } },
  });

  redirect(
    correction ? `/inspections/${correction.citation.finding.inspectionId}/corrections` : "/inspector",
  );
}
