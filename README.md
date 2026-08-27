# AFH Compliance Portal

A working prototype of an inspection and evidence portal for the Washington State
Department of Social and Health Services (DSHS), Residential Care Services (RCS),
Adult Family Home licensing process.

> **This is a prototype.** It is not an authoritative licensing record, it has not
> completed Washington State security, privacy or accessibility review, and it does
> not replace any legally required method of service. Do not enter real resident
> information. See [SECURITY.md](SECURITY.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

---

## The problem

Today a good deal of the exchange between an adult family home provider and a state
inspector happens over email. Evidence gets buried in threads, attachments get
overlooked, and nobody has a single view of what was asked for and what came back.
The worst outcome is a citation issued on a finding where the provider had already
sent evidence that nobody read.

This portal makes every inspection a single case record. Every potential finding,
request for evidence, provider response, uploaded document, inspector review,
consultation, citation, correction, dispute and resolution is traceable from one
place.

Two questions drive the whole design:

**For the provider** — what is the State asking for, when is it due, did they get
it, has anyone reviewed it, and what was decided?

**For the State** — what did we request, what did the provider submit, when, who
reviewed it, what did we decide, and why?

## The safeguard at the centre of it

**A citation cannot be finalized while provider evidence attached to that finding
is still unreviewed.**

The finding shows `PROVIDER EVIDENCE SUBMITTED — REVIEW REQUIRED`, names each
submission still waiting, and renders the finalize control disabled with the reason
in text. An override exists because policy may permit one, and it is expensive on
purpose: a written justification of at least twenty characters, the actor and
timestamp recorded, an immutable `ADMINISTRATIVE_OVERRIDE` audit row, and — where
configured — a Field Manager's countersignature.

Blocked attempts are audited too. A refusal is the record that the safeguard
worked, and it feeds the **Evidence Review Integrity** metric on the Field Manager
dashboard, whose target is zero.

![Citation guard blocking finalization](docs/screenshots/06-citation-guard.png)

## What the software does not do

- It makes **no regulatory decisions**. It never decides whether a violation
  occurred, whether a matter qualifies for consultation, whether evidence proves
  compliance, or whether enforcement is warranted. Policy guidance is displayed to
  inspectors; the determination is theirs and is recorded as theirs.
- It is **not the licensing system of record**. Homes, licences and identities
  originate in DSHS systems and synchronize inbound.
- It does **not replace statutory service**. Issue date, method of service, receipt
  date, portal notification date and responsible person are recorded separately so
  the portal runs alongside existing mail, email and hand-delivery requirements.
- There is **no AI in the compliance path**.

---

## Running it

### Prerequisites

Node.js 20 or newer, and Docker (for PostgreSQL, object storage and mail capture).

### Quick start

```bash
git clone https://github.com/sandy145/AFH-State-Inspection-App.git
cd AFH-State-Inspection-App

cp .env.example .env          # then set SESSION_SECRET, see below
docker compose up -d          # PostgreSQL, MinIO, MailHog
npm install
npx prisma migrate dev        # creates the schema
npm run seed                  # demo data, development only
npm run dev
```

Open <http://localhost:3000>.

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Without Docker

Any PostgreSQL 14+ will do — point `DATABASE_URL` at it. Leave `STORAGE_DRIVER=local`
and `MAIL_DRIVER=log` and neither MinIO nor MailHog is needed: files go to
`.storage/` and notification emails print a line to the console.

### What Docker Compose brings up

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL 16 | 5432 | Application and test databases |
| MinIO | 9000 (API), 9001 (console) | S3-compatible object storage, standing in for Azure Blob |
| MailHog | 1025 (SMTP), 8025 (web) | Captures notification email so nothing is actually sent |

MinIO console credentials are `minioadmin` / `minioadmin`. The `afh-evidence`
bucket is created private on first start.

## Demo accounts

Seeded **only** when `APP_ENV` is `development` or `test`. `prisma/seed.ts` refuses
to run in production, and `SEED_DEMO_ACCOUNTS` is forced off there regardless of
what the environment says.

| Email | Role | Sees |
|---|---|---|
| `inspector@example.com` | Inspector — Jane Doe | Region 2 cases; leads AFH-2026-001284 |
| `inspector2@example.com` | Inspector — Marcus Lee | Leads AFH-2026-001290, the blocked-citation case |
| `manager@example.com` | Field Manager — John Smith | All Region 2 cases, override approvals |
| `provider@example.com` | Provider — Maria Santos | Sunrise Adult Family Home only |
| `provider3@example.com` | Provider — Amelia Wright | Harbor View Adult Family Home only |
| `admin@example.com` | RCS Administrator | Users, homes, reference data, configuration |

Password for every demo account: `AfhPortal!Dev2026` (override with `DEMO_PASSWORD`).

These credentials are development-only and are documented here deliberately. They
must never exist in a deployed environment; see [SECURITY.md](SECURITY.md).

## The two seeded scenarios

**AFH-2026-001284 / F-004 — the case the product was built for.** An inspector
cannot confirm a required element of a residency agreement, requests it, the
provider uploads it, the inspector reviews and accepts it, and the finding resolves
as *no violation*. Sign in as `provider@example.com` to see the provider's side and
as `inspector@example.com` for the State's.

**AFH-2026-001290 / F-002 — the guard.** The provider sent version 2 of a
medication record and nobody has reviewed it. Sign in as `inspector2@example.com`,
open the case, open F-002, and try to finalize the draft citation. The system
refuses and records the refusal.

`npm run seed` asserts both states rather than describing them, so a broken guard
fails the seed.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run verify` | Lint, typecheck and the full test suite |
| `npm test` | All tests |
| `npm run test:domain` | Business-rule tests only (no database needed) |
| `npm run test:integration` | Integration tests (needs PostgreSQL) |
| `npm run seed` | Reseed demo data |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:studio` | Prisma Studio |
| `npm run test:e2e` | Browser smoke test against a running instance |
| `npm run reminders` | Send due-soon and overdue reminders (run on a schedule) |
| `npm run screenshots` | Recapture `docs/screenshots` from a running instance |

Integration tests use `TEST_DATABASE_URL` if set, falling back to `DATABASE_URL`.
Docker Compose creates `afh_portal_test` for exactly this purpose:

```bash
TEST_DATABASE_URL="postgresql://afh:afh_dev_password@localhost:5432/afh_portal_test" npm test
```

## How it is put together

```
src/
  app/            routes per persona; server actions for every mutation
  domain/         PURE business rules — no I/O, fully unit tested
  services/       integration seams (identity, storage, mail, scanning, DSHS systems)
  data/           Prisma access, authorization-scoped queries, transactions
  components/     UI primitives and shared pieces
prisma/           schema, migrations, seed
tests/domain/     business rules, no database
tests/integration/  the same rules against real PostgreSQL
```

The rules that carry legal weight — who may see a case, when a citation may be
finalized, how a deadline is computed, which state transitions exist — live in
`src/domain` as plain functions over plain objects. They are testable without a
database, they cannot be sidestepped by a stray query, and the UI, the server
actions and the data layer all read the same ones.

Deadline intervals, the holiday calendar and policy toggles are **configuration
rows**, not constants. RCS changes them in Admin → Deadlines without a deployment,
and every change is audited with its previous and new value.

> The deadline intervals shipped with this prototype are **placeholders**. They are
> not a statement of what Washington law requires. Set them from the applicable WAC,
> RCW and RCS policy before any real use.

Full detail in [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md) and
[docs/API.md](docs/API.md). The design record is in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Regulatory frame

Built around chapter 70.128 RCW and chapter 388-76 WAC — notably RCW 70.128.070
(inspections), RCW 70.128.090 (inspection reports), WAC 388-76-10920
(inspection/investigation reports), WAC 388-76-10930 (plan/attestation of
correction), and WAC 388-76-10990 with RCW 70.128.167 (informal dispute
resolution).

The regulation summaries in the seed are working text for the demo. The
authoritative source is the published WAC and RCW.

## Tests

118 tests plus a browser smoke test. The domain suite runs anywhere; the
integration suite runs against real PostgreSQL, because receipts, version chains,
audit rows and transaction boundaries are not things a mocked client can
demonstrate.

Covered, among others: provider A cannot reach provider B's home, case, finding or
document; an inspector cannot reach a case outside their assignment and region;
evidence submission writes an audit row and issues a receipt; evidence is never
overwritten; a citation cannot be finalized while evidence is unreviewed; it can
once everything is reviewed; an override without justification is refused; deadline
maths in both calendar and working days; a provider can submit a correction;
opening a dispute does not disturb correction status; and a case walked end to end
leaves an audit trail with no silent steps.

`npm run test:e2e` drives a real browser against a running instance: a provider
uploads an actual file through the form, gets a receipt, the submission appears in
the inspector's queue, and the citation guard refuses to finalize on the case where
evidence is unreviewed. Nineteen checks, no mocks.

```bash
npm run build && npm start &
npm run test:e2e
```

## Deadline reminders

`npm run reminders` notifies providers of evidence and corrections due soon or
overdue, and staff of approaching IDR deadlines. It is idempotent — one reminder
per recipient, per record, per day — so running it hourly is safe and a missed run
is caught by the next. It only notifies: it never moves a deadline and never
changes a status. Run it as a container job or a cron entry.

## Screenshots

| | |
|---|---|
| [Login](docs/screenshots/01-login.png) | [Provider dashboard](docs/screenshots/02-provider-dashboard.png) |
| [Evidence requests](docs/screenshots/03-provider-evidence-requests.png) | [Inspector dashboard](docs/screenshots/04-inspector-dashboard.png) |
| [Evidence review queue](docs/screenshots/05-evidence-review-queue.png) | [Citation guard](docs/screenshots/06-citation-guard.png) |
| [Field Manager dashboard](docs/screenshots/07-field-manager-dashboard.png) | [Reports](docs/screenshots/08-reports.png) |
| [Deadline configuration](docs/screenshots/09-deadline-configuration.png) | [Audit log](docs/screenshots/10-audit-log.png) |

## Accessibility

Built to WCAG 2.1 AA as a target: semantic landmarks and headings, labelled
controls, visible focus, `aria-live` results on every form, real table semantics
with scoped headers, and status conveyed by icon and text as well as colour, so
nothing depends on colour alone. It has **not** been through a formal accessibility
audit — see ARCHITECTURE.md.

## Licence

Not yet determined. This is a prototype produced for evaluation.
