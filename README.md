# Polymarket Copy Trading Bot

A bot that copies trades from a Polymarket wallet to yours. You pick a wallet to follow; the bot watches their activity and mirrors their buys and sells (scaled to your balance) on Polymarket’s CLOB.

Written in TypeScript/Node.js. Uses Polymarket’s data API for activity and the CLOB client for orders. No database—everything runs in memory.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

---

## What it does

- Polls Polymarket’s activity API every second (configurable) for the target wallet’s trades
- Deduplicates by transaction hash so it doesn’t double-execute
- Ignores trades older than a set window (default 24h)
- For each new trade: figures out buy/sell/merge, checks both wallets’ balances and positions, then places orders on the CLOB with a 5% slippage cap and FOK (fill-or-kill)
- Validates your wallet/private key at startup via a small API (so wrong keys don’t start the bot)

High level flow: **Data API (poll)** → **trade monitor** → **in-memory queue** → **executor** (positions + balances) → **CLOB client** (orders).

---

## Table of Contents

- [Requirements](#requirements)
- [Install](#install)
- [Config](#config)
- [Run](#run)
- [How it works (architecture)](#how-it-works-architecture)
- [Trading logic](#trading-logic)
- [APIs used](#apis-used)
- [Dev / scripts](#dev--scripts)
- [Security & risk](#security--risk)
- [Troubleshooting](#troubleshooting)
- [Performance notes](#performance-notes)
- [Support / contact](#support--contact)
- [License](#license)

---

## Requirements

- Node.js 18+
- A Polygon wallet with USDC (for trading)
- Private key in 64-char hex, no `0x` prefix
- USDC approved for the CLOB contract

---

## Install

```bash
git clone https://github.com/AtlasAlperen/polymarket-copytrading-bot
cd polymarket-arbitrage-trading-bot
npm install
```

Copy the example env and fill it in:

```bash
cp env.example .env
```

---

## Config

Create a `.env` in the project root. You need at least:

```env
# Who to copy, and your wallet
USER_ADDRESS=0x...   # wallet you're copying
PROXY_WALLET=0x...   # your wallet
PRIVATE_KEY=...      # 64 hex chars, no 0x
TARGET_ADDRESS=...   # wallet you are copying

# Polymarket
CLOB_HTTP_URL=https://clob.polymarket.com
CLOB_WS_URL=wss://clob-ws.polymarket.com

# Polygon
RPC_URL=https://polygon-rpc.com
USDC_CONTRACT_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

# Optional
FETCH_INTERVAL=1        # seconds between activity polls (default 1)
TOO_OLD_TIMESTAMP=24    # ignore trades older than this many hours (default 24)
RETRY_LIMIT=3           # max retries per order (default 3)
```

| Variable | Required | Description |
|----------|----------|-------------|
| `USER_ADDRESS` | yes | Wallet to copy |
| `PROXY_WALLET` | yes | Your wallet |
| `PRIVATE_KEY` | yes | Your key (64 hex, no 0x) |
| `CLOB_HTTP_URL` / `CLOB_WS_URL` | yes | CLOB endpoints |
| `RPC_URL` | yes | Polygon RPC |
| `USDC_CONTRACT_ADDRESS` | yes | USDC on Polygon |
| `FETCH_INTERVAL` | no | Poll interval in seconds (default 1) |
| `TOO_OLD_TIMESTAMP` | no | Stale trade cutoff in hours (default 24) |
| `RETRY_LIMIT` | no | Order retries (default 3) |

---

## Run

```bash
npm run dev    # dev with watch
# or
npm run build && npm start
```

You should see validation success, both addresses, and “Trade Monitor is running every X seconds”. When the target wallet trades, you’ll see “new transaction(s) found” and order outcomes in the logs.

---

## How it works (architecture)

```
Polymarket Data API (HTTP poll, 1s)
    ↓
Trade Monitor: fetch activities for USER_ADDRESS, filter type=TRADE, dedupe by tx hash, time window
    ↓
In-memory: processedTrades (Set), pendingTrades (array)
    ↓
Executor: compare positions, check balances, decide buy/sell/merge, apply risk params
    ↓
Order engine: FOK orders, 5% slippage check, up to RETRY_LIMIT retries
    ↓
Polymarket CLOB client
```

- No DB: state is in-memory (Sets/arrays). Restart = clean state.
- Wallet validation at startup: private key is checked against a small API; if it fails, the process exits.

---

## Trading logic

**Buy** (they buy):  
We compute a size from the ratio of your balance to their balance (after their trade), cap by your balance, then place a FOK buy. We check the best ask and bail if it’s more than 5% worse than expected.

**Sell** (they sell):  
We figure how much of their position they sold, scale that ratio to your position size, and place a FOK sell against the best bid (again with 5% slippage check).

**Merge** (they close, you still have size):  
We treat it as “close our position” and sell our full size in chunks against the book until we’re flat.

---

## APIs used

- **Activity:** `GET https://data-api.polymarket.com/activities?user={address}` — we only use `type === 'TRADE'`.
- **Positions:** `GET https://data-api.polymarket.com/positions?user={address}` — for sizing and comparison.
- **Orders:** CLOB client (`@polymarket/clob-client`) for creating and posting FOK market orders.

Response shapes are in the code as `UserActivityInterface` and `UserPositionInterface` if you need details.

---

## Dev / scripts

```bash
npm run build      # compile TypeScript
npm run dev        # run with watch
npm start          # run compiled build
npm run lint       # eslint
npm run lint:fix   # eslint --fix
npm run format     # prettier
```

Strict TypeScript, ESLint + Prettier. We avoid `any` where possible.

---

## Security & risk

- Don’t commit `.env`. Keep the private key off the repo and off shared machines.
- The bot can lose money: copy trading copies losses too. Use a wallet you can afford to lose and only fund what you need.
- Slippage is limited to 5% in code; in illiquid markets you can still get bad fills or failed FOKs.
- We don’t audit Polymarket’s contracts; you’re trusting their CLOB and USDC setup.

**Use at your own risk. No warranty.**

---

## Troubleshooting

**“USER_ADDRESS is not defined”**  
Your `.env` is missing or not loaded. Copy `env.example` to `.env` and set all required vars.

**“Private key validation failed”**  
Key must be 64 hex characters, no `0x`. Check that the validation API (used at startup) is reachable.

**“Cannot find module '@polymarket/clob-client'”**  
Run `npm install`.

**“Insufficient balance”**  
Your proxy wallet needs more USDC on Polygon. Confirm `USDC_CONTRACT_ADDRESS` is the right contract.

**Orders failing**  
Often slippage (market moved) or thin book. Try smaller size or check market liquidity. Retries are limited by `RETRY_LIMIT`.

For more verbose output you can set `process.env.DEBUG = '*'` in the entrypoint (e.g. `index.ts`).

---

## Performance notes

- Polling is every `FETCH_INTERVAL` seconds (default 1). Don’t set it too low or you may hit rate limits.
- Order execution usually finishes in a few seconds depending on RPC and CLOB.
- Memory use is modest (tens of MB). No DB or disk writes for state.

Some example runs (screenshots in the repo) are in the “Performance Snapshots” section below—past results only, not a guarantee of future performance.

<img width="352" src="https://github.com/user-attachments/assets/294c51f5-d531-450c-904c-9c19e0184a23" />
<img width="290" src="https://github.com/user-attachments/assets/2b7633a6-d9f1-43f2-a14d-ba79f9c147b2" />
<img width="351" src="https://github.com/user-attachments/assets/7b7ad783-98b5-4b10-a0a7-166e90f56589" />
<img width="313" src="https://github.com/user-attachments/assets/3b58db58-66e0-43f7-922f-8c220e37cd4c" />

---

## Support / contact

Telegram: [@crystel25s](https://t.me/crystel25s)

---
## License

ISC. See the license file for the full text. Software provided as-is, no warranties.
