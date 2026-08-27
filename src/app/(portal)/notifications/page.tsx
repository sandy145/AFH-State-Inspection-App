import Link from "next/link";
import { currentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/domain/deadlines";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { MarkAllReadForm } from "./mark-read-form";

export const metadata = { title: "Notifications" };

/**
 * In-app notifications (§23).
 *
 * The in-app notice carries the detail; the email that accompanies it carries a
 * subject and a link only. Opening this page marks everything read, which is why
 * the unread count in the header falls after a visit.
 */
export default async function NotificationsPage() {
  const user = (await currentUser())!;

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    include: { inspection: { select: { caseNumber: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Documents and case details are never sent by email — they live here."
        actions={unread > 0 ? <MarkAllReadForm /> : undefined}
      />

      {notifications.length === 0 ? (
        <EmptyState title="No notifications yet." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={
                notification.readAt
                  ? "rounded-lg border bg-card p-4"
                  : "rounded-lg border border-primary/40 bg-primary/5 p-4"
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {notification.linkPath ? (
                      <Link href={notification.linkPath} className="underline-offset-2 hover:underline">
                        {notification.subject}
                      </Link>
                    ) : (
                      notification.subject
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(notification.createdAt)}
                    {notification.inspection ? ` · ${notification.inspection.caseNumber}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge
                    label={notification.event.replace(/_/g, " ").toLowerCase()}
                    tone={notification.readAt ? "neutral" : "info"}
                  />
                  {!notification.readAt ? (
                    <span className="text-xs font-medium text-primary">Unread</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
