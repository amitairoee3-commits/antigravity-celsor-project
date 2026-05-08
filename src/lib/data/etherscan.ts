/**
 * CELSOR — Etherscan EVM Data Layer
 *
 * Hard rules:
 *  1. STABLECOINS are BANNED — no USDT, USDC, DAI etc.
 *  2. MEMECOINS are filtered OUT of the main intelligence pipeline.
 *     (Memecoins go to the Memecoin Hunt section — a separate pipeline)
 *  3. Only REAL, TRADEABLE assets with market structure: BTC, ETH, SOL,
 *     TON, TRX, BIO, LAB, RIVER, POL, ALT, ARB, OP, LINK, AAVE, UNI etc.
 *
 * Chains: ETH, ARB, BASE, BSC, OP
 */

// ─── Stablecoin Blacklist ─────────────────────────────────────────────────────

export const STABLECOIN_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USDD', 'USDP', 'LUSD',
  'SUSD', 'GUSD', 'CUSD', 'MIM', 'UST', 'USDB', 'EURC', 'EURT', 'PYUSD',
  'FDUSD', 'CRVUSD', 'GHO', 'DOLA', 'HUSD', 'OUSD', 'RAI', 'USDX', 'USDE',
  'USDS', 'USDM', 'USDL', 'XAUT', 'PAXG', // gold-pegged also out
]);

export const STABLECOIN_CONTRACTS = new Set([
  '0xdac17f958d2ee523a2206206994597c13d831ec7',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '0x6b175474e89094c44da98b954eedeac495271d0f',
  '0x4fabb145d64652a948d72533023f6e7a623c7c53',
]);

// ─── Memecoin / Junk Coin Filter ─────────────────────────────────────────────
// These go to Memecoin Hunt, NOT to the Intelligence pipeline

const MEMECOIN_KEYWORDS = [
  'PEPE', 'DOGE', 'SHIB', 'FLOKI', 'BONK', 'WIF', 'BRETT', 'MOG',
  'MOODENG', 'TOSHI', 'NORMIE', 'BABYDOGE', 'BABY', 'TURBO', 'MEME',
  'INU', 'ELON', 'CHAD', 'DEGEN', 'WOJAK', 'FROG', 'CAT', 'PIZZA',
  'PNUT', 'NEIRO', 'GOAT', 'ACT', 'TRUMP', 'MELANIA', 'GIGA',
];

export function isMemeOrJunkCoin(symbol?: string, name?: string): boolean {
  if (!symbol) return false;
  const s = symbol.toUpperCase();
  const n = (name ?? '').toUpperCase();
  return MEMECOIN_KEYWORDS.some(k => s.includes(k) || n.includes(k));
}

export function isStablecoin(symbol?: string, contractAddress?: string): boolean {
  if (symbol && STABLECOIN_SYMBOLS.has(symbol.toUpperCase())) return true;
  if (contractAddress && STABLECOIN_CONTRACTS.has(contractAddress.toLowerCase())) return true;
  return false;
}

// ─── Explorer APIs ────────────────────────────────────────────────────────────

const EXPLORERS: Record<string, string> = {
  eth:  'https://api.etherscan.io/api',
  arb:  'https://api.arbiscan.io/api',
  base: 'https://api.basescan.org/api',
  bsc:  'https://api.bscscan.com/api',
  op:   'https://api-optimistic.etherscan.io/api',
};

// High-signal institutional wallets to watch
const WATCH_WALLETS: Record<string, string[]> = {
  eth: [
    '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', // Binance 7
    '0x28C6c06298d514Db089934071355E5743bf21d60', // Binance 14
    '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', // Jump Trading
    '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', // Binance Cold
    '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b', // OKX Hot
  ],
  arb:  ['0x489ee077994B6658eAfA855C308275EAd8097C4A', '0x1a0ad011913A150f69f6A19DF447A0CfD9551054'],
  base: ['0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', '0xcF1Ca5e124B6be9D3A6728e4c83DAbEf46CF3bE3'],
  bsc:  ['0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', '0xf977814e90da44bfa03b6295a0616a897441acec'],
  op:   ['0x6d80113e533a2C0fe82EaBD35f1875DcEA89Ea97', '0x394b00ca7e3eb14e53E8E669399f95Afb4AEd9C3'],
};

// ─── Core type ────────────────────────────────────────────────────────────────

export interface WhaleTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  valueEth: number;
  timeStamp: string;
  chain: string;
  tokenSymbol?: string;
  tokenName?: string;
  contractAddress?: string;
  isNative?: boolean;
}

