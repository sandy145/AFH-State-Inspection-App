import Link from "next/link";
import { Bell, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/domain/authz";
import { unreadNotificationCount } from "@/data/notifications";
import type { SessionUser } from "@/lib/session";

interface NavItem {
  href: string;
  label: string;
}

const NAV_BY_ROLE: Record<SessionUser["role"], NavItem[]> = {
  PROVIDER: [
    { href: "/provider", label: "Dashboard" },
    { href: "/provider/requests", label: "Evidence requests" },
    { href: "/provider/findings", label: "Findings" },
    { href: "/provider/corrections", label: "Corrections" },
    { href: "/provider/documents", label: "Documents" },
  ],
  INSPECTOR: [
    { href: "/inspector", label: "Dashboard" },
    { href: "/inspector/review", label: "Evidence review" },
    { href: "/inspections", label: "Inspections" },
    { href: "/search", label: "Search" },
  ],
  FIELD_MANAGER: [
    { href: "/manager", label: "Dashboard" },
    { href: "/manager/reports", label: "Reports" },
    { href: "/inspector/review", label: "Evidence review" },
    { href: "/inspections", label: "Inspections" },
    { href: "/search", label: "Search" },
  ],
  RCS_ADMIN: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/facilities", label: "Facilities" },
    { href: "/admin/regulations", label: "Regulations" },
    { href: "/admin/deadlines", label: "Deadlines" },
    { href: "/admin/audit", label: "Audit log" },
    { href: "/inspections", label: "Inspections" },
  ],
  IDR_MANAGER: [
    { href: "/manager", label: "Dashboard" },
    { href: "/inspections", label: "Inspections" },
  ],
};

export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const nav = NAV_BY_ROLE[user.role] ?? [];
  const unread = await unreadNotificationCount(user.id);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 rounded-md font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>
              AFH Compliance Portal
              <span className="sr-only">— Washington State DSHS Residential Care Services</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              Notifications
              {unread > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  {unread}
                </span>
              ) : null}
              <span className="sr-only">{unread > 0 ? `${unread} unread` : "none unread"}</span>
            </Link>

            <div className="hidden text-right text-sm sm:block">
              <div className="font-medium">{user.fullName}</div>
              <div className="text-xs text-muted-foreground">
                {ROLE_LABELS[user.role]}
                {user.regionName ? ` · ${user.regionName}` : ""}
              </div>
            </div>

            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>

        <nav aria-label="Primary" className="mx-auto max-w-[1400px] px-4">
          <ul className="flex flex-wrap gap-1 pb-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-block rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-[1400px] px-4 py-8">
        {children}
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 pb-10 text-xs text-muted-foreground">
        <p>
          Prototype for demonstration. Not an authoritative licensing record, and not a substitute for
          any legally required method of service. Regulatory decisions are made by authorized DSHS
          staff, never by this software.
        </p>
      </footer>
    </div>
  );
}
