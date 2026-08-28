/**
 * Environment defaults that a deployment depends on.
 *
 * Two of these are quiet when wrong: APP_URL drives the session cookie's Secure
 * flag, and the local storage driver cannot work on an ephemeral filesystem.
 * Both are taken from the platform when it offers them, and both are covered
 * here so a refactor cannot silently take them away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = { ...process.env };

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL, ...overrides } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }
  return (await import("@/lib/env")).env;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("hosting platform defaults", () => {
  it("takes the application URL from the platform when it is not set", async () => {
    const env = await loadEnv({
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "example.vercel.app",
      APP_URL: undefined,
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.appUrl).toBe("https://example.vercel.app");
  });

  it("marks the session cookie Secure when the derived URL is https", async () => {
    const env = await loadEnv({
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "example.vercel.app",
      APP_URL: undefined,
      COOKIE_SECURE: undefined,
      DATABASE_URL: "postgresql://localhost/x",
    });

    // The whole point: a hosted deployment gets a Secure cookie without anyone
    // having to remember to ask for one.
    expect(env.cookieSecure).toBe(true);
  });

  it("leaves the cookie insecure for plain-http local development", async () => {
    const env = await loadEnv({
      VERCEL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
      VERCEL_URL: undefined,
      APP_URL: undefined,
      COOKIE_SECURE: undefined,
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.appUrl).toBe("http://localhost:3000");
    expect(env.cookieSecure).toBe(false);
  });

  it("never defaults to the filesystem driver on an ephemeral platform", async () => {
    const env = await loadEnv({
      VERCEL: "1",
      STORAGE_DRIVER: undefined,
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.storageDriver).toBe("database");
  });

  it("defaults to the filesystem driver locally", async () => {
    const env = await loadEnv({
      VERCEL: undefined,
      STORAGE_DRIVER: undefined,
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.storageDriver).toBe("local");
  });

  it("lets an explicit value override the platform every time", async () => {
    const env = await loadEnv({
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "example.vercel.app",
      APP_URL: "https://portal.example.gov",
      STORAGE_DRIVER: "s3",
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.appUrl).toBe("https://portal.example.gov");
    expect(env.storageDriver).toBe("s3");
  });
});

describe("demo credentials", () => {
  it("are never advertised in production, whatever the flag says", async () => {
    const env = await loadEnv({
      APP_ENV: "production",
      SHOW_DEMO_CREDENTIALS: "true",
      SEED_DEMO_ACCOUNTS: "true",
      SESSION_SECRET: "a-real-secret-value-for-production-use-only",
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.showDemoCredentials).toBe(false);
    expect(env.seedDemoAccounts).toBe(false);
  });

  it("are opt-in outside production rather than on by default", async () => {
    const env = await loadEnv({
      APP_ENV: "demo",
      SHOW_DEMO_CREDENTIALS: undefined,
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.showDemoCredentials).toBe(false);
  });
});

describe("database url", () => {
  it("is read on access, so a build without it still succeeds", async () => {
    const env = await loadEnv({ DATABASE_URL: undefined });

    // Importing must not throw — Next.js imports every route module at build.
    expect(env.appEnv).toBeTruthy();
    // Reading it must throw, so a request that needs it fails loudly.
    expect(() => env.databaseUrl).toThrow(/DATABASE_URL/);
  });
});

describe("blank environment variables", () => {
  // Both of these cost real time on a live deployment. A dashboard makes it easy
  // to add a variable and leave the value empty, and `??` does not catch it.
  it("treats an empty string as unset, not as a configured empty value", async () => {
    const env = await loadEnv({
      DEMO_PASSWORD: "",
      APP_URL: "",
      STORAGE_DRIVER: "",
      VERCEL: undefined,
      DATABASE_URL: "postgresql://localhost/x",
    });

    // An empty DEMO_PASSWORD once seeded every demo account with an empty
    // password, which the sign-in form will not accept — nobody could log in.
    expect(env.demoPassword).toBe("AfhPortal!Dev2026");
    expect(env.appUrl).toBe("http://localhost:3000");
    expect(env.storageDriver).toBe("local");
  });

  it("treats a whitespace-only value as unset too", async () => {
    const env = await loadEnv({
      DEMO_PASSWORD: "   ",
      MAX_UPLOAD_BYTES: "  ",
      DATABASE_URL: "postgresql://localhost/x",
    });

    expect(env.demoPassword).toBe("AfhPortal!Dev2026");
    expect(env.maxUploadBytes).toBe(25 * 1024 * 1024);
  });

  it("trims a value that has stray whitespace around it", async () => {
    // Pasting into a dashboard field picks up spaces and newlines easily, and a
    // connection string with a trailing newline fails in a very confusing way.
    const env = await loadEnv({
      APP_URL: "  https://portal.example.gov  ",
      DATABASE_URL: "  postgresql://localhost/x\n",
    });

    expect(env.appUrl).toBe("https://portal.example.gov");
    expect(env.databaseUrl).toBe("postgresql://localhost/x");
  });

  it("does not let a blank boolean flag read as false-by-accident", async () => {
    const env = await loadEnv({
      APP_ENV: "test",
      SHOW_DEMO_CREDENTIALS: "",
      DATABASE_URL: "postgresql://localhost/x",
    });

    // Blank means unset, so the default for a test environment applies.
    expect(env.showDemoCredentials).toBe(true);
  });

  it("rejects a blank required variable rather than accepting emptiness", async () => {
    const env = await loadEnv({ DATABASE_URL: "   " });
    expect(() => env.databaseUrl).toThrow(/DATABASE_URL/);
  });
});
