import "server-only";
import { resolveUploadLimits } from "@/lib/upload-limits";

/**
 * Environment access, validated once at module load.
 *
 * Two rules enforced here rather than by convention:
 *  - Demo credentials cannot be seeded outside development or test.
 *  - A production build refuses to start on the default session secret.
 */
/**
 * Reads an environment variable, treating a blank one as absent.
 *
 * A deployment dashboard makes it easy to add a variable and leave its value
 * empty, and this has now cost real time twice: an empty DIRECT_DATABASE_URL
 * stopped a build with "resolved to an empty string", and an empty DEMO_PASSWORD
 * seeded every demo account with an empty password, locking them all out.
 *
 * `??` does not help, because an empty string is neither null nor undefined. A
 * blank variable means "not configured" — never "configured as nothing" — so
 * every reader below goes through here.
 */
function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function required(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return read(name) ?? fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = read(name);
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function int(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const appEnv = optional("APP_ENV", optional("NODE_ENV", "development"));
const isProduction = appEnv === "production";

/**
 * Values the hosting platform already knows.
 *
 * Two of these are easy to set wrong and expensive when they are. APP_URL feeds
 * the session cookie's Secure flag, so a mistyped one silently downgrades every
 * session; and the local filesystem driver cannot work on an ephemeral one, so
 * "local" is never the right default there. Taking them from the platform when
 * it offers them removes two chances to get a deployment subtly wrong.
 *
 * An explicit environment variable always wins.
 */
const onVercel = Boolean(read("VERCEL"));

const platformUrl = read("VERCEL_PROJECT_PRODUCTION_URL") ?? read("VERCEL_URL");
const defaultAppUrl = platformUrl ? `https://${platformUrl}` : "http://localhost:3000";
const defaultStorageDriver = onVercel ? "database" : "local";

const sessionSecret = optional("SESSION_SECRET", "");
if (isProduction && (!sessionSecret || sessionSecret.includes("replace-me"))) {
  throw new Error("SESSION_SECRET must be set to a strong random value in production.");
}

export const env = {
  appEnv,
  isProduction,
  isDevelopmentLike: appEnv === "development" || appEnv === "test",
  appUrl: optional("APP_URL", defaultAppUrl),

  /**
   * Read lazily rather than at module load.
   *
   * A build should not need production credentials: the deployment platform
   * compiles the app in one environment and runs it in another, and Next.js
   * imports every route module while building. Demanding the database URL up
   * front would fail the build for want of a secret the build has no business
   * holding. A request that actually needs the database still fails loudly.
   */
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },

  sessionSecret: sessionSecret || "development-only-session-secret",
  sessionTtlMinutes: int("SESSION_TTL_MINUTES", 60),

  /**
   * Whether the session cookie carries the Secure flag.
   *
   * Derived from the scheme the app is actually served over, not from APP_ENV.
   * A hosted demo runs over HTTPS while deliberately not calling itself
   * "production", and tying Secure to APP_ENV would have shipped that demo with
   * a cookie that travels in the clear.
   */
  cookieSecure: bool("COOKIE_SECURE", optional("APP_URL", defaultAppUrl).startsWith("https:")),

  /**
   * Whether the login page lists the demo accounts. Anyone can sign in with
   * them, so this is off unless explicitly enabled, and never on in production.
   */
  showDemoCredentials:
    bool("SHOW_DEMO_CREDENTIALS", appEnv === "development" || appEnv === "test") && !isProduction,

  storageDriver: optional("STORAGE_DRIVER", defaultStorageDriver) as "local" | "s3" | "database",
  storageLocalPath: optional("STORAGE_LOCAL_PATH", ".storage"),
  s3: {
    endpoint: optional("S3_ENDPOINT", "http://localhost:9000"),
    region: optional("S3_REGION", "us-west-2"),
    bucket: optional("S3_BUCKET", "afh-evidence"),
    accessKeyId: optional("S3_ACCESS_KEY_ID", ""),
    secretAccessKey: optional("S3_SECRET_ACCESS_KEY", ""),
    forcePathStyle: bool("S3_FORCE_PATH_STYLE", true),
  },

  // Resolved centrally so the limit the form prints, the limit the domain rule
  // enforces and the limit Next.js accepts are the same number.
  maxUploadBytes: resolveUploadLimits(process.env).maxUploadBytes,

  mailDriver: optional("MAIL_DRIVER", "log") as "log" | "smtp",
  mailFrom: optional("MAIL_FROM", "AFH Compliance Portal <no-reply@afh-portal.local.test>"),
  smtp: {
    host: optional("SMTP_HOST", "localhost"),
    port: int("SMTP_PORT", 1025),
    secure: bool("SMTP_SECURE", false),
    user: optional("SMTP_USER", ""),
    password: optional("SMTP_PASSWORD", ""),
  },

  /** Demo accounts are refused outside development and test, whatever the flag says. */
  seedDemoAccounts: bool("SEED_DEMO_ACCOUNTS", false) && !isProduction,
  demoPassword: optional("DEMO_PASSWORD", "AfhPortal!Dev2026"),
} as const;
