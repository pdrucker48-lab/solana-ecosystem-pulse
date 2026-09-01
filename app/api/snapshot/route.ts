import { fallbackSnapshot } from '@/lib/snapshot';
import type {
  ActivityPoint,
  DevelopmentItem,
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
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'getRecentPerformanceSamples',
    params: [12],
  },
  { jsonrpc: '2.0', id: 3, method: 'getVoteAccounts', params: [] },
  { jsonrpc: '2.0', id: 4, method: 'getSupply', params: [] },
  { jsonrpc: '2.0', id: 5, method: 'getBlockHeight', params: [] },
  { jsonrpc: '2.0', id: 6, method: 'getRecentPrioritizationFees', params: [] },
];
const SOLANA_DATA_URL = 'https://solana.com/api/databricks/data?days=7';
const SIMD_BASE =
  'https://raw.githubusercontent.com/solana-foundation/solana-improvement-documents/main/proposals';

type RpcEnvelope = {
  id: number;
  result?: unknown;
  error?: { message?: string };
};
type EpochInfo = { epoch: number; slotIndex: number; slotsInEpoch: number };
type PerformanceSample = {
  numSlots: number;
  numTransactions: number;
  numNonVoteTransactions?: number;
  samplePeriodSecs: number;
};
type VoteAccount = {
  activatedStake: number;
  commission: number;
  nodePubkey: string;
  votePubkey: string;
};
type SolanaDataRow = {
  date: string;
  metricName: string;
  providerName: string;
  unit: string;
  value: number;
};
type BlockResponse = {
  transactions?: Array<{ meta?: { fee?: number } | null }>;
};

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 9000,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (!headers.has('User-Agent'))
    headers.set('User-Agent', 'SOL-PULSE-dashboard/1.1');
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string, timeoutMs = 9000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'text/plain', 'User-Agent': 'SOL-PULSE-dashboard/1.1' },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function rpcRequest<T>(
  endpoint: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetchJson<{
    result?: T;
    error?: { message?: string };
  }>(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    },
    12_000,
  );
  if (response.error || response.result === undefined)
    throw new Error(response.error?.message ?? `${method} returned no result`);
  return response.result;
}

async function fetchRpc() {
  let lastError: unknown;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const responses = await fetchJson<RpcEnvelope[]>(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(RPC_CALLS),
        },
        12_000,
      );
      const values = new Map(responses.map((item) => [item.id, item.result]));
      if (!values.get(1) || !values.get(2))
        throw new Error('Incomplete RPC response');
      return { endpoint, values };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No RPC endpoint available');
}

async function fetchBlockFees() {
  let lastError: unknown;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const slot = await rpcRequest<number>(endpoint, 'getSlot', [
        { commitment: 'finalized' },
      ]);
      for (const offset of [5, 10, 20]) {
        try {
          const block = await rpcRequest<BlockResponse>(endpoint, 'getBlock', [
            slot - offset,
            {
              commitment: 'finalized',
              encoding: 'json',
              transactionDetails: 'accounts',
              maxSupportedTransactionVersion: 0,
              rewards: false,
            },
          ]);
          const fees = (block.transactions ?? [])
            .map((transaction) => transaction.meta?.fee)
            .filter(
              (fee): fee is number =>
                typeof fee === 'number' && Number.isFinite(fee),
            );
          if (fees.length)
            return {
              endpoint,
              transactionCount: fees.length,
              medianFee: median(fees),
            };
        } catch (error) {
          lastError = error;
        }
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No recent finalized block available');
}

function settledValue<T>(result: PromiseSettledResult<T>) {
  return result.status === 'fulfilled' ? result.value : undefined;
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]) {
  const valid = values.filter(Number.isFinite);
  return valid.length
    ? valid.reduce((total, value) => total + value, 0) / valid.length
    : 0;
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0)
    return 0;
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

function metricMedian(rows: SolanaDataRow[], date: string, metricName: string) {
  return median(
    rows
      .filter((row) => row.date === date && row.metricName === metricName)
      .map((row) => row.value),
  );
}

