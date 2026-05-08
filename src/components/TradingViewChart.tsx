'use client';

import { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;   // e.g., "BINANCE:ETHUSDT" or "COINBASE:BTCUSD"
  chain?: string;   // used to derive symbol if not provided
  height?: number;
  interval?: string; // '1', '5', '15', '60', '240', 'D'
  theme?: 'dark' | 'light';
  showToolbar?: boolean;
  showSideToolbar?: boolean;
  allowSymbolChange?: boolean;
  autosize?: boolean;
}

// Map chain+token to TradingView symbol
function toTVSymbol(symbol: string, chain?: string): string {
  // If already a TradingView format, return as-is
  if (symbol.includes(':')) return symbol;

  const normalized = symbol.toUpperCase().replace(/\s+/g, '');

  // Known mappings
  const knownSymbols: Record<string, string> = {
    'ETH': 'BINANCE:ETHUSDT',
    'BTC': 'BINANCE:BTCUSDT',
    'WBTC': 'BINANCE:BTCUSDT',
    'BNB': 'BINANCE:BNBUSDT',
    'SOL': 'BINANCE:SOLUSDT',
    'PEPE': 'BINANCE:PEPEUSDT',
    'BONK': 'BYBIT:BONKUSDT',
    'WIF': 'BINANCE:WIFUSDT',
    'BRETT': 'BYBIT:BRETTUSDT',
    'ARB': 'BINANCE:ARBUSDT',
    'OP': 'BINANCE:OPUSDT',
    'MATIC': 'BINANCE:MATICUSDT',
    'AVAX': 'BINANCE:AVAXUSDT',
    'LINK': 'BINANCE:LINKUSDT',
    'DOGE': 'BINANCE:DOGEUSDT',
    'SHIB': 'BINANCE:SHIBUSDT',
    'FLOKI': 'BINANCE:FLOKIUSDT',
    'TURBO': 'BYBIT:TURBOUSDT',
    'MEME': 'BINANCE:MEMEUSDT',
    'USDT': 'BINANCE:USDTUSDC',
    'USDC': 'BINANCE:BTCUSDT', // fallback to BTC for stablecoins
  };

  if (knownSymbols[normalized]) return knownSymbols[normalized];

  // Try Binance first, Bybit as fallback
  return `BINANCE:${normalized}USDT`;
}

declare global {
  interface Window {
    TradingView?: { widget: new (config: Record<string, unknown>) => unknown };
  }
}

const TradingViewChart = memo(function TradingViewChart({
  symbol,
  chain,
  height = 420,
  interval = '60',
  theme = 'dark',
  showToolbar = true,
  showSideToolbar = false,
  allowSymbolChange = true,
  autosize = false,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<unknown>(null);
  const tvSymbol = toTVSymbol(symbol, chain);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.id = `tv_widget_${Date.now()}`;
    widgetDiv.style.height = autosize ? '100%' : `${height}px`;
    container.appendChild(widgetDiv);

    // Load TradingView script if not already loaded
    const loadWidget = () => {
      if (!window.TradingView) return;
      try {
        widgetRef.current = new window.TradingView.widget({
          container_id: widgetDiv.id,
          symbol: tvSymbol,
          interval,
          timezone: 'Etc/UTC',
          theme,
          style: '1', // candlestick
          locale: 'en',
          toolbar_bg: '#0a0a0a',
          enable_publishing: false,
          withdateranges: showToolbar,
          hide_top_toolbar: !showToolbar,
          hide_side_toolbar: !showSideToolbar,
          allow_symbol_change: allowSymbolChange,
          save_image: false,
          height: autosize ? '100%' : height,
          width: '100%',
          autosize: autosize,
          studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
          overrides: {
            'paneProperties.background': '#050505',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.03)',
            'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.03)',
            'symbolWatermarkProperties.transparency': 100,
            'scalesProperties.textColor': '#6b7280',
            'mainSeriesProperties.candleStyle.upColor': '#22c55e',
            'mainSeriesProperties.candleStyle.downColor': '#ef4444',
            'mainSeriesProperties.candleStyle.wickUpColor': '#22c55e',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
            'mainSeriesProperties.candleStyle.borderUpColor': '#22c55e',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
          },
          studies_overrides: {
            'volume.volume.color.0': 'rgba(239,68,68,0.4)',
            'volume.volume.color.1': 'rgba(34,197,94,0.4)',
          },
        });
      } catch (e) {
        console.warn('[TradingView Widget] Failed to create widget:', e);
      }
    };

    if (window.TradingView) {
      loadWidget();
    } else {
      // Load the TradingView script
      const existingScript = document.getElementById('tradingview-script');
      if (existingScript) {
        existingScript.addEventListener('load', loadWidget);
      } else {
        const script = document.createElement('script');
        script.id = 'tradingview-script';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = loadWidget;
        script.onerror = () => {
          console.warn('[TradingView] Failed to load TV script');
          // Show fallback iframe
          if (container) {
            container.innerHTML = `
              <iframe
                src="https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSymbol)}&interval=${interval}&theme=${theme}&style=1&locale=en&allow_symbol_change=1&studies=RSI%7Cstudies_display_settings%3D%7B%22showLabelsOnPriceScale%22%3Atrue%7D&studies=MACD"
                width="100%"
                height="${height}"
                style="border:none;background:#050505;"
                allowtransparency="true"
                scrolling="no"
                frameborder="0"
              ></iframe>
            `;
          }
        };
        document.head.appendChild(script);
      }
    }

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [tvSymbol, interval, theme, height, showToolbar, showSideToolbar, allowSymbolChange, autosize]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden bg-[#050505]"
      style={{ minHeight: `${height}px` }}
    />
  );
});

export default TradingViewChart;
export { toTVSymbol };
