/**
 * CELSOR — Prisma Database Client
 * Singleton pattern for Next.js (prevents connection pool exhaustion in dev).
 * Falls back gracefully when DATABASE_URL is not configured.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['error', 'warn']
      : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ─── Type re-exports for convenience ─────────────────────────────────────────
export type {
  Profile,
  Signal,
  Wallet,
  Subscription,
  UserAlert,
  UserWatchlist,
  SignalBookmark,
  ScanHistory,
  PlanTier,
  SignalDirection,
  RiskRating,
  ChainId,
} from '@prisma/client';
