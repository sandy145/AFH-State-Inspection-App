"use client";

import { useState } from "react";
import { submitEvidenceAction } from "@/app/actions/evidence";
import { ActionForm } from "@/components/forms";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/status-badge";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@/domain/evidence";

/**
 * Evidence upload.
 *
 * The size check here runs before anything is sent. A body larger than the
 * request limit is aborted mid-stream by the runtime, which means the server
 * action never runs and cannot report anything — the upload simply dies and the
 * page sits there. Checking first turns that silence into a sentence.
 *
 * It is a courtesy, not a control: `assertUploadAllowed` on the server is the
 * authority, and nothing here is trusted.
 */
export function UploadForm({
  evidenceRequestId,
  allowMultipleFiles,
  explanationRequired,
  supersedesSubmissionId,
  maxUploadLabel,
  maxUploadBytes,
}: {
  evidenceRequestId: string;
  allowMultipleFiles: boolean;
  explanationRequired: boolean;
  supersedesSubmissionId?: string | null;
  maxUploadLabel: string;
  maxUploadBytes: number;
}) {
  const [tooLarge, setTooLarge] = useState<string[]>([]);

  function checkSizes(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    setTooLarge(files.filter((file) => file.size > maxUploadBytes).map((file) => file.name));
  }

  return (
    <div className="space-y-4">
      {/* Announced, because the file input's own change is silent to a screen
          reader and the submit button is about to become unavailable. */}
      <div aria-live="polite">
        {tooLarge.length > 0 ? (
          <Alert tone="critical" title={tooLarge.length === 1 ? "That file is too large" : "Those files are too large"}>
            <p>
              {tooLarge.join(", ")} {tooLarge.length === 1 ? "is" : "are"} over the {maxUploadLabel} limit
              for a single submission.
            </p>
            <p className="mt-1">
              Send a smaller scan, or split the documents across separate submissions — every
              submission is kept, so sending several is fine.
            </p>
          </Alert>
        ) : null}
      </div>

      <ActionForm
        action={submitEvidenceAction}
        submitLabel="Submit evidence"
        pendingLabel="Uploading…"
        disabled={tooLarge.length > 0}
        disabledReason={
          tooLarge.length > 0 ? `Remove the oversized ${tooLarge.length === 1 ? "file" : "files"} to continue.` : undefined
        }
      >
        <input type="hidden" name="evidenceRequestId" value={evidenceRequestId} />
        {supersedesSubmissionId ? (
          <input type="hidden" name="supersedesSubmissionId" value={supersedesSubmissionId} />
        ) : null}

        <Field
          label={allowMultipleFiles ? "Files" : "File"}
          htmlFor="files"
          required
          hint={`Accepted: ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")}. Up to ${maxUploadLabel} per submission.${
            allowMultipleFiles ? "" : " This request accepts a single file."
          }`}
        >
          <Input
            id="files"
            name="files"
            type="file"
            multiple={allowMultipleFiles}
            required
            accept={ALLOWED_UPLOAD_EXTENSIONS.join(",")}
            aria-describedby="files-hint"
            aria-invalid={tooLarge.length > 0 || undefined}
            onChange={checkSizes}
            className="cursor-pointer py-1.5"
          />
        </Field>

        <Field
          label="Explanation for the inspector"
          htmlFor="providerExplanation"
          required={explanationRequired}
          hint="Optional but helpful — for example, which page the requested information appears on."
        >
          <Textarea
            id="providerExplanation"
            name="providerExplanation"
            required={explanationRequired}
            aria-describedby="providerExplanation-hint"
            placeholder="The information you asked about is on page 3, section 4."
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          You will receive a receipt with a submission number the moment this is uploaded. Your files
          are never replaced — sending a document again keeps the earlier version on the record.
        </p>
      </ActionForm>
    </div>
  );
}
