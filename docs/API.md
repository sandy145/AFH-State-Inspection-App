# Interfaces

The portal is a server-rendered application: mutations are Next.js **server
actions**, not a public HTTP API. This document describes those actions, the one
HTTP route that exists, and the service interfaces a DSHS integration would
implement.

There is no public REST or GraphQL surface, and adding one should be a deliberate
decision — every rule in this system assumes an authenticated actor resolved from a
session, and an API would need to re-establish that.

---

## Conventions

Every server action:

1. resolves the signed-in user, returning an error state if the session has expired;
2. loads the target record's authorization slice and re-checks the domain predicate;
3. delegates to the data layer, which asserts the state transition and writes the
   change, timeline entry and audit row in one transaction;
4. returns `{ success }` or `{ error }` — never an exception page — so the form can
   announce the result in an `aria-live` region.

```ts
interface ActionState {
  error?: string;
  success?: string;
}
```

Authorization failures and missing records are indistinguishable by design.

---

## Evidence (`src/app/actions/evidence.ts`)

### `requestEvidenceAction`
Inspector asks a provider for documents. Requires `canRequestEvidence`.

| Field | Type | Notes |
|---|---|---|
| `findingId` | uuid | required |
| `title` | string | min 3 |
| `instructions` | string | min 10; the provider sees this verbatim |
| `itemsRequested` | string | min 3 |
| `dueAt` | date | optional; falls back to the `EVIDENCE_REQUEST_DUE` rule |
| `priority` | `LOW \| NORMAL \| HIGH \| URGENT` | default `NORMAL` |
| `allowMultipleFiles` | checkbox | default on |
| `explanationRequired` | checkbox | requires written explanation with the files |

Moves the finding to `EVIDENCE_REQUESTED`, materializes a deadline, notifies the
provider in-app and by email (link only).

### `submitEvidenceAction`
Provider uploads evidence. Requires `canSubmitEvidence`.

| Field | Type | Notes |
|---|---|---|
| `evidenceRequestId` | uuid | required |
| `files` | File[] | at least one; type and extension must agree and be allow-listed |
| `providerExplanation` | string | required when the request asked for one |
| `supersedesSubmissionId` | uuid | optional; marks the earlier submission superseded |

Writes files to storage first, then commits the submission, document versions,
receipt, audit row, timeline entries and notifications together. Redirects to the
receipt. Never overwrites: a repeat filename becomes version *n+1* with a
`previousVersionId` chain.

### `reviewEvidenceAction`
Inspector records a determination. Requires `canReviewEvidence`.

| Field | Type | Notes |
|---|---|---|
| `submissionId` | uuid | required |
| `outcome` | `ACCEPTED \| PARTIALLY_ACCEPTED \| INSUFFICIENT \| WRONG_DOCUMENT \| ADDITIONAL_INFO_REQUIRED \| SUPERSEDED \| NOT_APPLICABLE` | |
| `reason` | string | **required for every outcome except `ACCEPTED`** |

Earlier determinations are retained with `isCurrent = false` rather than edited.

### `postMessageAction`
A message on a finding. `isInternal` is refused for providers.

---

## Outcomes (`src/app/actions/outcomes.ts`)

| Action | Who | Effect |
|---|---|---|
| `createFindingAction` | assigned staff | New finding; `residentIdentifier` must be a redacted reference |
| `resolveFindingAction` | assigned staff | `RESOLVED_NO_VIOLATION`; basis required |
| `issueConsultationAction` | inspector | Consultation; **rationale required**, never computed |
| `draftCitationAction` | inspector | Draft citation. Always permitted |
| `finalizeCitationAction` | inspector | **Guarded** — see below |
| `approveOverrideAction` | Field Manager in region | Countersigns an override |
| `rescindCitationAction` | inspector | Rescinds; reason required |
| `submitCorrectionAction` | provider | Attestation or Plan of Correction with e-signature |
| `reviewCorrectionAction` | staff | Accept, request more, require verification, or record back in compliance |
| `requestIDRAction` | provider | Opens a dispute; does not touch correction status |
| `advanceIDRAction` | staff | Moves the dispute; decision required to complete |
| `scheduleFollowUpAction` / `completeFollowUpAction` | assigned staff | Follow-up verification |
| `setInspectionStatusAction` | assigned staff | Case status, via the state machine |

