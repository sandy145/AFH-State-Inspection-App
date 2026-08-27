import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser, toActor } from "@/lib/session";
import { canViewInspection } from "@/domain/authz";
import { loadInspectionScope } from "@/data/scope";
import { documentStorage } from "@/services/storage";
import * as audit from "@/data/audit";

/**
 * Document download.
 *
 * Storage keys are never exposed and object storage is never public. A download
 * streams through here, and only after:
 *   1. the caller is signed in,
 *   2. the caller may see the inspection the document belongs to, and
 *   3. the file has not been flagged by malware scanning.
 *
 * Every download is audited — who read which document, and when (§21).
 */
export async function GET(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: { select: { id: true, inspectionId: true, title: true } } },
  });

  // Absent and forbidden return the same status: confirming existence to an
  // unauthorized caller leaks the shape of another provider's case.
  const denied = NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!version?.document.inspectionId) return denied;

  const scope = await loadInspectionScope(version.document.inspectionId);
  if (!scope || !canViewInspection(toActor(user), scope)) return denied;

  if (version.scanStatus === "INFECTED") {
    return NextResponse.json(
      { error: "This file was quarantined by malware scanning and cannot be downloaded." },
      { status: 403 },
    );
  }

  let body: Buffer;
  try {
    body = await documentStorage().get(version.storageKey);
  } catch {
    // Seeded demo rows have metadata but no bytes behind them.
    return NextResponse.json(
      { error: "The stored file is not available in this environment." },
      { status: 404 },
    );
  }

  await audit.record(user, {
    action: "EVIDENCE_DOWNLOADED",
    entityType: "DocumentVersion",
    entityId: version.id,
    newValue: `${version.fileName} (version ${version.version})`,
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": version.mimeType,
      // attachment, and the filename is quoted: a provider-supplied name must
      // never be able to break out of the header.
      "Content-Disposition": `attachment; filename="${version.fileName.replace(/["\\]/g, "")}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
