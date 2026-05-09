/**
 * CELSOR — /api/analyze
 * POST { query: "PEPE" | "0xABC..." }
 * 
 * Returns a structured Institutional Conviction Report:
 * - On-chain safety (GoPlus honeypot check, liquidity lock)
 * - Social narrative (Twitter/YouTube/Bybit bio)
 * - Rugpull Probability (0-100)
 * - Growth Potential (0-100)
 * - GPT-4o executive summary
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'mock_key' });

// ─── On-Chain Safety via GoPlus API (free, no key needed) ────────────────────

async function getOnChainSafety(tokenAddress: string, chain = 'eth') {
  const chainIdMap: Record<string, string> = {
    eth: '1', bsc: '56', arb: '42161', base: '8453', op: '10',
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

// ─── Token search via DexScreener ────────────────────────────────────────────

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
      name: pair.baseToken?.name,
      symbol: pair.baseToken?.symbol,
      address: pair.baseToken?.address,
      chain: pair.chainId,
      price: pair.priceUsd,
      priceChange24h: pair.priceChange?.h24,
      volume24h: pair.volume?.h24,
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

// ─── Social Search via SearXNG/Tavily (free fallback to structured mock) ──────

async function getSocialContext(tokenName: string, tokenSymbol: string): Promise<{
  twitterMentions: string[];
  youtubeMentions: string[];
  bybitContext: string;
  redditSentiment: string;
  rawContext: string;
}> {
  // Use Tavily if configured, otherwise synthesize from DexScreener/CoinGecko
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (tavilyKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: `${tokenName} ${tokenSymbol} crypto coin review rugpull scam OR legitimate 2024 2025`,
          search_depth: 'advanced',
          max_results: 8,
          include_domains: ['twitter.com', 'youtube.com', 'bybit.com', 'reddit.com', 'coinmarketcap.com'],
        }),
      });
      const data = await res.json();
      const results = data.results ?? [];
      
      const rawContext = results.map((r: any) => `[${r.title}] ${r.content}`).join('\n\n');
      const twitter = results.filter((r: any) => r.url?.includes('twitter.com')).map((r: any) => r.title);
      const youtube = results.filter((r: any) => r.url?.includes('youtube.com')).map((r: any) => r.title);
      const bybit = results.find((r: any) => r.url?.includes('bybit.com'))?.content ?? '';
      const reddit = results.find((r: any) => r.url?.includes('reddit.com'))?.content ?? '';

      return { twitterMentions: twitter, youtubeMentions: youtube, bybitContext: bybit, redditSentiment: reddit, rawContext };
    } catch { /* fallthrough */ }
  }

  // CoinGecko fallback for coin description/bio
  try {
    const cgRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(tokenSymbol)}`,
      { next: { revalidate: 600 } }
    );
    const cgData = await cgRes.json();
    const coin = cgData?.coins?.[0];
    
    if (coin?.id) {
      const detailRes = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false`,
        { next: { revalidate: 600 } }
      );
      const detail = await detailRes.json();
      const desc = detail?.description?.en?.replace(/<[^>]+>/g, '').slice(0, 1500) ?? '';
      const twitter = detail?.links?.twitter_screen_name ? [`@${detail.links.twitter_screen_name}`] : [];
      const youtube = detail?.links?.youtube_channel ? [detail.links.youtube_channel] : [];

      return {
        twitterMentions: twitter,
        youtubeMentions: youtube,
        bybitContext: '',
        redditSentiment: detail?.sentiment_votes_up_percentage ? `${detail.sentiment_votes_up_percentage}% positive` : '',
        rawContext: desc,
      };
    }
  } catch { /* ignore */ }

  return { twitterMentions: [], youtubeMentions: [], bybitContext: '', redditSentiment: '', rawContext: '' };
}

// ─── Structured Report Schema ─────────────────────────────────────────────────

interface ConvictionReport {
  coinName: string;
  coinSymbol: string;
  coinAddress: string;
  chain: string;

  // Scores
  rugpullRisk: number;         // 0-100 (higher = more risky)
  growthPotential: number;     // 0-100
  institutionalConviction: number; // composite

  // Verdicts
  verdict: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'CONFIRMED_RUG';
  verdictReason: string;

  // Breakdown
  onChainFlags: string[];
  socialSignals: string[];
  risks: string[];
  catalysts: string[];

  // Executive Summary
  executiveSummary: string;
  whyThisCoinExists: string;
  teamBackground: string;

  // Market
  price: string;
  priceChange24h: string;
  liquidity: string;
  marketCap: string;

  // Meta
  analysedAt: number;
  dexUrl: string;
}

// ─── Rule-Based Fallback Engine (when OpenAI quota exceeded) ────────────────

