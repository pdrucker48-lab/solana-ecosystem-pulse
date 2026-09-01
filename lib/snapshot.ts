export type SourceState = 'live' | 'stale' | 'unavailable';
export type SnapshotState = 'live' | 'partial' | 'sample';
export type SignalSeverity = 'info' | 'watch' | 'critical';

export interface SourceStatus {
  name: string;
  url: string;
  state: SourceState;
  cadence: string;
}

export interface PerformancePoint {
  label: string;
  tps: number;
  slotTimeMs: number;
}

export interface TvlPoint {
  date: string;
  tvl: number;
}

export interface ValidatorRow {
  identity: string;
  votePubkey: string;
  activatedStake: number;
  commission: number;
  status: 'healthy' | 'delinquent';
}

export interface EcosystemSignal {
  severity: SignalSeverity;
  title: string;
  detail: string;
}

export interface ReleaseItem {
  title: string;
  tag: string;
  publishedAt: string;
  url: string;
}

export interface EcosystemSnapshot {
  generatedAt: string;
  state: SnapshotState;
  briefing: string;
  network: {
    tps: number;
    slotTimeMs: number;
    blockHeight: number;
    epoch: number;
    epochProgress: number;
    epochEtaSeconds: number;
    activeValidators: number;
    delinquentValidators: number;
    delinquentPercent: number;
    supplySol: number;
  };
  economy: {
    solPrice: number;
    solPriceChange24h: number;
    tvl: number;
    tvlChange1d: number;
    tvlChange7d: number;
    tvlChange30d: number;
    dexVolume24h: number;
    dexVolume7d: number;
    stablecoinSupply: number;
  };
  performance: PerformancePoint[];
  tvlHistory: TvlPoint[];
  validators: ValidatorRow[];
  signals: EcosystemSignal[];
  releases: ReleaseItem[];
  sources: SourceStatus[];
}

export const fallbackSnapshot: EcosystemSnapshot = {
  generatedAt: '2026-08-31T20:00:00.000Z',
  state: 'sample',
  briefing: 'Solana is operating normally with stable throughput and healthy validator participation.',
  network: {
    tps: 3842,
    slotTimeMs: 406,
    blockHeight: 421_800_000,
    epoch: 824,
    epochProgress: 68.4,
    epochEtaSeconds: 136_800,
    activeValidators: 1373,
    delinquentValidators: 21,
    delinquentPercent: 1.51,
    supplySol: 617_200_000,
  },
  economy: {
    solPrice: 103.3,
    solPriceChange24h: -0.62,
    tvl: 5_854_308_801,
    tvlChange1d: 0.7,
    tvlChange7d: 3.8,
    tvlChange30d: 6.1,
    dexVolume24h: 1_929_632_645,
    dexVolume7d: 18_173_864_650,
    stablecoinSupply: 16_059_243_251,
  },
  performance: [3120, 3370, 3250, 3560, 3710, 3480, 3890, 4020, 3780, 3940, 3860, 3842].map(
    (tps, index) => ({ label: `${11 - index}m`, tps, slotTimeMs: 394 + ((index * 7) % 26) }),
  ),
  tvlHistory: Array.from({ length: 31 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10),
    tvl: 5_250_000_000 + index * 20_000_000 + Math.sin(index / 2.4) * 95_000_000,
  })),
  validators: [
    { identity: '9xQeWvG8…9b2', votePubkey: 'vote-01', activatedStake: 12_840_000, commission: 8, status: 'healthy' },
    { identity: 'HVCp1…7Yq', votePubkey: 'vote-02', activatedStake: 10_210_000, commission: 5, status: 'healthy' },
    { identity: 'GalaXy…4Pk', votePubkey: 'vote-03', activatedStake: 8_920_000, commission: 7, status: 'healthy' },
    { identity: 'Figm3nt…8As', votePubkey: 'vote-04', activatedStake: 7_480_000, commission: 7, status: 'healthy' },
    { identity: 'Stak3…2Nh', votePubkey: 'vote-05', activatedStake: 6_960_000, commission: 6, status: 'healthy' },
  ],
  signals: [
    { severity: 'watch', title: 'DEX volume above baseline', detail: '24-hour DEX volume is elevated versus the daily average of the last seven days.' },
    { severity: 'info', title: 'Validator participation healthy', detail: 'Delinquent validators remain below the 5% watch threshold.' },
  ],
  releases: [
    { title: 'Release v4.4.0-alpha.2', tag: 'v4.4.0-alpha.2', publishedAt: '2026-08-28T10:07:28Z', url: 'https://github.com/anza-xyz/agave/releases' },
    { title: 'Release v4.3.0-beta.3', tag: 'v4.3.0-beta.3', publishedAt: '2026-08-28T18:53:56Z', url: 'https://github.com/anza-xyz/agave/releases' },
    { title: 'Release v4.2.2', tag: 'v4.2.2', publishedAt: '2026-08-28T18:47:41Z', url: 'https://github.com/anza-xyz/agave/releases' },
  ],
  sources: [
    { name: 'Solana RPC', url: 'https://api.mainnet-beta.solana.com', state: 'stale', cadence: '60 sec' },
    { name: 'DefiLlama', url: 'https://defillama.com', state: 'stale', cadence: '5 min' },
    { name: 'CoinGecko', url: 'https://coingecko.com', state: 'stale', cadence: '5 min' },
    { name: 'Agave releases', url: 'https://github.com/anza-xyz/agave/releases', state: 'stale', cadence: '1 hour' },
  ],
};
