import { requireAdminSection } from "@/lib/guards";

export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSection();
  return <>{children}</>;
}
