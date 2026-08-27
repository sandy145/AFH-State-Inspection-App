"use client";

import { submitCorrectionAction } from "@/app/actions/outcomes";
import { ActionForm } from "@/components/forms";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@/domain/evidence";

/**
 * The electronic attestation. The name typed here and the time the portal
 * received it are recorded as separate facts — they are not the same thing.
 */
export function CorrectionForm({ correctionId }: { correctionId: string }) {
  return (
    <ActionForm action={submitCorrectionAction} submitLabel="Submit correction" pendingLabel="Submitting…">
      <input type="hidden" name="correctionId" value={correctionId} />

      <Field label="How the deficiency was corrected" htmlFor="howCorrected" required>
        <Textarea id="howCorrected" name="howCorrected" required />
      </Field>

      <Field label="Date the correction was completed" htmlFor="correctionCompletedAt" required>
        <Input id="correctionCompletedAt" name="correctionCompletedAt" type="date" required />
      </Field>

      <Field label="How the correction will be maintained" htmlFor="howMaintained" required>
        <Textarea id="howMaintained" name="howMaintained" required />
      </Field>

      <Field label="Person responsible" htmlFor="responsiblePerson" required>
        <Input id="responsiblePerson" name="responsiblePerson" required />
      </Field>

      <Field
        label="Supporting documents"
        htmlFor="files"
        hint={`Optional. Accepted: ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")}.`}
      >
        <Input
          id="files"
          name="files"
          type="file"
          multiple
          accept={ALLOWED_UPLOAD_EXTENSIONS.join(",")}
          aria-describedby="files-hint"
          className="cursor-pointer py-1.5"
        />
      </Field>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Electronic attestation</legend>
        <p className="text-sm text-muted-foreground">
          By typing your name below you attest that the information you have given is accurate and that
          the correction described has been made.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your full name" htmlFor="signatureName" required>
            <Input id="signatureName" name="signatureName" required autoComplete="name" />
          </Field>

          <Field label="Your title" htmlFor="signatureTitle">
            <Input id="signatureTitle" name="signatureTitle" placeholder="Provider" />
          </Field>
        </div>
      </fieldset>
    </ActionForm>
  );
}
