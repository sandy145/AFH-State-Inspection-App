import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Form primitives.
 *
 * Every control here is label-associated and describes its own error through
 * `aria-describedby`, because an error a screen reader cannot reach is not an
 * error message (WCAG 2.1 AA, 3.3.1).
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-sm border border-input bg-background px-2.5 py-1.5 text-sm",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-sm border border-input bg-background px-2.5 py-1.5 text-sm",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-sm border border-input bg-background px-2.5 py-1.5 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("block text-sm font-medium text-foreground", className)} {...props}>
      {children}
      {required ? (
        <span className="ml-1 text-destructive" aria-hidden="true">
          *
        </span>
      ) : null}
      {required ? <span className="sr-only"> (required)</span> : null}
    </label>
  );
}

export function FieldHint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint ? <FieldHint id={`${htmlFor}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}

export { Input, Textarea, Select };
