import { NextRequest, NextResponse } from "next/server";
import { PRICES_USD, PAY_LABEL } from "@/lib/x402";

// The paid routes. Each is one paywall over a wallet action, so they share a
// shape and differ only in path, price, and wording. Add a new paid endpoint by
// appending an entry here (and its price key in lib/x402's PRICES_USD); the
// OpenAPI doc and the discovery guidance pick it up with no other change. Routes
// need not be "send-*" — the family name is not baked into the discovery shape.
const PAID_ROUTES = [
  {
    path: "/api/send-token",
    operationId: "sendToken",
    summary: "Send Token — pay the ERC-20 transfer execution fee",
    description: "Pay the execution fee for an ERC-20 token transfer.",
    price: PRICES_USD["send-token"],
  },
  {
    path: "/api/send-native",
    operationId: "sendNative",
    summary: "Send Native — pay the native coin transfer execution fee",
    description: "Pay the execution fee for a native coin transfer.",
    price: PRICES_USD["send-native"],
  },
  {
    path: "/api/send-nft",
    operationId: "sendNft",
    summary: "Send NFT — pay the ERC-721/1155 transfer execution fee",
    description: "Pay the execution fee for an NFT (ERC-721/1155) transfer.",
    price: PRICES_USD["send-nft"],
  },
  {
    path: "/api/add-pool",
    operationId: "addPool",
    summary: "Add Pool — pay the Uniswap V3 add-liquidity execution fee",
    description:
      "Pay the execution fee for adding liquidity to a Uniswap V3 pool.",
    price: PRICES_USD["add-pool"],
  },
  {
    path: "/api/supply-usdc",
    operationId: "supplyUsdc",
    summary: "Supply USDC — pay the lending-market supply execution fee",
    description:
      "Pay the execution fee for supplying USDC to a lending market.",
    price: PRICES_USD["supply-usdc"],
  },
] as const;

// One OpenAPI operation per paid route, in the shape x402scan indexes:
//   - x-payment-info  -> price mode + protocols (marks the route as x402-paid)
//   - responses.402   -> the payment challenge
//   - an input + output schema (required; missing schemas fail registration)
// The runtime 402 challenge stays the source of truth; this only describes it.
function paidOperation(route: (typeof PAID_ROUTES)[number]) {
  return {
    get: {
      operationId: route.operationId,
      summary: route.summary,
      description: `${route.description} Paid in ${PAY_LABEL}.`,
      "x-payment-info": {
        // amount is decimal USD here; the runtime 402 quotes atomic units.
        price: { mode: "fixed", currency: "USD", amount: route.price },
        protocols: [{ x402: {} }],
      },
      // No transfer details are taken — the route is a bare paywall, so the
      // input schema is an empty object. An empty schema is not the same as a
      // missing one: x402scan warns on operations with no input schema at all,
      // while this states positively that the route takes no parameters.
      parameters: [] as unknown[],
      "x-input-schema": {
        type: "object",
        properties: {},
        required: [] as string[],
        additionalProperties: false,
      },
      responses: {
        "200": {
          description: "Fee settled",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { status: { type: "string", enum: ["ok"] } },
                required: ["status"],
              },
            },
          },
        },
        "402": { description: "Payment Required" },
      },
    },
  };
}

// The public origin of this deployment. req.nextUrl.origin is the *internal*
// URL the server was reached on, so behind a proxy/CDN it reads as
// http://localhost:3000 and would publish a localhost doc. Prefer an explicit
// site URL, then Vercel's injected production domain, then the forwarded host
// the proxy actually served, and only fall back to the request URL in dev.
function resolveOrigin(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

// Canonical machine-readable contract, served at GET /openapi.json. This is the
// first source x402scan reads (ahead of the live 402 challenge) to discover the
// endpoints, their input/output schema, and their price.
export async function GET(req: NextRequest) {
  const origin = resolveOrigin(req);

  const doc = {
    openapi: "3.1.0",
    info: {
      title: "x402 KEYRING AGENT Server",
      version: "1.0.0",
      description:
        "Agent-native wallet-action paywall. Pay-per-call with USDC on Base " +
        "over the x402 protocol. No accounts or API keys required.",
      // High-level guidance x402scan surfaces to agents browsing the API.
      // Phrased about the paywall in general, not any one route family, so it
      // stays correct as endpoints are added — see each operation's summary and
      // x-payment-info for what a specific route does and costs.
      "x-guidance":
        "Every paid endpoint charges a fixed execution fee via x402 (USDC on " +
        "Base): pay the 402 challenge and the call settles. The routes take no " +
        "transfer details and never touch the chain — the caller broadcasts the " +
        "transfer itself. See each operation for its price and behavior.",
      contact: { email: "info@bacoor.co" },
      "x-logo": {
        url: `${origin}/favicon.ico`,
        altText: "x402 KEYRING AGENT Server",
      },
    },
    servers: [{ url: origin }],
    paths: Object.fromEntries(
      PAID_ROUTES.map((route) => [route.path, paidOperation(route)])
    ),
  };

  return NextResponse.json(doc);
}
