/**
 * Deriving the migration connection from the runtime one.
 *
 * A deployment failed because DIRECT_DATABASE_URL was empty, and that variable
 * is a mechanical transformation of DATABASE_URL: same host, same credentials,
 * session port instead of transaction port, without the flags that exist only
 * to make pooled connections safe. Asking someone to type it twice is asking
 * for exactly the failure that happened.
 */
import { describe, expect, it } from "vitest";
import { deriveDirectUrl } from "../../scripts/lib/derive-direct-url.mjs";

const POOLED =
  "postgresql://afh_portal_app.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres" +
  "?schema=afh_portal&pgbouncer=true&connection_limit=1";

describe("deriveDirectUrl", () => {
  it("moves a Supabase transaction pooler URL to the session port", () => {
    const derived = new URL(deriveDirectUrl(POOLED)!);

    expect(derived.port).toBe("5432");
    expect(derived.hostname).toBe("aws-0-us-east-1.pooler.supabase.com");
    expect(derived.username).toBe("afh_portal_app.ref");
    expect(derived.password).toBe("pw");
  });

  it("keeps the schema, which the migration needs to land in the right place", () => {
    expect(new URL(deriveDirectUrl(POOLED)!).searchParams.get("schema")).toBe("afh_portal");
  });

  it("drops the flags that only make sense for a pooled runtime connection", () => {
    const params = new URL(deriveDirectUrl(POOLED)!).searchParams;

    expect(params.has("pgbouncer")).toBe(false);
    expect(params.has("connection_limit")).toBe(false);
  });

  it("recognises a pooled URL by its flag even on a non-standard port", () => {
    const derived = deriveDirectUrl("postgresql://u:p@host:7000/db?pgbouncer=true");

    expect(derived).not.toBeNull();
    expect(new URL(derived!).searchParams.has("pgbouncer")).toBe(false);
  });

  it("returns null for a direct connection, so the caller can say so", () => {
    // Nothing to transform — the caller reports that rather than pretending.
    expect(deriveDirectUrl("postgresql://u:p@db.ref.supabase.co:5432/postgres?schema=x")).toBeNull();
  });

  it("returns null rather than throwing on nonsense", () => {
    expect(deriveDirectUrl("not-a-url")).toBeNull();
    expect(deriveDirectUrl("")).toBeNull();
    expect(deriveDirectUrl(undefined)).toBeNull();
  });
});