// ─── Real Etherscan Fetcher ───────────────────────────────────────────────────

export async function getWhaleTransfers(chain: 'eth' | 'arb' | 'base' | 'bsc' | 'op'): Promise<WhaleTx[]> {
  const keyMap: Record<string, string | undefined> = {
    eth:  process.env.ETH_SCAN_API_KEY,
    arb:  process.env.ARB_SCAN_API_KEY,
    base: process.env.BASE_SCAN_API_KEY,
    bsc:  process.env.BSC_SCAN_API_KEY,
    op:   process.env.OP_SCAN_API_KEY,
  };

  const apiKey = keyMap[chain];
  if (!apiKey || apiKey === 'YourApiKeyToken') {
    console.warn(`[CELSOR] No API key for ${chain} — using enriched mock data`);
    return getMockWhaleTxs(chain);
  }

  const base = EXPLORERS[chain];
  const results: WhaleTx[] = [];

  // Native large transfers
  const watchedWallets = WATCH_WALLETS[chain] ?? [];
  for (const wallet of watchedWallets.slice(0, 3)) {
    try {
      const url = `${base}?module=account&action=txlist&address=${wallet}&page=1&offset=20&sort=desc&apikey=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status !== '1') continue;

      const txs = (data.result as any[])
        .filter((tx: any) => parseFloat(tx.value) / 1e18 > 10)
        .map((tx: any) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          valueEth: parseFloat(tx.value) / 1e18 * 3200,
          timeStamp: tx.timeStamp,
          chain,
          tokenSymbol: chain === 'bsc' ? 'BNB' : 'ETH',
          tokenName: chain === 'bsc' ? 'BNB' : 'Ethereum',
          isNative: true,
        }))
        .slice(0, 5);

      results.push(...txs);
    } catch { /* per-wallet fail ok */ }
  }

  // ERC20 token transfers — stablecoin + memecoin filtered
  try {
    const url = `${base}?module=account&action=tokentx&page=1&offset=100&sort=desc&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (res.ok) {
      const data = await res.json();
      if (data.status === '1') {
        const erc20Txs = (data.result as any[])
          .filter((tx: any) => {
            if (isStablecoin(tx.tokenSymbol, tx.contractAddress)) return false;
            if (isMemeOrJunkCoin(tx.tokenSymbol, tx.tokenName)) return false;
            const decimals = parseInt(tx.tokenDecimal || '18');
            return parseFloat(tx.value) / Math.pow(10, decimals) > 1000;
          })
          .map((tx: any) => {
            const decimals = parseInt(tx.tokenDecimal || '18');
            return {
              hash: tx.hash,
              from: tx.from,
              to: tx.to,
              value: tx.value,
              valueEth: parseFloat(tx.value) / Math.pow(10, decimals),
              timeStamp: tx.timeStamp,
              chain,
              tokenSymbol: tx.tokenSymbol,
              tokenName: tx.tokenName,
              contractAddress: tx.contractAddress,
            };
          })
          .slice(0, 15);

        results.push(...erc20Txs);
      }
    }
  } catch { /* ignore */ }

  if (results.length === 0) return getMockWhaleTxs(chain);

  return results
    .filter(tx => !isStablecoin(tx.tokenSymbol, tx.contractAddress))
    .filter(tx => !isMemeOrJunkCoin(tx.tokenSymbol, tx.tokenName))
    .sort((a, b) => b.valueEth - a.valueEth)
    .slice(0, 25);
}

// ─── REAL COIN Mock Data (NO memecoins) ──────────────────────────────────────
// These are the coins the intelligence pipeline should analyze:
// Major L1s, DeFi blue chips, ecosystem tokens — things with real market structure

const REAL_TOKENS: Record<string, Array<{ symbol: string; name: string; minUSD: number }>> = {
  eth: [
    { symbol: 'WBTC',  name: 'Wrapped Bitcoin',      minUSD: 500_000 },
    { symbol: 'ETH',   name: 'Ethereum',              minUSD: 250_000 },
    { symbol: 'LINK',  name: 'Chainlink',             minUSD: 200_000 },
    { symbol: 'AAVE',  name: 'Aave',                  minUSD: 200_000 },
    { symbol: 'UNI',   name: 'Uniswap',               minUSD: 150_000 },
    { symbol: 'MKR',   name: 'Maker',                 minUSD: 150_000 },
    { symbol: 'LDO',   name: 'Lido DAO',              minUSD: 100_000 },
    { symbol: 'RPL',   name: 'Rocket Pool',           minUSD: 100_000 },
    { symbol: 'ENS',   name: 'Ethereum Name Service', minUSD: 100_000 },
    { symbol: 'CRV',   name: 'Curve DAO',             minUSD: 150_000 },
    { symbol: 'CVX',   name: 'Convex Finance',        minUSD: 100_000 },
    { symbol: 'BIO',   name: 'BIO Protocol',          minUSD: 100_000 },
  ],
  arb: [
    { symbol: 'ARB',    name: 'Arbitrum',        minUSD: 150_000 },
    { symbol: 'GMX',    name: 'GMX',             minUSD: 100_000 },
    { symbol: 'PENDLE', name: 'Pendle',          minUSD: 100_000 },
    { symbol: 'GNS',    name: 'Gains Network',   minUSD: 80_000  },
    { symbol: 'RDNT',   name: 'Radiant Capital', minUSD: 80_000  },
    { symbol: 'MAGIC',  name: 'Magic',           minUSD: 80_000  },
  ],
  base: [
    { symbol: 'AERO',   name: 'Aerodrome',      minUSD: 100_000 },
    { symbol: 'CBBTC',  name: 'Coinbase BTC',   minUSD: 300_000 },
    { symbol: 'RIVER',  name: 'River',          minUSD: 80_000  },
    { symbol: 'LAB',    name: 'LAB',            minUSD: 80_000  },
  ],
  bsc: [
    { symbol: 'BNB',    name: 'BNB',             minUSD: 200_000 },
    { symbol: 'CAKE',   name: 'PancakeSwap',     minUSD: 100_000 },
    { symbol: 'ALT',    name: 'AltLayer',        minUSD: 100_000 },
    { symbol: 'TRX',    name: 'TRON',            minUSD: 200_000 },
    { symbol: 'TON',    name: 'Toncoin',         minUSD: 200_000 },
    { symbol: 'POL',    name: 'Polygon',         minUSD: 150_000 },
    { symbol: 'ZAC',    name: 'ZAC',             minUSD: 80_000  },
  ],
  op: [
    { symbol: 'OP',    name: 'Optimism',   minUSD: 150_000 },
    { symbol: 'VELO',  name: 'Velodrome', minUSD: 100_000 },
    { symbol: 'SNX',   name: 'Synthetix', minUSD: 100_000 },
    { symbol: 'WLD',   name: 'Worldcoin', minUSD: 150_000 },
  ],
};

const WHALE_WALLETS = [
  '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE',
  '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
  '0x28C6c06298d514Db089934071355E5743bf21d60',
  '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
  '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b',
  '0xF977814e90dA44bfA03b6295A0616a897441acEf',
  '0x489ee077994B6658eAfA855C308275EAd8097C4A',
  '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
];

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
}

