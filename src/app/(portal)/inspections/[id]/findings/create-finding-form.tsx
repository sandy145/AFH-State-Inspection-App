"use client";

import { createFindingAction } from "@/app/actions/outcomes";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function CreateFindingForm({
  inspectionId,
  regulations,
}: {
  inspectionId: string;
  regulations: { id: string; citation: string; source: string; title: string }[];
}) {
  return (
    <ActionForm action={createFindingAction} submitLabel="Create finding">
      <input type="hidden" name="inspectionId" value={inspectionId} />

      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required placeholder="Residency Agreement Requirements" />
      </Field>

      <Field
        label="Observation"
        htmlFor="observation"
        required
        hint="What was observed, in neutral terms. This is not a determination."
      >
        <Textarea
          id="observation"
          name="observation"
          required
          aria-describedby="observation-hint"
          placeholder="Required information could not be confirmed from the residency agreement reviewed during inspection."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Regulation" htmlFor="regulationId">
          <Select id="regulationId" name="regulationId" defaultValue="">
            <option value="">Not linked yet</option>
            {regulations.map((regulation) => (
              <option key={regulation.id} value={regulation.id}>
                {regulation.source} {regulation.citation} — {regulation.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Resident reference"
          htmlFor="residentIdentifier"
          hint="Use a redacted identifier such as “Resident A”. Never enter a resident's name."
        >
          <Input
            id="residentIdentifier"
            name="residentIdentifier"
            placeholder="Resident A"
            aria-describedby="residentIdentifier-hint"
          />
        </Field>
      </div>

      <Field
        label="Potential outcome"
        htmlFor="potentialOutcome"
        hint="Your working view. It carries no weight until a consultation or citation exists."
      >
        <Select id="potentialOutcome" name="potentialOutcome" defaultValue="UNDETERMINED" aria-describedby="potentialOutcome-hint">
          <option value="UNDETERMINED">Undetermined</option>
          <option value="LIKELY_NO_VIOLATION">Likely no violation</option>
          <option value="POSSIBLE_CONSULTATION">Possible consultation</option>
          <option value="POSSIBLE_CITATION">Possible citation</option>
        </Select>
      </Field>
    </ActionForm>
  );
}
