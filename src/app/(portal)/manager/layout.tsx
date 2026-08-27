import { requireStaffSection } from "@/lib/guards";

export default async function ManagerSectionLayout({ children }: { children: React.ReactNode }) {
  await requireStaffSection();
  return <>{children}</>;
}
