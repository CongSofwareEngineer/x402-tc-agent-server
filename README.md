# x402 Server

A Next.js (App Router) API that charges per call using the [x402](https://docs.x402.org) payment protocol.

- **Price:** `$0.01` – `$0.03` USDC · **Network:** Base mainnet (`eip155:8453`) · **Facilitator:** Coinbase CDP

> **Base MAINNET — real USDC, real money on every paid call.** To try the flow for free,
> pass `environment: "development"` to `createX402Server` in `lib/x402.ts` and set
> `NETWORK` to Base Sepolia (`eip155:84532`).

### Endpoints

Three execution-fee endpoints. Each is self-contained in its own route file — the logic is
the same, only the price differs:

| Endpoint | Price | Fee for |
| --- | --- | --- |
| `GET /api/send-token` | `$0.01` | ERC-20 token transfer |
| `GET /api/send-native` | `$0.02` | Native coin transfer |
| `GET /api/send-nft` | `$0.03` | NFT (ERC-721/1155) transfer |

Each returns `{ "status": "ok" }` once the payment settles — the caller then broadcasts
the transfer itself. These endpoints **never touch the chain** and take no transfer
details: the wallet builds, signs and broadcasts the send.

## How it works

Each route is wrapped with `withX402FromHTTPServer` from
[`@x402/next`](https://www.npmjs.com/package/@x402/next), backed by a resource server built
with `createX402Server` from the Coinbase CDP SDK:

1. A request with no payment receives **HTTP 402 Payment Required**. The payment
   requirements (amount, network, recipient) come back in the **`PAYMENT-REQUIRED`
   response header** — base64-encoded JSON — and the body is empty. That header, not the
   body, is where x402 v2 puts them.
2. The client signs a USDC payment and retries with an `X-PAYMENT` header.
3. The CDP facilitator verifies + settles the payment, then the handler runs and returns
   its result.

Prices and networks live in the route map in `lib/x402.ts`, keyed by `"METHOD /path"` —
the keys must match the real route paths, since that map is what a request is matched
against to find its price.

## Setup

```bash
yarn install
```

Set your CDP credentials and payout wallet in `.env.local` (copy from `.env.example`):

```bash
CDP_API_KEY_ID=your-cdp-api-key-id          # portal.cdp.coinbase.com
CDP_API_KEY_SECRET=your-cdp-api-key-secret
EVM_ADDRESS=0xYourWalletAddressHere         # where the USDC fees land
```

`payToConfig: { type: "address" }` means CDP never custodies the funds — they settle
straight to `EVM_ADDRESS` — which is why no `CDP_WALLET_SECRET` is needed.

## Run

```bash
yarn dev      # http://localhost:3000
```

## Try it

Unpaid request — returns 402 with the requirements in the `PAYMENT-REQUIRED` header:

```bash
curl -i http://localhost:3000/api/send-token
curl -i http://localhost:3000/api/send-native
curl -i http://localhost:3000/api/send-nft
```

The header is base64 JSON — decode it to read the requirements:

```bash
curl -sD - -o /dev/null http://localhost:3000/api/send-token \
  | grep -i '^payment-required:' | sed 's/^[^:]*: *//' | tr -d '\r' \
  | base64 -d | python3 -m json.tool
```

To pay automatically, use an x402 client (e.g. `@x402/fetch` or `@x402/axios`) with a
wallet holding USDC on Base mainnet.

## Discoverability (x402scan)

So agents can find and call this API, it follows the
[x402scan discovery spec](https://x402scan.com/discovery/spec):

- **OpenAPI at `/openapi.json`** — the canonical machine-readable contract
  (`app/openapi.json/route.ts`). x402scan reads this first, then verifies the runtime
  `402` challenge (runtime behavior is authoritative).
- Each `send-*` operation includes what a payable operation needs:
  - `x-payment-info` → `price: { mode: "fixed", currency: "USD", amount: "0.01" }`
    (`0.02` / `0.03` for the other two) and `protocols: [{ "x402": {} }]`
  - a `402` response
  - an **output schema** (`{ status: "ok" }`)

> These operations take **no parameters** — paying the fee is the whole request. x402scan
> may skip endpoints without an input schema as non-invocable; if that matters for
> registration, add a documented query param (e.g. `chain`) to the operations in
> `app/openapi.json/route.ts`.

### Validate before registering

```bash
# what x402scan resolves from your origin
npx -y @agentcash/discovery@latest discover http://localhost:3100
# warnings on how the discovery document can be improved
npx -y @agentcash/discovery@latest check http://localhost:3100
```

Run these against your **public** origin once deployed (the registry must reach it).

### Register on x402scan

Registration requires SIWX wallet auth, handled by the agentcash MCP server:

```bash
npx agentcash install   # adds x402 payment + SIWX wallet tools
```

Then use the MCP `fetch_with_auth` tool to `POST https://x402scan.com/api/x402/registry/register-origin`
with your origin. It returns `{ registered, failed, deprecated, total, source, failedDetails? }`;
fix anything in `failedDetails` and re-register.

## Files

- `lib/x402.ts` — CDP-backed resource server + the route map (price, network, payout address); single source of truth for the prices (`PRICES_USD`)
- `app/api/send-token/route.ts` — the paid ERC-20 transfer fee endpoint ($0.01)
- `app/api/send-native/route.ts` — the paid native transfer fee endpoint ($0.02)
- `app/api/send-nft/route.ts` — the paid NFT transfer fee endpoint ($0.03)
- `app/openapi.json/route.ts` — OpenAPI discovery document for x402scan
- `app/page.tsx` — landing page describing the endpoints
