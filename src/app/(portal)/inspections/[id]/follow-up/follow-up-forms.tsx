"use client";

import { useState } from "react";
import { completeFollowUpAction, scheduleFollowUpAction } from "@/app/actions/outcomes";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FOLLOW_UP_METHOD_LABELS } from "@/domain/status";

export function ScheduleFollowUpForm({
  inspectionId,
  citations,
}: {
  inspectionId: string;
  citations: { id: string; citationNumber: string }[];
}) {
  return (
    <ActionForm action={scheduleFollowUpAction} submitLabel="Schedule follow-up">
      <input type="hidden" name="inspectionId" value={inspectionId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Verification method" htmlFor="method" required>
          <Select id="method" name="method" defaultValue="DOCUMENT_REVIEW">
            {Object.entries(FOLLOW_UP_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Scheduled date" htmlFor="scheduledFor">
          <Input id="scheduledFor" name="scheduledFor" type="date" />
        </Field>
      </div>

      {citations.length > 0 ? (
        <Field label="Related citation" htmlFor="citationId">
          <Select id="citationId" name="citationId" defaultValue="">
            <option value="">Not tied to a specific citation</option>
            {citations.map((citation) => (
              <option key={citation.id} value={citation.id}>
                {citation.citationNumber}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" />
      </Field>
    </ActionForm>
  );
}

export function CompleteFollowUpForm({ followUpId }: { followUpId: string }) {
  const [result, setResult] = useState("BACK_IN_COMPLIANCE");
  const deficienciesRequired = result === "ADDITIONAL_DEFICIENCIES";

  return (
    <ActionForm action={completeFollowUpAction} submitLabel="Record follow-up result" className="space-y-3 border-t pt-4">
      <input type="hidden" name="followUpId" value={followUpId} />

      <Field label="Result" htmlFor="result" required>
        <Select id="result" name="result" value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="BACK_IN_COMPLIANCE">Back in compliance</option>
          <option value="NOT_BACK_IN_COMPLIANCE">Not back in compliance</option>
          <option value="ADDITIONAL_DEFICIENCIES">Additional deficiencies identified</option>
        </Select>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="backInCompliance"
          className="h-4 w-4"
          defaultChecked={result === "BACK_IN_COMPLIANCE"}
        />
        Record this home as back in compliance
      </label>

      <Field label="Evidence reviewed" htmlFor="evidenceReviewed">
        <Textarea id="evidenceReviewed" name="evidenceReviewed" />
      </Field>

      <Field
        label="Additional deficiencies"
        htmlFor="additionalDeficiencies"
        required={deficienciesRequired}
        hint={deficienciesRequired ? "Required when additional deficiencies were identified." : undefined}
      >
        <Textarea
          id="additionalDeficiencies"
          name="additionalDeficiencies"
          required={deficienciesRequired}
          aria-describedby="additionalDeficiencies-hint"
        />
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" />
      </Field>
    </ActionForm>
  );
}
