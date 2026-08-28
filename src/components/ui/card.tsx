import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A grouped panel.
 *
 * The reference pages group related controls in a real `fieldset` with its
 * legend sitting on the top rule. Card keeps that look — square, thin grey
 * border, label on the edge — while staying a plain container, so it can hold
 * content that is not a form without misusing fieldset semantics.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("border border-border bg-card", className)} {...props} />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1 border-b border-border bg-muted px-4 py-2.5", className)}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-sm font-semibold leading-tight text-foreground", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("px-4 py-4", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center border-t border-border px-4 py-3", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

/**
 * The reference's search box: a real fieldset with its legend on the rule. Use
 * this for groups of form controls, where the semantics are earned.
 */
export function FieldGroup({
  legend,
  children,
  className,
}: {
  legend: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("border border-border px-4 pb-4 pt-2", className)}>
      <legend className="px-2 text-sm font-semibold text-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
