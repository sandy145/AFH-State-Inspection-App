/**
 * Deadline engine (§33).
 *
 * Pure date arithmetic over configuration. Nothing here hard-codes a regulatory
 * interval: callers pass a rule loaded from `DeadlineRule`, so RCS can change an
 * offset without a deployment. The engine computes and describes deadlines; it
 * never decides that a deadline was met, and it never silently moves one.
 *
 * All arithmetic is done on UTC-midnight date parts to stay free of DST drift.
 * Display formatting happens in the UI with an explicit Pacific time zone.
 */
import type { DeadlineTrigger, DeadlineUnit } from "./types";

export interface DeadlineRuleInput {
  key: string;
  label: string;
  trigger: DeadlineTrigger;
  offset: number;
  unit: DeadlineUnit;
  authority?: string | null;
}

export interface ComputeDeadlineOptions {
  /** Configured holiday calendar, any Date; only the calendar day is used. */
  holidays?: Date[];
  /** Days treated as non-working. Default Saturday and Sunday. */
  weekendDays?: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WEEKEND = [0, 6];

/** Calendar day key in UTC, e.g. "2026-08-27". */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Strips the time component, returning UTC midnight of the same calendar day. */
export function startOfDay(date: Date): Date {
  return new Date(`${dayKey(date)}T00:00:00.000Z`);
}

export function isWeekend(date: Date, weekendDays: number[] = DEFAULT_WEEKEND): boolean {
  return weekendDays.includes(date.getUTCDay());
}

export function isHoliday(date: Date, holidays: Date[] = []): boolean {
  const key = dayKey(date);
  return holidays.some((h) => dayKey(h) === key);
}

export function isWorkingDay(date: Date, options: ComputeDeadlineOptions = {}): boolean {
  return !isWeekend(date, options.weekendDays ?? DEFAULT_WEEKEND) && !isHoliday(date, options.holidays ?? []);
}

/**
 * Adds calendar days. If the result lands on a weekend or configured holiday the
 * deadline is *not* moved: whether a calendar deadline rolls forward is a policy
 * question, expressed by choosing WORKING_DAYS for the rule instead.
 */
export function addCalendarDays(from: Date, days: number): Date {
  return new Date(startOfDay(from).getTime() + days * DAY_MS);
}

/** Adds working days, skipping weekends and configured holidays. */
export function addWorkingDays(from: Date, days: number, options: ComputeDeadlineOptions = {}): Date {
  let cursor = startOfDay(from);
  if (days === 0) return cursor;

  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);

  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + step * DAY_MS);
    if (isWorkingDay(cursor, options)) remaining -= 1;
  }
  return cursor;
}

export interface ComputedDeadline {
  ruleKey: string;
  label: string;
  dueAt: Date;
  computedFrom: Date;
  computedFromEvent: DeadlineTrigger;
  authority: string | null;
}

/** Applies a configured rule to the date of its triggering event. */
export function computeDeadline(
  rule: DeadlineRuleInput,
  triggeredAt: Date,
  options: ComputeDeadlineOptions = {},
): ComputedDeadline {
  const dueAt =
    rule.unit === "WORKING_DAYS"
      ? addWorkingDays(triggeredAt, rule.offset, options)
      : addCalendarDays(triggeredAt, rule.offset);

  return {
    ruleKey: rule.key,
    label: rule.label,
    dueAt,
    computedFrom: triggeredAt,
    computedFromEvent: rule.trigger,
    authority: rule.authority ?? null,
  };
}

export type DeadlineUrgency = "met" | "overdue" | "due-today" | "due-soon" | "upcoming";

export interface DeadlineDescription {
  urgency: DeadlineUrgency;
  /** Whole days remaining; negative when overdue, 0 on the due date. */
  daysRemaining: number;
  /** Screen-reader-safe sentence, e.g. "Overdue by 2 days". Never colour alone. */
  text: string;
}

/**
 * Describes a deadline relative to `now`. "Due soon" is a display threshold, not
 * a regulatory concept, so it is a parameter rather than a constant.
 */
export function describeDeadline(
  dueAt: Date,
  now: Date = new Date(),
  options: { satisfiedAt?: Date | null; dueSoonDays?: number } = {},
): DeadlineDescription {
  const dueSoonDays = options.dueSoonDays ?? 3;

  if (options.satisfiedAt) {
    return { urgency: "met", daysRemaining: 0, text: "Met" };
  }

  const daysRemaining = Math.round((startOfDay(dueAt).getTime() - startOfDay(now).getTime()) / DAY_MS);

  if (daysRemaining < 0) {
    const overdueBy = Math.abs(daysRemaining);
    return {
      urgency: "overdue",
      daysRemaining,
      text: `Overdue by ${overdueBy} ${overdueBy === 1 ? "day" : "days"}`,
    };
  }
  if (daysRemaining === 0) {
    return { urgency: "due-today", daysRemaining, text: "Due today" };
  }
  return {
    urgency: daysRemaining <= dueSoonDays ? "due-soon" : "upcoming",
    daysRemaining,
    text: `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} remaining`,
  };
}

const PACIFIC = "America/Los_Angeles";

/** Human date in Pacific time — the time zone the state operates in. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: PACIFIC,
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: PACIFIC,
    timeZoneName: "short",
  }).format(date);
}
