import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { inspectionScope } from "@/data/scope";
import { formatDateTime } from "@/domain/deadlines";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, DataTable, Row } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Documents" };

/**
 * Everything the provider has sent, including superseded versions. Nothing is
 * ever removed, so a provider can always show what they sent and when (§22).
 */
export default async function ProviderDocuments() {
  const user = (await currentUser())!;

  const documents = await prisma.document.findMany({
    where: { inspection: inspectionScope(toActor(user)) },
    include: {
      inspection: { select: { caseNumber: true } },
      versions: { orderBy: { version: "desc" }, include: { uploadedBy: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Documents"
        description="Every file on your inspections, including earlier versions. Nothing here is ever overwritten."
      />

      <DataTable
        caption="Documents on your inspections"
        headers={["File", "Case", "Version", "Uploaded by", "Uploaded", "Size", ""]}
        empty="You have not sent any documents yet."
      >
        {documents.flatMap((document) =>
          document.versions.map((version) => (
            <Row key={version.id}>
              <Cell className="font-medium">{version.fileName}</Cell>
              <Cell className="whitespace-nowrap text-sm">{document.inspection?.caseNumber ?? "—"}</Cell>
              <Cell>
                {version.version}
                <StatusBadge
                  label={version.isCurrent ? "Current" : "Superseded"}
                  tone={version.isCurrent ? "success" : "neutral"}
                  className="ml-2"
                />
              </Cell>
              <Cell className="text-sm">{version.uploadedBy.fullName}</Cell>
              <Cell className="whitespace-nowrap text-xs">{formatDateTime(version.uploadedAt)}</Cell>
              <Cell className="whitespace-nowrap text-sm tabular-nums">
                {(version.sizeBytes / 1024).toFixed(0)} KB
              </Cell>
              <Cell>
                <Link href={`/documents/${version.id}`} className="text-sm underline underline-offset-2">
                  Download
                </Link>
              </Cell>
            </Row>
          )),
        )}
      </DataTable>
    </>
  );
}
