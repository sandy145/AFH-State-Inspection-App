import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { formatDateTime } from "@/domain/deadlines";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { canViewInternalNotes } from "@/domain/authz";

export const metadata = { title: "Audit history" };

/**
 * Audit history for one case (§21).
 *
 * Read-only, and there is no code path anywhere in the application that edits or
 * deletes an audit row. Providers see the history of their own case; IP
 * addresses are staff-only, since they identify individuals.
 */
export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  await requireInspectionAccessOrNotFound(toActor(user), id);

  const inspection = await prisma.inspection.findUniqueOrThrow({
    where: { id },
    select: { caseNumber: true },
  });

  const events = await prisma.auditEvent.findMany({
    where: { caseNumber: inspection.caseNumber },
    orderBy: { occurredAt: "desc" },
    take: 500,
  });

  const showIp = canViewInternalNotes(toActor(user));

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Every recorded action on {inspection.caseNumber}, newest first. Audit records cannot be edited
        or deleted.
      </p>

      <DataTable
        caption={`Audit history for ${inspection.caseNumber}`}
        headers={
          showIp
            ? ["When", "Actor", "Action", "Record", "Previous", "New", "Reason", "IP"]
            : ["When", "Actor", "Action", "Record", "Previous", "New", "Reason"]
        }
        empty="No audit events recorded."
      >
        {events.map((event) => (
          <Row key={event.id}>
            <Cell className="whitespace-nowrap text-xs">{formatDateTime(event.occurredAt)}</Cell>
            <Cell className="text-sm">
              {event.actorEmail ?? "system"}
              {event.actorRole ? (
                <p className="text-xs text-muted-foreground">{event.actorRole.replace(/_/g, " ").toLowerCase()}</p>
              ) : null}
            </Cell>
            <Cell className="text-sm font-medium">{event.action.replace(/_/g, " ").toLowerCase()}</Cell>
            <Cell className="text-xs text-muted-foreground">{event.entityType}</Cell>
            <Cell className="max-w-[14rem] text-xs">{event.previousValue ?? "—"}</Cell>
            <Cell className="max-w-[14rem] text-xs">{event.newValue ?? "—"}</Cell>
            <Cell className="max-w-[18rem] text-xs">{event.reason ?? "—"}</Cell>
            {showIp ? <Cell className="text-xs text-muted-foreground">{event.ipAddress ?? "—"}</Cell> : null}
          </Row>
        ))}
      </DataTable>
    </>
  );
}
