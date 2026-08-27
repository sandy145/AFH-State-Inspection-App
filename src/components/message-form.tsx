"use client";

import { postMessageAction } from "@/app/actions/evidence";
import { ActionForm } from "@/components/forms";
import { Field, Textarea } from "@/components/ui/field";

/**
 * Messages belong to a finding, never to a general inbox (§11). The internal
 * checkbox only renders for staff; the server refuses an internal note from a
 * provider regardless.
 */
export function MessageForm({ findingId, allowInternal = false }: { findingId: string; allowInternal?: boolean }) {
  return (
    <ActionForm action={postMessageAction} submitLabel="Send message" className="space-y-3 border-t pt-4">
      <input type="hidden" name="findingId" value={findingId} />

      <Field label="Message" htmlFor="body" required>
        <Textarea id="body" name="body" required placeholder="Write a message about this finding." />
      </Field>

      {allowInternal ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isInternal" className="h-4 w-4" />
          Internal note — not visible to the provider
        </label>
      ) : null}
    </ActionForm>
  );
}
