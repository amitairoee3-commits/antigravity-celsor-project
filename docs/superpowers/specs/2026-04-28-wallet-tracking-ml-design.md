# Celsor Nexus — Wallet Tracking + ML Intelligence Engine Design

## Goal
Add multi-chain on-chain wallet surveillance and a full ML signal pipeline (scoring + anomaly detection + wallet clustering) to the Celsor Nexus dashboard.

## Architecture

### Data Layer (Free/Scraped Sources)
- **EVM chains** (ETH, ARB, Base, BSC, OP): Etherscan-compatible free APIs + public Alchemy RPC for tx streaming
- **Solana**: Public mainnet-beta RPC + DexScreener API (free, no key) for memecoin activity
- **Memecoins / DEX**: DexScreener REST API (free) — covers pairs, volume spikes, new token launches across all chains
- **Whale alerts**: Whale-Alert public feed + large transfer threshold detection from RPC
- **Wallet labels**: Hardcoded + community-sourced label registry (no Nansen key needed)

### ML Pipeline (Next.js API Routes — TypeScript statistical models)
Three models run server-side in API routes, no Python needed:
1. **Signal Scorer** — Weighted ensemble scoring each on-chain event (tx size, wallet age, token velocity, timing, chain)
2. **Anomaly Detector** — Z-score + IQR-based outlier detection on wallet behavior metrics (dormancy → spike pattern)
3. **Wallet Clusterer** — K-means style behavioral clustering: Smart Money / Insider / Degen / VC Unlock / Bot archetypes

### Frontend — New Pages
- `/dashboard/wallets` — Multi-chain wallet tracker with chain filter tabs, live feed
- `/dashboard/ml` — ML engine status, model accuracy indicators, anomaly log
- Enhanced `/dashboard` — ML confidence score overlay on existing signals

### Data Flow
```
DexScreener + Public RPCs → /api/chain/[chain] (polling every 30s)
                          → ML scoring pipeline (/api/ml/score)
                          → Supabase wallet_events table
                          → WebSocket broadcast → Dashboard
```

## Tech
- Next.js 14 API Routes (edge-compatible)
- DexScreener API (free, no key)
- Etherscan API v2 (free tier, 5 req/s)
- Solana public RPC (`https://api.mainnet-beta.solana.com`)
- Supabase for wallet_events + wallet_profiles tables
- Framer Motion + existing Tailwind design system
