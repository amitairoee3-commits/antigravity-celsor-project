/**
 * CELSOR NEXUS — Wallet Cache
 * TTL-based cache for wallet profiles and transaction history.
 */

import { cacheGet, cacheSet, cacheDel } from './redis';
import type { WalletProfile } from '@/lib/ai/prompts/walletProfile';

export interface CachedWallet {
  address: string;
  chain: string;
  archetype: string;
  convictionScore: number;
  followWorthiness: number;
  tags: string[];
  profile?: WalletProfile;
  lastSeenTxHash?: string;
  lastSeenAt: number;
  totalVolumeUSD: number;
  txCount: number;
  addedAt: number;
}

const WALLET_PREFIX    = 'celsor:wallet:';
const WATCHLIST_KEY    = 'celsor:watchlist:all';
const PROFILE_PREFIX   = 'celsor:profile:';
const WALLET_TTL       = 3600;   // 1h for wallet summary
const PROFILE_TTL      = 86400;  // 24h for AI-generated profiles

export async function setWallet(wallet: CachedWallet): Promise<void> {
  await cacheSet(`${WALLET_PREFIX}${wallet.chain}:${wallet.address}`, wallet, WALLET_TTL);
}

export async function getWallet(address: string, chain: string): Promise<CachedWallet | null> {
  return cacheGet<CachedWallet>(`${WALLET_PREFIX}${chain}:${address}`);
}

export async function setWalletProfile(address: string, chain: string, profile: WalletProfile): Promise<void> {
  await cacheSet(`${PROFILE_PREFIX}${chain}:${address}`, profile, PROFILE_TTL);
}

export async function getWalletProfile(address: string, chain: string): Promise<WalletProfile | null> {
  return cacheGet<WalletProfile>(`${PROFILE_PREFIX}${chain}:${address}`);
}

export async function removeWallet(address: string, chain: string): Promise<void> {
  await cacheDel(`${WALLET_PREFIX}${chain}:${address}`);
  await cacheDel(`${PROFILE_PREFIX}${chain}:${address}`);
}
