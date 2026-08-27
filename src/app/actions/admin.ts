"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser, toActor } from "@/lib/session";
import { canAdminister } from "@/domain/authz";
import { checkPasswordStrength, hashPassword } from "@/services/identity";
import { DomainError } from "@/domain/types";
import * as audit from "@/data/audit";
import type { ActionState } from "@/app/actions/evidence";

/**
 * Administration (§4, §33).
 *
 * Two rules run through every action here:
 *   - only an RCS_ADMIN may call them, re-checked on each request; and
 *   - a change to a deadline rule or a policy toggle writes an audit row
 *     carrying the previous and the new value. A regulatory deadline must never
 *     change silently.
 */
function messageFor(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  console.error("[admin action] unexpected failure", error);
  return "Something went wrong. Nothing was saved.";
}

async function requireAdmin() {
  const user = await currentUser();
  if (!user || !canAdminister(toActor(user))) return null;
  return user;
}

export async function updateDeadlineRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an RCS administrator can change deadline configuration." };

  const schema = z.object({
    ruleId: z.string().uuid(),
    offset: z.coerce.number().int().min(0, "Offset cannot be negative.").max(365, "Offset looks too large."),
    unit: z.enum(["CALENDAR_DAYS", "WORKING_DAYS"]),
    authority: z.string().optional(),
    reason: z.string().min(5, "Record why this deadline is changing."),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    const before = await prisma.deadlineRule.findUniqueOrThrow({ where: { id: parsed.data.ruleId } });

    await prisma.$transaction(async (tx) => {
      await tx.deadlineRule.update({
        where: { id: parsed.data.ruleId },
        data: {
          offset: parsed.data.offset,
          unit: parsed.data.unit,
          authority: parsed.data.authority?.trim() || null,
        },
      });

      await audit.record(
        user,
        {
          action: "DEADLINE_RULE_MODIFIED",
          entityType: "DeadlineRule",
          entityId: before.id,
          previousValue: `${before.offset} ${before.unit}`,
          newValue: `${parsed.data.offset} ${parsed.data.unit}`,
          reason: parsed.data.reason,
        },
        tx,
      );
    });

    revalidatePath("/admin/deadlines");
    return {
      success:
        `${before.label} updated. Existing deadlines already computed are unchanged; ` +
        "the new value applies to deadlines computed from now on.",
    };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function updateConfigurationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an RCS administrator can change configuration." };

  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "");

  try {
    const before = await prisma.systemConfiguration.findUniqueOrThrow({ where: { key } });

    await prisma.$transaction(async (tx) => {
      await tx.systemConfiguration.update({
        where: { key },
        data: { value, updatedById: user.id },
      });

      await audit.record(
        user,
        {
          action: "CONFIGURATION_CHANGED",
          entityType: "SystemConfiguration",
          entityId: before.id,
          previousValue: `${key}=${before.value}`,
          newValue: `${key}=${value}`,
        },
        tx,
      );
    });

    revalidatePath("/admin");
    return { success: `${before.label} updated.` };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an RCS administrator can manage users." };

  const schema = z.object({
    email: z.string().email("Enter a valid email address."),
    fullName: z.string().min(2, "Enter the person's name."),
    role: z.enum(["PROVIDER", "INSPECTOR", "FIELD_MANAGER", "RCS_ADMIN", "IDR_MANAGER"]),
    title: z.string().optional(),
    regionId: z.string().optional(),
    facilityId: z.string().optional(),
    password: z.string(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const strength = checkPasswordStrength(parsed.data.password);
  if (!strength.ok) return { error: `Password is too weak. ${strength.problems.join(" ")}` };

  // A provider account with no facility link can see nothing, which is a
  // confusing account to hand someone.
  if (parsed.data.role === "PROVIDER" && !parsed.data.facilityId) {
    return { error: "A provider account must be linked to an adult family home." };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          email: parsed.data.email.trim().toLowerCase(),
          fullName: parsed.data.fullName.trim(),
          role: parsed.data.role,
          title: parsed.data.title?.trim() || null,
          regionId: parsed.data.regionId || null,
          passwordHash: await hashPassword(parsed.data.password),
        },
      });

      if (parsed.data.facilityId) {
        await tx.facilityUser.create({
          data: { facilityId: parsed.data.facilityId, userId: account.id },
        });
      }

      await audit.record(
        user,
        {
          action: "USER_CREATED",
          entityType: "User",
          entityId: account.id,
          newValue: `${account.email} (${account.role})`,
        },
        tx,
      );

      return account;
    });

    revalidatePath("/admin/users");
    return { success: `Account created for ${created.email}.` };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "An account with that email address already exists." };
    }
    return { error: messageFor(error) };
  }
}

export async function setUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an RCS administrator can manage users." };

  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";

  if (userId === user.id && !active) {
    return { error: "You cannot deactivate your own account." };
  }

  try {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: active, deactivatedAt: active ? null : new Date() },
      });

      // Deactivating has to end live sessions, or the account keeps working
      // until its cookie expires.
      if (!active) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await audit.record(
        user,
        {
          action: "USER_MODIFIED",
          entityType: "User",
          entityId: userId,
          previousValue: before.isActive ? "active" : "inactive",
          newValue: active ? "active" : "inactive",
        },
        tx,
      );
    });

    revalidatePath("/admin/users");
    return { success: `${before.fullName} is now ${active ? "active" : "deactivated"}.` };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function upsertRegulationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an RCS administrator can manage reference data." };

  const schema = z.object({
    citation: z.string().min(3, "Enter the citation, e.g. 388-76-10506."),
    source: z.enum(["WAC", "RCW", "POLICY"]),
    title: z.string().min(3, "Enter the title."),
    summary: z.string().optional(),
    inspectorGuidance: z.string().optional(),
    url: z.string().url("Enter a valid URL.").optional().or(z.literal("")),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  try {
    const regulation = await prisma.regulation.upsert({
      where: { citation: parsed.data.citation.trim() },
      create: {
        citation: parsed.data.citation.trim(),
        source: parsed.data.source,
        title: parsed.data.title.trim(),
        summary: parsed.data.summary?.trim() || null,
        inspectorGuidance: parsed.data.inspectorGuidance?.trim() || null,
        url: parsed.data.url || null,
      },
      update: {
        source: parsed.data.source,
        title: parsed.data.title.trim(),
        summary: parsed.data.summary?.trim() || null,
        inspectorGuidance: parsed.data.inspectorGuidance?.trim() || null,
        url: parsed.data.url || null,
      },
    });

    await audit.record(user, {
      action: "CONFIGURATION_CHANGED",
      entityType: "Regulation",
      entityId: regulation.id,
      newValue: `${regulation.source} ${regulation.citation}`,
    });

    revalidatePath("/admin/regulations");
    return { success: `${regulation.source} ${regulation.citation} saved.` };
  } catch (error) {
    return { error: messageFor(error) };
  }
}
