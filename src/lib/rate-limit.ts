import "server-only";

/**
 * Rate limiting (§24).
 *
 * A fixed-window counter held in process memory. That is honest about what it
 * is: it protects a single instance against credential stuffing and runaway
 * submissions, and it resets on deploy. A multi-instance production deployment
 * must move this behind a shared store (Azure Cache for Redis) or the platform's
 * own throttling — see ARCHITECTURE.md. The interface below does not change when
 * that happens.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Bounded so a flood of distinct keys cannot grow the map without limit.
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Reads a window without consuming from it.
 *
 * Sign-in checks this before verifying a password and only consumes on failure,
 * so someone who signs in correctly every day is never rate limited, while
 * repeated failures still lock out.
 */
export function isRateLimited(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }

  return {
    allowed: existing.count < limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Consumes one attempt from the window. */
export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) evictExpired(now);
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}

function evictExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows: drop the oldest rather than refuse to track.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, 1000);
    for (const [key] of oldest) windows.delete(key);
  }
}

/** Test seam. */
export function resetRateLimits(): void {
  windows.clear();
}
