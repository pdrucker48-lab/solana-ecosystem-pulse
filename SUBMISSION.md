# Submission package

## Project

SOL//PULSE — Solana Ecosystem Intelligence

## One-line summary

A live, keyless Solana dashboard that turns network, validator, DeFi, market, stablecoin, and release data into an automatically refreshed briefing with JSON and Markdown exports.

## Suggested submission description

SOL//PULSE makes Solana ecosystem health readable at a glance. It pulls live data from Solana JSON-RPC, DefiLlama, CoinGecko, and Agave GitHub releases without API keys, labels every source and refresh cadence, and degrades transparently when an upstream provider is unavailable.

The dashboard covers TPS and slot performance, epoch progress, validator participation, SOL supply and price, DeFi TVL, DEX volume, stablecoin supply, and recent client releases. It adds straightforward anomaly signals, selectable automatic refresh, time-range controls, and one-click Markdown and JSON exports. Reproducible sample reports are included in the repository.

## Before submitting

- Confirm the entrant is eligible for the Canada-only bounty.
- Publish this folder to a public GitHub repository.
- Deploy the dashboard and set NEXT_PUBLIC_SITE_URL to its public address.
- Replace the placeholders below.
- Re-run pnpm lint, pnpm build, and pnpm reports.
- Review reports/latest.md for stale or partial source warnings.

## Links to provide

- Public repository: PENDING APPROVAL
- Private review dashboard: https://sol-pulse-solana-intelligence.pdrucker48.chatgpt.site
- Public hosted dashboard: PENDING APPROVAL
- Sample Markdown report: reports/latest.md
- Sample JSON report: reports/latest.json
- Live Markdown endpoint: /api/report/markdown
- Live JSON endpoint: /api/report/json

## Reviewer checklist

- Confirm the dashboard opens and identifies each upstream source.
- Change the 24H, 7D, and 30D liquidity ranges.
- Change the automatic refresh interval and use the manual refresh control.
- Download both Markdown and JSON reports.
- Check the validator table, anomaly signals, and Agave release links.
- Confirm the private review copy is ready to be made public.

## Accuracy note

Values are informational snapshots from public upstream providers and may lag. SOL//PULSE exposes source health and generation timestamps instead of presenting stale values as live.
