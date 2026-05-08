-- ============================================================
-- CELSOR — Supabase Database Schema v1
-- Run this in the Supabase SQL Editor (Dashboard → SQL)
-- Requires: pgvector extension (enabled by default on Supabase)
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists vector;

-- ─── ENUMS ────────────────────────────────────────────────────────────────────
create type plan_tier as enum ('free', 'basic', 'pro');
create type signal_direction as enum ('LONG', 'SHORT', 'WATCH');
create type risk_rating as enum ('LOW', 'MEDIUM', 'HIGH');
create type chain_id as enum ('eth', 'arb', 'base', 'bsc', 'op');

-- ─── PROFILES (extends auth.users) ────────────────────────────────────────────
-- Automatically created on signup via trigger.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  plan        plan_tier not null default 'free',
  -- Per-user preferences (JSON blob for flexibility)
  preferences jsonb not null default '{
    "chains": ["eth", "arb", "base", "bsc", "op"],
    "minConvictionScore": 50,
    "emailAlertsEnabled": false,
    "pushAlertsEnabled": false,
    "alertThreshold": 75,
    "watchedTokens": []
  }'::jsonb,
  signals_today int not null default 0,
  signals_reset_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── SUBSCRIPTIONS (Stripe sync) ──────────────────────────────────────────────
create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id  text unique,
  stripe_sub_id       text unique,
  plan                plan_tier not null default 'free',
  status              text not null default 'active', -- active, past_due, canceled
  current_period_end  timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── WALLETS (on-chain profiles, shared across all users) ─────────────────────
create table public.wallets (
  id                  uuid primary key default gen_random_uuid(),
  address             text not null,
  chain               chain_id not null,
  archetype           text not null default 'Unknown',   -- Smart Money, Whale, MEV Bot, etc.
  conviction_score    int not null default 0,            -- 0-100 follow-worthiness
  follow_worthiness   int not null default 0,
  tags                text[] not null default '{}',
  total_volume_usd    numeric not null default 0,
  tx_count            int not null default 0,
  last_seen_tx_hash   text,
  last_seen_at        timestamptz,
  first_seen_at       timestamptz not null default now(),
  -- pgvector embedding for behavioral similarity search
  embedding           vector(1536),
  constraint wallets_address_chain unique (address, chain)
);

create index idx_wallets_conviction on public.wallets (conviction_score desc);
create index idx_wallets_chain on public.wallets (chain);
create index idx_wallets_archetype on public.wallets (archetype);
-- Approximate nearest-neighbor index for embedding similarity search
create index idx_wallets_embedding on public.wallets 
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─── SIGNALS (the core intelligence feed) ─────────────────────────────────────
create table public.signals (
  id                    text primary key,              -- sig_{txhash}_{timestamp}
  wallet_address        text not null,
  chain                 chain_id not null,
  token_symbol          text not null,
  token_name            text,
  tx_hash               text not null,
  direction             signal_direction not null default 'WATCH',
  conviction_score      int not null default 0,
  title                 text not null,
  catalyst_summary      text not null,
  invalidation_criteria text not null default '',
  risk_rating           risk_rating not null default 'MEDIUM',
  time_horizon          text not null default '4H',
  key_tags              text[] not null default '{}',
  value_usd             numeric not null default 0,
  -- Tracking: did this signal play out?
  outcome               text,                          -- WON, LOST, NEUTRAL, null=pending
  outcome_pnl_pct       numeric,                       -- % price change after time_horizon
  generated_at          timestamptz not null default now(),
  -- Foreign key to wallet profile (if exists)
  wallet_id             uuid references public.wallets(id)
);

create index idx_signals_generated_at on public.signals (generated_at desc);
create index idx_signals_conviction on public.signals (conviction_score desc);
create index idx_signals_chain on public.signals (chain);
create index idx_signals_direction on public.signals (direction);
create index idx_signals_wallet on public.signals (wallet_address);

-- ─── USER WATCHLIST ───────────────────────────────────────────────────────────
create table public.user_watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  wallet_id   uuid not null references public.wallets(id) on delete cascade,
  label       text,                                   -- Custom user label for this wallet
  notes       text,
  added_at    timestamptz not null default now(),
  constraint user_watchlist_unique unique (user_id, wallet_id)
);

