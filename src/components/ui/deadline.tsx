import { CalendarClock } from "lucide-react";
import { describeDeadline, formatDate } from "@/domain/deadlines";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/domain/status";

const URGENCY_TONE: Record<string, Tone> = {
  met: "success",
  overdue: "critical",
  "due-today": "warning",
  "due-soon": "attention",
  upcoming: "neutral",
};

/**
 * A deadline always renders its date and how long is left, in words. "Overdue by
 * 2 days" has to survive being read aloud or printed in black and white.
 */
export function DeadlineChip({
  dueAt,
  satisfiedAt,
  dueSoonDays = 3,
  label,
}: {
  dueAt: Date;
  satisfiedAt?: Date | null;
  dueSoonDays?: number;
  label?: string;
}) {
  const description = describeDeadline(dueAt, new Date(), { satisfiedAt, dueSoonDays });

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm">
        <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span>
          {label ? `${label}: ` : "Due "}
          {formatDate(dueAt)}
        </span>
      </span>
      <StatusBadge label={description.text} tone={URGENCY_TONE[description.urgency] ?? "neutral"} />
    </span>
  );
}
