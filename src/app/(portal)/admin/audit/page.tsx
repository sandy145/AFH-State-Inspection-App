import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/domain/deadlines";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Audit log" };

const NOTABLE_ACTIONS = [
  "ALL",
  "ADMINISTRATIVE_OVERRIDE",
  "CITATION_FINALIZATION_BLOCKED",
  "CITATION_FINALIZED",
  "CITATION_RESCINDED",
  "DEADLINE_RULE_MODIFIED",
  "CONFIGURATION_CHANGED",
  "EVIDENCE_DOWNLOADED",
  "USER_SIGN_IN_FAILED",
  "INSPECTION_REASSIGNED",
];

/**
 * System-wide audit log (§21).
 *
 * Append-only, and there is no edit or delete path in the application. The
 * default filter is the set of actions worth looking at first — overrides,
 * blocked finalizations, deadline changes and failed sign-ins.
 */
export default async function AuditAdmin({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; q?: string }>;
}) {

  const { action = "ALL", q = "" } = await searchParams;

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(action !== "ALL" ? { action } : {}),
      ...(q
        ? {
            OR: [
              { caseNumber: { contains: q, mode: "insensitive" as const } },
              { actorEmail: { contains: q, mode: "insensitive" as const } },
              { entityId: q },
            ],
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 300,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every recorded action across the system. Audit records cannot be edited or deleted."
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium">
            Case number, actor email or record id
          </label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="action" className="block text-sm font-medium">
            Action
          </label>
          <Select id="action" name="action" defaultValue={action} className="w-72">
            {NOTABLE_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All actions" : value.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {events.length} {events.length === 1 ? "event" : "events"} shown, newest first (maximum 300).
      </p>

      <DataTable
        caption="System audit log"
        headers={["When", "Actor", "Role", "Action", "Case", "Record", "Previous", "New", "Reason", "IP"]}
        empty="No audit events match this view."
      >
        {events.map((event) => (
          <Row key={event.id}>
            <Cell className="whitespace-nowrap text-xs">{formatDateTime(event.occurredAt)}</Cell>
            <Cell className="text-xs">{event.actorEmail ?? "system"}</Cell>
            <Cell className="text-xs">{event.actorRole ?? "—"}</Cell>
            <Cell className="text-sm font-medium">{event.action.replace(/_/g, " ").toLowerCase()}</Cell>
            <Cell className="whitespace-nowrap text-xs">{event.caseNumber ?? "—"}</Cell>
            <Cell className="text-xs text-muted-foreground">{event.entityType}</Cell>
            <Cell className="max-w-[12rem] text-xs">{event.previousValue ?? "—"}</Cell>
            <Cell className="max-w-[12rem] text-xs">{event.newValue ?? "—"}</Cell>
            <Cell className="max-w-[16rem] text-xs">{event.reason ?? "—"}</Cell>
            <Cell className="text-xs text-muted-foreground">{event.ipAddress ?? "—"}</Cell>
          </Row>
        ))}
      </DataTable>
    </>
  );
}
