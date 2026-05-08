/**
 * CELSOR — Social Intelligence Agent
 * 
 * Focuses on narrative quality and social presence:
 * - X (Twitter): follower count, engagement RATE (not raw followers), influencer mentions
 * - YouTube: video coverage, view velocity  
 * - Telegram: member velocity, message speed
 * 
 * Weighted by ENGAGEMENT QUALITY not just follower counts.
 * A project with 1M followers but 0.01% engagement scores lower 
 * than one with 50K followers and 8% engagement.
 */

import type { AgentFinding, SocialIntelligence } from './types';

interface CoinGeckoSocialData {
  twitterFollowers?: number;
  twitterHandle?: string;
  youtubeChannel?: string;
  telegramChannel?: string;
  redditSubscribers?: number;
  sentimentUpPct?: number;
}

interface TavilyResult {
  title: string;
  content: string;
  url: string;
  score?: number;
}

// Score social presence — weighted by engagement quality, not raw size
function scoreSocialPresence(
  tavilyResults: TavilyResult[],
  cgData: CoinGeckoSocialData,
  tokenSymbol: string,
): SocialIntelligence {

  // ─── X (Twitter) scoring ───────────────────────────────────────────────────
  const xFollowers = cgData.twitterFollowers ?? 0;

  // Estimate engagement from mentions and recency in search results
  const xMentions = tavilyResults.filter(r => r.url?.includes('twitter.com') || r.url?.includes('x.com'));
  const xMentions24h = xMentions.length;
  
  // Calculate engagement rate estimate
  // Projects with high follower counts but low search presence = low engagement
  let xEngagementRate = 0;
  if (xFollowers > 0 && xMentions24h > 0) {
    xEngagementRate = Math.min(100, (xMentions24h / Math.log10(xFollowers + 1)) * 10);
  }

  // Quality signals: influencer content > regular mentions
  const xInfluencerMentions = xMentions
    .filter(r => r.score && r.score > 0.7)
    .map(r => r.title.slice(0, 60))
    .slice(0, 3);

  // X score: balanced between followers, engagement rate, and search visibility
  let xScore = 0;
  if (xFollowers >= 1_000_000) xScore += 30;
  else if (xFollowers >= 100_000) xScore += 20;
  else if (xFollowers >= 10_000) xScore += 12;
  else if (xFollowers >= 1_000) xScore += 6;

  // Engagement multiplier — this is the key differentiator
  if (xEngagementRate > 5) xScore = Math.min(100, xScore + 30);
  else if (xEngagementRate > 2) xScore = Math.min(100, xScore + 15);
  else if (xEngagementRate < 0.1 && xFollowers > 100_000) xScore = Math.max(0, xScore - 15); // ghost followers penalty

  xScore += xMentions24h * 5; // bonus for active mentions
  xScore = Math.min(100, xScore);

  // Sentiment from mention content
  const xContent = xMentions.map(r => r.content.toLowerCase()).join(' ');
  const xBullKeywords = ['moon', 'pump', 'bullish', 'buy', 'gem', 'undervalued', '100x'];
  const xBearKeywords = ['rug', 'scam', 'dump', 'avoid', 'honeypot', 'exit'];
  const xBullScore = xBullKeywords.filter(k => xContent.includes(k)).length;
  const xBearScore = xBearKeywords.filter(k => xContent.includes(k)).length;
  const xSentiment = xBearScore >= 2 ? 'BEARISH' : xBullScore >= 2 ? 'BULLISH' : 'NEUTRAL';

  // ─── YouTube scoring ───────────────────────────────────────────────────────
  const ytMentions = tavilyResults.filter(r => r.url?.includes('youtube.com'));
  const ytVideoCount = ytMentions.length;
  const ytTotalViews = ytMentions.reduce((acc, r) => {
    const viewMatch = r.content.match(/(\d[\d,]+)\s*view/i);
    return acc + (viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : 0);
  }, 0);

  let ytScore = 0;
  if (ytVideoCount >= 5) ytScore += 30;
  else if (ytVideoCount >= 2) ytScore += 20;
  else if (ytVideoCount >= 1) ytScore += 10;
  
  if (ytTotalViews > 1_000_000) ytScore += 40;
  else if (ytTotalViews > 100_000) ytScore += 25;
  else if (ytTotalViews > 10_000) ytScore += 15;
  ytScore = Math.min(100, ytScore);

  const ytContent = ytMentions.map(r => r.content.toLowerCase()).join(' ');
  const ytSentiment = ytContent.includes('rug') || ytContent.includes('scam') ? 'BEARISH' :
                      ytContent.includes('buy') || ytContent.includes('gem') ? 'BULLISH' : 'NEUTRAL';

  // ─── Telegram scoring ─────────────────────────────────────────────────────
  const tgMentions = tavilyResults.filter(r => r.url?.includes('t.me') || r.url?.includes('telegram'));
  
  // Estimate member count from context
  let tgMemberCount = 0;
  let tgMessageVelocity = 'Unknown';
  for (const r of tgMentions) {
    const memberMatch = r.content.match(/(\d[\d,]+)\s*member/i);
    if (memberMatch) tgMemberCount = parseInt(memberMatch[1].replace(/,/g, ''));
    const msgMatch = r.content.match(/(\d+)\s*message/i);
    if (msgMatch) tgMessageVelocity = `~${msgMatch[1]}/hr`;
  }

  let tgScore = 0;
  if (tgMemberCount >= 50_000) tgScore += 40;
  else if (tgMemberCount >= 10_000) tgScore += 25;
  else if (tgMemberCount >= 1_000) tgScore += 15;
  else if (tgMentions.length > 0) tgScore += 10; // has TG at least

  const tgContent = tgMentions.map(r => r.content.toLowerCase()).join(' ');
  const tgSentiment: SocialIntelligence['tgSentiment'] = 
    tgContent.includes('panic') || tgContent.includes('exit') ? 'PANIC' :
    tgContent.includes('rug') ? 'BEARISH' :
    tgContent.includes('moon') || tgContent.includes('pump') ? 'BULLISH' : 'NEUTRAL';

  // ─── Composite Social Score ────────────────────────────────────────────────
  // X gets highest weight since it's most real-time for crypto
  const socialScore = Math.round((xScore * 0.5) + (ytScore * 0.3) + (tgScore * 0.2));

  // Narrative strength
  const narrativeStrength: SocialIntelligence['narrativeStrength'] =
    socialScore >= 80 ? 'VIRAL' :
    socialScore >= 60 ? 'STRONG' :
    socialScore >= 35 ? 'MODERATE' : 'WEAK';

  // Social trend
  const recentMentions = tavilyResults.filter(r => {
    const content = r.content.toLowerCase();
    return content.includes('today') || content.includes('just') || content.includes('hours');
  }).length;
  const socialTrend: SocialIntelligence['socialTrend'] =
    recentMentions >= 3 ? 'GROWING' :
    tavilyResults.length >= 5 ? 'STABLE' : 'DECLINING';

  return {
    xFollowers,
    xEngagementRate: parseFloat(xEngagementRate.toFixed(2)),
    xSentiment,
    xMentions24h,
    xInfluencerMentions,
    xScore,
    ytVideoCount,
    ytTotalViews,
    ytSentiment,
    ytScore,
    tgMemberCount,
    tgMessageVelocity,
    tgSentiment,
    tgScore,
    socialScore,
    socialTrend,
    narrativeStrength,
  };
}

