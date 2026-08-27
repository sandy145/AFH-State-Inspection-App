import Link from "next/link";
import { currentUser, toActor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireInspectionAccessOrNotFound } from "@/data/scope";
import { formatDateTime } from "@/domain/deadlines";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, DataTable, Row } from "@/components/ui/table";

export const metadata = { title: "Documents" };

/**
 * Every document on the case, with its full version chain (§22). Nothing is ever
 * overwritten, so a superseded version stays listed and downloadable.
 */
export default async function DocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  await requireInspectionAccessOrNotFound(toActor(user), id);

  const documents = await prisma.document.findMany({
    where: { inspectionId: id },
    include: {
      versions: {
        orderBy: { version: "desc" },
        include: { uploadedBy: { select: { fullName: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <DataTable
      caption="Documents on this inspection"
      headers={["File", "Version", "Uploaded by", "Uploaded", "Size", "Checksum", "Scan", ""]}
      empty="No documents on this case."
    >
      {documents.flatMap((document) =>
        document.versions.map((version) => (
          <Row key={version.id}>
            <Cell className="font-medium">{version.fileName}</Cell>
            <Cell>
              {version.version}
              {version.isCurrent ? (
                <StatusBadge label="Current" tone="success" className="ml-2" />
              ) : (
                <StatusBadge label="Superseded" tone="neutral" className="ml-2" />
              )}
            </Cell>
            <Cell className="text-sm">{version.uploadedBy.fullName}</Cell>
            <Cell className="whitespace-nowrap text-xs">{formatDateTime(version.uploadedAt)}</Cell>
            <Cell className="whitespace-nowrap text-sm tabular-nums">
              {(version.sizeBytes / 1024).toFixed(0)} KB
            </Cell>
            <Cell className="font-mono text-xs">{version.checksum.slice(0, 12)}…</Cell>
            <Cell>
              <StatusBadge
                label={version.scanStatus.toLowerCase()}
                tone={
                  version.scanStatus === "CLEAN"
                    ? "success"
                    : version.scanStatus === "INFECTED"
                      ? "critical"
                      : "neutral"
                }
              />
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
  );
}
