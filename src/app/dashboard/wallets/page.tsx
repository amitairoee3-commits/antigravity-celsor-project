'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Wallet, TrendingUp, TrendingDown, Zap, AlertTriangle,
  RefreshCw, ChevronRight, Shield, Bot, Users, Star, ArrowUpRight, Globe
} from 'lucide-react';
import type { WalletProfile } from '@/lib/ml/clusterer';
import type { DiscoveredWallet } from '@/lib/engine/autonomousScanner';

interface WhaleTx {
  hash: string;
  from: string;
  to: string;
  valueEth: number;
  timeStamp: string;
  chain: string;
  tokenSymbol?: string;
}

interface WalletData {
  whaleTxs: WhaleTx[];
  walletProfiles: WalletProfile[];
  chainStats: Record<string, number>;
  totalTracked: number;
  timestamp: number;
}

const CHAIN_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  eth: { label: 'ETH', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  sol: { label: 'SOL', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  arb: { label: 'ARB', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  base: { label: 'BASE', color: 'text-blue-300', bg: 'bg-blue-400/10 border-blue-400/20' },
  bsc: { label: 'BSC', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  op: { label: 'OP', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

const ARCHETYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  smart_money: { label: 'Smart Money', icon: <Star className="w-3 h-3" />, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  insider: { label: 'Insider', icon: <Shield className="w-3 h-3" />, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  whale: { label: 'Whale', icon: <TrendingUp className="w-3 h-3" />, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  degen: { label: 'Degen', icon: <Zap className="w-3 h-3" />, color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/30' },
  bot: { label: 'Bot', icon: <Bot className="w-3 h-3" />, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30' },
  vc_unlock: { label: 'VC Unlock', icon: <AlertTriangle className="w-3 h-3" />, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  unknown: { label: 'Unknown', icon: <Users className="w-3 h-3" />, color: 'text-gray-500', bg: 'bg-gray-500/10 border-gray-500/20' },
};

function shortenAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
}

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function WalletsPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [watchlist, setWatchlist] = useState<DiscoveredWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChain, setActiveChain] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'whales' | 'watchlist' | 'profiles'>('watchlist');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [walletRes, engineRes] = await Promise.all([
        fetch(`/api/wallets?chain=${activeChain}`),
        fetch('/api/engine/scan'),
      ]);
      const walletJson = await walletRes.json();
      const engineJson = await engineRes.json();
      // Normalize API shape — ensure whaleTxs/walletProfiles always exist
      setData({
        whaleTxs: walletJson.whaleTxs ?? [],
        walletProfiles: walletJson.walletProfiles ?? walletJson.wallets ?? [],
        chainStats: walletJson.chainStats ?? {},
        totalTracked: walletJson.totalTracked ?? walletJson.count ?? 0,
        timestamp: walletJson.timestamp ?? Date.now(),
      });
      setWatchlist(engineJson.watchlist ?? []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Wallet fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [activeChain]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="min-w-0">
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Auto-Watching', value: watchlist.length, icon: <Wallet className="w-5 h-5" />, color: 'text-orange-400' },
            { label: 'Whale Txs (Live)', value: data?.whaleTxs.length ?? '—', icon: <Activity className="w-5 h-5" />, color: 'text-green-400' },
            { label: 'Smart Money', value: watchlist.filter(w => w.archetype === 'smart_money').length, icon: <Star className="w-5 h-5" />, color: 'text-yellow-400' },
            { label: 'Insider Signals', value: watchlist.filter(w => w.archetype === 'insider').length, icon: <Shield className="w-5 h-5" />, color: 'text-red-400' },
          ].map(stat => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-[#111] border border-white/5 rounded-xl p-5 flex items-center gap-4">
              <div className={`${stat.color} p-2 rounded-lg bg-white/5`}>{stat.icon}</div>
              <div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Chain Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Globe className="w-4 h-4 text-gray-500" />
          {['all', 'eth', 'sol', 'arb', 'base', 'bsc', 'op'].map(chain => (
            <button key={chain} onClick={() => setActiveChain(chain)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                activeChain === chain
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                  : 'bg-white/[0.03] border-white/5 text-gray-500 hover:text-gray-300'
              }`}>
              {chain === 'all' ? 'All Chains' : CHAIN_CONFIG[chain]?.label ?? chain.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[#111] rounded-xl border border-white/5 w-fit">
          {(['watchlist', 'whales', 'profiles'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {tab === 'whales' ? '🐋 Whale Txs' : tab === 'watchlist' ? '👁 Auto-Watchlist' : '📊 Profiles'}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'watchlist' ? (
            <motion.div key="watchlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {watchlist.length === 0 ? (
                <EmptyState message="Engine scanning markets — wallets auto-added when high-conviction signals detected…" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {watchlist.map((w, i) => (
                    <WatchlistCard key={w.address + i} wallet={w} index={i} />
                  ))}
                </div>
              )}
            </motion.div>
          ) : activeTab === 'whales' ? (
            <motion.div key="whales" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {(data?.whaleTxs ?? []).length === 0 ? (
                <EmptyState message="Scanning chains for whale movements…" />
              ) : (
                data?.whaleTxs.map((tx, i) => (
                  <WhaleTxCard key={tx.hash + i} tx={tx} index={i} />
                ))
              )}
            </motion.div>
          ) : (
            <motion.div key="profiles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(data?.walletProfiles ?? []).map((profile, i) => (
                  <WalletProfileCard key={profile.address + i} profile={profile} index={i} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function WhaleTxCard({ tx, index }: { tx: WhaleTx; index: number }) {
  const chain = CHAIN_CONFIG[tx.chain] ?? { label: tx.chain.toUpperCase(), color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' };
  const usdValue = tx.valueEth * (tx.tokenSymbol === 'ETH' ? 3000 : 1);
  const isLarge = usdValue >= 500_000;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`bg-[#111] border rounded-xl p-4 flex items-center gap-4 hover:border-white/10 transition-colors relative overflow-hidden ${isLarge ? 'border-orange-500/20' : 'border-white/5'}`}
    >
      {isLarge && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />}
      
      <div className={`px-2.5 py-1 rounded-md text-xs font-bold border ${chain.bg} ${chain.color}`}>
        {chain.label}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 font-mono">{shortenAddress(tx.from)}</span>
          <ArrowUpRight className="w-3 h-3 text-gray-600 shrink-0" />
          <span className="text-gray-400 font-mono">{shortenAddress(tx.to)}</span>
        </div>
        <div className="text-xs text-gray-600 mt-0.5 font-mono">{tx.hash.slice(0, 20)}…</div>
      </div>

      <div className="text-right shrink-0">
        <div className={`text-lg font-bold font-mono ${isLarge ? 'text-orange-400' : 'text-white'}`}>
          {formatUsd(usdValue)}
        </div>
        <div className="text-xs text-gray-500">{tx.tokenSymbol ?? 'NATIVE'}</div>
      </div>

      {isLarge && (
        <div className="flex items-center gap-1 text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-md">
          <Zap className="w-3 h-3" />
          <span className="text-xs font-bold">WHALE</span>
        </div>
      )}
    </motion.div>
  );
}

function WalletProfileCard({ profile, index }: { profile: WalletProfile; index: number }) {
  const arch = ARCHETYPE_CONFIG[profile.archetype] ?? ARCHETYPE_CONFIG['unknown'];
  const winPct = Math.round((profile.winRate ?? 0) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-[#111] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-mono text-sm text-gray-300">{shortenAddress(profile.address)}</div>
          <div className={`flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold w-fit ${arch.bg} ${arch.color}`}>
            {arch.icon} {arch.label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">Conviction</div>
          <div className="text-xl font-bold text-white font-mono">{profile.archetypeScore}%</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Age', value: `${profile.ageDays}d` },
          { label: 'Txs', value: profile.txCount.toLocaleString() },
          { label: 'Avg Size', value: formatUsd(profile.avgTxUsd) },
        ].map(stat => (
          <div key={stat.label} className="bg-black/30 rounded-lg p-2.5 text-center">
            <div className="text-xs text-gray-500">{stat.label}</div>
            <div className="text-sm font-semibold text-white mt-0.5">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Win Rate Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Est. Win Rate</span>
          <span className={winPct >= 70 ? 'text-green-400' : winPct >= 50 ? 'text-yellow-400' : 'text-red-400'}>{winPct}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${winPct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: index * 0.06 + 0.3 }}
            className={`h-full rounded-full ${winPct >= 70 ? 'bg-green-500' : winPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {profile.tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-xs px-2 py-0.5 bg-white/[0.04] border border-white/5 rounded-full text-gray-400">{tag}</span>
        ))}
      </div>
    </motion.div>
  );
}

function WatchlistCard({ wallet, index }: { wallet: DiscoveredWallet; index: number }) {
  const chain = CHAIN_CONFIG[wallet.chain] ?? { label: wallet.chain.toUpperCase(), color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' };
  const arch = ARCHETYPE_CONFIG[wallet.archetype] ?? ARCHETYPE_CONFIG['unknown'];
  const isHigh = wallet.convictionScore >= 75;
  const timeAgo = Math.round((Date.now() - wallet.detectedAt) / 60_000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`bg-[#111] border rounded-xl p-5 hover:border-white/10 transition-all relative overflow-hidden ${isHigh ? 'border-orange-500/20' : 'border-white/5'}`}
    >
      {isHigh && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-mono text-sm text-gray-300">{shortenAddress(wallet.address)}</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${chain.bg} ${chain.color}`}>{chain.label}</span>
            <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${arch.bg} ${arch.color}`}>
              {arch.icon} {arch.label}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-bold font-mono ${isHigh ? 'text-orange-400' : 'text-white'}`}>{wallet.convictionScore}</div>
          <div className="text-xs text-gray-500">Conviction</div>
        </div>
      </div>
      <div className="bg-black/30 rounded-lg p-3 mb-3">
        <div className="text-xs text-gray-400 leading-relaxed">{wallet.reason}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-orange-400 font-mono font-bold">{wallet.tokenTrigger}</span>
          <span className={`text-xs font-semibold ${wallet.priceAction > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {wallet.priceAction > 0 ? '+' : ''}{wallet.priceAction.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {wallet.tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 bg-white/[0.04] border border-white/5 rounded-full text-gray-500">{tag}</span>
          ))}
        </div>
        <span className="text-xs text-gray-600">{timeAgo < 1 ? 'just now' : `${timeAgo}m ago`}</span>
      </div>
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
      <Activity className="w-8 h-8 text-gray-600 mb-4 animate-pulse" />
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );
}
