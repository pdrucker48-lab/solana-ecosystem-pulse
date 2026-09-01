# SOL//PULSE

SOL//PULSE is a live Solana ecosystem intelligence dashboard and automatic report generator. It combines network, validator, activity, fee, DeFi, market, stablecoin, and protocol-development signals in one low-maintenance view.

## What it does

- Refreshes network performance and validator participation every 60 seconds.
- Separates total TPS from non-vote TPS and samples recent transaction and priority fees.
- Tracks SOL price, Solana DeFi TVL, DEX volume, stablecoin supply, active addresses, fee payers, daily transactions, network fees, and failed non-vote transactions.
- Calculates provider-consensus activity figures as the daily median across independent public providers surfaced by Solana Data.
- Highlights TPS, slot-time, validator, failure-rate, price, TVL, and DEX-volume anomalies with explicit thresholds.
- Shows recent Agave releases and live status from official Alpenglow and reduced-slot-time SIMD proposals.
- Exports the current snapshot as JSON or a readable Markdown report.
- Serves always-current report endpoints at /api/report/json and /api/report/markdown.
- Keeps a clearly labeled sample-data fallback and transparent source-state warnings so upstream outages do not make the dashboard unusable.

## Data sources

| Source                   | Used for                                                                           | Credentials |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------- |
| Solana JSON-RPC          | TPS, slot time, epoch, validators, supply, block height                            | None        |
| Solana Data              | Provider-consensus active addresses, fee payers, fees, transactions, failure rates | None        |
| DefiLlama                | TVL, DEX volume, stablecoin supply                                                 | None        |
| CoinGecko                | SOL price and 24-hour change                                                       | None        |
| GitHub Releases          | Recent Agave releases                                                              | None        |
| Official SIMD repository | Alpenglow and slot-time proposal status                                            | None        |

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

To generate equivalent reports without Node.js, the dashboard, or third-party Python packages:

    python scripts/solpulse.py

This creates `reports/python-latest.json` and `reports/python-latest.md`. A scheduled GitHub Actions workflow refreshes these files daily.

## Mandatory pre-submission critique

Every candidate release must run the adversarial quality gate described in `docs/PRE_SUBMISSION_REVIEW.md`:

    pnpm preflight:review
    pnpm preflight

The review command permits private-review warnings. The final command fails until all technical checks, Canada eligibility confirmation, and public repository/demo links are complete. Both write the auditable scorecard at `reports/preflight.md`.

## Architecture

- Vinext and React power the dashboard.
- The server-side snapshot route queries public, keyless data sources in parallel.
- The provider-consensus method takes the median across available public indexers for each complete daily metric, reducing single-provider dependence.
- Each upstream request has a timeout; unavailable sources degrade to a partial or sample state.
- Lightweight SVG trend charts and shadcn components provide responsive, accessible visualizations and controls.
- Browser auto-refresh is selectable: off, 30 seconds, 60 seconds, or 5 minutes.

## Limitations

- Public endpoints can be rate-limited or briefly unavailable.
- Cross-provider medians improve robustness but can mask real methodology differences; the report records provider count and observation date.
- TPS is derived from recent performance samples and is not a promise of future capacity.
- Validator rows are a live top-stake sample, not a complete validator explorer.
- This is ecosystem monitoring software, not financial advice.

## License

MIT
