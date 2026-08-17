import { DOMAIN } from "@/constants/app";
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import type { Address } from "viem";

type Network = `${string}:${string}`;

// Base mainnet (CAIP-2). Payments settle in USDC here, via the CDP facilitator
// that createX402Server wires up automatically — there is no facilitator URL or
// bearer token to configure.
export const NETWORK = "eip155:8453";

// EVM account that receives the payments. payToConfig.type "address" means CDP
// does NOT provision a wallet for us: funds go straight to this address and no
// CDP_WALLET_SECRET is needed — only the API key pair for the facilitator.
const payTo = process.env.EVM_ADDRESS as Address | undefined;
if (!payTo) {
  throw new Error(
    "EVM_ADDRESS environment variable is required (your Base payout address, 0x…)",
  );
}
if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
  throw new Error(
    `EVM_ADDRESS must be an EVM address (0x… , 42 chars), got: ${payTo}`,
  );
}
export const payToAddress: Address = payTo;

// Per-route price, in USD. Shared with the OpenAPI doc so discovery and the 402
// challenge agree. The three routes are the same paywall over three different
// wallet actions, priced by how much value each one moves.
export const PRICES_USD = {
  "send-nft": "0.05",
  "send-token": "0.05",
  "send-native": "0.05",
  "add-pool": "3",
  "supply-usdc": "0.01",
} as const;

// Human-readable label for the one payment option we accept. The OpenAPI doc
// renders this; keep it in step with NETWORK.
export const PAY_LABEL = "USDC on Base";

// Human-readable purpose of each paid route, used for the route description the
// 402 challenge carries. Keyed the same as PRICES_USD so the two stay in step.
const DESCRIPTIONS = {
  "send-token": "Pay the send-token execution fee (ERC-20 transfer)",
  "send-native": "Pay the send-native execution fee (native coin transfer)",
  "send-nft": "Pay the send-nft execution fee (ERC-721/1155 transfer)",
  "add-pool":
    "Pay the add-pool execution fee (add liquidity to a Uniswap V3 pool)",
  "supply-usdc":
    "Pay the supply-usdc execution fee (supply USDC to a lending market)",
} as const satisfies Record<keyof typeof PRICES_USD, string>;

// Discovery metadata for one paid route, in the Bazaar extension shape that
// indexers (x402scan) read off the 402 challenge.
//
// createX402Server auto-injects a bazaar declaration via buildBazaarDeclaration,
// but for a GET route that auto-built one is only { type, method } — no input
// schema and no output — which is what makes x402scan warn "Paid endpoint is
// missing an input schema". Setting extensions.bazaar explicitly (as the route
// map below does) replaces that default wholesale and clears the warning.
//
// The routes are bare paywalls: they read no query params and no body, so the
// input schema is legitimately an empty object. Empty is not the same as
// absent — this states "takes no parameters", which is what an agent needs to
// know to call the endpoint correctly.
//
// No `method` is passed. declareDiscoveryExtension's own JSDoc examples show
// one, but its input type is DistributiveOmit<…, "method">, so TypeScript
// rejects the field — the JSDoc is stale relative to the type. Omitting it is
// safe: the method is filled in later by withSyntheticMethod, which parses the
// leading verb off the route key ("GET /api/…" below) and falls back to GET
// when a key carries no verb. That inference is exactly why those keys must
// spell out a concrete method — a wildcard would silently index as GET.
//
// `output.schema` sits alongside `output.example` so an agent can tell what a
// paid call returns before spending anything — the example alone shows one
// value, the schema states the contract.
//
// Two quirks of how the SDK emits this, both load-bearing:
//   - the whole output block is emitted only when `output.example` is set, so
//     dropping the example would silently drop the schema with it;
//   - `output.schema` is spread into the JSON-Schema node describing the
//     example, so it must be a schema for the response body itself (the shape
//     `{ status: "ok" }` has), not a wrapper around it.
function bazaarDeclaration() {
  return declareDiscoveryExtension({
    input: {},
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    output: {
      example: { status: "ok" },
      schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["ok"],
            description: "ok once the execution fee is settled",
          },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  });
}

// The CDP-backed resource server. Routes are declared here rather than at the
// handler: this map is what the server matches an incoming request against to
// find its price, so the "METHOD /path" keys must match the real route paths.
//
// `resource` is the URL of the specific endpoint being paid for, so each route
// gets its own full URL — a bare origin would make every paywall advertise the
// same resource and confuse indexers.
//
// These are FULL x402 RouteConfigs (they carry an `accepts` array), not the
// simplified CDP format. That is deliberate: createX402Server expands the
// simplified format via convertCdpRoute(), which only keeps accepts/description/
// extensions and silently DROPS `resource` — so the 402 challenge would fall
// back to adapter.getUrl() instead of using DOMAIN. A full RouteConfig is kept
// as-is by fillX402RoutePayTo() (it spreads ...route), so `resource` survives.
//
// Top-level await — this module is imported only by Node-runtime route handlers,
// never by middleware or the edge runtime, so the await resolves at module load.

const config = Object.fromEntries(
  (Object.keys(PRICES_USD) as (keyof typeof PRICES_USD)[]).map((name) => [
    `GET /api/${name}`,
    {
      accepts: {
        scheme: "exact",
        price: `$${PRICES_USD[name]}`,
        network: NETWORK as Network,
        payTo: payToAddress,
        maxTimeoutSeconds: 3600,
      },
      description: DESCRIPTIONS[name],
      extensions: bazaarDeclaration(),
      resource: DOMAIN,
    },
  ]),
);

export const server = await createX402Server({
  payToConfig: { type: "address", evm: payToAddress },
  routes: config,
});