export function runSocialAgent(
  tavilyResults: TavilyResult[],
  cgData: CoinGeckoSocialData,
  tokenSymbol: string,
): { finding: AgentFinding; socialIntelligence: SocialIntelligence } {
  const socialIntelligence = scoreSocialPresence(tavilyResults, cgData, tokenSymbol);
  const { socialScore, narrativeStrength, xSentiment, ytSentiment, tgSentiment } = socialIntelligence;

  const flags: string[] = [];
  const catalysts: string[] = [];

  // Build flags and catalysts from social data
  if (socialIntelligence.xFollowers > 0) {
    if (socialIntelligence.xEngagementRate < 0.1 && socialIntelligence.xFollowers > 100_000) {
      flags.push(`${socialIntelligence.xFollowers.toLocaleString()} X followers but <0.1% engagement — possible ghost audience`);
    } else {
      catalysts.push(`X: ${socialIntelligence.xFollowers.toLocaleString()} followers, ${socialIntelligence.xEngagementRate}% engagement`);
    }
  } else {
    flags.push('No verified X presence found');
  }

  if (socialIntelligence.ytVideoCount > 0) {
    catalysts.push(`YouTube: ${socialIntelligence.ytVideoCount} coverage video(s), ${(socialIntelligence.ytTotalViews / 1000).toFixed(0)}K views`);
  } else {
    flags.push('No YouTube coverage detected');
  }

  if (socialIntelligence.tgMemberCount > 0) {
    catalysts.push(`Telegram: ${socialIntelligence.tgMemberCount.toLocaleString()} members`);
  }

  if (tgSentiment === 'PANIC') flags.push('Telegram showing PANIC sentiment — potential sell event incoming');
  if (xSentiment === 'BEARISH') flags.push('X sentiment leans negative — rug mentions detected');
  if (narrativeStrength === 'VIRAL') catalysts.push('VIRAL narrative momentum across X + YouTube');

  // Overall social verdict
  const bearishSignals = [xSentiment, ytSentiment, tgSentiment].filter(s => s === 'BEARISH').length;
  const bullishSignals = [xSentiment, ytSentiment].filter(s => s === 'BULLISH').length;

  let verdict: AgentFinding['verdict'] = 'NEUTRAL';
  if (tgSentiment === 'PANIC' || bearishSignals >= 2) verdict = 'DANGER';
  else if (bearishSignals >= 1) verdict = 'BEARISH';
  else if (bullishSignals >= 2 && socialScore >= 60) verdict = 'BULLISH';
  else if (socialScore >= 40) verdict = 'BULLISH';

  const finding: AgentFinding = {
    agentRole: 'social',
    confidence: tavilyResults.length > 3 ? 75 : 40,
    verdict,
    flags,
    catalysts,
    summary: `Social score: ${socialScore}/100. Narrative: ${narrativeStrength}. X sentiment: ${xSentiment}.`,
    weight: 0.35,
  };

  return { finding, socialIntelligence };
}
