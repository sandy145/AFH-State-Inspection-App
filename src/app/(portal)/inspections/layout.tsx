import { requireStaffSection } from "@/lib/guards";

/** Case records are a staff view; providers use /provider. */
export default async function InspectionsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireStaffSection();
  return <>{children}</>;
}