export function getMockWhaleTxs(chain: string): WhaleTx[] {
  const tokens = REAL_TOKENS[chain] ?? REAL_TOKENS.eth;
  const now = Math.floor(Date.now() / 1000);

  // Seed changes every 3 minutes for variety
  const seed = Math.floor(Date.now() / 180000) + chain.charCodeAt(0);
  const rng = seededRand(seed);

  const count = 6 + Math.floor(rng() * 5);

  return Array.from({ length: count }, (_, i) => {
    const token = tokens[Math.floor(rng() * tokens.length)];
    const walletIdx = Math.floor(rng() * WHALE_WALLETS.length);
    let toIdx = Math.floor(rng() * WHALE_WALLETS.length);
    if (toIdx === walletIdx) toIdx = (walletIdx + 1) % WHALE_WALLETS.length;

    // Real coin trades are bigger — min 100k
    const valueUSD = Math.round(token.minUSD + rng() * token.minUSD * 4);

    const ageRoll = rng();
    const ageSeconds = Math.floor(Math.pow(ageRoll, 2) * 4 * 3600) + 120;

    const contractAddr = `0x${Array.from({ length: 40 }, () =>
      '0123456789abcdef'[Math.floor(rng() * 16)]
    ).join('')}`;

    const txHash = `0x${Array.from({ length: 64 }, () =>
      '0123456789abcdef'[Math.floor(rng() * 16)]
    ).join('')}`;

    return {
      hash: txHash,
      from: WHALE_WALLETS[walletIdx],
      to: WHALE_WALLETS[toIdx],
      value: String(BigInt(Math.floor(valueUSD)) * BigInt(1e15)),
      valueEth: valueUSD,
      timeStamp: String(now - ageSeconds),
      chain,
      tokenSymbol: token.symbol,
      tokenName: token.name,
      contractAddress: contractAddr,
    };
  });
}
