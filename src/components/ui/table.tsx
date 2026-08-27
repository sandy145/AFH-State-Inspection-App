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
    <div className={cn("w-full overflow-x-auto rounded-lg border bg-card", className)}>
      <table className="w-full caption-bottom text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b bg-muted/50">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
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
  return <tr className={cn("hover:bg-muted/40", className)} {...props} />;
}

export function Cell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-top", className)} {...props} />;
}

export function RowHeader({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="row" className={cn("px-4 py-3 text-left align-top font-medium", className)} {...props} />;
}
