/**
 * CELSOR — /api/thesis
 * POST { query: "PEPE" | "0xABC..." }
 *
 * Runs the full Multi-Agent Thesis Engine:
 * 1. Security Agent (on-chain analysis)
 * 2. Social Agent (X/YouTube/Telegram quality scoring)
 * 3. Mediator (synthesizes, spawns Economic Agent if conflict)
 *
 * Returns a complete ThesisReport with dev history, social intelligence,
 * and agent debate transcript.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMultiAgentThesis } from '@/lib/agents/mediator';
import { cacheGet, cacheSet } from '@/lib/db/redis';

const CACHE_TTL = 600; // 10 minutes

async function searchToken(query: string) {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      { next: { revalidate: 60 } }
    );
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (!pair) return null;

    return {
      name: pair.baseToken?.name ?? query,
      symbol: pair.baseToken?.symbol ?? query.toUpperCase(),
      address: pair.baseToken?.address ?? '',
      chain: pair.chainId ?? 'eth',
      price: pair.priceUsd,
      priceChange24h: pair.priceChange?.h24,
      liquidity: pair.liquidity?.usd,
      marketCap: pair.marketCap,
      fdv: pair.fdv,
      pairCreatedAt: pair.pairCreatedAt,
      dexUrl: pair.url,
      txns24h: pair.txns?.h24,
    };
  } catch {
    return null;
  }
}

async function getOnChainSafety(tokenAddress: string, chain: string) {
  const chainIdMap: Record<string, string> = {
    ethereum: '1', eth: '1', bsc: '56', arbitrum: '42161',
    arb: '42161', base: '8453', op: '10', optimism: '10',
  };
  const chainId = chainIdMap[chain] ?? '1';

  try {
    const res = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${tokenAddress}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    const result = data?.result?.[tokenAddress.toLowerCase()];
    if (!result) return null;

    return {
      isHoneypot: result.is_honeypot === '1',
      cannotSell: result.cannot_sell_all === '1',
      hasProxy: result.is_proxy === '1',
      mintable: result.is_mintable === '1',
      ownerCanRenounce: result.can_take_back_ownership === '1',
      creatorHoldPercent: parseFloat(result.creator_percent ?? '0') * 100,
      lpLockedPercent: parseFloat(result.lp_holder_analysis?.[0]?.percent ?? '0') * 100,
      holderCount: parseInt(result.holder_count ?? '0'),
      topHolders: (result.holders ?? []).slice(0, 5).map((h: any) => ({
        address: h.address,
        percent: parseFloat(h.percent) * 100,
        isLocked: h.is_locked === 1,
        isContract: h.is_contract === 1,
        tag: h.tag,
      })),
    };
  } catch {
    return null;
  }
}

async function getTavilyResults(tokenName: string, tokenSymbol: string) {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) return [];

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: `${tokenName} ${tokenSymbol} crypto review 2025 twitter telegram youtube`,
        search_depth: 'advanced',
        max_results: 10,
        include_domains: ['twitter.com', 'x.com', 'youtube.com', 't.me', 'telegram.org', 'reddit.com'],
      }),
    });
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

async function getCoinGeckoData(symbol: string) {
  try {
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      { next: { revalidate: 600 } }
    );
    const searchData = await searchRes.json();
    const coin = searchData?.coins?.[0];
    if (!coin?.id) return {};

    const detailRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false`,
      { next: { revalidate: 600 } }
    );
    const detail = await detailRes.json();

    return {
      twitterFollowers: detail?.community_data?.twitter_followers ?? 0,
      twitterHandle: detail?.links?.twitter_screen_name ?? '',
      youtubeChannel: detail?.links?.youtube_channel ?? '',
      telegramChannel: detail?.links?.telegram_channel_identifier ?? '',
      sentimentUpPct: detail?.sentiment_votes_up_percentage ?? 50,
      rawDescription: detail?.description?.en?.replace(/<[^>]+>/g, '').slice(0, 1000) ?? '',
    };
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ ok: false, error: 'Query too short' }, { status: 400 });
    }

    const cacheKey = `celsor:v2:thesis:${query.toLowerCase().trim()}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return NextResponse.json({ ok: true, report: cached, cached: true });

    // Step 1: Find token
    const tokenData = await searchToken(query.trim());
    if (!tokenData) {
      return NextResponse.json({ ok: false, error: `Token "${query}" not found` }, { status: 404 });
    }

    // Step 2: Parallel fetch all data sources
    const [onChainData, tavilyResults, cgData] = await Promise.all([
      tokenData.address ? getOnChainSafety(tokenData.address, tokenData.chain) : Promise.resolve(null),
      getTavilyResults(tokenData.name, tokenData.symbol),
      getCoinGeckoData(tokenData.symbol),
    ]);

    // Step 3: Run multi-agent thesis
    const report = await runMultiAgentThesis({
      tokenData,
      onChainData,
      tavilyResults,
      cgData,
    });

    // Enrich with market data for display
    const enrichedReport = {
      ...report,
      price: tokenData.price ? `$${parseFloat(tokenData.price).toFixed(8)}` : 'Unknown',
      priceChange24h: tokenData.priceChange24h ? `${tokenData.priceChange24h}%` : 'N/A',
      liquidity: tokenData.liquidity ? `$${Number(tokenData.liquidity).toLocaleString()}` : 'N/A',
      marketCap: tokenData.marketCap ? `$${Number(tokenData.marketCap).toLocaleString()}` : 'N/A',
      dexUrl: tokenData.dexUrl ?? '',
      cgDescription: cgData.rawDescription ?? '',
    };

    await cacheSet(cacheKey, enrichedReport, CACHE_TTL);

    return NextResponse.json({ ok: true, report: enrichedReport, cached: false });
  } catch (error) {
    console.error('[/api/thesis]', error);
    return NextResponse.json({ ok: false, error: 'Thesis analysis failed' }, { status: 500 });
  }
}
