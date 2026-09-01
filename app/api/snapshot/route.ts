import { fallbackSnapshot } from '@/lib/snapshot';
import type {
  EcosystemSignal,
  EcosystemSnapshot,
  ReleaseItem,
  SourceStatus,
  ValidatorRow,
} from '@/lib/snapshot';

const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];

const RPC_CALLS = [
  { jsonrpc: '2.0', id: 1, method: 'getEpochInfo', params: [] },
  { jsonrpc: '2.0', id: 2, method: 'getRecentPerformanceSamples', params: [12] },
  { jsonrpc: '2.0', id: 3, method: 'getVoteAccounts', params: [] },
  { jsonrpc: '2.0', id: 4, method: 'getSupply', params: [] },
  { jsonrpc: '2.0', id: 5, method: 'getBlockHeight', params: [] },
];

type RpcEnvelope = { id: number; result?: unknown; error?: { message?: string } };
type EpochInfo = {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
};
type PerformanceSample = {
  numSlots: number;
  numTransactions: number;
  samplePeriodSecs: number;
};
type VoteAccount = {
  activatedStake: number;
  commission: number;
  nodePubkey: string;
  votePubkey: string;
};

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 9000): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (!headers.has('User-Agent')) headers.set('User-Agent', 'SOL-PULSE-dashboard/1.0');

  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function fetchRpc() {
  let lastError: unknown;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const responses = await fetchJson<RpcEnvelope[]>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(RPC_CALLS),
      });
      const values = new Map(responses.map((item) => [item.id, item.result]));
      if (!values.get(1) || !values.get(2)) throw new Error('Incomplete RPC response');
      return { endpoint, values };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No RPC endpoint available');
}