function activityFromRows(rows: SolanaDataRow[]) {
  const required = [
    'Active Addresses',
    'Fee Payers',
    'Fees',
    'Transaction Count (Total)',
    'Non Vote Transaction Count (Success)',
    'Non Vote Transaction Count (Failed)',
  ];
  const dates = [...new Set(rows.map((row) => row.date))].toSorted().reverse();
  const observedDate = dates.find((date) =>
    required.every((metric) =>
      rows.some((row) => row.date === date && row.metricName === metric),
    ),
  );
  if (!observedDate) return undefined;
  const providers = new Set(
    rows
      .filter(
        (row) => row.date === observedDate && required.includes(row.metricName),
      )
      .map((row) => row.providerName),
  );
  const successful = metricMedian(rows, observedDate, required[4]);
  const failed = metricMedian(rows, observedDate, required[5]);
  const history = dates
    .slice(0, 7)
    .reverse()
    .map<ActivityPoint>((date) => ({
      date,
      activeAddresses: metricMedian(rows, date, required[0]),
      feePayers: metricMedian(rows, date, required[1]),
      networkFeesSol: metricMedian(rows, date, required[2]),
      totalTransactions: metricMedian(rows, date, required[3]),
    }));
  return {
    observedDate,
    activeAddresses: metricMedian(rows, observedDate, required[0]),
    feePayers: metricMedian(rows, observedDate, required[1]),
    networkFeesSol: metricMedian(rows, observedDate, required[2]),
    totalTransactions: metricMedian(rows, observedDate, required[3]),
    successfulNonVoteTransactions: successful,
    failedNonVoteTransactions: failed,
    nonVoteFailurePercent:
      successful + failed ? (failed / (successful + failed)) * 100 : 0,
    providerCount: providers.size,
    history,
  };
}

function development(
  markdown: string,
  identifier: string,
  detail: string,
  url: string,
): DevelopmentItem {
  const frontmatterValue = (field: string) =>
    markdown
      .match(new RegExp(`^${field}\\s*:\\s*['"]?(.+?)['"]?\\s*$`, 'im'))?.[1]
      ?.trim();
  return {
    title: frontmatterValue('title') ?? identifier,
    identifier,
    status: frontmatterValue('status') ?? 'Unknown',
    detail,
    url,
  };
}

function signalSummary(signals: EcosystemSignal[]) {
  const urgent = signals.filter((item) => item.severity !== 'info');
  if (!urgent.length)
    return 'Solana is operating normally across the monitored network and ecosystem baselines.';
  if (urgent.some((item) => item.severity === 'critical'))
    return 'Solana is online, but one or more network or economic indicators require attention.';
  return `Solana is operating normally with ${urgent.length} unusual ecosystem signal${urgent.length === 1 ? '' : 's'} under watch.`;
}

