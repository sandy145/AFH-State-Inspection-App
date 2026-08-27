import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { hashSessionToken, newSessionToken } from "@/services/identity";
import type { Actor } from "@/domain/types";

/**
 * Session handling.
 *
 * The cookie holds a random opaque token; the database holds only its SHA-256.
 * Cookies are HttpOnly, SameSite=Lax (so email deep links still work on a GET)
 * and Secure outside development. Sessions expire on an absolute TTL and are
 * revoked, never deleted, so an audit trail survives sign-out.
 */
const COOKIE_NAME = "afh_session";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Actor["role"];
  title: string | null;
  regionId: string | null;
  regionName: string | null;
  mfaEnrolled: boolean;
  facilityIds: string[];
}

export async function createSession(userId: string): Promise<void> {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + env.sessionTtlMinutes * 60 * 1000);
  const headerList = await headers();

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      ipAddress: clientIp(headerList),
      userAgent: headerList.get("user-agent")?.slice(0, 300) ?? null,
    },
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(COOKIE_NAME);
}

/**
 * Resolves the signed-in user. Cached per request so a page that checks
 * authorization in several components issues one query, not ten.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          region: { select: { name: true } },
          facilityLinks: { select: { facilityId: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  // Touch last-seen at most once a minute; this runs on every request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    title: user.title,
    regionId: user.regionId,
    regionName: user.region?.name ?? null,
    mfaEnrolled: user.mfaEnrolled,
    facilityIds: user.facilityLinks.map((link) => link.facilityId),
  };
});

/** The authorization-layer view of the signed-in user. */
export function toActor(user: SessionUser): Actor {
  return {
    id: user.id,
    role: user.role,
    regionId: user.regionId,
    facilityIds: user.facilityIds,
  };
}

export async function clientIpAddress(): Promise<string | null> {
  return clientIp(await headers());
}

function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip");
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
