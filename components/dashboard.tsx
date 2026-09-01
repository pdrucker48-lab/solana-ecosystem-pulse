'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CircleGauge,
  Clock3,
  Download,
  ExternalLink,
  FileJson2,
  FileText,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { snapshotToMarkdown } from '@/lib/report';
import type { EcosystemSnapshot, SignalSeverity } from '@/lib/snapshot';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const throughputConfig = {
  tps: { label: 'Transactions/sec', color: '#14f195' },
  slotTimeMs: { label: 'Slot time (ms)', color: '#9945ff' },
} satisfies ChartConfig;

const tvlConfig = {
  tvl: { label: 'DeFi TVL', color: '#9945ff' },
} satisfies ChartConfig;

function pct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatEta(seconds: number) {
  const hours = Math.max(0, Math.round(seconds / 3600));
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return days ? `${days}d ${remainder}h` : `${remainder}h`;
}

function formatStake(value: number) {
  return `${compact.format(value)} SOL`;
}

function shortKey(key: string) {
  if (key.length < 13) return key;
  return `${key.slice(0, 6)}…${key.slice(-5)}`;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function signalStyle(severity: SignalSeverity) {
  if (severity === 'critical') return 'border-red-400/18 bg-red-400/[0.055] text-red-200';
  if (severity === 'watch') return 'border-amber-300/16 bg-amber-300/[0.045] text-amber-200';
  return 'border-cyan-300/14 bg-cyan-300/[0.04] text-cyan-200';
}

interface DashboardProps {
  initialSnapshot: EcosystemSnapshot;
}

export function Dashboard({ initialSnapshot }: DashboardProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [range, setRange] = useState<1 | 7 | 30>(7);
  const [autoRefresh, setAutoRefresh] = useState(60);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/snapshot', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
      setSnapshot((await response.json()) as EcosystemSnapshot);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Live refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => void refresh(), autoRefresh * 1000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, refresh]);

  const tvlData = useMemo(() => snapshot.tvlHistory.slice(-(range + 1)), [range, snapshot.tvlHistory]);
  const tvlChange =
    range === 1
      ? snapshot.economy.tvlChange1d
      : range === 7
        ? snapshot.economy.tvlChange7d
        : snapshot.economy.tvlChange30d;
  const latestPerformance = snapshot.performance.at(-1)?.tps ?? snapshot.network.tps;
  const previousPerformance = snapshot.performance.at(-2)?.tps ?? latestPerformance;
  const tpsChange = previousPerformance ? ((latestPerformance - previousPerformance) / previousPerformance) * 100 : 0;
  const liveSources = snapshot.sources.filter((source) => source.state === 'live').length;
  const generated = new Date(snapshot.generatedAt);

  const exportJson = () =>
    downloadFile(
      `sol-pulse-${snapshot.generatedAt.slice(0, 10)}.json`,
      JSON.stringify(snapshot, null, 2),
      'application/json',
    );
  const exportMarkdown = () =>
    downloadFile(
      `sol-pulse-${snapshot.generatedAt.slice(0, 10)}.md`,
      snapshotToMarkdown(snapshot),
      'text/markdown',
    );

  const metrics = [
    {
      label: 'Network TPS',
      value: integer.format(snapshot.network.tps),
      change: pct(tpsChange),
      positive: tpsChange >= 0,
      icon: Activity,
    },
    {
      label: 'Median slot time',
      value: `${integer.format(snapshot.network.slotTimeMs)} ms`,
      change: 'recent median',
      positive: true,
      icon: Clock3,
    },
    {
      label: 'Active validators',
      value: integer.format(snapshot.network.activeValidators),
      change: `${snapshot.network.delinquentPercent.toFixed(1)}% delinquent`,
      positive: snapshot.network.delinquentPercent < 5,
      icon: ShieldCheck,
    },
    {
      label: 'Solana DeFi TVL',
      value: `$${compact.format(snapshot.economy.tvl)}`,
      change: `${pct(tvlChange)} / ${range}d`,
      positive: tvlChange >= 0,
      icon: WalletCards,
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3.5 sm:px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="pulse-mark" aria-hidden="true"><span /><span /><span /></div>
            <div>
              <p className="font-mono text-sm font-semibold tracking-[0.18em] text-white">SOL//PULSE</p>
              <p className="hidden text-xs text-muted-foreground sm:block">Ecosystem intelligence</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/7 px-3 py-1.5 text-xs text-emerald-300 md:flex">
            <Radio className="size-3.5" />
            <span>{snapshot.state === 'live' ? 'Live network feed' : `${snapshot.state} data`}</span>
            <span className="mx-1 h-3 w-px bg-emerald-300/20" />
            <span className="font-mono text-emerald-100/70">{generated.toISOString().slice(11, 19)} UTC</span>
          </div>

          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="Automatic refresh interval"
              size="sm"
              value={String(autoRefresh)}
              onChange={(event) => setAutoRefresh(Number(event.target.value))}
              className="hidden border-white/10 bg-white/4 text-zinc-300 sm:block"
            >
              <NativeSelectOption value="0">Manual</NativeSelectOption>
              <NativeSelectOption value="60">Every minute</NativeSelectOption>
              <NativeSelectOption value="300">Every 5 minutes</NativeSelectOption>
              <NativeSelectOption value="900">Every 15 minutes</NativeSelectOption>
            </NativeSelect>
            <Button
              aria-label="Refresh live data"
              variant="outline"
              size="icon"
              className="border-white/10 bg-white/4 text-zinc-200"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            </Button>
            <Button className="hidden bg-white text-zinc-950 hover:bg-zinc-200 sm:inline-flex" onClick={exportMarkdown}>
              <Download data-icon="inline-start" /> Export report
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-5 lg:px-8">
        {(error || snapshot.state !== 'live') && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300/14 bg-amber-300/[0.04] px-3 py-2 text-xs text-amber-100/70">
            <span>{error ? `Live refresh issue: ${error}. Showing the latest available values.` : `Data state: ${snapshot.state}. ${liveSources}/${snapshot.sources.length} sources are live.`}</span>
            <button type="button" className="shrink-0 font-medium text-amber-200 hover:text-white" onClick={() => void refresh()}>Retry</button>
          </div>
        )}

        <section className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-violet-300"><Sparkles className="size-3.5" /> Network briefing</div>
            <h1 className="max-w-4xl text-3xl font-semibold tracking-[-0.035em] text-white md:text-4xl">{snapshot.briefing}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Keyless, automatically refreshed monitoring across Solana RPC, DefiLlama, CoinGecko, and Agave releases.
            </p>
          </div>
          <div className="flex items-center gap-1 self-start rounded-lg border border-white/8 bg-white/[0.025] p-1 md:self-auto">
            {([
              [1, '24H'],
              [7, '7D'],
              [30, '30D'],
            ] as const).map(([days, label]) => (
              <button
                key={days}
                className={`rounded-md px-3 py-1.5 font-mono text-xs transition ${range === days ? 'bg-white text-zinc-950' : 'text-zinc-500 hover:text-zinc-200'}`}
                type="button"
                onClick={() => setRange(days)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const Direction = metric.positive ? ArrowUpRight : ArrowDownRight;
            return (
              <Card key={metric.label} className="metric-card border-0 bg-card py-4 ring-white/8">
                <CardContent className="px-4">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
                    <span className="rounded-md border border-white/8 bg-white/[0.035] p-1.5 text-zinc-400"><Icon className="size-4" /></span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <strong className="font-mono text-2xl font-semibold tracking-tight text-white">{metric.value}</strong>
                    <span className={`flex items-center gap-0.5 text-right font-mono text-[11px] ${metric.positive ? 'text-emerald-300' : 'text-rose-300'}`}><Direction className="size-3.5" />{metric.change}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_1fr]">
          <Card className="border-0 bg-card ring-white/8">
            <CardHeader className="border-b border-white/7 pb-4">
              <div className="flex items-start justify-between">
                <div><CardTitle className="text-base text-white">Network throughput</CardTitle><CardDescription>Transactions and slot cadence from recent RPC samples</CardDescription></div>
                <Badge variant="outline" className="border-emerald-400/20 bg-emerald-400/7 text-emerald-300">{integer.format(snapshot.network.tps)} TPS</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={throughputConfig} className="h-64 w-full aspect-auto" initialDimension={{ width: 760, height: 256 }}>
                <LineChart data={snapshot.performance} margin={{ left: -18, right: 8, top: 14, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis yAxisId="tps" tickLine={false} axisLine={false} width={58} tickFormatter={(value) => compact.format(value)} />
                  <YAxis yAxisId="slot" orientation="right" hide domain={['dataMin - 5', 'dataMax + 5']} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Line yAxisId="tps" type="monotone" dataKey="tps" stroke="var(--color-tps)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line yAxisId="slot" type="monotone" dataKey="slotTimeMs" stroke="var(--color-slotTimeMs)" strokeWidth={1.5} strokeDasharray="4 5" dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Card className="border-0 bg-card ring-white/8">
              <CardHeader className="border-b border-white/7 pb-4">
                <CardTitle className="flex items-center gap-2 text-base text-white"><CircleGauge className="size-4 text-violet-300" /> Epoch {snapshot.network.epoch}</CardTitle>
                <CardDescription>Estimated completion in {formatEta(snapshot.network.epochEtaSeconds)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="mb-2 flex justify-between font-mono text-xs"><span className="text-zinc-500">Progress</span><span className="text-white">{snapshot.network.epochProgress.toFixed(1)}%</span></div>
                  <Progress value={snapshot.network.epochProgress} className="[&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-emerald-400 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/6" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/7 bg-white/[0.025] p-3"><p className="text-xs text-zinc-500">Block height</p><p className="mt-1 font-mono text-lg text-white">{compact.format(snapshot.network.blockHeight)}</p></div>
                  <div className="rounded-lg border border-white/7 bg-white/[0.025] p-3"><p className="text-xs text-zinc-500">SOL supply</p><p className="mt-1 font-mono text-lg text-white">{compact.format(snapshot.network.supplySol)}</p></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-card ring-white/8">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base text-white"><ShieldAlert className="size-4 text-amber-300" /> Signal desk</CardTitle><CardDescription>Rule-based anomaly checks</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {snapshot.signals.slice(0, 3).map((signal) => (
                  <div key={signal.title} className={`rounded-lg border p-3 ${signalStyle(signal.severity)}`}>
                    <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{signal.title}</p><span className="font-mono text-[9px] uppercase tracking-wider opacity-70">{signal.severity}</span></div>
                    <p className="mt-1 text-xs leading-5 opacity-60">{signal.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-3 grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
          <Card className="border-0 bg-card ring-white/8">
            <CardHeader className="border-b border-white/7 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div><CardTitle className="flex items-center gap-2 text-base text-white"><TrendingUp className="size-4 text-violet-300" /> Ecosystem liquidity</CardTitle><CardDescription>Solana DeFi TVL over the selected range</CardDescription></div>
                <span className={`font-mono text-xs ${tvlChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(tvlChange)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={tvlConfig} className="h-64 w-full aspect-auto" initialDimension={{ width: 820, height: 256 }}>
                <AreaChart data={tvlData} margin={{ left: -10, right: 8, top: 14, bottom: 0 }}>
                  <defs><linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9945ff" stopOpacity={0.38} /><stop offset="100%" stopColor="#9945ff" stopOpacity={0.015} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={30} tickFormatter={(value) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} />
                  <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(value) => `$${compact.format(value)}`} domain={['dataMin - 50000000', 'dataMax + 50000000']} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" formatter={(value) => <span className="ml-auto font-mono font-medium text-white">${compact.format(Number(value))}</span>} />} />
                  <Area type="monotone" dataKey="tvl" stroke="var(--color-tvl)" strokeWidth={2.5} fill="url(#tvlGradient)" />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-0 bg-card ring-white/8">
            <CardHeader><CardTitle className="text-base text-white">Economic indicators</CardTitle><CardDescription>Market and on-chain liquidity context</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                ['SOL price', usd.format(snapshot.economy.solPrice), pct(snapshot.economy.solPriceChange24h)],
                ['DEX volume · 24h', `$${compact.format(snapshot.economy.dexVolume24h)}`, 'DefiLlama'],
                ['Stablecoin supply', `$${compact.format(snapshot.economy.stablecoinSupply)}`, 'on Solana'],
                ['DEX volume · 7d', `$${compact.format(snapshot.economy.dexVolume7d)}`, 'rolling'],
              ].map(([label, value, detail]) => (
                <div key={label} className="rounded-lg border border-white/7 bg-white/[0.025] p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 font-mono text-lg text-white">{value}</p><p className="mt-1 font-mono text-[10px] text-zinc-600">{detail}</p></div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="mt-3 grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
          <Card className="border-0 bg-card ring-white/8">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base text-white"><UsersRound className="size-4 text-emerald-300" /> Validator watch</CardTitle><CardDescription>Largest observed validators by activated stake</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader className="border-white/8 text-[11px] uppercase tracking-wider text-zinc-600"><TableRow className="border-white/8 hover:bg-transparent"><TableHead className="pl-0 text-zinc-600">Identity</TableHead><TableHead className="text-zinc-600">Activated stake</TableHead><TableHead className="text-zinc-600">Commission</TableHead><TableHead className="pr-0 text-right text-zinc-600">Status</TableHead></TableRow></TableHeader>
                <TableBody>{snapshot.validators.map((validator) => <TableRow key={validator.votePubkey} className="border-white/5 hover:bg-white/[0.025]"><TableCell className="pl-0 font-mono text-xs text-zinc-300">{shortKey(validator.identity)}</TableCell><TableCell className="font-mono text-xs text-zinc-400">{formatStake(validator.activatedStake)}</TableCell><TableCell className="font-mono text-xs text-zinc-400">{validator.commission}%</TableCell><TableCell className="pr-0 text-right"><span className={`inline-flex items-center gap-1.5 text-xs ${validator.status === 'healthy' ? 'text-emerald-300' : 'text-rose-300'}`}><span className={`size-1.5 rounded-full ${validator.status === 'healthy' ? 'bg-emerald-400' : 'bg-rose-400'}`} />{validator.status}</span></TableCell></TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-0 bg-card ring-white/8">
            <CardHeader><CardTitle className="text-base text-white">Agave release radar</CardTitle><CardDescription>Latest validator-client releases</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {snapshot.releases.slice(0, 4).map((release) => (
                <a key={`${release.tag}-${release.publishedAt}`} href={release.url} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-3 rounded-lg border border-white/7 bg-white/[0.02] px-3 py-2.5 transition hover:border-violet-400/20 hover:bg-violet-400/[0.035]">
                  <div className="min-w-0"><p className="truncate text-sm text-zinc-300 group-hover:text-white">{release.title}</p><p className="mt-1 font-mono text-[10px] text-zinc-600">{new Date(release.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div><ExternalLink className="size-3.5 shrink-0 text-zinc-600 group-hover:text-violet-300" />
                </a>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
          <Card className="border-0 bg-card ring-white/8">
            <CardHeader><CardTitle className="text-base text-white">Source coverage</CardTitle><CardDescription>{liveSources}/{snapshot.sources.length} upstream sources live at the latest refresh</CardDescription></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {snapshot.sources.map((source) => (
                <a key={source.name} href={source.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-white/7 bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04]"><span className="text-sm text-zinc-300">{source.name}</span><span className={`font-mono text-[9px] uppercase tracking-wider ${source.state === 'live' ? 'text-emerald-300' : source.state === 'stale' ? 'text-amber-300' : 'text-rose-300'}`}>{source.state}</span></a>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 bg-card ring-white/8 lg:w-[290px]">
            <CardHeader><CardTitle className="text-base text-white">Portable reports</CardTitle><CardDescription>Same snapshot, two formats</CardDescription></CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" className="flex-1 border-white/10 bg-white/4 text-zinc-200" onClick={exportJson}><FileJson2 data-icon="inline-start" /> JSON</Button>
              <Button variant="outline" className="flex-1 border-white/10 bg-white/4 text-zinc-200" onClick={exportMarkdown}><FileText data-icon="inline-start" /> Markdown</Button>
            </CardContent>
          </Card>
        </section>

        <footer className="mt-6 flex flex-col justify-between gap-2 border-t border-white/7 py-5 text-xs text-zinc-600 sm:flex-row">
          <p>SOL//PULSE · Informational only · No API keys required</p>
          <p>Generated {generated.toLocaleString('en-CA', { timeZone: 'UTC' })} UTC</p>
        </footer>
      </div>
    </main>
  );
}
