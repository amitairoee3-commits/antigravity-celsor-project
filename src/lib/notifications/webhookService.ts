/**
 * CELSOR NEXUS — Elite Signal Webhook Service
 * Pushes high-conviction signals to Discord/Telegram for immediate alerting.
 */

export interface WebhookPayload {
  title: string;
  description: string;
  color?: number;
  url?: string;
  footer?: string;
}

export async function sendDiscordWebhook(payload: WebhookPayload) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: payload.title,
          description: payload.description,
          color: payload.color ?? 0xf97316, // Default orange
          url: payload.url,
          footer: payload.footer ? { text: payload.footer } : undefined,
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (error) {
    console.warn('[CELSOR Webhook] Failed to send Discord alert:', error);
  }
}

export async function sendTelegramWebhook(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      })
    });
  } catch (error) {
    console.warn('[CELSOR Webhook] Failed to send Telegram alert:', error);
  }
}

export async function notifyEliteSignal(signal: {
  type: 'INSTITUTIONAL' | 'MEMECOIN_ELITE';
  title: string;
  symbol: string;
  chain: string;
  convictionScore: number;
  narrative: string;
  address?: string;
}) {
  const isElite = signal.type === 'MEMECOIN_ELITE';
  const prefix = isElite ? '🚨 🔥 ELITE ENTRY DETECTED' : '🐋 INSTITUTIONAL TIER SIGNAL';
  const color = isElite ? 0xff0000 : 0x00ff00;

  const title = `${prefix} — ${signal.symbol} (${signal.chain.toUpperCase()})`;
  const description = `**Score:** ${signal.convictionScore}/100\n\n**Analysis:**\n${signal.narrative}`;
  const url = signal.address ? `https://dexscreener.com/${signal.chain}/${signal.address}` : undefined;

  // Discord
  await sendDiscordWebhook({
    title,
    description,
    color,
    url,
    footer: 'Celsor Institutional Intelligence Engine'
  });

  // Telegram
  const tgText = `<b>${title}</b>\n\n<b>Score:</b> ${signal.convictionScore}/100\n\n<b>Analysis:</b>\n${signal.narrative}\n\n${url ? `<a href="${url}">View on DexScreener</a>` : ''}`;
  await sendTelegramWebhook(tgText);
}
