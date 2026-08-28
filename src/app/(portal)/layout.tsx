import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser, type SessionUser } from "@/lib/session";
import { homePathForRole } from "@/domain/authz";
import { AppShell } from "@/components/app-shell";

/**
 * Every authenticated route sits under this layout, so an unauthenticated
 * request cannot reach a page by URL. Authorization for the *record* is checked
 * again inside each page — being signed in is not the same as being entitled to
 * a particular case.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  if (!user) {
    // Preserve where they were heading so an emailed deep link survives login.
    // The header is set by src/middleware.ts.
    const headerList = await headers();
    const path = headerList.get("x-pathname");
    redirect(path ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }

  // A breadcrumb root per persona; pages deeper in add their own trail through
  // their own headers, as the reference site does.
  const path = (await headers()).get("x-pathname") ?? "";
  return (
    <AppShell user={user} breadcrumb={breadcrumbFor(user.role, path)}>
      {children}
    </AppShell>
  );
}

/** Mirrors the reference site's Home > Section > Page trail. */
function breadcrumbFor(role: SessionUser["role"], path: string): { label: string; href?: string }[] {
  const home = { label: "Home", href: homePathForRole(role) };
  const segments = path.split("?")[0]!.split("/").filter(Boolean);

  if (segments.length === 0) return [home];

  const labels: Record<string, string> = {
    provider: "Home",
    inspector: "Home",
    manager: "Home",
    admin: "Administration",
    inspections: "Inspections",
    requests: "Evidence Requests",
    findings: "Findings",
    corrections: "Corrections",
    documents: "Documents",
    review: "Evidence Review",
    reports: "Reports",
    users: "Users",
    facilities: "Facilities",
    regulations: "Regulations",
    deadlines: "Deadlines",
    audit: "Audit Log",
    notifications: "Notifications",
    receipts: "Receipt",
    search: "Search",
    timeline: "Timeline",
    evidence: "Evidence Requests",
    idr: "Informal Dispute Resolution",
    "follow-up": "Follow-Up",
  };

  const trail: { label: string; href?: string }[] = [home];

  for (const segment of segments.slice(1)) {
    // Identifiers are not places a person navigates to; skip them.
    if (/^[0-9a-f-]{36}$/i.test(segment)) continue;
    const label = labels[segment];
    if (label) trail.push({ label });
  }

  return trail;
}
