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

const hasDatabase = Boolean(process.env.DATABASE_URL);
const shouldSeed = process.env.RUN_SEED_ON_BUILD === "true";

function run(command, label) {
  console.info(`\n▸ ${label}`);
  execSync(command, { stdio: "inherit", env: process.env });
}

if (!hasDatabase) {
  console.warn("DATABASE_URL is not set — skipping migrations and seed.");
  process.exit(0);
}

// Migrations need a session connection; the runtime uses a transaction pooler.
// Prisma reads DIRECT_DATABASE_URL for this via `directUrl` in the schema.
if (!process.env.DIRECT_DATABASE_URL) {
  console.warn(
    "DIRECT_DATABASE_URL is not set — migrations will use the pooled connection, " +
      "which can fail for DDL in transaction mode.",
  );
}

run("prisma migrate deploy", "Applying database migrations");

if (shouldSeed) {
  console.warn("\nRUN_SEED_ON_BUILD is true — this REPLACES all data in the database.");
  run("tsx prisma/seed.ts", "Seeding demo data");
} else {
  console.info("\n▸ Skipping seed (set RUN_SEED_ON_BUILD=true to reseed on a build)");
}
