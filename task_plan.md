# CELSOR — Beast Mode Implementation Plan
**Created:** 2026-05-02  
**Goal:** Transform Celsor from visual prototype into a fully autonomous, revenue-generating institutional intelligence engine.

## Architecture Overview
```
Supabase (Auth + Postgres + RLS)
    ↓
Next.js API Routes (JWT-secured)
    ↓
BullMQ Workers → Signal Pipeline → GPT-4o → Structured JSON
    ↓
pgvector RAG (wallet behavioral embeddings)
    ↓
Dashboard (live feed, custom alerts, per-user settings)
```

---

## Phase 1: Database Foundation [IN PROGRESS]
**Goal:** Real Supabase schema with migrations, RLS, and type-safe Prisma client.

Tasks:
- [ ] Supabase schema: users, subscriptions, signals, wallets, wallet_embeddings, user_alerts
- [ ] Row-Level Security policies (users only see their own data + public signals)
- [ ] RBAC: plan tiers (free, basic, pro) with permissions
- [ ] Prisma schema + generate client
- [ ] Database migrations applied to Supabase
- [ ] Type exports for frontend

---

## Phase 2: Authentication — Real Login [PENDING]
**Goal:** Working magic link → session → JWT → protected dashboard flow.

Tasks:
- [ ] Supabase Auth configured (magic link + email)
- [ ] Next.js middleware: validate Supabase session server-side
- [ ] `/api/auth/callback` — exchange code → session → redirect
- [ ] `/api/auth/me` — return user profile + plan tier + permissions
- [ ] Login page: send magic link → success state
- [ ] Plan-gated route protection (free = limited signals, pro = all)
- [ ] User preferences table: alert thresholds, chains, tokens watchlist

---

## Phase 3: Autonomous Background Scanner [PENDING]
**Goal:** 24/7 scanner that runs without user interaction.

Tasks:
- [ ] Upstash Redis (serverless-compatible) — no local Redis required
- [ ] BullMQ worker: `celsor:scan` queue → pipeline every 5 minutes per chain
- [ ] Real Etherscan API integration (all 5 chains, $10K+ whale filter)
- [ ] DexScreener API: live price data for signal context
- [ ] Scheduled scans via `node-cron` or Vercel cron
- [ ] Store every signal to Supabase `signals` table
- [ ] Store every wallet profile to `wallets` table

---

## Phase 4: ML Intelligence Layer — RAG + Embeddings [PENDING]
**Goal:** Give the engine memory and behavioral intelligence.

Tasks:
- [ ] OpenAI `text-embedding-3-small` for wallet behavior embeddings
- [ ] pgvector extension on Supabase for similarity search
- [ ] Wallet embedding: archetype + tags + historical patterns → vector
- [ ] RAG retrieval: "find wallets similar to this one" → context for GPT-4o
- [ ] Historical performance tracking: did signals actually play out?
- [ ] Conviction score v2: ML-enhanced (embedding similarity + historical accuracy)
- [ ] Wallet cluster analysis: auto-group by behavior type

---

## Phase 5: User Customization Layer [PENDING]
**Goal:** Let users configure their own intelligence feed.

Tasks:
- [ ] `/dashboard/settings` page: chains, min conviction, tokens watchlist
- [ ] Custom alert thresholds: "notify me when conviction > 85 on ETH"
- [ ] Watchlist: add specific wallets to track
- [ ] Email alerts via Resend (magic link email provider)
- [ ] Push notifications (PWA — already scaffolded)
- [ ] Signal bookmarking / saved signals per user

---

## Phase 6: Pro Features & Revenue [PENDING]
**Goal:** Gate premium features behind Stripe subscriptions.

Tasks:
- [ ] Stripe webhook: sync subscription status → Supabase `subscriptions` table
- [ ] Free tier: 10 signals/day, ETH only, no AI narratives
- [ ] Pro tier: unlimited signals, all chains, AI narratives, email alerts
- [ ] Upgrade flow: landing page → Stripe checkout → success → dashboard
- [ ] Usage metering per user

---

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| None yet | — | — |

## Decisions Made
- Using Upstash Redis (serverless) instead of self-hosted to avoid ECONNREFUSED
- Supabase for auth + DB (already configured in project)
- pgvector for wallet embeddings (native Supabase support)
- Keeping in-memory fallback while Upstash is not configured
