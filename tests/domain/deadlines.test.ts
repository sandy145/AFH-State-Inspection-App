import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  addWorkingDays,
  computeDeadline,
  describeDeadline,
  isWorkingDay,
} from "@/domain/deadlines";
import type { DeadlineRuleInput } from "@/domain/deadlines";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Thanksgiving 2026 and the day after — a two-day state holiday block that a
// working-day deadline has to skip.
const HOLIDAYS = [utc("2026-11-26"), utc("2026-11-27")];

describe("calendar-day arithmetic", () => {
  it("adds calendar days without regard to weekends", () => {
    // 2026-08-27 is a Thursday; +10 calendar days lands on a Sunday and stays.
    expect(addCalendarDays(utc("2026-08-27"), 10).toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("ignores the time of day on the triggering event", () => {
    const lateEvening = new Date("2026-08-27T23:59:59.000Z");
    expect(addCalendarDays(lateEvening, 1).toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  it("crosses month and year boundaries", () => {
    expect(addCalendarDays(utc("2026-12-28"), 10).toISOString()).toBe("2027-01-07T00:00:00.000Z");
  });
});

describe("working-day arithmetic", () => {
  it("skips weekends", () => {
    // Thursday + 3 working days = Tuesday (Fri, Mon, Tue).
    expect(addWorkingDays(utc("2026-08-27"), 3).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("skips configured holidays", () => {
    // Wed 2026-11-25 + 2 working days, skipping Thu/Fri holidays and the
    // weekend, lands on Tuesday 2026-12-01.
    const result = addWorkingDays(utc("2026-11-25"), 2, { holidays: HOLIDAYS });
    expect(result.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("treats a holiday as a non-working day", () => {
    expect(isWorkingDay(utc("2026-11-26"), { holidays: HOLIDAYS })).toBe(false);
    expect(isWorkingDay(utc("2026-11-25"), { holidays: HOLIDAYS })).toBe(true);
    expect(isWorkingDay(utc("2026-08-29"))).toBe(false); // Saturday
  });

  it("returns the starting day for a zero offset", () => {
    expect(addWorkingDays(utc("2026-08-29"), 0).toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });
});

describe("computeDeadline", () => {
  const attestationRule: DeadlineRuleInput = {
    key: "ATTESTATION_OF_CORRECTION_DUE",
    label: "Attestation of Correction due",
    trigger: "INSPECTION_REPORT_RECEIVED",
    offset: 45,
    unit: "CALENDAR_DAYS",
    authority: "WAC 388-76-10930",
  };

  const idrRule: DeadlineRuleInput = {
    key: "IDR_REQUEST_DUE",
    label: "IDR request due",
    trigger: "CITATION_RECEIVED",
    offset: 10,
    unit: "WORKING_DAYS",
    authority: "WAC 388-76-10990",
  };

  it("applies a calendar-day rule from its trigger date", () => {
    const result = computeDeadline(attestationRule, utc("2026-08-27"));
    expect(result.dueAt.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(result.computedFromEvent).toBe("INSPECTION_REPORT_RECEIVED");
    expect(result.authority).toBe("WAC 388-76-10930");
  });

  it("applies a working-day rule, skipping weekends and holidays", () => {
    const result = computeDeadline(idrRule, utc("2026-11-20"), { holidays: HOLIDAYS });
    // Fri 11/20 + 10 working days: Mon 11/23 … Wed 11/25 are days 1-3, the
    // Thu/Fri holiday block is skipped, and day 10 lands on Tue 12/08.
    expect(result.dueAt.toISOString()).toBe("2026-12-08T00:00:00.000Z");
  });

  it("carries the rule key so a deadline can be traced back to its configuration", () => {
    expect(computeDeadline(attestationRule, utc("2026-01-01")).ruleKey).toBe(
      "ATTESTATION_OF_CORRECTION_DUE",
    );
  });
});

describe("describeDeadline", () => {
  const now = utc("2026-08-27");

  it("reports remaining days in words, not colour", () => {
    expect(describeDeadline(utc("2026-08-31"), now)).toMatchObject({
      urgency: "upcoming",
      daysRemaining: 4,
      text: "4 days remaining",
    });
  });

  it("flags the due date itself", () => {
    expect(describeDeadline(utc("2026-08-27"), now)).toMatchObject({
      urgency: "due-today",
      text: "Due today",
    });
  });

  it("reports how far overdue an item is", () => {
    expect(describeDeadline(utc("2026-08-25"), now)).toMatchObject({
      urgency: "overdue",
      daysRemaining: -2,
      text: "Overdue by 2 days",
    });
  });

  it("uses the singular for one day", () => {
    expect(describeDeadline(utc("2026-08-28"), now).text).toBe("1 day remaining");
    expect(describeDeadline(utc("2026-08-26"), now).text).toBe("Overdue by 1 day");
  });

  it("marks a satisfied deadline as met regardless of date", () => {
    expect(describeDeadline(utc("2026-08-01"), now, { satisfiedAt: utc("2026-07-30") })).toMatchObject({
      urgency: "met",
      text: "Met",
    });
  });

  it("treats a configurable window as due soon", () => {
    expect(describeDeadline(utc("2026-08-29"), now, { dueSoonDays: 3 }).urgency).toBe("due-soon");
    expect(describeDeadline(utc("2026-08-29"), now, { dueSoonDays: 1 }).urgency).toBe("upcoming");
  });
});
