import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, toActor } from "@/lib/session";
import { canAdminister } from "@/domain/authz";
import { prisma } from "@/lib/prisma";
import { facilityDirectory, licensingSystem } from "@/services/external-systems";
import { formatDate } from "@/domain/deadlines";
import { Alert, StatusBadge } from "@/components/ui/status-badge";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Adult family homes" };

/**
 * Facility administration (§39).
 *
 * The portal is not the licensing system of record. Rows here carry the external
 * id and the last synchronization time, and the licence status shown comes from
 * the LicensingSystemService rather than from a column in this database.
 */
export default async function FacilitiesAdmin() {
  const user = (await currentUser())!;
  if (!canAdminister(toActor(user))) redirect("/");

  const facilities = await prisma.facility.findMany({
    include: {
      region: { select: { name: true } },
      organization: { select: { name: true } },
      userLinks: { include: { user: { select: { fullName: true, email: true } } } },
      _count: { select: { inspections: true } },
    },
    orderBy: { name: "asc" },
  });

  const licensing = licensingSystem();
  const statuses = await Promise.all(
    facilities.map((facility) => licensing.getLicenseStatus(facility.licenseNumber)),
  );

  return (
    <>
      <PageHeader
        title="Adult family homes"
        description="Homes synchronized into this portal from the DSHS facility directory."
      />

      <Alert tone="info" title="This portal is not the licensing system of record" className="mb-6">
        Homes, licence numbers and licence status originate in DSHS systems. In this prototype the{" "}
        <code>FacilityDirectoryService</code> and <code>LicensingSystemService</code> read seeded
        fixtures; in production they synchronize from the authoritative source, matching on the
        external id shown below. Licence status is never edited here.
      </Alert>

      <DataTable
        caption="Adult family homes"
        headers={["Home", "Licence", "External id", "Organization", "Region", "Provider contacts", "Cases", "Licence status", "Synced"]}
      >
        {facilities.map((facility, index) => (
          <Row key={facility.id}>
            <Cell className="font-medium">
              {facility.name}
              <p className="text-xs text-muted-foreground">
                {facility.city}, {facility.state} · {facility.bedCapacity} beds
              </p>
            </Cell>
            <Cell className="text-sm">{facility.licenseNumber}</Cell>
            <Cell className="font-mono text-xs text-muted-foreground">{facility.externalId ?? "—"}</Cell>
            <Cell className="text-sm">{facility.organization?.name ?? "—"}</Cell>
            <Cell className="text-sm">{facility.region?.name ?? "—"}</Cell>
            <Cell className="text-sm">
              {facility.userLinks.length === 0 ? (
                <span className="text-muted-foreground">None linked</span>
              ) : (
                facility.userLinks.map((link) => (
                  <p key={link.id} className="text-xs">
                    {link.user.fullName} · {link.relationship}
                  </p>
                ))
              )}
            </Cell>
            <Cell className="tabular-nums">
              <Link href={`/inspections?q=${facility.licenseNumber}`} className="underline underline-offset-2">
                {facility._count.inspections}
              </Link>
            </Cell>
            <Cell>
              <StatusBadge
                label={statuses[index]?.status ?? "Unknown"}
                tone={statuses[index]?.status === "ACTIVE" ? "success" : "neutral"}
              />
            </Cell>
            <Cell className="whitespace-nowrap text-xs">
              {facility.syncedAt ? formatDate(facility.syncedAt) : "Never"}
            </Cell>
          </Row>
        ))}
      </DataTable>

      <p className="mt-4 text-xs text-muted-foreground">
        Directory source: {facilityDirectory().source}. Licensing source: {licensing.source}.
      </p>
    </>
  );
}
