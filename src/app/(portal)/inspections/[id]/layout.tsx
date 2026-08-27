import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { formatDate } from "@/domain/deadlines";
import { INSPECTION_STATUS_META, INSPECTION_TYPE_LABELS, SERVICE_METHOD_LABELS } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/misc";

/**
 * Inspection case shell (§5).
 *
 * The tabs are the case record: overview, findings, evidence requests,
 * documents, timeline, corrections, IDR, follow-up and audit history. Each is a
 * real route, so any tab can be linked to from an email or a report.
 */
const TABS = [
  { segment: "", label: "Overview" },
  { segment: "findings", label: "Findings" },
  { segment: "evidence", label: "Evidence requests" },
  { segment: "documents", label: "Documents" },
  { segment: "timeline", label: "Timeline" },
  { segment: "corrections", label: "Corrections" },
  { segment: "idr", label: "IDR" },
  { segment: "follow-up", label: "Follow-up" },
  { segment: "audit", label: "Audit history" },
];

export default async function InspectionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = (await currentUser())!;
  await requireInspectionAccessOrNotFound(toActor(user), id);

  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      facility: { select: { name: true, licenseNumber: true, city: true } },
      leadInspector: { select: { fullName: true } },
      fieldManager: { select: { fullName: true } },
    },
  });

  if (!inspection) notFound();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/inspections" className="underline-offset-2 hover:underline">
            ← All inspections
          </Link>
        }
        title={inspection.caseNumber}
        description={
          <>
            {INSPECTION_TYPE_LABELS[inspection.type]} · {inspection.facility.name} (licence{" "}
            {inspection.facility.licenseNumber}) · Inspector{" "}
            {inspection.leadInspector?.fullName ?? "unassigned"} · Field Manager{" "}
            {inspection.fieldManager?.fullName ?? "unassigned"}
            <br />
            Started {formatDate(inspection.startedAt)}
            {inspection.lastDataCollectionAt
              ? ` · last data collection ${formatDate(inspection.lastDataCollectionAt)}`
              : ""}
            {inspection.reportServiceMethod
              ? ` · report served by ${SERVICE_METHOD_LABELS[inspection.reportServiceMethod]}`
              : ""}
          </>
        }
        actions={
          <StatusBadge
            label={INSPECTION_STATUS_META[inspection.status].label}
            tone={INSPECTION_STATUS_META[inspection.status].tone}
          />
        }
      />

      <nav aria-label="Inspection sections" className="mb-6 border-b">
        <ul className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <li key={tab.segment}>
              <Link
                href={`/inspections/${id}${tab.segment ? `/${tab.segment}` : ""}`}
                className="inline-block rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </>
  );
}
