# Architecture

How the AFH Compliance Portal prototype is built, and what it would take to turn it
into a Washington State production service.

> **This prototype does not meet Washington State certification, security or
> accessibility requirements.** Nothing in this document should be read as a claim
> that it does. It is an account of what exists and an honest inventory of what is
> missing.

---

## 1. Shape of the system

```
┌─────────────────────────────────────────────────────────────┐
│ Next.js 15 (App Router, React Server Components)            │
│                                                             │
│  app/          routes per persona, server actions           │
│  components/   UI primitives                                │
├─────────────────────────────────────────────────────────────┤
│ domain/        PURE business rules — no I/O                 │
│    authz · deadlines · evidence (the guard) · state machines │
├─────────────────────────────────────────────────────────────┤
│ data/          Prisma access, scoped queries, transactions   │
│ services/      integration seams                             │
├─────────────────────────────────────────────────────────────┤
│ PostgreSQL 16          Object storage        SMTP            │
└─────────────────────────────────────────────────────────────┘
```

### Why a pure domain layer

The rules that carry legal weight are plain functions over plain objects, with no
database, no network and no framework:

- `domain/authz.ts` — who may see and do what
- `domain/evidence.ts` — the citation finalization guard, review and upload rules
- `domain/deadlines.ts` — calendar and working-day arithmetic over configuration
- `domain/state-machines.ts` — the legal lifecycle of every record

Three consequences. They are unit-testable without infrastructure. The UI, the
server actions and the data layer all consult the *same* function, so the disabled
button and the server-side refusal can never disagree. And a stray query cannot
bypass a rule, because the rule is not expressed as a query.

`src/domain` may not import a runtime value from `@prisma/client` — types only.

### Request flow for a mutation

1. A form posts to a server action.
2. The action resolves the session, loads the record's authorization slice, and
   re-checks the domain predicate. Being signed in is not the same as being
   entitled to a record, and the page that rendered the form is a different
   request.
3. The data layer opens a transaction, asserts the state transition, writes the
   change, and writes the timeline entry and audit row **in the same transaction**.
   A change with no audit row and an audited change that rolled back are both wrong.
4. Notification emails dispatch after commit. A mail failure must never undo a
   submission.

## 2. Data model

Twenty-eight models, UUID keys, `createdAt`/`updatedAt` throughout. The spine:

```
Region ──< Facility ──< FacilityUser >── User
              │
              └──< Inspection ──< Finding ──< EvidenceRequest ──< EvidenceSubmission
                                    │                                   │
                                    │                                   ├──< EvidenceFile >── DocumentVersion
                                    │                                   ├──< EvidenceReview
                                    │                                   └──  Receipt
                                    ├──  Consultation
                                    ├──  Citation ──< Correction ──< CorrectionEvidence
                                    │        ├──< IDRRequest
                                    │        └──< FollowUp
                                    ├──< FindingMessage
                                    └──< Deadline
```

Rules the schema enforces or encodes:

- **Evidence is append-only.** A re-upload creates a new `DocumentVersion` pointing
  at its predecessor via `previousVersionId`, with its own SHA-256; the old version
  stays current-flagged `false` and downloadable. A corrected submission
  *supersedes* rather than replaces.
- **Receipts are denormalized.** A `Receipt` copies the case number, home name,
  finding reference, file names and submitter name at issue time, so it still reads
  correctly if surrounding records change.
- **Audit rows are append-only.** `data/audit.ts` exports `record` and nothing
  else. There is no update or delete path in the codebase and none should be added.
  Rows carry actor email and role denormalized for the same reason receipts do.
- **IDR is a separate axis.** A citation can be `CORRECTION_PENDING` while an
  `IDRRequest` is open. `advanceIDR` asserts after its transaction that no
  correction row changed.
- **Resident identifiers, not names.** `Finding.residentIdentifier` holds
  "Resident A". The UI says so at the point of entry.
- **Service is recorded, not assumed.** Inspections and citations carry issue date,
  service method, receipt date and portal-notification date as distinct columns.
  Deadlines compute from the date *received*.

## 3. Integration seams

Each is an interface with a local implementation and a documented production
target. Business logic never learns which is in use.

| Interface | Local | Production target |
|---|---|---|
| `IdentityService` (`services/identity.ts`) | scrypt password + DB session; MFA hooks present | Microsoft Entra ID (staff), Entra External ID (providers) |
| `DocumentStorageService` (`services/storage.ts`) | filesystem or S3/MinIO driver | Azure Blob Storage with SAS |
| `MailTransport` (`services/mail.ts`) | console log or SMTP | Azure Communication Services |
| `MalwareScanService` (`services/malware-scan.ts`) | records `PENDING`, never `CLEAN` | Defender for Storage or an ICAP scanner |
| `FacilityDirectoryService` (`services/external-systems.ts`) | seeded fixture | DSHS facility directory |
| `LicensingSystemService` (`services/external-systems.ts`) | seeded fixture | DSHS licensing system of record |

`NotificationService` (`data/notifications.ts`) sits above the mail transport and
enforces the rule that email carries a subject and a link, never a document.

## 4. Configuration over code

`DeadlineRule`, `Holiday` and `SystemConfiguration` are tables. Nothing in the
application hard-codes a regulatory interval; it asks for a rule by key and applies
whatever is configured. RCS edits these in Admin → Deadlines, every edit demands a
reason, and the audit row carries the previous and new value.

Editing a rule does **not** move deadlines already computed on open cases. That is
deliberate — a deadline a provider was told about should not move under them — and
the admin screen says so.

