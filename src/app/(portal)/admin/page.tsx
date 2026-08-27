import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { canAdminister } from "@/domain/authz";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { ConfigurationForm } from "./configuration-form";

export const metadata = { title: "Administration" };

export default async function AdminOverview() {
  const user = (await currentUser())!;
  if (!canAdminister(toActor(user))) redirect("/");

  const [users, facilities, inspections, regulations, configuration] = await Promise.all([
    prisma.user.count(),
    prisma.facility.count(),
    prisma.inspection.count(),
    prisma.regulation.count(),
    prisma.systemConfiguration.findMany({ orderBy: { category: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Administration"
        description="Users, homes, reference data and the policy settings the workflow reads."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={users} href="/admin/users" />
        <StatCard label="Adult family homes" value={facilities} href="/admin/facilities" />
        <StatCard label="Inspections" value={inspections} href="/inspections" />
        <StatCard label="Regulations" value={regulations} href="/admin/regulations" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Policy settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            These are read at runtime by the workflow. Every change is written to the audit log with
            its previous and new value.
          </p>

          {configuration.map((setting) => (
            <ConfigurationForm
              key={setting.key}
              settingKey={setting.key}
              label={setting.label}
              description={setting.description}
              value={setting.value}
              valueType={setting.valueType}
            />
          ))}
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground">
        Deadline intervals are configured separately under{" "}
        <Link href="/admin/deadlines" className="underline">
          Deadlines
        </Link>
        .
      </p>
    </>
  );
}
