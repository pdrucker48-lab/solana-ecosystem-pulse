# SOL//PULSE

SOL//PULSE is a live Solana ecosystem intelligence dashboard and automatic report generator. It combines network, validator, DeFi, market, stablecoin, and software-release signals in one low-maintenance view.

## What it does

- Refreshes network performance and validator participation every 60 seconds.
- Tracks SOL price, Solana DeFi TVL, DEX volume, and stablecoin supply.
- Highlights simple anomalies such as elevated validator delinquency, sharp price moves, and unusual DEX activity.
- Shows recent Agave software releases.
- Exports the current snapshot as JSON or a readable Markdown report.
- Serves always-current report endpoints at /api/report/json and /api/report/markdown.
- Keeps a clearly labeled sample-data fallback so upstream outages do not make the dashboard unusable.

## Data sources

| Source | Used for | Credentials |
| --- | --- | --- |
| Solana JSON-RPC | TPS, slot time, epoch, validators, supply, block height | None |
| DefiLlama | TVL, DEX volume, stablecoin supply | None |
| CoinGecko | SOL price and 24-hour change | None |
| GitHub Releases | Recent Agave releases | None |

The dashboard displays source health and generation time. Values are informational and may lag upstream providers.

## Run locally

Requirements: Node.js 22.13 or newer and pnpm.

    pnpm install
    pnpm dev

Open http://localhost:3000.

Machine-readable report: http://localhost:3000/api/report/json  
Markdown report: http://localhost:3000/api/report/markdown

## Verify

    pnpm lint
    pnpm build

To capture live sample reports while the development server is running:

    pnpm reports

This creates reports/latest.json and reports/latest.md.

## Architecture

- Vinext and React power the dashboard.
- The server-side snapshot route queries public, keyless data sources in parallel.
- Each upstream request has a timeout; unavailable sources degrade to a partial or sample state.
- Lightweight SVG trend charts and shadcn components provide responsive, accessible visualizations and controls.
- Browser auto-refresh is selectable: off, 30 seconds, 60 seconds, or 5 minutes.

## Limitations

- Public endpoints can be rate-limited or briefly unavailable.
- TPS is derived from recent performance samples and is not a promise of future capacity.
- Validator rows are a live top-stake sample, not a complete validator explorer.
- This is ecosystem monitoring software, not financial advice.

## License

MIT
