import { requireStaffSection } from "@/lib/guards";

/** Providers have their own list views; cross-case search is a staff tool. */
export default async function SearchSectionLayout({ children }: { children: React.ReactNode }) {
  await requireStaffSection();
  return <>{children}</>;
}
