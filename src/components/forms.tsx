"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions/evidence";

/**
 * A form bound to a server action, with its result announced in a live region.
 *
 * Every mutating form in the portal uses this so success and failure reach
 * screen-reader users, not just sighted ones (WCAG 2.1 AA, 4.1.3).
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  variant = "default",
  disabled,
  disabledReason,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children: React.ReactNode;
  variant?: "default" | "destructive" | "outline" | "secondary";
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      <div aria-live="polite" className="empty:hidden">
        {state.error ? <Alert tone="critical" title="Not saved">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success" title="Saved">{state.success}</Alert> : null}
      </div>

      {children}

      <div className="space-y-2">
        <Button type="submit" variant={variant} disabled={pending || disabled}>
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </Button>
        {/* The reason is text, not a colour or a tooltip: a disabled control
            with no stated reason is a dead end. */}
        {disabled && disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : null}
      </div>
    </form>
  );
}
