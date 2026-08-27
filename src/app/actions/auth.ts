"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/services/identity";
import { createSession, currentUser, destroySession } from "@/lib/session";
import { homePathForRole } from "@/domain/authz";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpAddress } from "@/lib/session";
import * as audit from "@/data/audit";

/**
 * Authentication actions.
 *
 * Sign-in failures are deliberately uniform: the same message whether the
 * account is unknown, inactive, or the password is wrong, and a verification is
 * always run so the timing does not differ either. Distinguishing them tells an
 * attacker which email addresses are real.
 */
const credentials = z.object({
  email: z.string().email("Enter the email address you were given."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export interface AuthState {
  error?: string;
}

const GENERIC_FAILURE = "Email address or password is incorrect.";

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE };
  }

  const email = parsed.data.email.trim().toLowerCase();

  // Two windows: one per account so a single target cannot be ground down, and
  // one per source address so a spray across many accounts is throttled too.
  const ip = (await clientIpAddress()) ?? "unknown";
  const perAccount = rateLimit(`signin:email:${email}`, 5, 15 * 60);
  const perAddress = rateLimit(`signin:ip:${ip}`, 20, 15 * 60);

  if (!perAccount.allowed || !perAddress.allowed) {
    await audit.recordAnonymous({
      action: "USER_SIGN_IN_FAILED",
      entityType: "User",
      attemptedEmail: email,
      reason: "rate limited",
    });
    const wait = Math.max(perAccount.retryAfterSeconds, perAddress.retryAfterSeconds);
    return {
      error: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
    };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  const stored = user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
  const passwordOk = await verifyPassword(parsed.data.password, stored);

  if (!user || !user.isActive || !user.passwordHash || !passwordOk) {
    await audit.recordAnonymous({
      action: "USER_SIGN_IN_FAILED",
      entityType: "User",
      entityId: user?.id ?? null,
      attemptedEmail: email,
      reason: !user ? "unknown account" : !user.isActive ? "inactive account" : "invalid password",
    });
    return { error: GENERIC_FAILURE };
  }

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await audit.record(
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      title: user.title,
      regionId: user.regionId,
      regionName: null,
      mfaEnrolled: user.mfaEnrolled,
      facilityIds: [],
    },
    { action: "USER_SIGNED_IN", entityType: "User", entityId: user.id },
  );

  // Deep links from notification emails land here after authentication (§23).
  // Only same-site relative paths are honoured — never an absolute URL.
  const next = parsed.data.next;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  redirect(safeNext ?? homePathForRole(user.role));
}

export async function signOut(): Promise<void> {
  const user = await currentUser();
  if (user) {
    await audit.record(user, { action: "USER_SIGNED_OUT", entityType: "User", entityId: user.id });
  }
  await destroySession();
  redirect("/login");
}
