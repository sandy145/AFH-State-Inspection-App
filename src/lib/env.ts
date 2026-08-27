import "server-only";

/**
 * Environment access, validated once at module load.
 *
 * Two rules enforced here rather than by convention:
 *  - Demo credentials cannot be seeded outside development or test.
 *  - A production build refuses to start on the default session secret.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const appEnv = optional("APP_ENV", optional("NODE_ENV", "development"));
const isProduction = appEnv === "production";

const sessionSecret = optional("SESSION_SECRET", "");
if (isProduction && (!sessionSecret || sessionSecret.includes("replace-me"))) {
  throw new Error("SESSION_SECRET must be set to a strong random value in production.");
}

export const env = {
  appEnv,
  isProduction,
  isDevelopmentLike: appEnv === "development" || appEnv === "test",
  appUrl: optional("APP_URL", "http://localhost:3000"),
  databaseUrl: required("DATABASE_URL"),

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
  cookieSecure: bool("COOKIE_SECURE", optional("APP_URL", "").startsWith("https:")),

  /**
   * Whether the login page lists the demo accounts. Anyone can sign in with
   * them, so this is off unless explicitly enabled, and never on in production.
   */
  showDemoCredentials:
    bool("SHOW_DEMO_CREDENTIALS", appEnv === "development" || appEnv === "test") && !isProduction,

  storageDriver: optional("STORAGE_DRIVER", "local") as "local" | "s3" | "database",
  storageLocalPath: optional("STORAGE_LOCAL_PATH", ".storage"),
  s3: {
    endpoint: optional("S3_ENDPOINT", "http://localhost:9000"),
    region: optional("S3_REGION", "us-west-2"),
    bucket: optional("S3_BUCKET", "afh-evidence"),
    accessKeyId: optional("S3_ACCESS_KEY_ID", ""),
    secretAccessKey: optional("S3_SECRET_ACCESS_KEY", ""),
    forcePathStyle: bool("S3_FORCE_PATH_STYLE", true),
  },

  maxUploadBytes: int("MAX_UPLOAD_BYTES", 25 * 1024 * 1024),

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
