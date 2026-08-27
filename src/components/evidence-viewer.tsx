"use client";

import { useState } from "react";
import { Download, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Evidence viewer (§32).
 *
 * Shows the document beside the request rather than making a reviewer download it
 * and lose their place. PDFs and images render inline; anything else offers a
 * download, because rendering an arbitrary office document in the page is not
 * worth the attack surface.
 *
 * The iframe is sandboxed. The bytes come from the authorization-checked
 * `/documents/[versionId]` route, never from object storage directly, so the
 * viewer has no more reach than the reviewer does.
 */
export interface ViewableFile {
  id: string;
  fileName: string;
  mimeType: string;
  version: number;
  sizeBytes: number;
}

const INLINE_PDF = "application/pdf";
const INLINE_IMAGES = ["image/jpeg", "image/png", "image/tiff"];

export function EvidenceViewer({ files }: { files: ViewableFile[] }) {
  const [activeId, setActiveId] = useState(files[0]?.id ?? null);
  const active = files.find((file) => file.id === activeId) ?? files[0];

  if (!active) {
    return <p className="text-sm text-muted-foreground">No files on this submission.</p>;
  }

  const src = `/documents/${active.id}`;
  const isPdf = active.mimeType === INLINE_PDF;
  const isImage = INLINE_IMAGES.includes(active.mimeType);

  return (
    <div className="space-y-3">
      {files.length > 1 ? (
        <div role="tablist" aria-label="Files in this submission" className="flex flex-wrap gap-2">
          {files.map((file) => (
            <button
              key={file.id}
              type="button"
              role="tab"
              aria-selected={file.id === active.id}
              onClick={() => setActiveId(file.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm",
                file.id === active.id ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent",
              )}
            >
              {file.mimeType.startsWith("image/") ? (
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {file.fileName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border bg-muted/30">
        {isPdf ? (
          <iframe
            key={active.id}
            src={src}
            title={`${active.fileName}, version ${active.version}`}
            className="h-[32rem] w-full bg-white"
            // allow-same-origin so the browser's built-in PDF viewer works —
            // it is blocked in a fully sandboxed frame. Scripts, forms, popups
            // and top-level navigation stay disabled, and the document is served
            // from this origin anyway, so this grants nothing a normal
            // same-origin frame would not already have.
            sandbox="allow-same-origin"
          />
        ) : isImage ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             next/image would proxy this through the optimizer, which fetches the
             URL without the viewer's session. The bytes come from an
             authorization-checked route and must stay behind it. */
          <img
            key={active.id}
            src={src}
            alt={`Evidence document ${active.fileName}`}
            className="mx-auto max-h-[32rem] w-auto"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {active.fileName} cannot be previewed in the browser. Download it to review.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {active.fileName} · version {active.version} · {(active.sizeBytes / 1024).toFixed(0)} KB
        </p>
        <Button asChild size="sm" variant="outline">
          <a href={src} download>
            <Download aria-hidden="true" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}
