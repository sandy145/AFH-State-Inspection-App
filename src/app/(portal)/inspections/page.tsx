import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { inspectionList } from "@/data/queries";
import { formatDate } from "@/domain/deadlines";
import { INSPECTION_STATUS_META, INSPECTION_TYPE_LABELS } from "@/domain/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Inspections" };

const STATUSES = [
  "ALL",
  "IN_PROGRESS",
  "EVIDENCE_REVIEW",
  "PENDING_REPORT",
  "REPORT_ISSUED",
  "CORRECTION_PERIOD",
  "FOLLOW_UP",
  "CLOSED",
] as const;

/**
 * Inspection list with filters (§32, §35).
 *
 * Search runs through the same scoped query as everything else, so a search can
 * never surface a case the signed-in user may not open.
 */
export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "ALL", q = "" } = await searchParams;
  const user = (await currentUser())!;
  const inspections = await inspectionList(toActor(user), { status, q });

  return (
    <>
      <PageHeader
        title="Inspections"
        description="Cases you are assigned to or that fall within your region."
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Case number, home name, or licence number"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <Select id="status" name="status" defaultValue={status} className="w-56">
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All statuses" : INSPECTION_STATUS_META[value].label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {inspections.length} {inspections.length === 1 ? "inspection" : "inspections"} shown.
      </p>

      <DataTable
        caption="Inspection cases"
        headers={["Case", "Adult family home", "Type", "Inspector", "Field Manager", "Findings", "Status", "Started"]}
        empty="No inspections match this view."
      >
        {inspections.map((inspection) => (
          <Row key={inspection.id}>
            <Cell className="whitespace-nowrap">
              <Link href={`/inspections/${inspection.id}`} className="font-medium underline-offset-2 hover:underline">
                {inspection.caseNumber}
              </Link>
            </Cell>
            <Cell>
              {inspection.facility.name}
              <p className="text-xs text-muted-foreground">
                Licence {inspection.facility.licenseNumber} · {inspection.facility.city}
              </p>
            </Cell>
            <Cell className="text-sm">{INSPECTION_TYPE_LABELS[inspection.type]}</Cell>
            <Cell className="text-sm">{inspection.leadInspector?.fullName ?? "—"}</Cell>
            <Cell className="text-sm">{inspection.fieldManager?.fullName ?? "—"}</Cell>
            <Cell className="tabular-nums">{inspection._count.findings}</Cell>
            <Cell>
              <StatusBadge
                label={INSPECTION_STATUS_META[inspection.status].label}
                tone={INSPECTION_STATUS_META[inspection.status].tone}
              />
            </Cell>
            <Cell className="whitespace-nowrap text-sm">{formatDate(inspection.startedAt)}</Cell>
          </Row>
        ))}
      </DataTable>
    </>
  );
}
