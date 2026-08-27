import "server-only";
import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { computeDeadline } from "@/domain/deadlines";
import type { DeadlineRuleInput } from "@/domain/deadlines";
import type { DeadlineTrigger } from "@/domain/types";

/**
 * Configuration access (§33).
 *
 * Deadline lengths, the holiday calendar and policy toggles are rows, not
 * constants. Nothing in the application may hard-code a regulatory interval;
 * it asks for a rule by key and applies whatever RCS has configured.
 */

export const CONFIG_KEYS = {
  overrideRequiresFieldManagerApproval: "override.requires_field_manager_approval",
  evidenceDueSoonDays: "deadline.due_soon_days",
  evidenceReviewTargetDays: "review.target_days",
} as const;

export const DEADLINE_RULE_KEYS = {
  evidenceRequestDue: "EVIDENCE_REQUEST_DUE",
  attestationDue: "ATTESTATION_OF_CORRECTION_DUE",
  idrRequestDue: "IDR_REQUEST_DUE",
  followUpDue: "FOLLOW_UP_DUE",
} as const;

export const getConfiguration = cache(async (): Promise<Map<string, string>> => {
  const rows = await prisma.systemConfiguration.findMany();
  return new Map(rows.map((row) => [row.key, row.value]));
});

export async function configBool(key: string, fallback: boolean): Promise<boolean> {
  const value = (await getConfiguration()).get(key);
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

export async function configInt(key: string, fallback: number): Promise<number> {
  const value = (await getConfiguration()).get(key);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const getHolidays = cache(async (): Promise<Date[]> => {
  const rows = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  return rows.map((row) => row.date);
});

export async function getDeadlineRule(key: string): Promise<DeadlineRuleInput | null> {
  const rule = await prisma.deadlineRule.findUnique({ where: { key } });
  if (!rule || !rule.isActive) return null;

  return {
    key: rule.key,
    label: rule.label,
    trigger: rule.trigger,
    offset: rule.offset,
    unit: rule.unit,
    authority: rule.authority,
  };
}

export interface MaterializeDeadlineInput {
  ruleKey: string;
  triggeredAt: Date;
  inspectionId?: string;
  findingId?: string;
  evidenceRequestId?: string;
  citationId?: string;
  idrRequestId?: string;
}

/**
 * Computes a deadline from its configured rule and writes it. Returns null when
 * the rule is absent or inactive — a missing rule must not silently become a
 * hard-coded default.
 */
export async function materializeDeadline(
  client: Prisma.TransactionClient,
  input: MaterializeDeadlineInput,
): Promise<Date | null> {
  const rule = await getDeadlineRule(input.ruleKey);
  if (!rule) return null;

  const holidays = await getHolidays();
  const computed = computeDeadline(rule, input.triggeredAt, { holidays });
  const ruleRow = await prisma.deadlineRule.findUnique({ where: { key: input.ruleKey } });

  await client.deadline.create({
    data: {
      ruleId: ruleRow?.id ?? null,
      ruleKey: computed.ruleKey,
      label: computed.label,
      dueAt: computed.dueAt,
      computedFrom: computed.computedFrom,
      computedFromEvent: computed.computedFromEvent as DeadlineTrigger,
      inspectionId: input.inspectionId ?? null,
      findingId: input.findingId ?? null,
      evidenceRequestId: input.evidenceRequestId ?? null,
      citationId: input.citationId ?? null,
      idrRequestId: input.idrRequestId ?? null,
    },
  });

  return computed.dueAt;
}