function buildFallbackReport(tokenData: any, safetyData: any, socialData: any): ConvictionReport {
  const onChainFlags: string[] = [];
  const socialSignals: string[] = [];
  let rugRisk = 20;
  let growth = 50;

  // On-chain scoring
  if (safetyData) {
    if (safetyData.isHoneypot)       { onChainFlags.push('⚠ Honeypot detected — cannot sell'); rugRisk += 40; }
    if (safetyData.mintable)          { onChainFlags.push('Contract is mintable — unlimited supply risk'); rugRisk += 15; }
    if (safetyData.hasProxy)          { onChainFlags.push('Proxy contract — owner can change logic'); rugRisk += 10; }
    if (safetyData.creatorHoldPercent > 20) { onChainFlags.push(`Creator holds ${safetyData.creatorHoldPercent.toFixed(1)}% of supply`); rugRisk += 20; }
    if (safetyData.lpLockedPercent < 50)    { onChainFlags.push('LP not fully locked — rug risk'); rugRisk += 15; }
    if (safetyData.holderCount > 5000)      { growth += 15; }
  } else {
    onChainFlags.push('On-chain safety data unavailable — treat with caution');
    rugRisk += 10;
  }

  // Social scoring
  if (socialData.twitterMentions.length > 0) {
    socialSignals.push(`Twitter presence: ${socialData.twitterMentions[0]}`); growth += 5;
  }
  if (socialData.youtubeMentions.length > 0) {
    socialSignals.push(`YouTube coverage detected`); growth += 5;
  }
  if (socialData.redditSentiment) {
    socialSignals.push(`Community: ${socialData.redditSentiment}`);
  }
  if (socialData.rawContext.toLowerCase().includes('rug')) {
    socialSignals.push('Rug mentions found in social context'); rugRisk += 15;
  }
  if (socialData.rawContext.toLowerCase().includes('scam')) {
    socialSignals.push('Scam mentions found in social context'); rugRisk += 10;
  }

  // Market data
  const liq = Number(tokenData.liquidity ?? 0);
  if (liq < 50_000)  { rugRisk += 15; onChainFlags.push('Low liquidity — exit risk'); }
  if (liq > 500_000) { growth += 10; }

  const age = tokenData.pairCreatedAt ? (Date.now() - tokenData.pairCreatedAt) / (1000 * 60 * 60 * 24) : 999;
  if (age < 7) { rugRisk += 15; onChainFlags.push(`Very new token — ${age.toFixed(0)} days old`); }
  else if (age > 180) { growth += 10; }

  rugRisk = Math.min(rugRisk, 100);
  growth  = Math.min(growth, 100);
  const conviction = Math.round((growth * 0.6) + ((100 - rugRisk) * 0.4));

  let verdict: ConvictionReport['verdict'] = 'SAFE';
  if (rugRisk >= 80)      verdict = 'CONFIRMED_RUG';
  else if (rugRisk >= 55) verdict = 'HIGH_RISK';
  else if (rugRisk >= 30) verdict = 'CAUTION';

  const verdictMessages: Record<typeof verdict, string> = {
    SAFE: 'No major red flags detected. Monitor for position changes.',
    CAUTION: 'Some risk factors present. Reduce position size and set tight stops.',
    HIGH_RISK: 'Multiple risk factors detected. High probability of adverse outcome.',
    CONFIRMED_RUG: 'Critical security flags — honeypot or extreme concentration detected.',
  };

  return {
    coinName: tokenData.name ?? 'Unknown',
    coinSymbol: tokenData.symbol ?? '???',
    coinAddress: tokenData.address ?? '',
    chain: tokenData.chain ?? 'eth',
    price: tokenData.price ? `$${parseFloat(tokenData.price).toFixed(8)}` : 'Unknown',
    priceChange24h: tokenData.priceChange24h ? `${tokenData.priceChange24h}%` : 'N/A',
    liquidity: liq ? `$${liq.toLocaleString()}` : 'N/A',
    marketCap: tokenData.marketCap ? `$${Number(tokenData.marketCap).toLocaleString()}` : 'N/A',
    dexUrl: tokenData.dexUrl ?? '',
    analysedAt: Date.now(),
    rugpullRisk: rugRisk,
    growthPotential: growth,
    institutionalConviction: conviction,
    verdict,
    verdictReason: verdictMessages[verdict],
    onChainFlags,
    socialSignals,
    risks: onChainFlags.slice(0, 3),
    catalysts: socialSignals.slice(0, 2),
    executiveSummary: `${tokenData.symbol} is a ${tokenData.chain?.toUpperCase()} token with $${liq.toLocaleString()} liquidity. Rug risk: ${rugRisk}/100. Growth potential: ${growth}/100. ${verdictMessages[verdict]}`,
    whyThisCoinExists: socialData.rawContext?.slice(0, 300) || 'Narrative context not available.',
    teamBackground: 'Team verification not available — check official channels.',
  };
}

// ─── Main GPT-4o Analysis (with rule-based fallback) ──────────────────────────

