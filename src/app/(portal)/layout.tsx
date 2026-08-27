import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser } from "@/lib/session";
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

  return <AppShell user={user}>{children}</AppShell>;
}
