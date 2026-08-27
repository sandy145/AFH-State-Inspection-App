import { currentUser } from "@/lib/session";
import { ROLE_LABELS } from "@/domain/authz";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/domain/deadlines";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/misc";
import { CreateUserForm, ToggleUserForm } from "./user-forms";

export const metadata = { title: "Users" };

export default async function UsersAdmin() {
  const user = (await currentUser())!;

  const [users, regions, facilities] = await Promise.all([
    prisma.user.findMany({
      include: {
        region: { select: { name: true } },
        facilityLinks: { include: { facility: { select: { name: true } } } },
      },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    }),
    prisma.region.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.facility.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Users" description="Accounts, roles, regions and facility access." />

      <DataTable
        caption="User accounts"
        headers={["Name", "Email", "Role", "Region / homes", "Last sign-in", "Status", ""]}
      >
        {users.map((account) => (
          <Row key={account.id}>
            <Cell className="font-medium">
              {account.fullName}
              {account.title ? <p className="text-xs text-muted-foreground">{account.title}</p> : null}
            </Cell>
            <Cell className="text-sm">{account.email}</Cell>
            <Cell className="text-sm">{ROLE_LABELS[account.role]}</Cell>
            <Cell className="text-sm">
              {account.region?.name ??
                account.facilityLinks.map((link) => link.facility.name).join(", ") ??
                "—"}
              {!account.region && account.facilityLinks.length === 0 ? "—" : null}
            </Cell>
            <Cell className="whitespace-nowrap text-sm">
              {account.lastLoginAt ? formatDate(account.lastLoginAt) : "Never"}
            </Cell>
            <Cell>
              <StatusBadge
                label={account.isActive ? "Active" : "Deactivated"}
                tone={account.isActive ? "success" : "neutral"}
              />
            </Cell>
            <Cell>
              <ToggleUserForm userId={account.id} active={account.isActive} self={account.id === user.id} />
            </Cell>
          </Row>
        ))}
      </DataTable>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm regions={regions} facilities={facilities} />
        </CardContent>
      </Card>
    </>
  );
}
