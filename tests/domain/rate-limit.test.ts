import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

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