export async function collectSnapshot(): Promise<EcosystemSnapshot> {
  const [
    rpcResult,
    blockFeeResult,
    solanaDataResult,
    tvlResult,
    dexResult,
    stableResult,
    priceResult,
    releaseResult,
    simdResult,
  ] = await Promise.allSettled([
    fetchRpc(),
    fetchBlockFees(),
    fetchJson<{ rows?: SolanaDataRow[] }>(SOLANA_DATA_URL, undefined, 15_000),
    fetchJson<Array<{ date: number; tvl: number }>>(
      'https://api.llama.fi/v2/historicalChainTvl/Solana',
    ),
    fetchJson<{ total24h?: number; total7d?: number }>(
      'https://api.llama.fi/overview/dexs/Solana?excludeTotalDataChartBreakdown=true&excludeTotalDataChart=true',
    ),
    fetchJson<
      Array<{ date: string; totalCirculatingUSD?: { peggedUSD?: number } }>
    >('https://stablecoins.llama.fi/stablecoincharts/Solana'),
    fetchJson<{ solana?: { usd?: number; usd_24h_change?: number } }>(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
    ),
    fetchJson<
      Array<{
        name?: string;
        tag_name?: string;
        published_at?: string;
        html_url?: string;
      }>
    >('https://api.github.com/repos/anza-xyz/agave/releases?per_page=4'),
    Promise.all([
      fetchText(`${SIMD_BASE}/0326-alpenglow.md`),
      fetchText(`${SIMD_BASE}/0525-reduce-slot-times.md`),
    ]),
  ]);

  const rpc = settledValue(rpcResult);
  const blockFees = settledValue(blockFeeResult);
  const solanaDataRows = settledValue(solanaDataResult)?.rows;
  const tvlRaw = settledValue(tvlResult);
  const dex = settledValue(dexResult);
  const stableRaw = settledValue(stableResult);
  const price = settledValue(priceResult)?.solana;
  const releasesRaw = settledValue(releaseResult);
  const simdRaw = settledValue(simdResult);
  const snapshot: EcosystemSnapshot = structuredClone(fallbackSnapshot);
  snapshot.generatedAt = new Date().toISOString();

  if (rpc) {
    const epoch = rpc.values.get(1) as EpochInfo;
    const samples = rpc.values.get(2) as PerformanceSample[];
    const votes = rpc.values.get(3) as
      | { current?: VoteAccount[]; delinquent?: VoteAccount[] }
      | undefined;
    const supply = rpc.values.get(4) as
      | { value?: { total?: number } }
      | undefined;
    const blockHeight = rpc.values.get(5) as number | undefined;
    const prioritizationFees = rpc.values.get(6) as
      | Array<{ prioritizationFee?: number }>
      | undefined;
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
    snapshot.network.epochProgress =
      (epoch.slotIndex / epoch.slotsInEpoch) * 100;
    snapshot.network.epochEtaSeconds =
      ((epoch.slotsInEpoch - epoch.slotIndex) * slotTimeMs) / 1000;
    snapshot.network.supplySol =
      (supply?.value?.total ?? snapshot.network.supplySol * 1e9) / 1e9;
    snapshot.network.medianPriorityFeeMicroLamports = median(
      (prioritizationFees ?? []).map((item) => item.prioritizationFee ?? 0),
    );
    snapshot.performance = [...samples].reverse().map((sample, index, all) => ({
      label: index === all.length - 1 ? 'now' : `${all.length - 1 - index}m`,
      tps: sample.numTransactions / sample.samplePeriodSecs,
      nonVoteTps:
        (sample.numNonVoteTransactions ?? 0) / sample.samplePeriodSecs,
      slotTimeMs: (sample.samplePeriodSecs / sample.numSlots) * 1000,
    }));
    if (votes?.current && votes.delinquent) {
      snapshot.network.activeValidators = votes.current.length;
      snapshot.network.delinquentValidators = votes.delinquent.length;
      snapshot.network.delinquentPercent =
        (votes.delinquent.length /
          (votes.current.length + votes.delinquent.length)) *
        100;
      snapshot.validators = [
        ...votes.current.map((item) => ({
          ...item,
          status: 'healthy' as const,
        })),
        ...votes.delinquent.map((item) => ({
          ...item,
          status: 'delinquent' as const,
        })),
      ]
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

  if (blockFees)
    snapshot.network.medianTransactionFeeLamports = blockFees.medianFee;
  const activity = solanaDataRows?.length
    ? activityFromRows(solanaDataRows)
    : undefined;
  if (activity) {
    snapshot.activity = {
      ...snapshot.activity,
      ...activity,
      networkFeesUsd: 0,
    };
    snapshot.activityHistory = activity.history;
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
    snapshot.economy.dexVolume24h =
      dex.total24h ?? snapshot.economy.dexVolume24h;
    snapshot.economy.dexVolume7d = dex.total7d ?? snapshot.economy.dexVolume7d;
  }
  if (stableRaw?.length)
    snapshot.economy.stablecoinSupply =
      stableRaw.at(-1)?.totalCirculatingUSD?.peggedUSD ??
      snapshot.economy.stablecoinSupply;
  if (price) {
    snapshot.economy.solPrice = price.usd ?? snapshot.economy.solPrice;
    snapshot.economy.solPriceChange24h =
      price.usd_24h_change ?? snapshot.economy.solPriceChange24h;
  }
  snapshot.activity.networkFeesUsd =
    snapshot.activity.networkFeesSol * snapshot.economy.solPrice;
  if (releasesRaw?.length)
    snapshot.releases = releasesRaw.map<ReleaseItem>((release) => ({
      title: release.name ?? release.tag_name ?? 'Agave release',
      tag: release.tag_name ?? 'release',
      publishedAt: release.published_at ?? snapshot.generatedAt,
      url: release.html_url ?? 'https://github.com/anza-xyz/agave/releases',
    }));
  if (simdRaw)
    snapshot.developments = [
      development(
        simdRaw[0],
        'SIMD-0326',
        'New consensus design targeting materially lower finality latency and stronger resilience.',
        'https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0326-alpenglow.md',
      ),
      development(
        simdRaw[1],
        'SIMD-0525',
        'Feature-gated proposal to reduce target slot time in stages from 400ms toward 200ms.',
        'https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0525-reduce-slot-times.md',
      ),
    ];

  const signals: EcosystemSignal[] = [];
  const delinquent = snapshot.network.delinquentPercent;
  if (delinquent >= 8)
    signals.push({
      severity: 'critical',
      title: 'High validator delinquency',
      detail: `${delinquent.toFixed(1)}% of observed validators are delinquent.`,
    });
  else if (delinquent >= 5)
    signals.push({
      severity: 'watch',
      title: 'Validator delinquency elevated',
      detail: `${delinquent.toFixed(1)}% of observed validators are delinquent.`,
    });
  else
    signals.push({
      severity: 'info',
      title: 'Validator participation healthy',
      detail: `Delinquency is ${delinquent.toFixed(1)}%, below the 5% watch threshold.`,
    });

  const baselinePerformance = snapshot.performance.slice(0, -1);
  const tpsDelta = percentChange(
    snapshot.network.tps,
    mean(baselinePerformance.map((point) => point.tps)),
  );
  if (tpsDelta <= -40)
    signals.push({
      severity: 'critical',
      title: 'TPS materially below baseline',
      detail: `Current TPS is ${Math.abs(tpsDelta).toFixed(1)}% below the preceding sample mean.`,
    });
  else if (Math.abs(tpsDelta) >= 20)
    signals.push({
      severity: 'watch',
      title: 'TPS outside recent baseline',
      detail: `Current TPS is ${Math.abs(tpsDelta).toFixed(1)}% ${tpsDelta > 0 ? 'above' : 'below'} the preceding sample mean.`,
    });
  const slotBaseline = mean(
    baselinePerformance.map((point) => point.slotTimeMs),
  );
  const slotDelta = percentChange(snapshot.network.slotTimeMs, slotBaseline);
  if (snapshot.network.slotTimeMs >= 600)
    signals.push({
      severity: 'critical',
      title: 'Slot production materially delayed',
      detail: `Recent slot time is ${snapshot.network.slotTimeMs.toFixed(0)}ms.`,
    });
  else if (snapshot.network.slotTimeMs >= 450 || slotDelta >= 20)
    signals.push({
      severity: 'watch',
      title: 'Slot time elevated',
      detail: `Recent slot time is ${snapshot.network.slotTimeMs.toFixed(0)}ms, ${Math.max(0, slotDelta).toFixed(1)}% above baseline.`,
    });
  const failureRate = snapshot.activity.nonVoteFailurePercent;
  if (failureRate >= 60)
    signals.push({
      severity: 'critical',
      title: 'High non-vote transaction failure rate',
      detail: `${failureRate.toFixed(1)}% of observed non-vote transaction attempts failed on ${snapshot.activity.observedDate}.`,
    });
  else if (failureRate >= 45)
    signals.push({
      severity: 'watch',
      title: 'Non-vote failure rate elevated',
      detail: `${failureRate.toFixed(1)}% of observed non-vote transaction attempts failed on ${snapshot.activity.observedDate}.`,
    });
  const averageDailyDex = snapshot.economy.dexVolume7d / 7;
  const dexDelta = percentChange(
    snapshot.economy.dexVolume24h,
    averageDailyDex,
  );
  if (Math.abs(dexDelta) >= 25)
    signals.push({
      severity: 'watch',
      title: 'DEX volume outside baseline',
      detail: `24-hour DEX volume is ${Math.abs(dexDelta).toFixed(1)}% ${dexDelta > 0 ? 'above' : 'below'} the seven-day daily average.`,
    });
  if (Math.abs(snapshot.economy.solPriceChange24h) >= 5)
    signals.push({
      severity: 'watch',
      title: 'Material SOL price move',
      detail: `SOL moved ${snapshot.economy.solPriceChange24h.toFixed(1)}% over 24 hours.`,
    });
  if (Math.abs(snapshot.economy.tvlChange1d) >= 4)
    signals.push({
      severity: 'watch',
      title: 'Material TVL move',
      detail: `Solana DeFi TVL moved ${snapshot.economy.tvlChange1d.toFixed(1)}% over one day.`,
    });
  snapshot.signals = signals;
  snapshot.briefing = signalSummary(signals);

  const sources = [
    source(
      'Solana RPC',
      rpc?.endpoint ?? RPC_ENDPOINTS[0],
      '60 sec',
      Boolean(rpc),
    ),
    source(
      'Solana Data',
      'https://solana.com/data',
      '12 hours',
      Boolean(activity),
    ),
    source(
      'DefiLlama',
      'https://defillama.com/chain/Solana',
      '5 min',
      Boolean(tvlRaw && dex && stableRaw),
    ),
    source(
      'CoinGecko',
      'https://www.coingecko.com/en/coins/solana',
      '5 min',
      Boolean(price),
    ),
    source(
      'Agave releases',
      'https://github.com/anza-xyz/agave/releases',
      '1 hour',
      Boolean(releasesRaw),
    ),
    source(
      'SIMD repository',
      'https://github.com/solana-foundation/solana-improvement-documents',
      '1 hour',
      Boolean(simdRaw),
    ),
  ];
  snapshot.sources = sources;
  const liveSources = sources.filter((item) => item.state === 'live').length;
  snapshot.state =
    liveSources === sources.length
      ? 'live'
      : liveSources > 0
        ? 'partial'
        : 'sample';
  return snapshot;
}

export async function GET() {
  return Response.json(await collectSnapshot(), {
    headers: {
      'Cache-Control':
        'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
