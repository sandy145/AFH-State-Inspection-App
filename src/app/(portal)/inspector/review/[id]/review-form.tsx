"use client";

import { useState } from "react";
import { reviewEvidenceAction } from "@/app/actions/evidence";
import { ActionForm } from "@/components/forms";
import { Field, Select, Textarea } from "@/components/ui/field";
import { REVIEW_OUTCOME_LABELS, reviewRequiresReason } from "@/domain/evidence";
import type { ReviewOutcome } from "@/domain/types";

const OUTCOMES = Object.keys(REVIEW_OUTCOME_LABELS) as ReviewOutcome[];

/**
 * The determination form.
 *
 * The reason field becomes required as soon as the outcome is anything other
 * than "Accepted" — the same rule the server enforces, mirrored here so the
 * inspector finds out before submitting rather than after.
 */
export function ReviewForm({ submissionId }: { submissionId: string }) {
  const [outcome, setOutcome] = useState<ReviewOutcome>("ACCEPTED");
  const reasonRequired = reviewRequiresReason(outcome);

  return (
    <ActionForm action={reviewEvidenceAction} submitLabel="Record determination" pendingLabel="Recording…">
      <input type="hidden" name="submissionId" value={submissionId} />

      <Field label="Determination" htmlFor="outcome" required>
        <Select
          id="outcome"
          name="outcome"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as ReviewOutcome)}
        >
          {OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {REVIEW_OUTCOME_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Reason"
        htmlFor="reason"
        required={reasonRequired}
        hint={
          reasonRequired
            ? "Required. The provider sees this, so say what was missing or wrong."
            : "Optional for an acceptance."
        }
      >
        <Textarea
          id="reason"
          name="reason"
          required={reasonRequired}
          aria-describedby="reason-hint"
          placeholder={
            reasonRequired ? "The practitioner order referenced on page 14 was not included." : ""
          }
        />
      </Field>
    </ActionForm>
  );
}
