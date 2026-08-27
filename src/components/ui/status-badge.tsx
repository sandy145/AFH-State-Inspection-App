import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileWarning,
  Info,
  OctagonAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/domain/status";

/**
 * Status is communicated three ways at once: an icon, a text label, and colour.
 * Colour is never the only channel (WCAG 2.1 AA, 1.4.1), which also means these
 * badges stay readable in greyscale and when printed.
 */
const TONE_STYLES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-primary/10 text-primary border-primary/25",
  attention: "bg-amber-50 text-amber-900 border-amber-300",
  warning: "bg-orange-50 text-orange-900 border-orange-300",
  critical: "bg-red-50 text-red-900 border-red-300",
  success: "bg-emerald-50 text-emerald-900 border-emerald-300",
};

const TONE_ICONS: Record<Tone, React.ComponentType<{ className?: string }>> = {
  neutral: CircleDashed,
  info: Info,
  attention: Clock,
  warning: FileWarning,
  critical: OctagonAlert,
  success: CheckCircle2,
};

export function StatusBadge({
  label,
  tone = "neutral",
  className,
  title,
}: {
  label: string;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        TONE_STYLES[tone],
        className,
      )}
      title={title}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "critical" || tone === "warning" ? AlertTriangle : TONE_ICONS[tone];
  return (
    <div
      // Assertive rather than polite: these carry blocking conditions a reviewer
      // has to act on, such as unreviewed evidence on a citation.
      role={tone === "critical" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border p-4 text-sm", TONE_STYLES[tone], className)}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
