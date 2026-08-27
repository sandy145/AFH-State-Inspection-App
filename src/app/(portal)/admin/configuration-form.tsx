"use client";

import { updateConfigurationAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/field";

export function ConfigurationForm({
  settingKey,
  label,
  description,
  value,
  valueType,
}: {
  settingKey: string;
  label: string;
  description: string | null;
  value: string;
  valueType: string;
}) {
  return (
    <div className="rounded-md border p-4">
      <ActionForm action={updateConfigurationAction} submitLabel="Save" variant="secondary" className="space-y-3">
        <input type="hidden" name="key" value={settingKey} />

        <Field label={label} htmlFor={`config-${settingKey}`} hint={description ?? undefined}>
          {valueType === "boolean" ? (
            <Select id={`config-${settingKey}`} name="value" defaultValue={value}>
              <option value="true">On</option>
              <option value="false">Off</option>
            </Select>
          ) : (
            <Input
              id={`config-${settingKey}`}
              name="value"
              type={valueType === "integer" ? "number" : "text"}
              defaultValue={value}
            />
          )}
        </Field>

        <p className="font-mono text-xs text-muted-foreground">{settingKey}</p>
      </ActionForm>
    </div>
  );
}
