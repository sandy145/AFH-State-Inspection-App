# AFH Compliance Portal — Implementation Plan

Washington State DSHS / Residential Care Services (RCS)
Adult Family Home Inspection & Evidence Portal — **prototype MVP**.

> This is a prototype. It has **not** been through Washington State security review,
> accessibility certification, or OCIO/OCS approval, and it is not an authoritative
> licensing record. See `ARCHITECTURE.md` and `SECURITY.md`.

---

## 1. Product principle

Two questions drive every design decision:

**Provider:** *What is the State asking me for, when is it due, did they receive it,
has anyone reviewed it, and what was decided?*

**State:** *What did we request, what did the provider submit, when, who reviewed it,
what did we decide, and why?*

Anything that does not help answer one of those is out of MVP scope.

## 2. Non-goals

- The portal is **not** the source of truth for licensing. Facility, license and
  identity records synchronize from DSHS systems through mock integration services.
- The software makes **no** regulatory decisions. It never decides whether a
  violation occurred, whether a matter qualifies for consultation, whether evidence
  proves compliance, or whether enforcement is warranted. It surfaces configured
  deadlines and policy guidance; a human decides.
- Portal delivery does **not** replace statutory service. Service method, issue date,
  and receipt date are recorded explicitly so the portal runs alongside existing
  mail/email/hand-delivery requirements.
- No AI in the compliance path.

## 3. Regulatory frame

Built around chapter 70.128 RCW and chapter 388-76 WAC. Notably
RCW 70.128.070 (inspections), RCW 70.128.090 (inspection reports),
WAC 388-76-10920 (inspection/investigation reports),
WAC 388-76-10930 (plan/attestation of correction),
WAC 388-76-10990 and RCW 70.128.167 (Informal Dispute Resolution).

Deadline lengths, business-day rules and holidays are **configuration rows**
(`DeadlineRule`, `SystemConfiguration`, `Holiday`), not constants in code, so RCS can
change them without a deployment. Every administrative change to a rule or to an
individual deadline is audited.

## 4. Architecture

```
Next.js 15 (App Router, RSC) + TypeScript + Tailwind + shadcn/ui
        │
        ├── app/          route groups per persona; server actions for mutations
        ├── domain/       PURE business rules — no DB, no I/O, fully unit tested
        ├── services/     integration seams (storage, mail, identity, directory…)
        ├── data/         Prisma access + authorization-scoped query helpers
        └── prisma/       schema, migrations, seed
                │
        PostgreSQL 16 (Prisma ORM, parameterized everywhere)
        Object storage behind DocumentStorageService (local FS ▸ MinIO/S3 ▸ Azure Blob)
```

**Why a pure `domain/` layer.** The rules that matter legally — the citation guard,
deadline computation, state-machine transitions, access scoping — are pure functions
over plain objects. They are unit-testable without a database, they cannot be
accidentally bypassed by a stray query, and they are the same functions the UI uses to
decide what to render and the server actions use to decide what to allow.

**Integration seams** (§39). Each is an interface with a local implementation:

| Service | Local (MVP) | Production target |
|---|---|---|
| `IdentityService` | scrypt password + DB session, MFA hooks | Microsoft Entra ID (staff) / Entra External ID (providers) |
| `DocumentStorageService` | filesystem driver, S3 driver | Azure Blob Storage + SAS |
| `NotificationService` | DB rows + SMTP capture (MailHog) | Azure Communication Services |
| `FacilityDirectoryService` | seeded fixture | DSHS facility directory |
| `LicensingSystemService` | seeded fixture | DSHS licensing system of record |
| `MalwareScanService` | interface + always-pending stub | Defender / ICAP scanner |

## 5. Roles and authorization

| Role | Scope |
|---|---|
| `PROVIDER` | Only facilities they are linked to via `FacilityUser`. |
| `INSPECTOR` | Inspections assigned to them; facilities in their region (read). |
| `FIELD_MANAGER` | Everything in their region; may reassign, approve overrides. |
| `RCS_ADMIN` | System-wide configuration, users, facilities, reference data. |
| `IDR_MANAGER` | Post-MVP; IDR queue only. Modeled, not surfaced. |

Authorization is enforced in three places, deliberately redundant:

1. `domain/authz.ts` — pure predicates (`canViewInspection`, `canReviewEvidence`, …).
2. `data/scope.ts` — every list query takes an actor and applies a `where` scope.
   There is no unscoped read path for case data.
3. Server actions re-check the predicate before mutating, and audit the attempt.

Tenant isolation rule: a provider's queries are always filtered by the set of facility
IDs from `FacilityUser`. A provider can never receive a row from another facility, and
document downloads re-verify facility linkage at fetch time, not just at list time.

## 6. State machines

**Inspection:** `DRAFT → IN_PROGRESS → EVIDENCE_REVIEW → PENDING_REPORT → REPORT_ISSUED
→ CORRECTION_PERIOD → FOLLOW_UP → CLOSED` (plus `CANCELLED`).

**Finding:** `DRAFT → POTENTIAL_FINDING → EVIDENCE_REQUESTED → PROVIDER_RESPONDED →
UNDER_INSPECTOR_REVIEW → ADDITIONAL_INFO_REQUESTED →` one of
`RESOLVED_NO_VIOLATION | RESOLVED_CONSULTATION | CITATION_ISSUED` →
`CORRECTION_PENDING → CORRECTION_UNDER_REVIEW → CORRECTED_BACK_IN_COMPLIANCE` with
`IDR_PENDING`, `MODIFIED_FOLLOWING_IDR`, `CITATION_RESCINDED`, `CLOSED`.

