/**
 * Build-time database preparation for a hosted deployment.
 *
 * Runs before `next build` on the deployment platform, which — unlike a browser
 * or a serverless request — has a session connection available for DDL.
 *
 *   1. Applies pending Prisma migrations using DIRECT_DATABASE_URL.
 *   2. Optionally seeds demo data, only when RUN_SEED_ON_BUILD is "true".
 *
 * Seeding is opt-in per build and off by default, because the seed truncates
 * every table. Turning it on for a first deploy and off afterwards is the
 * intended pattern; leaving it on means every redeploy resets the demo.
 *
 * Skipped entirely when there is no database configured, so a build can still
 * be produced for inspection without one.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveDirectUrl } from "./lib/derive-direct-url.mjs";

/** A blank variable is an unset one — see src/lib/env.ts for why this matters. */
const read = (name) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const hasDatabase = Boolean(read("DATABASE_URL"));
const shouldSeed = read("RUN_SEED_ON_BUILD") === "true";

// Vercel, Netlify, Render and friends all set this kind of marker. On a hosting
// platform a missing database is a misconfiguration, not a local convenience.
const onHostingPlatform = Boolean(
  read("VERCEL") || read("NETLIFY") || read("RENDER") || read("CI") === "1",
);

function run(command, label) {
  console.info(`\n▸ ${label}`);

  // npm puts node_modules/.bin on PATH for its own scripts, but this file should
  // work the same when invoked directly — otherwise it fails with a bare
  // "command not found" that says nothing about what is missing.
  const binDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)), "node_modules/.bin");
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` };

  execSync(command, { stdio: "inherit", env });
}

if (!hasDatabase) {
  if (onHostingPlatform) {
    // Failing here is the point. Skipping quietly produces a green deployment
    // serving an app with no database behind it: the login page renders, because
    // it is the one page that queries nothing, and the failure only surfaces when
    // somebody tries to sign in. A red build that names the missing variable is
    // worth far more than a green one that lies.
    console.error(
      [
        "",
        "DATABASE_URL is not set.",
        "",
        "This build is running on a hosting platform, so that is a configuration",
        "error rather than a local convenience. Set these in the project's",
        "environment variables and redeploy:",
        "",
        "  DATABASE_URL         pooled connection, transaction mode",
        "  DIRECT_DATABASE_URL  direct or session-mode connection, for migrations",
        "  SESSION_SECRET       a long random value",
        "",
        "See DEPLOYMENT.md. Note that environment variables are applied at build",
        "time: adding them does nothing until the next deployment.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  console.warn("DATABASE_URL is not set — skipping migrations and seed.");
  process.exit(0);
}

// Migrations need a session connection; the runtime uses a transaction pooler.
// Prisma reads DIRECT_DATABASE_URL for this via `directUrl` in the schema.
//
// Rather than demand a second variable that is a mechanical transformation of
// the first, derive it. Supabase's transaction pooler is port 6543 and its
// session pooler is 5432 on the same host, and the pgbouncer flags exist only
// to disable prepared statements for the pooled runtime connection.
if (!read("DIRECT_DATABASE_URL")) {
  const derived = deriveDirectUrl(read("DATABASE_URL"));

  if (derived) {
    process.env.DIRECT_DATABASE_URL = derived;
    console.info(
      "▸ DIRECT_DATABASE_URL is not set — derived a session-mode connection from " +
        "DATABASE_URL (port 6543 → 5432, pooling flags removed).",
    );
  } else {
    // Not a recognised pooled URL, so there is nothing to transform. Using the
    // same URL is right for a direct connection and merely suboptimal otherwise.
    process.env.DIRECT_DATABASE_URL = read("DATABASE_URL");
    console.warn(
      "▸ DIRECT_DATABASE_URL is not set and DATABASE_URL does not look pooled — " +
        "using it unchanged for migrations.",
    );
  }
}

run("prisma migrate deploy", "Applying database migrations");

if (shouldSeed) {
  console.warn("\nRUN_SEED_ON_BUILD is true — this REPLACES all data in the database.");
  run("tsx prisma/seed.ts", "Seeding demo data");
} else {
  console.info("\n▸ Skipping seed (set RUN_SEED_ON_BUILD=true to reseed on a build)");
}
