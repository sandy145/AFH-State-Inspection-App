import "server-only";
import type { NotificationEvent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { mailTransport } from "@/services/mail";

/**
 * NotificationService (§23, §11).
 *
 * Two channels, one rule: the in-app notification carries the detail, the email
 * carries a subject and a link. Documents and resident information never leave
 * the portal by email.
 *
 * Emails are dispatched after the transaction commits, so a mail failure can
 * never roll back a case record — the in-app notification is the source of truth
 * and the mail is best effort.
 */
export interface NotifyInput {
  userIds: string[];
  event: NotificationEvent;
  subject: string;
  body: string;
  linkPath?: string;
  inspectionId?: string;
}

type Client = Prisma.TransactionClient | typeof prisma;

/** Queues in-app notifications inside the caller's transaction. */
export async function queueNotifications(client: Client, input: NotifyInput): Promise<void> {
  if (input.userIds.length === 0) return;

  await client.notification.createMany({
    data: input.userIds.map((userId) => ({
      userId,
      event: input.event,
      channel: "IN_APP" as const,
      subject: input.subject,
      body: input.body,
      linkPath: input.linkPath ?? null,
      inspectionId: input.inspectionId ?? null,
    })),
  });
}

/**
 * Sends the email companion. Call after commit. Failures are logged and
 * swallowed: a notification that did not send must not undo a submission.
 */
export async function dispatchEmails(input: NotifyInput): Promise<void> {
  if (input.userIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: input.userIds }, isActive: true },
    select: { id: true, email: true },
  });

  const link = input.linkPath ? `${env.appUrl}${input.linkPath}` : undefined;
  const transport = mailTransport();

  await Promise.all(
    users.map(async (user) => {
      try {
        await transport.send({ to: user.email, subject: input.subject, text: input.subject, link });
        await prisma.notification.updateMany({
          where: { userId: user.id, event: input.event, sentAt: null },
          data: { sentAt: new Date() },
        });
      } catch (error) {
        console.error(`[notifications] email dispatch failed for user ${user.id}`, error);
      }
    }),
  );
}

/** Provider contacts for a facility — the people an evidence request goes to. */
export async function providerRecipients(facilityId: string): Promise<string[]> {
  const links = await prisma.facilityUser.findMany({
    where: { facilityId, user: { isActive: true, role: "PROVIDER" } },
    select: { userId: true },
  });
  return links.map((link) => link.userId);
}

/** Staff on a case — the people a provider response goes to. */
export async function staffRecipients(inspectionId: string): Promise<string[]> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      leadInspectorId: true,
      fieldManagerId: true,
      assignments: { where: { unassignedAt: null }, select: { userId: true } },
    },
  });
  if (!inspection) return [];

  const ids = new Set<string>();
  if (inspection.leadInspectorId) ids.add(inspection.leadInspectorId);
  if (inspection.fieldManagerId) ids.add(inspection.fieldManagerId);
  inspection.assignments.forEach((a) => ids.add(a.userId));
  return [...ids];
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