function settledValue<T>(result: PromiseSettledResult<T>) {
  return result.status === 'fulfilled' ? result.value : undefined;
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function source(
  name: string,
  url: string,
  cadence: string,
  available: boolean,
): SourceStatus {
  return { name, url, cadence, state: available ? 'live' : 'unavailable' };
}

function signalSummary(signals: EcosystemSignal[]) {
  const urgent = signals.filter((item) => item.severity !== 'info');
  if (!urgent.length) {
    return 'Solana is operating normally with stable throughput and healthy validator participation.';
  }
  if (urgent.some((item) => item.severity === 'critical')) {
    return 'Solana is online, but one or more network or economic indicators require attention.';
  }
  return `Solana is operating normally with ${urgent.length} unusual ecosystem signal${urgent.length === 1 ? '' : 's'} under watch.`;
}

export async function collectSnapshot(): Promise<EcosystemSnapshot> {
  const [rpcResult, tvlResult, dexResult, stableResult, priceResult, releaseResult] =
    await Promise.allSettled([
      fetchRpc(),
      fetchJson<Array<{ date: number; tvl: number }>>(
        'https://api.llama.fi/v2/historicalChainTvl/Solana',
      ),
      fetchJson<{ total24h?: number; total7d?: number }>(
        'https://api.llama.fi/overview/dexs/Solana?excludeTotalDataChartBreakdown=true&excludeTotalDataChart=true',
      ),
      fetchJson<Array<{ date: string; totalCirculatingUSD?: { peggedUSD?: number } }>>(
        'https://stablecoins.llama.fi/stablecoincharts/Solana',
      ),
      fetchJson<{ solana?: { usd?: number; usd_24h_change?: number } }>(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
      ),
      fetchJson<Array<{ name?: string; tag_name?: string; published_at?: string; html_url?: string }>>(
        'https://api.github.com/repos/anza-xyz/agave/releases?per_page=4',
      ),
    ]);

  const rpc = settledValue(rpcResult);
  const tvlRaw = settledValue(tvlResult);
  const dex = settledValue(dexResult);
  const stableRaw = settledValue(stableResult);
  const price = settledValue(priceResult)?.solana;
  const releasesRaw = settledValue(releaseResult);

  const snapshot: EcosystemSnapshot = structuredClone(fallbackSnapshot);
  snapshot.generatedAt = new Date().toISOString();

  if (rpc) {
    const epoch = rpc.values.get(1) as EpochInfo;
    const samples = rpc.values.get(2) as PerformanceSample[];
    const votes = rpc.values.get(3) as
      | { current?: VoteAccount[]; delinquent?: VoteAccount[] }
      | undefined;
    const supply = rpc.values.get(4) as { value?: { total?: number } } | undefined;
    const blockHeight = rpc.values.get(5) as number | undefined;
    const currentSample = samples[0];
    const slotTimeMs = currentSample
      ? (currentSample.samplePeriodSecs / currentSample.numSlots) * 1000
      : snapshot.network.slotTimeMs;

    snapshot.network.tps = currentSample
      ? currentSample.numTransactions / currentSample.samplePeriodSecs
      : snapshot.network.tps;
    snapshot.network.slotTimeMs = slotTimeMs;
    snapshot.network.blockHeight = blockHeight ?? snapshot.network.blockHeight;
    snapshot.network.epoch = epoch.epoch;
    snapshot.network.epochProgress = (epoch.slotIndex / epoch.slotsInEpoch) * 100;
    snapshot.network.epochEtaSeconds =
      ((epoch.slotsInEpoch - epoch.slotIndex) * slotTimeMs) / 1000;
    snapshot.network.supplySol = (supply?.value?.total ?? snapshot.network.supplySol * 1e9) / 1e9;
    snapshot.performance = [...samples].reverse().map((sample, index, all) => ({
      label: index === all.length - 1 ? 'now' : `${all.length - 1 - index}m`,
      tps: sample.numTransactions / sample.samplePeriodSecs,
      slotTimeMs: (sample.samplePeriodSecs / sample.numSlots) * 1000,
    }));

    if (votes?.current && votes.delinquent) {
      snapshot.network.activeValidators = votes.current.length;
      snapshot.network.delinquentValidators = votes.delinquent.length;
      snapshot.network.delinquentPercent =
        (votes.delinquent.length / (votes.current.length + votes.delinquent.length)) * 100;
      const rows = [
        ...votes.current.map((item) => ({ ...item, status: 'healthy' as const })),
        ...votes.delinquent.map((item) => ({ ...item, status: 'delinquent' as const })),
      ];
      snapshot.validators = rows
        .sort((a, b) => b.activatedStake - a.activatedStake)
        .slice(0, 7)
        .map<ValidatorRow>((item) => ({
          identity: item.nodePubkey,
          votePubkey: item.votePubkey,
          activatedStake: item.activatedStake / 1e9,
          commission: item.commission,
          status: item.status,
        }));
    }
  }

  if (tvlRaw?.length) {
    const history = tvlRaw.slice(-31);
    snapshot.tvlHistory = history.map((point) => ({
      date: new Date(point.date * 1000).toISOString().slice(0, 10),
      tvl: point.tvl,
    }));
    const latest = history.at(-1)?.tvl ?? snapshot.economy.tvl;
    const past = (days: number) => history.at(-(days + 1))?.tvl ?? latest;
    snapshot.economy.tvl = latest;
    snapshot.economy.tvlChange1d = percentChange(latest, past(1));
    snapshot.economy.tvlChange7d = percentChange(latest, past(7));
    snapshot.economy.tvlChange30d = percentChange(latest, past(30));
  }

  if (dex) {
    snapshot.economy.dexVolume24h = dex.total24h ?? snapshot.economy.dexVolume24h;
    snapshot.economy.dexVolume7d = dex.total7d ?? snapshot.economy.dexVolume7d;
  }
  if (stableRaw?.length) {
    snapshot.economy.stablecoinSupply =
      stableRaw.at(-1)?.totalCirculatingUSD?.peggedUSD ?? snapshot.economy.stablecoinSupply;
  }
  if (price) {
    snapshot.economy.solPrice = price.usd ?? snapshot.economy.solPrice;
    snapshot.economy.solPriceChange24h =
      price.usd_24h_change ?? snapshot.economy.solPriceChange24h;
  }
  if (releasesRaw?.length) {
    snapshot.releases = releasesRaw.map<ReleaseItem>((release) => ({
      title: release.name ?? release.tag_name ?? 'Agave release',
      tag: release.tag_name ?? 'release',
      publishedAt: release.published_at ?? snapshot.generatedAt,
      url: release.html_url ?? 'https://github.com/anza-xyz/agave/releases',
    }));
  }

  const signals: EcosystemSignal[] = [];
  const delinquent = snapshot.network.delinquentPercent;
  if (delinquent >= 8) {
    signals.push({ severity: 'critical', title: 'High validator delinquency', detail: `${delinquent.toFixed(1)}% of observed validators are delinquent.` });
  } else if (delinquent >= 5) {
    signals.push({ severity: 'watch', title: 'Validator delinquency elevated', detail: `${delinquent.toFixed(1)}% of observed validators are delinquent.` });
  } else {
    signals.push({ severity: 'info', title: 'Validator participation healthy', detail: `Delinquency is ${delinquent.toFixed(1)}%, below the 5% watch threshold.` });
  }

  const averageDailyDex = snapshot.economy.dexVolume7d / 7;
  const dexDelta = percentChange(snapshot.economy.dexVolume24h, averageDailyDex);
  if (Math.abs(dexDelta) >= 25) {
    signals.push({ severity: 'watch', title: 'DEX volume outside baseline', detail: `24-hour DEX volume is ${Math.abs(dexDelta).toFixed(1)}% ${dexDelta > 0 ? 'above' : 'below'} the seven-day daily average.` });
  }
  if (Math.abs(snapshot.economy.solPriceChange24h) >= 5) {
    signals.push({ severity: 'watch', title: 'Material SOL price move', detail: `SOL moved ${snapshot.economy.solPriceChange24h.toFixed(1)}% over 24 hours.` });
  }
  if (Math.abs(snapshot.economy.tvlChange1d) >= 4) {
    signals.push({ severity: 'watch', title: 'Material TVL move', detail: `Solana DeFi TVL moved ${snapshot.economy.tvlChange1d.toFixed(1)}% over one day.` });
  }
  snapshot.signals = signals;
  snapshot.briefing = signalSummary(signals);

  const sources = [
    source('Solana RPC', rpc?.endpoint ?? RPC_ENDPOINTS[0], '60 sec', Boolean(rpc)),
    source('DefiLlama', 'https://defillama.com/chain/Solana', '5 min', Boolean(tvlRaw && dex)),
    source('CoinGecko', 'https://www.coingecko.com/en/coins/solana', '5 min', Boolean(price)),
    source('Agave releases', 'https://github.com/anza-xyz/agave/releases', '1 hour', Boolean(releasesRaw)),
  ];
  snapshot.sources = sources;
  const liveSources = sources.filter((item) => item.state === 'live').length;
  snapshot.state = liveSources === sources.length ? 'live' : liveSources > 0 ? 'partial' : 'sample';

  return snapshot;
}

export async function GET() {
  return Response.json(await collectSnapshot(), {
    headers: {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
