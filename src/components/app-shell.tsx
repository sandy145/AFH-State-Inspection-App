import Link from "next/link";
import { Bell } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/domain/authz";
import { unreadNotificationCount } from "@/data/notifications";
import { AdministrationBand, Breadcrumb, SiteBanner, SiteFooter, type Crumb } from "@/components/site-chrome";
import type { SessionUser } from "@/lib/session";

/**
 * Application chrome, modelled on the Washington State DSHS / ALTSA pages: a
 * navy agency band, an ochre administration band beneath it, a breadcrumb strip
 * whose current item is a filled pill, and a charcoal footer of link columns.
 *
 * The banner deliberately carries this application's own name rather than the
 * department's. The visual language is borrowed; the identity is not. This is a
 * prototype on a public URL asking people for credentials, and a banner reading
 * as the agency itself would be a different thing altogether.
 */
interface NavItem {
  href: string;
  label: string;
}

const NAV_BY_ROLE: Record<SessionUser["role"], NavItem[]> = {
  PROVIDER: [
    { href: "/provider", label: "Home" },
    { href: "/provider/requests", label: "Evidence Requests" },
    { href: "/provider/findings", label: "Findings" },
    { href: "/provider/corrections", label: "Corrections" },
    { href: "/provider/documents", label: "Documents" },
  ],
  INSPECTOR: [
    { href: "/inspector", label: "Home" },
    { href: "/inspector/review", label: "Evidence Review" },
    { href: "/inspections", label: "Inspections" },
    { href: "/search", label: "Search" },
  ],
  FIELD_MANAGER: [
    { href: "/manager", label: "Home" },
    { href: "/manager/reports", label: "Reports" },
    { href: "/inspector/review", label: "Evidence Review" },
    { href: "/inspections", label: "Inspections" },
    { href: "/search", label: "Search" },
  ],
  RCS_ADMIN: [
    { href: "/admin", label: "Home" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/facilities", label: "Facilities" },
    { href: "/admin/regulations", label: "Regulations" },
    { href: "/admin/deadlines", label: "Deadlines" },
    { href: "/admin/audit", label: "Audit Log" },
    { href: "/inspections", label: "Inspections" },
  ],
  IDR_MANAGER: [
    { href: "/manager", label: "Home" },
    { href: "/inspections", label: "Inspections" },
  ],
};

export async function AppShell({
  user,
  breadcrumb,
  children,
}: {
  user: SessionUser;
  breadcrumb?: Crumb[];
  children: React.ReactNode;
}) {
  const nav = NAV_BY_ROLE[user.role] ?? [];
  const unread = await unreadNotificationCount(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteBanner>
        <Link
          href="/notifications"
          className="inline-flex items-center gap-2 py-1 text-sm text-banner-foreground hover:underline"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          Notifications
          {unread > 0 ? (
            <span className="bg-administration px-1.5 py-0.5 text-xs font-semibold text-administration-foreground">
              {unread}
            </span>
          ) : null}
          <span className="sr-only">{unread > 0 ? `${unread} unread` : "none unread"}</span>
        </Link>

        <div className="hidden whitespace-nowrap text-right text-xs leading-tight text-banner-foreground/90 sm:block">
          <div className="font-semibold">{user.fullName}</div>
          <div>
            {ROLE_LABELS[user.role]}
            {user.regionName ? ` · ${user.regionName}` : ""}
          </div>
        </div>

        <form action={signOut}>
          <Button type="submit" variant="banner" size="sm">
            Sign out
          </Button>
        </form>
      </SiteBanner>

      <AdministrationBand>
        <nav aria-label="Primary">
          <ul className="flex flex-wrap gap-x-1 pb-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-block px-3 py-1.5 text-sm font-medium text-administration-foreground hover:bg-black/10 hover:no-underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </AdministrationBand>

      {breadcrumb ? <Breadcrumb trail={breadcrumb} /> : null}

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
