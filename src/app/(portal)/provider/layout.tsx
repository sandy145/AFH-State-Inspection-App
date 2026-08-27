import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { homePathForRole } from "@/domain/authz";

/**
 * The provider workspace. Staff have their own views of the same cases, so a
 * staff member landing here is sent to theirs rather than shown a provider's
 * framing of the record.
 */
export default async function ProviderSectionLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "PROVIDER") redirect(homePathForRole(user.role));
  return <>{children}</>;
}
