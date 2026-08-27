"use client";

import { useState } from "react";
import { advanceIDRAction } from "@/app/actions/outcomes";
import { ActionForm } from "@/components/forms";
import { Field, Select, Textarea } from "@/components/ui/field";
import { IDR_TRANSITIONS } from "@/domain/state-machines";
import { IDR_STATUS_META } from "@/domain/status";
import type { IDRStatus } from "@/domain/types";

const TERMINAL: IDRStatus[] = ["COMPLETED_UPHELD", "COMPLETED_MODIFIED", "COMPLETED_RESCINDED"];

/**
 * Only the transitions the state machine actually allows from here are offered,
 * so the form cannot propose a move the server will reject.
 */
export function AdvanceIDRForm({ idrRequestId, status }: { idrRequestId: string; status: IDRStatus }) {
  const options = IDR_TRANSITIONS[status] ?? [];
  const [next, setNext] = useState<IDRStatus | "">(options[0] ?? "");
  const decisionRequired = next !== "" && TERMINAL.includes(next);

  if (options.length === 0) {
    return <p className="border-t pt-4 text-sm text-muted-foreground">This dispute is closed.</p>;
  }

  return (
    <ActionForm action={advanceIDRAction} submitLabel="Update dispute" className="space-y-3 border-t pt-4">
      <input type="hidden" name="idrRequestId" value={idrRequestId} />

      <Field label="Move to" htmlFor="status" required>
        <Select id="status" name="status" value={next} onChange={(e) => setNext(e.target.value as IDRStatus)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {IDR_STATUS_META[option].label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Decision summary"
        htmlFor="decisionSummary"
        required={decisionRequired}
        hint={decisionRequired ? "Required to complete a dispute." : "Optional at this stage."}
      >
        <Textarea
          id="decisionSummary"
          name="decisionSummary"
          required={decisionRequired}
          aria-describedby="decisionSummary-hint"
        />
      </Field>
    </ActionForm>
  );
}
