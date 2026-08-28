/**
 * Derives a session-mode connection string from a pooled one.
 *
 * Migrations need a session connection; a serverless runtime needs a pooled one.
 * On Supabase those differ only by port — 6543 for transaction mode, 5432 for
 * session mode on the same host — plus the flags that exist purely to make a
 * pooled connection safe for Prisma.
 *
 * Asking someone to enter both by hand invites exactly the failure it caused: a
 * deployment where the second variable was empty and the build stopped dead.
 *
 * Returns null when the input is not a pooled connection string, so the caller
 * can distinguish "transformed it" from "nothing to transform" and report which.
 */
export function deriveDirectUrl(databaseUrl) {
  if (!databaseUrl) return null;

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }

  const isPooled = url.port === "6543" || url.searchParams.has("pgbouncer");
  if (!isPooled) return null;

  if (url.port === "6543") url.port = "5432";
  url.searchParams.delete("pgbouncer");
  url.searchParams.delete("connection_limit");

  return url.toString();
}
