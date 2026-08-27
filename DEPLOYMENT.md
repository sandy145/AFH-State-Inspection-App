# Deploying to Vercel and Supabase

The database side is already provisioned. Two steps need you, because neither can
be done through the tooling I have: granting Vercel access to this repository,
and setting environment variables.

> Everything below deploys a **prototype holding fictional data**. Before anyone
> outside a demo audience sees it, read [SECURITY.md](SECURITY.md) — particularly
> the gap list.

---

## What is already done

**Supabase project `AFH`** (`kjcpsxvnswucwxnswigy`, us-east-1) has:

- a dedicated schema `afh_portal`, so this app cannot collide with anything in
  `public` — that schema belongs to a different project of yours;
- a least-privilege role `afh_portal_app` that can create and use objects in
  `afh_portal` and has no rights on `public`;
- no access for `anon` or `authenticated`. Nothing here is exposed through
  PostgREST; all access goes through the application's own connection and its own
  authorization checks.

No tables yet — the first deploy creates them, because the build runs
`prisma migrate deploy`.

## Step 1 — let Vercel see this repository

Vercel's GitHub App does not currently have access to
`sandy145/AFH-State-Inspection-App`, which is why an automated link returned 404.

1. Go to <https://vercel.com/new> and pick the **AFH** team.
2. Find `AFH-State-Inspection-App`. If it is not listed, click **Adjust GitHub App
   Permissions** and grant access to it.
3. Import it. Framework detection should say **Next.js**; leave the build settings
   alone — `vercel.json` and the `vercel-build` script handle the rest.
4. **Do not deploy yet.** Add the environment variables first (step 2), or the
   first build will fail when it tries to reach the database.

A project named `afh-compliance-portal` may already exist from an earlier attempt.
If so, reuse it and connect the repository under **Settings → Git**.

## Step 2 — environment variables

Add these under **Settings → Environment Variables**, for **all** environments.

### Database

Take the two connection strings from the Supabase dashboard
(**Connect → ORMs → Prisma**, or **Connect → Transaction/Session pooler**) and
substitute the role and password below. Vercel is IPv4-only and Supabase direct
connections are IPv6, so **both** strings must go through the pooler — the
`db.<ref>.supabase.co` host will not work from Vercel.

The role is `afh_portal_app`, so the pooler username is
`afh_portal_app.kjcpsxvnswucwxnswigy`.

```
DATABASE_URL
postgresql://afh_portal_app.kjcpsxvnswucwxnswigy:<DB-PASSWORD>@<POOLER-HOST>:6543/postgres?schema=afh_portal&pgbouncer=true&connection_limit=1

DIRECT_DATABASE_URL
postgresql://afh_portal_app.kjcpsxvnswucwxnswigy:<DB-PASSWORD>@<POOLER-HOST>:5432/postgres?schema=afh_portal
```

`<POOLER-HOST>` is the host Supabase shows you — `aws-0-us-east-1.pooler.supabase.com`
or `aws-1-us-east-1.pooler.supabase.com` depending on which Supavisor cluster the
project sits on. Copy it from the dashboard rather than guessing.

Why two: port **6543** is transaction mode, which is what serverless functions
need and what the app uses at runtime; `pgbouncer=true` turns off prepared
statements, which transaction mode does not support. Port **5432** is session
mode, which is what `prisma migrate deploy` needs for DDL.

### Application

```
SESSION_SECRET      <the value handed to you separately, or generate one:
                     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
APP_ENV             demo
NODE_ENV            production
APP_URL             https://<your-vercel-domain>
STORAGE_DRIVER      database
MAIL_DRIVER         log
MAX_UPLOAD_BYTES    10485760
```

`APP_ENV=demo` rather than `production` is deliberate: it permits the demo
accounts to exist. The session cookie is still `Secure`, because that follows the
scheme in `APP_URL`, not `APP_ENV`.

`STORAGE_DRIVER=database` keeps uploaded evidence in Postgres. Vercel's filesystem
is ephemeral, and no object store is attached. Downloads still go through the
authorization-checked route. See ARCHITECTURE.md — Azure Blob is the production
target, and `MAX_UPLOAD_BYTES` is lowered here because bytes are travelling
through a database connection.

### Demo data — first deploy only

```
RUN_SEED_ON_BUILD   true
SHOW_DEMO_CREDENTIALS  true
DEMO_PASSWORD       <choose one, or omit for the default>
```

**Set `RUN_SEED_ON_BUILD` back to `false` immediately after the first successful
deploy.** The seed truncates every table; left on, every redeploy wipes whatever
anyone has done in the demo.

`SHOW_DEMO_CREDENTIALS=true` lists the demo accounts on the login page. Anyone who
reaches the URL can then sign in — appropriate for an open demo, not otherwise.
Leave it unset and the accounts still exist but are not advertised.

## Step 3 — deploy

Deploy from the Vercel dashboard. The build runs:

```
prisma generate && node scripts/deploy-prepare.mjs && next build
```

`deploy-prepare` applies migrations and, on this first run, seeds. Watch the build
log for:

```
▸ Applying database migrations
▸ Seeding demo data
  Scenario 2 — AFH-2026-001290 F-002 has 1 unreviewed submission(s);
              citation finalization is blocked: EV-3F71D08
```

That last line is the seed asserting the citation guard actually holds. If the
seed cannot prove both scenarios, it fails the build.

## Step 4 — check it

```bash
SMOKE_BASE_URL=https://<your-domain> npm run test:e2e
```

Nineteen checks against the deployed instance: a provider uploads a real file,
gets a receipt, it reaches the inspector's queue, and the guard refuses to
finalize on the case with unreviewed evidence.

## Afterwards

- Set `RUN_SEED_ON_BUILD=false`.
- Consider Vercel **Deployment Protection** (Settings → Deployment Protection) if
  the demo should not be world-readable. It is a prototype with fictional data,
  but it is also a login page that resembles a state system, and the fewer
  strangers who find it the better.
- The two secrets are deliberately not written down here. They were handed over
  out of band; a repository is not a place to keep them. To rotate the database
  password: `ALTER ROLE afh_portal_app PASSWORD '<new>';` in the Supabase SQL
  editor, then update both Vercel variables.

## Things that will bite

**`Can't reach database server` during build.** The direct `db.<ref>.supabase.co`
host was used somewhere. Vercel cannot reach it — both URLs must be pooler hosts.

**`prepared statement "s0" already exists`.** `pgbouncer=true` is missing from
`DATABASE_URL`.

**`permission denied for schema afh_portal`.** The connection is not using the
`afh_portal_app` role, or `?schema=afh_portal` is missing.

**Uploads fail with a filesystem error.** `STORAGE_DRIVER` is not set to
`database`.
