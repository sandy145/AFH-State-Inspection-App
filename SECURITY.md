# Security

The security posture of the AFH Compliance Portal prototype: what is implemented,
what is deliberately stubbed, and what is missing.

> **This prototype has not completed a Washington State security review, a
> penetration test, or any formal assessment.** It must not hold real resident
> information or operate as a state system in its current form. What follows is an
> honest account, including the gaps.

---

## Threat model in one paragraph

The data here is sensitive on two counts: it concerns vulnerable adults living in
small residential homes, and it drives regulatory action against small businesses.
The three failures that matter most are one provider seeing another provider's
case, resident-identifying information leaking into a place it does not belong, and
the record of what was decided being altered after the fact. Everything below is
organized around those three.

---

## Implemented

### Tenant isolation

The rule: **a provider must never receive another provider's data.** Enforced in
three places on purpose, so a miss in one is caught by another.

1. `domain/authz.ts` — pure predicates, unit tested.
2. `data/scope.ts` — every list query for case data takes an actor and applies a
   `where` filter. There is no unscoped read path; a caller cannot ask for "all
   inspections", only for the ones this actor may see.
3. Server actions and detail pages re-check the predicate before rendering or
   mutating, because a direct URL is a different request from the list that
   would have linked to it.

A provider with no `FacilityUser` links matches nothing rather than everything —
the "match nothing" filter is `{ in: [] }` rather than a sentinel string, after an
integration test caught the sentinel producing a database cast error on `uuid`
columns.

Absent and forbidden are indistinguishable to the caller: both render the same
"Not available" page. Confirming that a record exists is itself a disclosure.

### Authentication and sessions

- scrypt password hashing (N=16384, r=8, p=1) with a per-user random salt and
  constant-time comparison. `services/identity.ts` is the only place a password is
  checked.
- Sign-in failures are uniform in wording and in timing: a verification always runs,
  even for an unknown account, so response time does not reveal which addresses
  exist.
- Session cookies are HttpOnly, `SameSite=Lax`, `Secure` outside development, with
  an absolute TTL (`SESSION_TTL_MINUTES`, default 60). The cookie holds a random
  opaque token; the database stores only its SHA-256.
- Sessions are revoked, never deleted, so sign-out survives in the record.
  Deactivating a user revokes their live sessions immediately rather than waiting
  for a cookie to expire.
- Password strength rules for local accounts: 14 characters minimum, mixed case,
  digit, symbol, no long runs.
- Rate limiting on sign-in: 5 attempts per account and 20 per source address in a
  15-minute window. Rate-limited attempts are audited.

### Authorization

Role-based, with region and facility scoping. Notably: an administrator can reach
records system-wide but **cannot issue citations** — regulatory determinations
belong to inspection staff, not to IT administrators. Only a Field Manager in the
region can approve an evidence-guard override, and never their own.

### Documents

- Object storage is never public. Downloads stream through a route that verifies
  the session, verifies case access, and refuses anything malware scanning flagged.
- Storage keys are random and never derived from a user-supplied filename, never
  rendered into a page, and never appear in a URL.
- The local driver refuses any key that would resolve outside the storage root.
- `Content-Disposition: attachment` with the filename sanitized of quotes and
  backslashes, plus `X-Content-Type-Options: nosniff`, so a provider-supplied name
  cannot break the header and a document cannot be sniffed into script.
- Upload validation requires the declared MIME type and the file extension to both
  be on the allow-list *and* to agree with each other, so `payload.exe` renamed to
  `.pdf` is refused either way. Size limit configurable, 25 MB default.
- Every download writes an `EVIDENCE_DOWNLOADED` audit row.

### Immutable audit trail

`data/audit.ts` exposes `record` and nothing else — no update, no delete, anywhere
in the codebase. An integration test asserts that the module exports nothing
matching `/update|delete|remove|edit/`. Rows capture actor, role, action, record,
previous value, new value, reason, IP and timestamp, with the case number
denormalized so a row stays readable on its own.

Audited among others: sign-in and failure, evidence uploaded, viewed, downloaded
and reviewed, every status change, citation created, finalized, modified and
rescinded, **blocked finalization attempts**, administrative overrides and their
approval, deadline and configuration changes, reassignment, and case closure.

### Data minimization

Findings reference `Resident A`, not a name. The field is labelled at the point of
entry with an instruction never to enter one. No resident name, date of birth or
identifier is modelled anywhere in the schema.

### Web hardening

- Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` and
  `frame-ancestors 'none'`, set in `next.config.ts` so they hold however it is
  hosted.
- CSRF: mutations are Next.js server actions, which are POST-only with an origin
  check, and the session cookie is `SameSite=Lax`.
- XSS: React escapes by default and the application contains no
  `dangerouslySetInnerHTML`.
- SQL injection: every query goes through Prisma with parameterized statements.
  There is no raw SQL in the request path.
- No sensitive data in URLs — no case content, no resident references, no tokens.
- Logs record identifiers and outcomes, never case content. The mail transport logs
  recipient and subject only.

### Email discipline

Notification email carries a subject and a link. Documents and case details never
leave the portal by email; recipients authenticate and read them here. This is
structural — `OutboundMail` has no attachment field to pass.

---

## Deliberately stubbed

| Control | State | To do |
|---|---|---|
| Malware scanning | Interface exists; records `PENDING`, never `CLEAN` | Wire Defender for Storage or ICAP; add quarantine |
| MFA | `mfaEnrolled` and `stepUpRequired()` present, no challenge | Comes with Entra ID |
| Encryption at rest | S3 driver sets `AES256`; local driver does not encrypt | Azure Blob with customer-managed key in Key Vault |
| Signed download URLs | Implemented for S3; local driver streams through the app | Blob user-delegation SAS, short expiry |
| Rate limiting | In-process fixed window; resets on deploy, per instance | Azure Cache for Redis or platform throttling |
| Secrets | `.env` file | Key Vault via managed identity |

---

## Known gaps

Things that are genuinely missing, not merely stubbed:

- **No penetration test or third-party assessment.**
- **No formal accessibility audit** against WCAG 2.1 AA with assistive technology.
- **No retention or deletion policy.** Nothing is ever deleted. Production needs a
  retention service driven by the DSHS schedule, with legal-hold support.
- **No public-records export or redaction tooling.**
- **No account lockout or credential-breach checking** beyond rate limiting.
- **No per-field encryption** for the most sensitive free text (evidence
  explanations, review reasons). Database-level encryption at rest is assumed from
  the platform.
- **No anomaly detection** on bulk download or unusual access patterns, though the
  audit data to build it is being collected.
- **No signed audit chain.** Audit rows are append-only by application discipline,
  not cryptographically tamper-evident. A production system holding regulatory
  evidence should consider hash chaining or an append-only store.
- **Session fixation on privilege change** is not specifically handled; there is no
  privilege escalation path in-app today, but role changes should rotate sessions.

---

## Development credentials

`prisma/seed.ts` throws if `APP_ENV` is `production`. `env.seedDemoAccounts` is
forced false in production regardless of the environment variable. The demo
password is documented in the README because it is a demonstration fixture and
publishing it is safer than implying it is a secret.

Before any deployment beyond a demonstration: seed no demo accounts, disable local
password authentication entirely rather than merely leaving it unused, set
`SESSION_SECRET` from a secret store, and set every deadline rule from the
applicable rule and policy.

## Reporting a vulnerability

This is a prototype in a personal repository, not a state system. Report issues
through the repository's issue tracker. Do not include real resident information,
real licence numbers, or anything you would not want public in a report.
