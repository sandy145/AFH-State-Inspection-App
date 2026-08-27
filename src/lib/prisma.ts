import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client. Next.js dev mode reloads modules on every edit, so the
 * client is cached on globalThis to avoid exhausting the connection pool.
 *
 * Every query in the application goes through Prisma, which parameterizes
 * statements; raw SQL is not used anywhere in the request path.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
