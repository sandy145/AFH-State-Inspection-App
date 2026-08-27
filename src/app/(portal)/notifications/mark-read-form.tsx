"use client";

import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { ActionForm } from "@/components/forms";

export function MarkAllReadForm() {
  return (
    <ActionForm
      action={markAllNotificationsReadAction}
      submitLabel="Mark all as read"
      variant="outline"
      className="space-y-0"
    >
      <span className="sr-only">Marks every notification in this list as read.</span>
    </ActionForm>
  );
}
