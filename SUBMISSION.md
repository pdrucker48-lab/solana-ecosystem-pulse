# Submission package

## Project

SOL//PULSE — Solana Ecosystem Intelligence

## One-line summary

A live, keyless Solana dashboard that turns network, validator, activity, fee, DeFi, market, stablecoin, release, and upgrade data into an automatically refreshed briefing with JSON and Markdown exports.

## Suggested submission description

SOL//PULSE makes Solana ecosystem health readable at a glance. It pulls live data from Solana JSON-RPC, Solana Data, DefiLlama, CoinGecko, Agave releases, and the official SIMD repository without API keys, labels every source and refresh cadence, and degrades transparently when an upstream provider is unavailable.

The dashboard covers total and non-vote TPS, slot performance, fees, epoch progress, validator participation, daily users and transactions, SOL supply and price, DeFi TVL, DEX volume, stablecoin supply, releases, and upcoming protocol changes. Its differentiator is provider-consensus activity data: the daily median across independent public indexers. It adds anomaly signals, selectable automatic refresh, time-range controls, one-click exports, a zero-dependency Python generator, and daily report automation.

## Before submitting

- Confirm the entrant is eligible for the Canada-only bounty.
- Publish this folder to a public GitHub repository.
- Deploy the dashboard and set NEXT_PUBLIC_SITE_URL to its public address.
- Replace the placeholders below.
- Re-run pnpm lint, pnpm build, and pnpm reports.
- Run `pnpm preflight`; do not submit unless it exits successfully with zero blockers.
- Review reports/latest.md for stale or partial source warnings.

Eligibility: CONFIRMED by entrant on 2026-08-31 (Canada-only bounty)

## Links to provide

- Public repository: https://github.com/pdrucker48-lab/solana-ecosystem-pulse
- Public hosted dashboard: https://sol-pulse-solana-intelligence.pdrucker48.chatgpt.site
- Sample Markdown report: reports/latest.md
- Sample JSON report: reports/latest.json
- Standalone Python report: reports/python-latest.md and reports/python-latest.json
- Adversarial pre-submission scorecard: reports/preflight.md
- Live Markdown endpoint: /api/report/markdown
- Live JSON endpoint: /api/report/json

## Reviewer checklist

- Confirm the dashboard opens and identifies each upstream source.
- Change the 24H, 7D, and 30D liquidity ranges.
- Change the automatic refresh interval and use the manual refresh control.
- Download both Markdown and JSON reports.
- Check the validator table, anomaly signals, and Agave release links.
- Check the provider-consensus activity/fee panel and official SIMD roadmap.
- Confirm `pnpm preflight` reports HIGH-CONFIDENCE READY with no blockers.
- Confirm the private review copy is ready to be made public.

## Accuracy note

Values are informational snapshots from public upstream providers and may lag. SOL//PULSE exposes source health and generation timestamps instead of presenting stale values as live.
