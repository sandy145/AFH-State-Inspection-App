/**
 * Minimal stand-ins for `next/headers` so the data layer can run under Vitest.
 * Integration tests exercise database behaviour, not cookie plumbing; session
 * handling is covered separately by the auth flow.
 */
const store = new Map<string, string>();

export async function headers(): Promise<Headers> {
  return new Headers({ "x-forwarded-for": "203.0.113.10", "user-agent": "vitest" });
}

export async function cookies() {
  return {
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    },
  };
}
