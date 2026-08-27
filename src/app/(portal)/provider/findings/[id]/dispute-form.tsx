"use client";

import { requestIDRAction } from "@/app/actions/outcomes";
import { acknowledgeConsultationAction } from "@/app/actions/evidence";
import { ActionForm } from "@/components/forms";
import { Field, Select, Textarea } from "@/components/ui/field";
import { IDR_METHOD_LABELS } from "@/domain/status";

/** Provider-initiated Informal Dispute Resolution (§15). */
export function DisputeForm({ citationId }: { citationId: string }) {
  return (
    <ActionForm action={requestIDRAction} submitLabel="Dispute citation" variant="outline">
      <input type="hidden" name="citationId" value={citationId} />

      <Field label="Why you disagree" htmlFor="reason" required>
        <Textarea id="reason" name="reason" required />
      </Field>

      <Field label="How you would like it reviewed" htmlFor="requestedMethod" required>
        <Select id="requestedMethod" name="requestedMethod" defaultValue="DESK_REVIEW">
          {Object.entries(IDR_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Supporting evidence you can provide" htmlFor="supportingEvidence">
        <Textarea id="supportingEvidence" name="supportingEvidence" />
      </Field>
    </ActionForm>
  );
}

export function AcknowledgeConsultationForm({ findingId }: { findingId: string }) {
  return (
    <ActionForm
      action={acknowledgeConsultationAction}
      submitLabel="I have seen this"
      variant="secondary"
      className="space-y-2"
    >
      <input type="hidden" name="findingId" value={findingId} />
    </ActionForm>
  );
}
