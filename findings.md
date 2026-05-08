# CELSOR — Findings & Research

## Supabase Project
- URL: `https://dummy.supabase.co` (placeholder — needs real project URL)
- Anon Key: `dummy_anon_key` (placeholder — needs real key)
- **ACTION NEEDED:** User must create a real Supabase project and update `.env.local`

## Current Tech Stack
- Next.js 14 (App Router)
- Supabase Auth (magic link)
- Three.js (custom blackhole shader — KEEP AS IS)
- In-memory signal cache (needs to become Supabase Postgres)
- BullMQ/Redis (bypassed — needs Upstash)
- OpenAI GPT-4o (key configured in .env.local)
- Stripe (test mode — keys placeholder)

## API Keys Available
- OpenAI: `sk-proj-kARcx-...` (configured in .env.local)
- Etherscan: `DHYIGWUDY5QB8II7VG958MZBY4QUN5ZTM8` (all chains)
- Gemini: `AIzaSyCLqlm_...`

## Supabase Schema Plan
### Tables needed:
1. `profiles` — extends auth.users (plan, preferences, created_at)
2. `subscriptions` — Stripe subscription state per user
3. `signals` — persisted signal feed (all chains)
4. `wallets` — tracked wallet profiles with archetypes
5. `wallet_embeddings` — pgvector embeddings for RAG
6. `user_alerts` — custom alert configs per user
7. `user_watchlist` — wallets users are tracking
8. `signal_bookmarks` — saved signals per user

## RLS Strategy
- `signals`: SELECT public (all authenticated), INSERT server-only (service role)
- `profiles`: SELECT/UPDATE own row only
- `wallets`: SELECT public, INSERT server-only
- `user_alerts`, `user_watchlist`, `signal_bookmarks`: own rows only

## RBAC Plan
- `free`: 10 signals/day, ETH only, no AI narrative
- `basic`: 50 signals/day, all chains, no AI narrative  
- `pro`: unlimited, all chains, AI narratives, email alerts, advanced scanner

## pgvector Strategy
- Embedding model: `text-embedding-3-small` (1536 dims)
- Embed: wallet archetype + tags + behavioral patterns as text
- Query: find similar wallets when new wallet detected → use history as RAG context
- Index: `ivfflat` for approximate nearest neighbor search

## Upstash Redis Plan
- Use `@upstash/redis` (HTTP-based, works in Vercel edge/serverless)
- No local Redis server needed
- URL format: `https://xxx.upstash.io`
- Configure via `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
