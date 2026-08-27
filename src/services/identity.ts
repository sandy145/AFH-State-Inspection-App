import "server-only";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/** promisify loses scrypt's options overload, so wrap it explicitly. */
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * IdentityService (§39, §24).
 *
 * Local password authentication for the prototype, structured so Microsoft Entra
 * ID can replace it without the application noticing:
 *
 *  - `verifyCredentials` is the only place a password is ever checked.
 *  - `User.externalId` already exists for an IdP subject claim.
 *  - `User.mfaEnrolled` and the step-up hook below are in place so MFA is a
 *    configuration change rather than a schema migration.
 *
 * Passwords are hashed with scrypt (Node built-in — no native dependency), a
 * per-user random salt, and a constant-time comparison.
 */
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // 2^14
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString(
    "base64",
  )}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, cost, blockSize, parallelization, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Password rules for the prototype's local accounts (§24). */
export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

export function checkPasswordStrength(password: string): PasswordCheck {
  const problems: string[] = [];

  if (password.length < 14) problems.push("Use at least 14 characters.");
  if (!/[a-z]/.test(password)) problems.push("Include a lowercase letter.");
  if (!/[A-Z]/.test(password)) problems.push("Include an uppercase letter.");
  if (!/[0-9]/.test(password)) problems.push("Include a number.");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("Include a symbol.");
  if (/(.)\1{3,}/.test(password)) problems.push("Avoid repeating the same character four or more times.");

  return { ok: problems.length === 0, problems };
}

/** Session tokens are random and stored only as a hash, like a password. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Step-up authentication hook. The prototype has no second factor, so this
 * reports what would be required rather than performing it. When Entra ID is in
 * place, a high-risk action (finalizing a citation, overriding the evidence
 * guard) routes through here for an MFA challenge.
 */
export type SensitiveAction = "FINALIZE_CITATION" | "OVERRIDE_EVIDENCE_GUARD" | "MANAGE_USERS";

export function stepUpRequired(action: SensitiveAction, user: { mfaEnrolled: boolean }): boolean {
  if (!user.mfaEnrolled) return false; // nothing to challenge against yet
  return action === "OVERRIDE_EVIDENCE_GUARD" || action === "MANAGE_USERS";
}