**The shipped intervals are placeholders.** They are marked as such in
`prisma/seed-data.ts` and on the admin screen. Set them from the applicable WAC,
RCW and RCS policy before any real use.

---

## 5. What production would take

### Identity — Microsoft Entra ID

Two populations with different needs:

- **State employees.** Entra ID with conditional access, MFA, and group-to-role
  mapping (`INSPECTOR`, `FIELD_MANAGER`, `RCS_ADMIN`, `IDR_MANAGER`). Groups become
  the source of truth for role; `User.role` becomes a cached projection.
- **Providers.** External identities (Entra External ID / B2C) with self-service
  password reset and MFA. Provider-to-home linkage stays in `FacilityUser`,
  provisioned from the licensing system rather than self-asserted.

The schema is ready: `User.externalId` holds the subject claim, `User.mfaEnrolled`
exists, and `stepUpRequired()` marks which actions warrant a step-up challenge
(overriding the evidence guard, managing users). Replacing local auth means
implementing `IdentityService` against MSAL and deleting the password path — no
schema migration.

Local passwords must be disabled entirely in production, not merely unused.

### Hosting on Azure

| Component | Service | Notes |
|---|---|---|
| Application | App Service or Container Apps | Multiple instances behind Front Door |
| Database | Azure Database for PostgreSQL Flexible Server | Private endpoint, TLS required, no public access |
| Documents | Azure Blob Storage | Private container, customer-managed key, short-lived user-delegation SAS |
| Secrets | Azure Key Vault | Managed identity; no connection strings in app settings |
| Mail | Azure Communication Services | Or the approved state notification service |
| Telemetry | Application Insights | With the scrubbing rules in §7 below |
| Cache / rate limiting | Azure Cache for Redis | Replaces the in-process limiter |
| Jobs | Container Apps job or Functions | Deadline reminders, retention sweeps |

Data residency: every service pinned to a US region, with the state's approved
region as the constraint. Blob and database geo-replication must stay inside that
boundary.

### Data residency, retention and public records

- Adult family home inspection material is subject to Washington's Public Records
  Act and to DSHS retention schedules. This prototype **deletes nothing** and
  implements no retention policy. Production needs a retention service driven by
  the applicable schedule, with legal-hold support, and an export path for records
  requests that can redact resident-identifying material.
- The prototype already minimizes resident data — redacted identifiers rather than
  names — which shrinks what has to be redacted later.
- Audit records should outlive the case records they describe, and their retention
  should be set separately.

### Disaster recovery and backup

- Point-in-time restore on PostgreSQL, tested by rehearsal rather than assumed.
- Blob soft-delete plus versioning, with immutability policies on evidence
  containers so a stored file cannot be altered within its retention window.
- Documented RPO/RTO agreed with the business. Evidence and audit are the
  irreplaceable data; application state can be rebuilt.
- Restore rehearsals should include verifying a receipt still resolves to its
  submission and that document checksums still match.

### Monitoring

- Availability and latency per route; alert on the review queue failing to load,
  because that is where the work backs up.
- Business alerts, not just technical: any `ADMINISTRATIVE_OVERRIDE`, any citation
  finalized with `overrideUsed`, evidence unreviewed beyond the configured target,
  and a rising `CITATION_FINALIZATION_BLOCKED` rate.
- Failed sign-ins by address, and any spike in `EVIDENCE_DOWNLOADED` by one actor.

### Document malware scanning

`MalwareScanService` currently records `PENDING` and never `CLEAN` — an unscanned
file must never be recorded as safe. Production wires Defender for Storage or an
ICAP scanner, and the surrounding workflow already exists: `INFECTED` blocks
download at the route, and the review UI shows scan state per file. Add a
quarantine container and notify the submitting provider when a file is rejected.

### Integration with existing DSHS systems

The portal is not the source of truth for licensing. Synchronization should be
inbound and idempotent, matching on `externalId`:

- **Facilities and licences** — nightly or event-driven from the facility
  directory. Licence status is displayed from `LicensingSystemService`, never
  edited here.
- **Staff identities** — from Entra ID group membership.
- **Provider-to-home linkage** — from the licensing system, so a change of
  ownership immediately changes who can see the case.
- **Inspection history** — closed cases from the existing system, read-only, so
  inspectors see prior history without this becoming the archive.

Outbound, the portal should publish case outcomes back to the system of record
rather than becoming a parallel record of citations.

### Security and accessibility review

Both still to do. See [SECURITY.md](SECURITY.md) for the control-by-control
position and the gap list. Accessibility needs an audit against WCAG 2.1 AA with
assistive technology, not just the automated checks and manual keyboard testing
done here.

## 6. Deliberately deferred

- **Full inspection workspace on a tablet** (checklists, photographs, offline
  capture, observations tagged to WAC in the field). The model already supports
  findings created and evidence requested before leaving the home; the MVP focuses
  on the post-inspection loop where evidence actually goes missing.
- **IDR program team.** `IDRRequest` carries its own status, method, schedule and
  decision, and the `IDR_MANAGER` role exists, so a separate team can take this
  over without a migration.
- **Enforcement actions** beyond citation and correction.
- **AI assistance.** If it ever appears, it is confined to summarizing documents,
  finding relevant pages, drafting text and searching regulatory references. It
  must never evaluate compliance, and no compliance path may depend on it.

## 7. Logging discipline

Application logs record identifiers and outcomes, never case content. The mail
transport logs recipient and subject only. Resident identifiers, evidence
explanations, review reasons and citation text stay out of logs and telemetry — in
Application Insights this means an explicit telemetry processor, since default
request logging captures query strings. No sensitive value appears in a URL
anywhere in the application, which is what makes that tractable.
