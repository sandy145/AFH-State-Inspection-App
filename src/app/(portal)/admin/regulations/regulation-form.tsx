"use client";

import { upsertRegulationAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function RegulationForm() {
  return (
    <ActionForm action={upsertRegulationAction} submitLabel="Save reference">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Source" htmlFor="source" required>
          <Select id="source" name="source" defaultValue="WAC">
            <option value="WAC">WAC</option>
            <option value="RCW">RCW</option>
            <option value="POLICY">RCS policy</option>
          </Select>
        </Field>

        <Field label="Citation" htmlFor="citation" required hint="Matching an existing citation updates it.">
          <Input id="citation" name="citation" required placeholder="388-76-10506" aria-describedby="citation-hint" />
        </Field>

        <Field label="Published URL" htmlFor="url">
          <Input id="url" name="url" type="url" placeholder="https://app.leg.wa.gov/WAC/..." />
        </Field>
      </div>

      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required placeholder="Residency agreement — Required information" />
      </Field>

      <Field label="Summary" htmlFor="summary">
        <Textarea id="summary" name="summary" />
      </Field>

      <Field
        label="Inspector guidance"
        htmlFor="inspectorGuidance"
        hint="Shown to inspectors alongside the rule. It informs a decision; it never makes one."
      >
        <Textarea id="inspectorGuidance" name="inspectorGuidance" aria-describedby="inspectorGuidance-hint" />
      </Field>
    </ActionForm>
  );
}
