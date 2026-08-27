/**
 * `server-only` throws on import outside a React Server Component graph, which
 * would stop integration tests from loading the modules they exist to test.
 * Vitest aliases the package to this empty module; the production build still
 * resolves the real one, so the guarantee holds where it matters.
 */
export {};