create index idx_user_watchlist_user on public.user_watchlist (user_id);

-- ─── USER ALERTS (custom alert configurations) ────────────────────────────────
create table public.user_alerts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  name                text not null,
  enabled             boolean not null default true,
  -- Conditions (all conditions must be true to trigger)
  chains              chain_id[] not null default '{eth}',
  min_conviction      int not null default 75,
  directions          signal_direction[] not null default '{LONG,SHORT}',
  tokens              text[] not null default '{}',       -- Empty = all tokens
  wallets             text[] not null default '{}',       -- Empty = all wallets
  -- Delivery
  email_enabled       boolean not null default false,
  push_enabled        boolean not null default false,
  -- Meta
  triggered_count     int not null default 0,
  last_triggered_at   timestamptz,
  created_at          timestamptz not null default now()
);

create index idx_user_alerts_user on public.user_alerts (user_id);

-- ─── SIGNAL BOOKMARKS ─────────────────────────────────────────────────────────
create table public.signal_bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  signal_id   text not null references public.signals(id) on delete cascade,
  notes       text,
  bookmarked_at timestamptz not null default now(),
  constraint signal_bookmarks_unique unique (user_id, signal_id)
);

create index idx_signal_bookmarks_user on public.signal_bookmarks (user_id);

-- ─── SCAN HISTORY (audit log) ─────────────────────────────────────────────────
create table public.scan_history (
  id                    uuid primary key default gen_random_uuid(),
  chain                 chain_id not null,
  signals_generated     int not null default 0,
  high_conviction_count int not null default 0,
  duration_ms           int not null default 0,
  triggered_by          text not null default 'cron',    -- cron, manual, api
  errors                text[] not null default '{}',
  scanned_at            timestamptz not null default now()
);

create index idx_scan_history_chain on public.scan_history (chain, scanned_at desc);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

-- Profiles: users can only see and edit their own profile
alter table public.profiles enable row level security;
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Subscriptions: own row only
alter table public.subscriptions enable row level security;
create policy "Users can read own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);

-- Wallets: all authenticated users can read, service role writes
alter table public.wallets enable row level security;
create policy "Authenticated users can read wallets"
  on public.wallets for select using (auth.role() = 'authenticated');

-- Signals: all authenticated users can read public signals
alter table public.signals enable row level security;
create policy "Authenticated users can read signals"
  on public.signals for select using (auth.role() = 'authenticated');

-- User watchlist: own rows only
alter table public.user_watchlist enable row level security;
create policy "Users can manage own watchlist"
  on public.user_watchlist for all using (auth.uid() = user_id);

-- User alerts: own rows only
alter table public.user_alerts enable row level security;
create policy "Users can manage own alerts"
  on public.user_alerts for all using (auth.uid() = user_id);

-- Signal bookmarks: own rows only
alter table public.signal_bookmarks enable row level security;
create policy "Users can manage own bookmarks"
  on public.signal_bookmarks for all using (auth.uid() = user_id);

-- Scan history: read-only for all authenticated
alter table public.scan_history enable row level security;
create policy "Authenticated users can read scan history"
  on public.scan_history for select using (auth.role() = 'authenticated');

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at on profiles
create or replace function public.handle_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.handle_updated_at();

-- Reset daily signal count at midnight
create or replace function public.reset_daily_signals()
returns void language plpgsql security definer
as $$
begin
  update public.profiles
  set signals_today = 0, signals_reset_at = now()
  where signals_reset_at < date_trunc('day', now());
end;
$$;

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

-- Find similar wallets using embedding cosine similarity
create or replace function public.find_similar_wallets(
  query_embedding vector(1536),
  match_threshold float default 0.78,
  match_count int default 5
)
returns table (
  id uuid,
  address text,
  chain chain_id,
  archetype text,
  conviction_score int,
  tags text[],
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    w.id,
    w.address,
    w.chain,
    w.archetype,
    w.conviction_score,
    w.tags,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.wallets w
  where w.embedding is not null
    and 1 - (w.embedding <=> query_embedding) > match_threshold
  order by w.embedding <=> query_embedding
  limit match_count;
end;
$$;
