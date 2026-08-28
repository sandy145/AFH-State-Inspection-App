/**
 * Upload size limits, resolved in one place.
 *
 * Three different limits have to agree, and when they do not the failure is
 * baffling: the form advertised 25 MB while Next.js rejected anything over its
 * 1 MB server-action default, so a normal-sized certificate failed with a
 * generic error and nothing in the UI explained why.
 *
 *   1. `maxUploadBytes`      — what the domain rule enforces and the form shows.
 *   2. `bodySizeLimitBytes`  — what Next.js will accept for a server action.
 *   3. the platform's own request cap, which no configuration can raise.
 *
 * The body limit must exceed the upload limit, because a multipart body also
 * carries field names, boundaries and the other form fields.
 *
 * Deliberately free of `server-only` and of any import: `next.config.ts` reads
 * this at build time, and `src/lib/env.ts` reads it at runtime, so the number
 * the form prints and the number the server enforces cannot drift apart.
 */

/** Vercel rejects serverless request bodies above 4.5 MB before any code runs. */
export const VERCEL_REQUEST_CAP_BYTES = 4.5 * 1024 * 1024;

const MEGABYTE = 1024 * 1024;

/** Room for multipart boundaries, field names and the other form fields. */
const MULTIPART_OVERHEAD_BYTES = 512 * 1024;

export interface UploadLimits {
  maxUploadBytes: number;
  bodySizeLimitBytes: number;
  /** True when a platform cap, rather than configuration, decided the limit. */
  cappedByPlatform: boolean;
}

/**
 * Only the variables this actually reads, so callers and tests can pass a plain
 * object without constructing a whole ProcessEnv.
 */
export interface UploadEnv {
  VERCEL?: string;
  MAX_UPLOAD_BYTES?: string;
  // Present so a real ProcessEnv is assignable; only the two above are read.
  [key: string]: string | undefined;
}

export function resolveUploadLimits(processEnv: UploadEnv = process.env): UploadLimits {
  const onVercel = Boolean(processEnv.VERCEL?.trim());

  const configured = Number.parseInt(processEnv.MAX_UPLOAD_BYTES?.trim() ?? "", 10);
  const requested = Number.isFinite(configured) && configured > 0 ? configured : 25 * MEGABYTE;

  if (!onVercel) {
    return {
      maxUploadBytes: requested,
      bodySizeLimitBytes: requested + MULTIPART_OVERHEAD_BYTES,
      cappedByPlatform: false,
    };
  }

  // On Vercel the request cap is fixed, so the advertised limit has to fit
  // beneath it with room for the rest of the body. Promising more than the
  // platform will carry produces a failure no error message can explain.
  const affordable = VERCEL_REQUEST_CAP_BYTES - MULTIPART_OVERHEAD_BYTES;
  const maxUploadBytes = Math.min(requested, affordable);

  return {
    maxUploadBytes,
    bodySizeLimitBytes: VERCEL_REQUEST_CAP_BYTES,
    cappedByPlatform: maxUploadBytes < requested,
  };
}

/** "4 MB" — for messages a provider reads. */
export function formatBytes(bytes: number): string {
  const mb = bytes / MEGABYTE;
  return `${mb >= 10 ? Math.floor(mb) : Math.round(mb * 10) / 10} MB`;
}