**Evidence submission:** `SUBMITTED → UNDER_REVIEW → {ACCEPTED, PARTIALLY_ACCEPTED,
INSUFFICIENT, WRONG_DOCUMENT, ADDITIONAL_INFO_REQUIRED, SUPERSEDED, NOT_APPLICABLE}`.

**Citation:** `DRAFT → FINALIZED → CORRECTION_PENDING → CORRECTION_UNDER_REVIEW →
CORRECTED` with `RESCINDED` / `MODIFIED` reachable from IDR outcomes.

**Correction:** `NOT_SUBMITTED → DRAFT → SUBMITTED → UNDER_REVIEW →
ADDITIONAL_INFO_REQUESTED → ACCEPTED → CORRECTION_VERIFICATION_REQUIRED → CORRECTED`,
plus `OVERDUE` as a derived flag.

**IDR runs on its own axis.** A citation may be `CORRECTION_PENDING` *and*
`IDR_PENDING` at the same time; IDR state lives on `IDRRequest`, never folded into
correction status.

Transitions are declared as tables in `domain/state-machines.ts`. An illegal
transition throws before any write, and every legal one emits a timeline event and an
audit event in the same transaction as the state change.

## 7. The citation finalization guard (§9)

The feature the product exists for.

```
finalizeCitation(finding) is blocked when
  ∃ EvidenceSubmission attached to the finding whose review outcome is null
```

Blocked means blocked: the server action refuses, the button is disabled with the
reason rendered as text (not color alone), and the finding detail shows the banner
`PROVIDER EVIDENCE SUBMITTED — REVIEW REQUIRED`.

An override exists only because policy may permit one. It requires a written
justification, records actor + timestamp + IP, writes an immutable `AuditEvent` of
type `ADMINISTRATIVE_OVERRIDE`, and — when
`SystemConfiguration.overrideRequiresFieldManagerApproval` is true — stays pending
until a Field Manager approves. Every override increments the **Evidence Review
Integrity** metric (§37), whose target is zero.

## 8. Deadline engine (§33)

`domain/deadlines.ts`, pure. Supports calendar days and working days, a configurable
holiday calendar, and event-based triggers (`REPORT_RECEIVED`, `CITATION_ISSUED`,
`EVIDENCE_REQUESTED`, …). Rules are rows: *trigger event + offset + unit + rule key*.
Renders `Due August 31 · 4 days remaining`, `Due Today`, `Overdue by 2 days` — always
with text, never color alone. Deadline edits are audited with previous and new value.

## 9. Data model

Prisma, PostgreSQL, UUID primary keys, `createdAt`/`updatedAt` throughout. Models:
`User, Role(enum), Organization, Region, Facility, FacilityUser, Inspection,
InspectionAssignment, Regulation, Finding, EvidenceRequest, EvidenceSubmission,
EvidenceFile, EvidenceReview, FindingMessage, Consultation, Citation, Correction,
CorrectionEvidence, IDRRequest, FollowUp, Notification, Deadline, DeadlineRule,
Holiday, AuditEvent, Document, DocumentVersion, SystemConfiguration, Session,
TimelineEvent, Receipt`.

Regulatory records are never destructively deleted. Soft deletion exists only for
`User` (deactivation) and draft-stage records. Evidence is append-only: a re-upload
creates a new `DocumentVersion` with `previousVersionId`, a checksum, and the old
version retained.

## 10. Critical business-rule tests (§43)

Pure-domain tests (no DB) plus integration tests against PostgreSQL:

1. Provider A cannot read Provider B's facility, inspection, finding, or document.
2. Inspector cannot read an inspection outside their assignment/region.
3. Evidence submission writes an audit event.
4. Evidence submission issues a receipt with a stable submission ID.
5. Evidence cannot be overwritten — a second upload versions, never replaces.
6. Citation finalization is blocked while any submission is unreviewed.
7. Citation finalization succeeds once every submission is reviewed.
8. Override without justification is rejected; with justification it audits.
9. Deadline math: calendar days.
10. Deadline math: working days, skipping weekends and configured holidays.
11. Provider can submit a correction; attestation captures signer and timestamp.
12. Opening an IDR does not alter correction status.
13. Every declared state transition emits an audit event; illegal transitions throw.

## 11. Build order

Follows the §42 priority list. Milestones, each ending in lint + typecheck + test:

- **M1** scaffold, schema, migration, domain layer + its tests
- **M2** auth, RBAC, sessions, login, layout shell
- **M3** facilities, inspections, findings, inspection detail tabs
- **M4** evidence requests, provider upload, receipts, versioning
- **M5** review queue, side-by-side reviewer, **citation guard**
- **M6** consultation, citation, correction, IDR, follow-up
- **M7** dashboards ×3, timeline, audit history, notifications
- **M8** reporting incl. Evidence Review Integrity, admin configuration
- **M9** docs, seed scenario, Docker Compose, accessibility pass

## 12. Accessibility (§25)

WCAG 2.1 AA target. Semantic landmarks, labelled controls, visible focus rings,
`aria-live` for async results, real `<table>` semantics with scoped headers, status
communicated by **icon + text + color** so color is never the sole channel, and no
keyboard trap in dialogs.
