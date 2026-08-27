"use client";

import { useState } from "react";
import { reviewCorrectionAction } from "@/app/actions/outcomes";
import { ActionForm } from "@/components/forms";
import { Field, Select, Textarea } from "@/components/ui/field";

/**
 * Reviewing a correction.
 *
 * "Back in compliance" is offered only once the paperwork has been accepted:
 * receiving an attestation and verifying the correction are different acts, and
 * the follow-up tab is where verification is recorded.
 */
export function ReviewCorrectionForm({ correctionId, status }: { correctionId: string; status: string }) {
  const [decision, setDecision] = useState("ACCEPTED");
  const noteRequired = decision !== "ACCEPTED" && decision !== "BACK_IN_COMPLIANCE";

  return (
    <ActionForm action={reviewCorrectionAction} submitLabel="Record decision" className="space-y-3 border-t pt-4">
      <input type="hidden" name="correctionId" value={correctionId} />

      <Field label="Decision" htmlFor="decision" required>
        <Select id="decision" name="decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="ACCEPTED">Accept the correction</option>
          <option value="ADDITIONAL_INFO_REQUESTED">Request additional information</option>
          <option value="CORRECTION_VERIFICATION_REQUIRED">Verification required</option>
          {status === "ACCEPTED" || status === "CORRECTION_VERIFICATION_REQUIRED" ? (
            <option value="BACK_IN_COMPLIANCE">Record as back in compliance</option>
          ) : null}
        </Select>
      </Field>

      <Field
        label="Note to the provider"
        htmlFor="note"
        required={noteRequired}
        hint={noteRequired ? "Required. Say what the provider still needs to do." : "Optional."}
      >
        <Textarea id="note" name="note" required={noteRequired} aria-describedby="note-hint" />
      </Field>
    </ActionForm>
  );
}
