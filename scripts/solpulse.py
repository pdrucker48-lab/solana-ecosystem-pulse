#!/usr/bin/env python3
"""Generate SOL//PULSE JSON and Markdown reports with Python's standard library only."""

from __future__ import annotations

import argparse
import copy
import json
import statistics
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RPC_ENDPOINTS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"]
SOLANA_DATA = "https://solana.com/api/databricks/data?days=7"
SIMD_BASE = "https://raw.githubusercontent.com/solana-foundation/solana-improvement-documents/main/proposals"


def request_json(url: str, payload: Any | None = None, timeout: int = 15) -> Any:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "SOL-PULSE-reporter/1.1"},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def request_text(url: str, timeout: int = 15) -> str:
    request = urllib.request.Request(url, headers={"Accept": "text/plain", "User-Agent": "SOL-PULSE-reporter/1.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def rpc_call(endpoint: str, method: str, params: list[Any]) -> Any:
    response = request_json(endpoint, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    if response.get("error") or "result" not in response:
        raise RuntimeError(response.get("error", {}).get("message", f"{method} failed"))
    return response["result"]


def fetch_rpc() -> tuple[str, dict[int, Any]]:
    calls = [
        (1, "getEpochInfo", []),
        (2, "getRecentPerformanceSamples", [12]),
        (3, "getVoteAccounts", []),
        (4, "getSupply", []),
        (5, "getBlockHeight", []),
        (6, "getRecentPrioritizationFees", []),
    ]
    payload = [{"jsonrpc": "2.0", "id": item_id, "method": method, "params": params} for item_id, method, params in calls]
    last_error: Exception | None = None
    for endpoint in RPC_ENDPOINTS:
        try:
            response = request_json(endpoint, payload)
            values = {item["id"]: item.get("result") for item in response}
            if not values.get(1) or not values.get(2):
                raise RuntimeError("Incomplete RPC response")
            return endpoint, values
        except Exception as error:  # per-source fallback is intentional
            last_error = error
    raise last_error or RuntimeError("No RPC endpoint available")


def fetch_block_fee() -> float:
    last_error: Exception | None = None
    for endpoint in RPC_ENDPOINTS:
        try:
            slot = rpc_call(endpoint, "getSlot", [{"commitment": "finalized"}])
            for offset in (5, 10, 20):
                try:
                    block = rpc_call(endpoint, "getBlock", [slot - offset, {
                        "commitment": "finalized", "encoding": "json", "transactionDetails": "accounts",
                        "maxSupportedTransactionVersion": 0, "rewards": False,
                    }])
                    fees = [item.get("meta", {}).get("fee") for item in block.get("transactions", []) if item.get("meta")]
                    fees = [float(value) for value in fees if isinstance(value, (int, float))]
                    if fees:
                        return statistics.median(fees)
                except Exception as error:
                    last_error = error
        except Exception as error:
            last_error = error
    raise last_error or RuntimeError("No recent block fee available")


def load_fallback() -> dict[str, Any]:
    path = ROOT / "reports" / "latest.json"
    if not path.exists():
        raise RuntimeError("reports/latest.json is required as the transparent offline fallback")
    return json.loads(path.read_text(encoding="utf-8"))


def median_metric(rows: list[dict[str, Any]], date: str, name: str) -> float:
    values = [float(row["value"]) for row in rows if row.get("date") == date and row.get("metricName") == name]
    return statistics.median(values) if values else 0


def parse_activity(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    names = ["Active Addresses", "Fee Payers", "Fees", "Transaction Count (Total)", "Non Vote Transaction Count (Success)", "Non Vote Transaction Count (Failed)"]
    dates = sorted({row.get("date") for row in rows if row.get("date")}, reverse=True)
    observed = next((date for date in dates if all(any(row.get("date") == date and row.get("metricName") == name for row in rows) for name in names)), None)
    if not observed:
        raise RuntimeError("No complete Solana Data activity date")
    successful = median_metric(rows, observed, names[4])
    failed = median_metric(rows, observed, names[5])
    providers = {row.get("providerName") for row in rows if row.get("date") == observed and row.get("metricName") in names}
    activity = {
        "observedDate": observed,
        "activeAddresses": median_metric(rows, observed, names[0]),
        "feePayers": median_metric(rows, observed, names[1]),
        "networkFeesSol": median_metric(rows, observed, names[2]),
        "networkFeesUsd": 0,
        "totalTransactions": median_metric(rows, observed, names[3]),
        "successfulNonVoteTransactions": successful,
        "failedNonVoteTransactions": failed,
        "nonVoteFailurePercent": failed / (successful + failed) * 100 if successful + failed else 0,
        "providerCount": len(providers),
    }
    history = [{
        "date": date,
        "activeAddresses": median_metric(rows, date, names[0]),
        "feePayers": median_metric(rows, date, names[1]),
        "networkFeesSol": median_metric(rows, date, names[2]),
        "totalTransactions": median_metric(rows, date, names[3]),
    } for date in reversed(dates[:7])]
    return activity, history


def parse_simd(markdown: str, identifier: str, detail: str, url: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in markdown.splitlines():
        if ":" in line:
            key, value = (part.strip().strip("'\"") for part in line.split(":", 1))
            if key.lower() in {"title", "status"}:
                fields[key.lower()] = value
    return {"title": fields.get("title", identifier), "identifier": identifier, "status": fields.get("status", "Unknown"), "detail": detail, "url": url}


def percentage(current: float, previous: float) -> float:
    return (current - previous) / previous * 100 if previous else 0


def markdown_report(snapshot: dict[str, Any]) -> str:
    network, economy, activity = snapshot["network"], snapshot["economy"], snapshot["activity"]
    signals = "\n".join(f'- **{item["severity"].upper()} — {item["title"]}:** {item["detail"]}' for item in snapshot["signals"])
    developments = "\n".join(f'| {item["identifier"]} | {item["title"]} | {item["status"]} | [Official proposal]({item["url"]}) |' for item in snapshot["developments"])
    sources = "\n".join(f'| {item["name"]} | {item["state"]} | {item["cadence"]} | {item["url"]} |' for item in snapshot["sources"])
    return f"""# SOL//PULSE — Solana Ecosystem Report

Generated: {snapshot['generatedAt']}  
Data state: {snapshot['state']}

## Briefing

{snapshot['briefing']}

## Network

| Metric | Value |
| --- | ---: |
| TPS | {network['tps']:,.2f} |
| Non-vote TPS | {snapshot['performance'][-1]['nonVoteTps']:,.2f} |
| Median slot time | {network['slotTimeMs']:,.2f} ms |
| Median transaction fee | {network['medianTransactionFeeLamports']:,.0f} lamports |
| Median priority fee | {network['medianPriorityFeeMicroLamports']:,.0f} micro-lamports / compute unit |
| Block height | {network['blockHeight']:,} |
| Epoch | {network['epoch']} ({network['epochProgress']:.2f}%) |
| Active validators | {network['activeValidators']:,} |
| Delinquent validators | {network['delinquentValidators']:,} ({network['delinquentPercent']:.2f}%) |

## Economy

| Metric | Value |
| --- | ---: |
| SOL price | ${economy['solPrice']:,.2f} ({economy['solPriceChange24h']:.2f}% 24h) |
| Solana DeFi TVL | ${economy['tvl']:,.2f} |
| DEX volume | ${economy['dexVolume24h']:,.2f} 24h / ${economy['dexVolume7d']:,.2f} 7d |
| Stablecoin supply | ${economy['stablecoinSupply']:,.2f} |

## Network activity and fees

Multi-provider median for {activity['observedDate']}, calculated from {activity['providerCount']} public providers surfaced by Solana Data.

| Metric | Value |
| --- | ---: |
| Active addresses | {activity['activeAddresses']:,.0f} |
| Fee payers | {activity['feePayers']:,.0f} |
| Total transactions | {activity['totalTransactions']:,.0f} |
| Non-vote failure rate | {activity['nonVoteFailurePercent']:.2f}% |
| Network fees | {activity['networkFeesSol']:,.2f} SOL / ${activity['networkFeesUsd']:,.2f} |

## Signals

{signals}

## Protocol roadmap

| Proposal | Development | Status | Source |
| --- | --- | --- | --- |
{developments}

## Data sources

| Source | State | Refresh | URL |
| --- | --- | --- | --- |
{sources}

---

Generated by SOL//PULSE. Values are informational and may lag their upstream sources.
"""


def generate() -> dict[str, Any]:
    snapshot = copy.deepcopy(load_fallback())
    snapshot["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    jobs = {
        "rpc": fetch_rpc,
        "block_fee": fetch_block_fee,
        "solana_data": lambda: request_json(SOLANA_DATA),
        "tvl": lambda: request_json("https://api.llama.fi/v2/historicalChainTvl/Solana"),
        "dex": lambda: request_json("https://api.llama.fi/overview/dexs/Solana?excludeTotalDataChartBreakdown=true&excludeTotalDataChart=true"),
        "stable": lambda: request_json("https://stablecoins.llama.fi/stablecoincharts/Solana"),
        "price": lambda: request_json("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true"),
        "releases": lambda: request_json("https://api.github.com/repos/anza-xyz/agave/releases?per_page=4"),
        "simd_326": lambda: request_text(f"{SIMD_BASE}/0326-alpenglow.md"),
        "simd_525": lambda: request_text(f"{SIMD_BASE}/0525-reduce-slot-times.md"),
    }
    results: dict[str, Any] = {}
    errors: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=9) as executor:
        futures = {executor.submit(function): name for name, function in jobs.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                results[name] = future.result()
            except Exception as error:
                errors[name] = str(error)

    if "rpc" in results:
        endpoint, values = results["rpc"]
        epoch, samples, votes, supply = values[1], values[2], values.get(3, {}), values.get(4, {})
        current = samples[0]
        slot_ms = current["samplePeriodSecs"] / current["numSlots"] * 1000
        snapshot["network"].update({
            "tps": current["numTransactions"] / current["samplePeriodSecs"], "slotTimeMs": slot_ms,
            "blockHeight": values.get(5, snapshot["network"]["blockHeight"]), "epoch": epoch["epoch"],
            "epochProgress": epoch["slotIndex"] / epoch["slotsInEpoch"] * 100,
            "epochEtaSeconds": (epoch["slotsInEpoch"] - epoch["slotIndex"]) * slot_ms / 1000,
            "supplySol": supply.get("value", {}).get("total", snapshot["network"]["supplySol"] * 1e9) / 1e9,
            "medianPriorityFeeMicroLamports": statistics.median([item.get("prioritizationFee", 0) for item in values.get(6, [])]) if values.get(6) else 0,
        })
        snapshot["performance"] = [{
            "label": "now" if index == len(samples) - 1 else f"{len(samples) - 1 - index}m",
            "tps": sample["numTransactions"] / sample["samplePeriodSecs"],
            "nonVoteTps": sample.get("numNonVoteTransactions", 0) / sample["samplePeriodSecs"],
            "slotTimeMs": sample["samplePeriodSecs"] / sample["numSlots"] * 1000,
        } for index, sample in enumerate(reversed(samples))]
        current_votes, delinquent_votes = votes.get("current", []), votes.get("delinquent", [])
        total_votes = len(current_votes) + len(delinquent_votes)
        snapshot["network"].update({
            "activeValidators": len(current_votes), "delinquentValidators": len(delinquent_votes),
            "delinquentPercent": len(delinquent_votes) / total_votes * 100 if total_votes else 0,
        })
        snapshot["sources"][0].update({"state": "live", "url": endpoint})
    if "block_fee" in results:
        snapshot["network"]["medianTransactionFeeLamports"] = results["block_fee"]
    if "solana_data" in results:
        snapshot["activity"], snapshot["activityHistory"] = parse_activity(results["solana_data"].get("rows", []))
        next(item for item in snapshot["sources"] if item["name"] == "Solana Data")["state"] = "live"
    if "tvl" in results and results["tvl"]:
        history = results["tvl"][-31:]
        snapshot["tvlHistory"] = [{"date": datetime.fromtimestamp(item["date"], timezone.utc).date().isoformat(), "tvl": item["tvl"]} for item in history]
        latest = history[-1]["tvl"]
        snapshot["economy"].update({
            "tvl": latest, "tvlChange1d": percentage(latest, history[-2]["tvl"]),
            "tvlChange7d": percentage(latest, history[-8]["tvl"]), "tvlChange30d": percentage(latest, history[-31]["tvl"]),
        })
    if "dex" in results:
        snapshot["economy"].update({"dexVolume24h": results["dex"].get("total24h", snapshot["economy"]["dexVolume24h"]), "dexVolume7d": results["dex"].get("total7d", snapshot["economy"]["dexVolume7d"])})
    if "stable" in results and results["stable"]:
        snapshot["economy"]["stablecoinSupply"] = results["stable"][-1].get("totalCirculatingUSD", {}).get("peggedUSD", snapshot["economy"]["stablecoinSupply"])
    if all(name in results for name in ("tvl", "dex", "stable")):
        next(item for item in snapshot["sources"] if item["name"] == "DefiLlama")["state"] = "live"
    if "price" in results:
        price = results["price"].get("solana", {})
        snapshot["economy"].update({"solPrice": price.get("usd", snapshot["economy"]["solPrice"]), "solPriceChange24h": price.get("usd_24h_change", snapshot["economy"]["solPriceChange24h"])})
        next(item for item in snapshot["sources"] if item["name"] == "CoinGecko")["state"] = "live"
    snapshot["activity"]["networkFeesUsd"] = snapshot["activity"]["networkFeesSol"] * snapshot["economy"]["solPrice"]
    if "releases" in results:
        snapshot["releases"] = [{"title": item.get("name") or item.get("tag_name", "Agave release"), "tag": item.get("tag_name", "release"), "publishedAt": item.get("published_at", snapshot["generatedAt"]), "url": item.get("html_url", "https://github.com/anza-xyz/agave/releases")} for item in results["releases"]]
        next(item for item in snapshot["sources"] if item["name"] == "Agave releases")["state"] = "live"
    if "simd_326" in results and "simd_525" in results:
        snapshot["developments"] = [
            parse_simd(results["simd_326"], "SIMD-0326", "New consensus design targeting materially lower finality latency and stronger resilience.", "https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0326-alpenglow.md"),
            parse_simd(results["simd_525"], "SIMD-0525", "Feature-gated proposal to reduce target slot time in stages from 400ms toward 200ms.", "https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0525-reduce-slot-times.md"),
        ]
        next(item for item in snapshot["sources"] if item["name"] == "SIMD repository")["state"] = "live"

    delinquent = snapshot["network"]["delinquentPercent"]
    signals = [{"severity": "critical" if delinquent >= 8 else "watch" if delinquent >= 5 else "info", "title": "High validator delinquency" if delinquent >= 8 else "Validator delinquency elevated" if delinquent >= 5 else "Validator participation healthy", "detail": f"Observed validator delinquency is {delinquent:.1f}%."}]
    previous = snapshot["performance"][:-1]
    if previous:
        tps_delta = percentage(snapshot["network"]["tps"], statistics.mean(item["tps"] for item in previous))
        if tps_delta <= -40:
            signals.append({"severity": "critical", "title": "TPS materially below baseline", "detail": f"Current TPS is {abs(tps_delta):.1f}% below the preceding sample mean."})
        elif abs(tps_delta) >= 20:
            signals.append({"severity": "watch", "title": "TPS outside recent baseline", "detail": f"Current TPS is {abs(tps_delta):.1f}% {'above' if tps_delta > 0 else 'below'} the preceding sample mean."})
    failure = snapshot["activity"]["nonVoteFailurePercent"]
    if failure >= 45:
        signals.append({"severity": "critical" if failure >= 60 else "watch", "title": "Non-vote failure rate elevated", "detail": f"{failure:.1f}% of observed non-vote transaction attempts failed."})
    snapshot["signals"] = signals
    urgent = [item for item in signals if item["severity"] != "info"]
    snapshot["briefing"] = "Solana is operating normally across the monitored network and ecosystem baselines." if not urgent else f"Solana is online with {len(urgent)} unusual signal{'s' if len(urgent) != 1 else ''} under watch."
    live = sum(item["state"] == "live" for item in snapshot["sources"])
    snapshot["state"] = "live" if live == len(snapshot["sources"]) else "partial" if live else "sample"
    snapshot["generationErrors"] = errors
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=str(ROOT / "reports"))
    arguments = parser.parse_args()
    output = Path(arguments.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    snapshot = generate()
    (output / "python-latest.json").write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    (output / "python-latest.md").write_text(markdown_report(snapshot), encoding="utf-8")
    print(f"Wrote {output / 'python-latest.json'} and {output / 'python-latest.md'} ({snapshot['state']}).")


if __name__ == "__main__":
    main()
