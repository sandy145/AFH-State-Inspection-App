/**
 * The three limits that must agree (§8).
 *
 * They did not, and a normal-sized certificate failed with a generic error: the
 * form advertised 25 MB while Next.js refused anything over its 1 MB default.
 */
import { describe, expect, it } from "vitest";
import { formatBytes, resolveUploadLimits, VERCEL_REQUEST_CAP_BYTES } from "@/lib/upload-limits";

const MB = 1024 * 1024;

describe("resolveUploadLimits", () => {
  it("always allows a body larger than the file limit, for multipart overhead", () => {
    const local = resolveUploadLimits({});
    expect(local.bodySizeLimitBytes).toBeGreaterThan(local.maxUploadBytes);
  });

  it("keeps the generous default when nothing constrains it", () => {
    const local = resolveUploadLimits({});
    expect(local.maxUploadBytes).toBe(25 * MB);
    expect(local.cappedByPlatform).toBe(false);
  });

  it("never promises more than the platform will carry", () => {
    // The failure this prevents: advertising 25 MB on a host that rejects
    // anything over 4.5 MB before a line of application code runs.
    const vercel = resolveUploadLimits({ VERCEL: "1" });

    expect(vercel.maxUploadBytes).toBeLessThan(VERCEL_REQUEST_CAP_BYTES);
    expect(vercel.bodySizeLimitBytes).toBeLessThanOrEqual(VERCEL_REQUEST_CAP_BYTES);
    expect(vercel.cappedByPlatform).toBe(true);
  });

  it("clamps an over-ambitious configured value on that platform", () => {
    const vercel = resolveUploadLimits({
      VERCEL: "1",
      MAX_UPLOAD_BYTES: String(50 * MB),
    });

    expect(vercel.maxUploadBytes).toBeLessThan(50 * MB);
    expect(vercel.cappedByPlatform).toBe(true);
  });

  it("honours a smaller configured value rather than overriding it", () => {
    const vercel = resolveUploadLimits({
      VERCEL: "1",
      MAX_UPLOAD_BYTES: String(2 * MB),
    });

    expect(vercel.maxUploadBytes).toBe(2 * MB);
    expect(vercel.cappedByPlatform).toBe(false);
  });

  it("ignores a blank or nonsense value instead of collapsing to zero", () => {
    expect(resolveUploadLimits({ MAX_UPLOAD_BYTES: "  " }).maxUploadBytes).toBe(25 * MB);
    expect(resolveUploadLimits({ MAX_UPLOAD_BYTES: "abc" }).maxUploadBytes).toBe(25 * MB);
    expect(resolveUploadLimits({ MAX_UPLOAD_BYTES: "0" }).maxUploadBytes).toBe(25 * MB);
  });
});

describe("formatBytes", () => {
  it("reads the way a person would write it", () => {
    expect(formatBytes(25 * MB)).toBe("25 MB");
    expect(formatBytes(4 * MB)).toBe("4 MB");
    expect(formatBytes(1.5 * MB)).toBe("1.5 MB");
  });
});
