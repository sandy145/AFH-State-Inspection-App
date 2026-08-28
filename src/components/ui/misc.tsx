import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        {eyebrow ? <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</div> : null}
        {/* Blue and unbolded, as on the reference pages. */}
        <h1 className="text-[1.75rem] font-normal leading-tight text-primary">{title}</h1>
        {description ? <div className="max-w-3xl text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** A labelled fact. Definition lists keep label/value pairs associated. */
export function DescriptionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "attention" | "critical";
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "border border-border bg-card p-3 transition-colors",
        href ? "hover:border-primary hover:bg-accent" : "",
        tone === "attention" ? "border-administration bg-administration/10" : "",
        tone === "critical" ? "border-destructive bg-destructive/5" : "",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );

  return href ? (
    <a href={href} className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </a>
  ) : (
    body
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border border-dashed border-border bg-muted px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function SectionHeading({ children, description }: { children: React.ReactNode; description?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
