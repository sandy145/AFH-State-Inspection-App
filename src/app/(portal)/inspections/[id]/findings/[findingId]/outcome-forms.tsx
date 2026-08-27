"use client";

import { useState } from "react";
import {
  draftCitationAction,
  finalizeCitationAction,
  issueConsultationAction,
  resolveFindingAction,
} from "@/app/actions/outcomes";
import { requestEvidenceAction } from "@/app/actions/evidence";
import { ActionForm } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/status-badge";
import { SERVICE_METHOD_LABELS } from "@/domain/status";
import type { EvidenceReviewSummary } from "@/domain/evidence";

export function RequestEvidenceForm({ findingId }: { findingId: string }) {
  return (
    <ActionForm action={requestEvidenceAction} submitLabel="Send evidence request">
      <input type="hidden" name="findingId" value={findingId} />

      <Field label="Request title" htmlFor="title" required>
        <Input id="title" name="title" required placeholder="Residency agreement for Resident A" />
      </Field>

      <Field
        label="Instructions to the provider"
        htmlFor="instructions"
        required
        hint="Be specific about what will answer the question. The provider sees this verbatim."
      >
        <Textarea
          id="instructions"
          name="instructions"
          required
          aria-describedby="instructions-hint"
          placeholder="Please provide the signed residency agreement in effect for Resident A on the date of inspection."
        />
      </Field>

      <Field label="Documents or information requested" htmlFor="itemsRequested" required>
        <Input id="itemsRequested" name="itemsRequested" required placeholder="Signed residency agreement" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due date" htmlFor="dueAt" hint="Leave blank to use the configured default.">
          <Input id="dueAt" name="dueAt" type="date" aria-describedby="dueAt-hint" />
        </Field>

        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="NORMAL">
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Options</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allowMultipleFiles" defaultChecked className="h-4 w-4" />
          Allow multiple files
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="explanationRequired" className="h-4 w-4" />
          Require a written explanation as well as a file
        </label>
      </fieldset>
    </ActionForm>
  );
}

export function ResolveFindingForm({ findingId }: { findingId: string }) {
  return (
    <ActionForm action={resolveFindingAction} submitLabel="Resolve — no violation" variant="secondary">
      <input type="hidden" name="findingId" value={findingId} />
      <Field
        label="Basis for resolving"
        htmlFor="note"
        required
        hint="What in the record establishes that no violation occurred."
      >
        <Textarea
          id="note"
          name="note"
          required
          aria-describedby="note-hint"
          placeholder="The signed agreement provided by the provider contains the required information on page 3."
        />
      </Field>
    </ActionForm>
  );
}

export function ConsultationForm({ findingId }: { findingId: string }) {
  return (
    <ActionForm action={issueConsultationAction} submitLabel="Record consultation" variant="secondary">
      <input type="hidden" name="findingId" value={findingId} />

      {/* Policy guidance, shown to inform the inspector — never to decide. */}
      <Alert tone="info" title="Consultation is your determination">
        RCS policy guidance may make a first-time violation with minimal or no resident harm eligible
        for consultation. This system does not evaluate eligibility and does not decide. Record your
        own reasoning below.
      </Alert>

      <Field label="Issue" htmlFor="issueDescription" required>
        <Textarea id="issueDescription" name="issueDescription" required />
      </Field>

      <Field
        label="Why consultation was selected"
        htmlFor="rationale"
        required
        hint="Required. This becomes part of the case record."
      >
        <Textarea id="rationale" name="rationale" required aria-describedby="rationale-hint" />
      </Field>

      <Field label="Evidence relied upon" htmlFor="evidenceRelied">
        <Textarea id="evidenceRelied" name="evidenceRelied" />
      </Field>
    </ActionForm>
  );
}

