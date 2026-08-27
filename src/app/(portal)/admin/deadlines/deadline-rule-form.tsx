"use client";

import { updateDeadlineRuleAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/field";

export function DeadlineRuleForm({
  ruleId,
  offset,
  unit,
  authority,
}: {
  ruleId: string;
  offset: number;
  unit: string;
  authority: string | null;
}) {
  return (
    <ActionForm action={updateDeadlineRuleAction} submitLabel="Save rule" variant="secondary">
      <input type="hidden" name="ruleId" value={ruleId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Offset" htmlFor={`offset-${ruleId}`} required>
          <Input id={`offset-${ruleId}`} name="offset" type="number" min={0} max={365} defaultValue={offset} required />
        </Field>

        <Field label="Counted in" htmlFor={`unit-${ruleId}`} required>
          <Select id={`unit-${ruleId}`} name="unit" defaultValue={unit}>
            <option value="CALENDAR_DAYS">Calendar days</option>
            <option value="WORKING_DAYS">Working days</option>
          </Select>
        </Field>

        <Field label="Authority" htmlFor={`authority-${ruleId}`} hint="Shown beside the deadline.">
          <Input
            id={`authority-${ruleId}`}
            name="authority"
            defaultValue={authority ?? ""}
            placeholder="WAC 388-76-10930"
            aria-describedby={`authority-${ruleId}-hint`}
          />
        </Field>
      </div>

      <Field
        label="Reason for the change"
        htmlFor={`reason-${ruleId}`}
        required
        hint="Required. Recorded in the audit log with the previous and new value."
      >
        <Input id={`reason-${ruleId}`} name="reason" required aria-describedby={`reason-${ruleId}-hint`} />
      </Field>
    </ActionForm>
  );
}
