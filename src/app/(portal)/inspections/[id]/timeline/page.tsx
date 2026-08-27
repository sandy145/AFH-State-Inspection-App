import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { formatDateTime } from "@/domain/deadlines";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Timeline" };

/**
 * Case timeline (§20).
 *
 * Generated entirely from system events — nothing here is typed by hand — so it
 * is a faithful account of what happened and when, readable by a provider and by
 * a Field Manager reconstructing a case.
 */
export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  await requireInspectionAccessOrNotFound(toActor(user), id);

  const events = await prisma.timelineEvent.findMany({
    where: { inspectionId: id },
    include: { actor: { select: { fullName: true } }, finding: { select: { reference: true } } },
    orderBy: { occurredAt: "asc" },
  });

  if (events.length === 0) {
    return <EmptyState title="No events recorded yet." />;
  }

  return (
    <ol className="relative space-y-0 border-l pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative pb-6 last:pb-0">
          <span
            className="absolute -left-[1.6875rem] top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary"
            aria-hidden="true"
          />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {formatDateTime(event.occurredAt)}
          </p>
          <p className="mt-0.5 text-sm">
            {event.description}
            {event.finding ? (
              <span className="text-muted-foreground"> · Finding {event.finding.reference}</span>
            ) : null}
          </p>
          {event.actor ? <p className="text-xs text-muted-foreground">{event.actor.fullName}</p> : null}
        </li>
      ))}
    </ol>
  );
}
