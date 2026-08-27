import { requireStaffSection } from "@/lib/guards";

export default async function InspectorSectionLayout({ children }: { children: React.ReactNode }) {
  await requireStaffSection();
  return <>{children}</>;
}
