import { beforeEach, describe, expect, it } from "vitest";
import { isRateLimited, rateLimit, resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  resetRateLimits();
});

describe("sign-in rate limiting", () => {
  it("allows attempts up to the limit and then refuses", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit("signin:email:a@test", 5, 900).allowed).toBe(true);
    }
    const blocked = rateLimit("signin:email:a@test", 5, 900);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key independently", () => {
    for (let i = 0; i < 5; i += 1) rateLimit("signin:email:a@test", 5, 900);

    expect(rateLimit("signin:email:a@test", 5, 900).allowed).toBe(false);
    // A different account is unaffected by one account being locked out.
    expect(rateLimit("signin:email:b@test", 5, 900).allowed).toBe(true);
  });

  it("reports how many attempts remain", () => {
    expect(rateLimit("k", 3, 900).remaining).toBe(2);
    expect(rateLimit("k", 3, 900).remaining).toBe(1);
    expect(rateLimit("k", 3, 900).remaining).toBe(0);
  });

  it("starts a fresh window once the old one has expired", () => {
    // A one-second window that has already elapsed by the time it is re-read.
    expect(rateLimit("short", 1, -1).allowed).toBe(true);
    expect(rateLimit("short", 1, -1).allowed).toBe(true);
  });
});

describe("read-only checks", () => {
  it("does not consume from the window", () => {
    // A successful sign-in checks the window but must not spend from it, or a
    // user who signs in five times in a morning would lock themselves out.
    for (let i = 0; i < 10; i += 1) {
      expect(isRateLimited("signin:email:frequent@test", 5).allowed).toBe(true);
    }
  });

  it("reports a window that failures have already exhausted", () => {
    for (let i = 0; i < 5; i += 1) rateLimit("signin:email:attacked@test", 5, 900);

    const status = isRateLimited("signin:email:attacked@test", 5);
    expect(status.allowed).toBe(false);
    expect(status.remaining).toBe(0);
    expect(status.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports an untouched key as allowed with the full budget", () => {
    expect(isRateLimited("signin:email:fresh@test", 5)).toMatchObject({
      allowed: true,
      remaining: 5,
      retryAfterSeconds: 0,
    });
  });
});
