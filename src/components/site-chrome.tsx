import Link from "next/link";

/**
 * The bands, breadcrumb and footer shared by every page, signed in or not.
 *
 * Modelled on the Washington State DSHS / ALTSA pages: a navy agency band above
 * an ochre administration band, a breadcrumb strip whose current item is a
 * filled pill, and a charcoal footer of link columns.
 *
 * The banner carries this application's own name, never the department's. The
 * visual language is borrowed; the identity is not.
 */
export interface Crumb {
  label: string;
  href?: string;
}

export function SiteBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-banner">
      <div className="mx-auto flex max-w-[1400px] items-stretch justify-between gap-4">
        <Link href="/" className="flex items-stretch focus-visible:ring-offset-banner">
          <span
            className="flex w-14 shrink-0 items-center justify-center bg-banner-mark text-[0.7rem] font-bold text-white"
            aria-hidden="true"
          >
            AFH
          </span>
          <span className="flex items-center px-4 py-3 text-[1.05rem] font-semibold text-banner-foreground">
            Adult Family Home Compliance Portal
          </span>
        </Link>

        {children ? <div className="flex items-center gap-4 px-4">{children}</div> : null}
      </div>
    </div>
  );
}

export function AdministrationBand({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-administration">
      <div className="mx-auto max-w-[1400px] px-4">
        <div className="py-2.5 text-[0.95rem] font-medium text-administration-foreground">
          Residential Care Services — Adult Family Home Inspections
        </div>
        {children}
      </div>
    </div>
  );
}

export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="border-b border-border">
      <ol className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
              {last ? (
                <span
                  aria-current="page"
                  className="bg-administration px-2 py-0.5 font-medium text-administration-foreground"
                >
                  {crumb.label}
                </span>
              ) : (
                <>
                  {crumb.href ? (
                    <Link href={crumb.href}>{crumb.label}</Link>
                  ) : (
                    <span className="text-muted-foreground">{crumb.label}</span>
                  )}
                  <span aria-hidden="true" className="text-muted-foreground">
                    &gt;
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const FOOTER_COLUMNS = [
  [
    { label: "About this prototype", href: "/about" },
    { label: "Accessibility", href: "/about#accessibility" },
  ],
  [
    { label: "Notice of Privacy Practices", href: "/about#privacy" },
    { label: "Security Notice", href: "/about#security" },
  ],
  [
    { label: "Nondiscrimination Policy", href: "/about#nondiscrimination" },
    { label: "Regulatory references", href: "/about#regulations" },
  ],
];

export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className="mt-10 bg-footer text-footer-foreground">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <div className={compact ? "" : "grid gap-6 md:grid-cols-4"}>
          <div>
            <p className="text-sm font-semibold">AFH Compliance Portal</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-white/80">
              An unofficial prototype. Not affiliated with, operated by, or endorsed by the
              Washington State Department of Social and Health Services. All data shown is fictional.
            </p>
          </div>

          {compact
            ? null
            : FOOTER_COLUMNS.map((column, index) => (
                <ul key={index} className="space-y-2 text-sm">
                  {column.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-white hover:underline">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}
        </div>

        <p className="mt-6 border-t border-white/20 pt-4 text-xs leading-relaxed text-white/70">
          Not an authoritative licensing record, and not a substitute for any legally required method
          of service. Regulatory decisions are made by authorized staff, never by this software.
        </p>
      </div>
    </footer>
  );
}
