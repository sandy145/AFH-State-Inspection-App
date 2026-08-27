import "server-only";
import { redirect } from "next/navigation";
import { currentUser, toActor, type SessionUser } from "@/lib/session";
import { canAdminister, homePathForRole, isStaff } from "@/domain/authz";

/**
 * Section-level role gates.
 *
 * Record-level authorization still happens on every page — these only keep a
 * persona out of a section built for someone else. A provider's own case data is
 * already scoped everywhere, so this is defence in depth rather than the control
 * that protects the data. It exists because a staff screen shows staff framing
 * (assignment, internal workflow, colleagues' names) that a provider should not
 * be reading even about their own case.
 *
 * Redirect rather than 404: the user is legitimately signed in and there is a
 * right place for them to be.
 */
export async function requireStaffSection(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isStaff(toActor(user))) redirect(homePathForRole(user.role));
  return user;
}

export async function requireAdminSection(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canAdminister(toActor(user))) redirect(homePathForRole(user.role));
  return user;
}
