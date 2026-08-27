"use client";

import { submitEvidenceAction } from "@/app/actions/evidence";
import { ActionForm } from "@/components/forms";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@/domain/evidence";

export function UploadForm({
  evidenceRequestId,
  allowMultipleFiles,
  explanationRequired,
  supersedesSubmissionId,
  maxUploadMb,
}: {
  evidenceRequestId: string;
  allowMultipleFiles: boolean;
  explanationRequired: boolean;
  supersedesSubmissionId?: string | null;
  maxUploadMb: number;
}) {
  return (
    <ActionForm action={submitEvidenceAction} submitLabel="Submit evidence" pendingLabel="Uploading…">
      <input type="hidden" name="evidenceRequestId" value={evidenceRequestId} />
      {supersedesSubmissionId ? (
        <input type="hidden" name="supersedesSubmissionId" value={supersedesSubmissionId} />
      ) : null}

      <Field
        label={allowMultipleFiles ? "Files" : "File"}
        htmlFor="files"
        required
        hint={`Accepted: ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")}. Up to ${maxUploadMb} MB each.${
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
        You will receive a receipt with a submission number the moment this is uploaded. Your files are
        never replaced — sending a document again keeps the earlier version on the record.
      </p>
    </ActionForm>
  );
}