### `finalizeCitationAction` — the guarded path

```
evaluateCitationGuard(submissions)
  → blocked when any non-withdrawn submission has no current review outcome
```

| Field | Type | Notes |
|---|---|---|
| `citationId` | uuid | required |
| `serviceMethod` | `US_MAIL \| CERTIFIED_MAIL \| HAND_DELIVERY \| EMAIL \| FAX \| PORTAL_ONLY` | optional |
| `servedAt` / `receivedAt` | date | correction and IDR deadlines compute from `receivedAt` |
| `overrideJustification` | string | only when overriding; **minimum 20 characters** |

Without a justification and with unreviewed evidence: refused, and a
`CITATION_FINALIZATION_BLOCKED` audit row is written. With one: finalized,
`overrideUsed = true`, an `ADMINISTRATIVE_OVERRIDE` audit row recorded, and held
`overridePendingApproval` when policy requires a Field Manager signature and the
actor is not one.

---

## Administration (`src/app/actions/admin.ts`)

`RCS_ADMIN` only, re-checked per request.

| Action | Notes |
|---|---|
| `updateDeadlineRuleAction` | **Reason required.** Audits previous and new value. Does not move deadlines already computed |
| `updateConfigurationAction` | Policy toggles; audited |
| `createUserAction` | Provider accounts must be linked to a home; password strength enforced |
| `setUserActiveAction` | Deactivation revokes live sessions immediately |
| `upsertRegulationAction` | WAC/RCW reference data |

---

## HTTP route

### `GET /documents/{documentVersionId}`

The only HTTP endpoint. Streams a stored document after checking, in order:
session, case access, and scan status. Returns `404` for both "does not exist" and
"not yours", `403` for a file flagged `INFECTED`. Writes an `EVIDENCE_DOWNLOADED`
audit row. Storage keys are never exposed.

```
Content-Type: <stored mime type>
Content-Disposition: attachment; filename="<sanitized>"
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

---

## Service interfaces for DSHS integration

Implement these to attach real systems; nothing above changes.

```ts
interface FacilityDirectoryService {
  readonly source: string;
  listFacilities(): Promise<FacilityRecord[]>;
  findByLicenseNumber(licenseNumber: string): Promise<FacilityRecord | null>;
}

interface LicensingSystemService {
  readonly source: string;
  getLicenseStatus(licenseNumber: string): Promise<LicenseStatus | null>;
}

interface DocumentStorageService {
  readonly driver: string;
  put(input: { body: Buffer; fileName: string; mimeType: string }): Promise<StoredObject>;
  get(storageKey: string): Promise<Buffer>;
  signedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string | null>;
}

interface MailTransport {
  readonly driver: string;
  send(mail: OutboundMail): Promise<void>;   // no attachment parameter, deliberately
}

interface MalwareScanService {
  readonly name: string;
  readonly scansSynchronously: boolean;
  scan(input: { storageKey: string; fileName: string; sizeBytes: number }): Promise<ScanVerdict>;
}
```

Identity is `services/identity.ts`; replacing it with Entra ID means implementing
`verifyCredentials` against MSAL and removing the password path. `User.externalId`
already holds the subject claim.

---

## Domain functions worth calling directly

Pure, no I/O, safe to reuse in a job or a report:

```ts
evaluateCitationGuard(submissions): CitationGuardResult
summarizeEvidenceReview(submissions): EvidenceReviewSummary
assertOverrideValid({ justification, fieldManagerApprovalRequired, actorIsFieldManager })
computeDeadline(rule, triggeredAt, { holidays }): ComputedDeadline
describeDeadline(dueAt, now, { satisfiedAt, dueSoonDays }): DeadlineDescription
canViewInspection(actor, inspection): boolean
assertTransition(table, from, to, entityLabel): void
```