async function generateReport(
  tokenData: any,
  safetyData: any,
  socialData: any,
): Promise<ConvictionReport> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    try {
      const prompt = `You are Celsor's institutional intelligence engine. Analyze this token and return a structured JSON report.

TOKEN DATA:
Name: ${tokenData.name}
Symbol: ${tokenData.symbol}
Address: ${tokenData.address}
Chain: ${tokenData.chain}
Price: $${tokenData.price}
24h Change: ${tokenData.priceChange24h}%
Liquidity: $${tokenData.liquidity?.toLocaleString()}
Market Cap: $${tokenData.marketCap?.toLocaleString()}
Created: ${tokenData.pairCreatedAt ? new Date(tokenData.pairCreatedAt).toDateString() : 'Unknown'}

ON-CHAIN SAFETY:
${safetyData ? JSON.stringify(safetyData, null, 2) : 'Could not fetch on-chain data'}

SOCIAL & NARRATIVE CONTEXT:
${socialData.rawContext?.slice(0, 1000) || 'No social context available'}
Twitter: ${socialData.twitterMentions.join(', ') || 'None found'}
Reddit: ${socialData.redditSentiment || 'Unknown'}

Return ONLY valid JSON:
{
  "rugpullRisk": <0-100>,
  "growthPotential": <0-100>,
  "institutionalConviction": <0-100>,
  "verdict": "SAFE"|"CAUTION"|"HIGH_RISK"|"CONFIRMED_RUG",
  "verdictReason": "<1 sentence>",
  "onChainFlags": ["<flag>"],
  "socialSignals": ["<signal>"],
  "risks": ["<risk>"],
  "catalysts": ["<catalyst>"],
  "executiveSummary": "<2-3 sentences>",
  "whyThisCoinExists": "<what problem/narrative>",
  "teamBackground": "<team info>"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
      return {
        coinName: tokenData.name,
        coinSymbol: tokenData.symbol,
        coinAddress: tokenData.address,
        chain: tokenData.chain,
        price: tokenData.price ? `$${parseFloat(tokenData.price).toFixed(8)}` : 'Unknown',
        priceChange24h: tokenData.priceChange24h ? `${tokenData.priceChange24h}%` : 'N/A',
        liquidity: tokenData.liquidity ? `$${Number(tokenData.liquidity).toLocaleString()}` : 'N/A',
        marketCap: tokenData.marketCap ? `$${Number(tokenData.marketCap).toLocaleString()}` : 'N/A',
        dexUrl: tokenData.dexUrl ?? '',
        analysedAt: Date.now(),
        ...parsed,
      };
    } catch (aiErr: any) {
      // If quota exceeded or any AI error, fall through to rule-based engine
      console.warn('[/api/analyze] OpenAI unavailable, using rule-based engine:', aiErr?.message?.slice(0, 80));
    }
  }

  // Rule-based fallback
  return buildFallbackReport(tokenData, safetyData, socialData);
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ ok: false, error: 'Query too short' }, { status: 400 });
    }

    // Step 1: Find the token on DEX
    const tokenData = await searchToken(query.trim());
    if (!tokenData) {
      return NextResponse.json({ ok: false, error: `Token "${query}" not found on any DEX. Try the full name or contract address.` }, { status: 404 });
    }

    // Step 2: Parallel fetch — on-chain safety + social context
    const [safetyData, socialData] = await Promise.all([
      tokenData.address ? getOnChainSafety(tokenData.address, tokenData.chain) : Promise.resolve(null),
      getSocialContext(tokenData.name ?? query, tokenData.symbol ?? query),
    ]);

    // Step 3: Generate GPT-4o institutional report
    const report = await generateReport(tokenData, safetyData, socialData);

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error('[/api/analyze]', error);
    return NextResponse.json({ ok: false, error: 'Analysis failed' }, { status: 500 });
  }
}

// GET: Quick search autocomplete — deduplicated, 1 result per symbol
export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get('q') ?? '';
  if (query.length < 2) return NextResponse.json({ suggestions: [] });

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      { next: { revalidate: 30 } }
    );
    const data = await res.json();
    const pairs: any[] = data?.pairs ?? [];

    // Deduplicate by uppercase symbol — keep the pair with highest liquidity
    const bySymbol = new Map<string, any>();
    for (const p of pairs) {
      const sym = (p.baseToken?.symbol ?? '').toUpperCase();
      if (!sym) continue;
      const liq = p.liquidity?.usd ?? 0;
      const existing = bySymbol.get(sym);
      if (!existing || liq > (existing.liquidity?.usd ?? 0)) {
        bySymbol.set(sym, p);
      }
    }

    // Filter: only keep symbols that actually match what the user typed
    const q = query.toUpperCase();
    const suggestions = Array.from(bySymbol.entries())
      .filter(([sym]) => sym.startsWith(q) || sym === q)
      .sort(([, a], [, b]) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
      .slice(0, 5)
      .map(([, p]) => ({
        name: p.baseToken?.name,
        symbol: p.baseToken?.symbol,
        address: p.baseToken?.address,
        chain: p.chainId,
        price: p.priceUsd,
        priceChange24h: p.priceChange?.h24,
        liquidity: p.liquidity?.usd,
        volume24h: p.volume?.h24,
      }));

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