export function DraftCitationForm({ findingId }: { findingId: string }) {
  return (
    <ActionForm action={draftCitationAction} submitLabel="Create draft citation" variant="outline">
      <input type="hidden" name="findingId" value={findingId} />

      <Field label="Deficient practice" htmlFor="deficientPractice" required>
        <Textarea id="deficientPractice" name="deficientPractice" required />
      </Field>

      <Field label="Inspector analysis" htmlFor="inspectorAnalysis" required>
        <Textarea id="inspectorAnalysis" name="inspectorAnalysis" required />
      </Field>

      <Field label="Evidence relied upon" htmlFor="evidenceRelied">
        <Textarea id="evidenceRelied" name="evidenceRelied" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Risk classification" htmlFor="riskLevel">
          <Select id="riskLevel" name="riskLevel" defaultValue="NOT_CLASSIFIED">
            <option value="NOT_CLASSIFIED">Not classified</option>
            <option value="LOW">Low</option>
            <option value="MODERATE">Moderate</option>
            <option value="HIGH">High</option>
            <option value="IMMEDIATE_JEOPARDY">Immediate jeopardy</option>
          </Select>
        </Field>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="planOfCorrectionRequired" className="h-4 w-4" />
            Plan of Correction required
          </label>
        </div>
      </div>
    </ActionForm>
  );
}

/**
 * Citation finalization — the guarded action (§9, §13).
 *
 * With unreviewed evidence the submit button is disabled and the reason is
 * rendered as text. An override reveals a justification field, and the server
 * enforces the same rule again regardless of what the browser sends.
 */
export function FinalizeCitationForm({
  citationId,
  summary,
  blocked,
  blockReason,
  canOverride,
  overrideNeedsApproval,
}: {
  citationId: string;
  summary: EvidenceReviewSummary;
  blocked: boolean;
  blockReason: string | null;
  canOverride: boolean;
  overrideNeedsApproval: boolean;
}) {
  const [overriding, setOverriding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Evidence review summary</p>
        <ul className="mt-2 space-y-0.5">
          <li>Provider submitted {summary.totalSubmissions} submission(s).</li>
          <li>{summary.reviewed} reviewed.</li>
          <li>{summary.accepted} accepted.</li>
          <li>{summary.insufficient} insufficient or wrong document.</li>
          <li className={summary.unreviewed > 0 ? "font-semibold text-red-800" : ""}>
            {summary.unreviewed === 0
              ? "No evidence remains unreviewed."
              : `${summary.unreviewed} submission(s) remain unreviewed: ${summary.unreviewedReferences.join(", ")}.`}
          </li>
        </ul>
      </div>

      {blocked ? (
        <Alert tone="critical" title="Finalization blocked">
          {blockReason}
        </Alert>
      ) : null}

      {blocked && canOverride ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={overriding}
            onChange={(event) => setOverriding(event.target.checked)}
          />
          <span>
            Finalize anyway using an authorized override.
            {overrideNeedsApproval
              ? " A Field Manager will have to countersign, and the override is written to the audit history."
              : " The override is written to the audit history."}
          </span>
        </label>
      ) : null}

      <ActionForm
        action={finalizeCitationAction}
        submitLabel={overriding ? "Finalize with override" : "Finalize citation"}
        variant={overriding ? "destructive" : "default"}
        disabled={blocked && !overriding}
        disabledReason={
          blocked && !overriding
            ? canOverride
              ? "Review every submission on this finding, or tick the override box above."
              : "Review every submission on this finding before finalizing."
            : undefined
        }
      >
        <input type="hidden" name="citationId" value={citationId} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Method of service" htmlFor="serviceMethod">
            <Select id="serviceMethod" name="serviceMethod" defaultValue="">
              <option value="">Not recorded yet</option>
              {Object.entries(SERVICE_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date served" htmlFor="servedAt">
            <Input id="servedAt" name="servedAt" type="date" />
          </Field>

          <Field
            label="Date received"
            htmlFor="receivedAt"
            hint="Correction and IDR deadlines are computed from this date."
          >
            <Input id="receivedAt" name="receivedAt" type="date" aria-describedby="receivedAt-hint" />
          </Field>
        </div>

        {overriding ? (
          <Field
            label="Written explanation for the override"
            htmlFor="overrideJustification"
            required
            hint="At least 20 characters. Recorded permanently in the audit history with your name and the time."
          >
            <Textarea
              id="overrideJustification"
              name="overrideJustification"
              required
              aria-describedby="overrideJustification-hint"
            />
          </Field>
        ) : null}
      </ActionForm>
    </div>
  );
}
