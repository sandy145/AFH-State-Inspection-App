"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import type { ActionState } from "@/app/actions/evidence";

/** Marks the signed-in user's notifications read. Scoped to them by construction. */
export async function markAllNotificationsReadAction(): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has expired. Sign in again." };

  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  return { success: `${count} notification${count === 1 ? "" : "s"} marked as read.` };
}
