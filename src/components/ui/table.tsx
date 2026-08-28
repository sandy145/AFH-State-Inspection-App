import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Real table semantics with scoped headers and a caption, so screen-reader
 * users get row and column context instead of a wall of cells (WCAG 1.3.1).
 * Wide tables scroll inside their own container rather than the page.
 */
export function DataTable({
  caption,
  headers,
  children,
  className,
  empty,
}: {
  caption: string;
  headers: readonly string[];
  children: React.ReactNode;
  className?: string;
  empty?: React.ReactNode;
}) {
  const hasRows = React.Children.count(children) > 0;

  return (
    <div className={cn("w-full overflow-x-auto border border-border bg-card", className)}>
      <table className="w-full caption-bottom text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-secondary">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="whitespace-nowrap border-r border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-secondary-foreground last:border-r-0"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {hasRows ? (
            children
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-muted-foreground">
                {empty ?? "Nothing to show."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Row({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("even:bg-muted/60 hover:bg-accent", className)} {...props} />;
}

export function Cell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-top", className)} {...props} />;
}

export function RowHeader({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="row" className={cn("px-3 py-2 text-left align-top font-medium", className)} {...props} />;
}
