"use client";

import { useState } from "react";
import { createUserAction, setUserActiveAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/field";
import { ROLE_LABELS } from "@/domain/authz";
import type { Role } from "@/domain/types";

const ROLES: Role[] = ["PROVIDER", "INSPECTOR", "FIELD_MANAGER", "RCS_ADMIN", "IDR_MANAGER"];

export function CreateUserForm({
  regions,
  facilities,
}: {
  regions: { id: string; name: string }[];
  facilities: { id: string; name: string }[];
}) {
  const [role, setRole] = useState<Role>("INSPECTOR");
  const isProvider = role === "PROVIDER";

  return (
    <ActionForm action={createUserAction} submitLabel="Create account">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" required>
          <Input id="fullName" name="fullName" required />
        </Field>

        <Field label="Email address" htmlFor="email" required>
          <Input id="email" name="email" type="email" required />
        </Field>

        <Field label="Role" htmlFor="role" required>
          <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Job title" htmlFor="title">
          <Input id="title" name="title" placeholder="Residential Care Licensor" />
        </Field>

        {isProvider ? (
          <Field
            label="Adult family home"
            htmlFor="facilityId"
            required
            hint="A provider account sees only the homes it is linked to."
          >
            <Select id="facilityId" name="facilityId" required aria-describedby="facilityId-hint">
              <option value="">Choose a home</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            label="Region"
            htmlFor="regionId"
            hint="Staff see cases in their region. Leaving this blank restricts them to assigned cases only."
          >
            <Select id="regionId" name="regionId" defaultValue="" aria-describedby="regionId-hint">
              <option value="">No region</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <Field
        label="Initial password"
        htmlFor="password"
        required
        hint="At least 14 characters with upper case, lower case, a number and a symbol. In production this is replaced by Microsoft Entra ID sign-in."
      >
        <Input id="password" name="password" type="password" required aria-describedby="password-hint" />
      </Field>
    </ActionForm>
  );
}

export function ToggleUserForm({
  userId,
  active,
  self,
}: {
  userId: string;
  active: boolean;
  self: boolean;
}) {
  if (self) {
    return <span className="text-xs text-muted-foreground">Your account</span>;
  }

  return (
    <ActionForm
      action={setUserActiveAction}
      submitLabel={active ? "Deactivate" : "Reactivate"}
      variant={active ? "outline" : "secondary"}
      className="space-y-0"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
    </ActionForm>
  );
}
