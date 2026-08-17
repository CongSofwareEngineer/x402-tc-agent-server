import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { server } from "@/lib/x402";

// The CDP SDK needs Node APIs — it does not run on the edge runtime.
export const runtime = "nodejs";

// The paid business logic for an ERC-20 token transfer. Only runs after a valid
// x402 payment is verified by the facilitator, so reaching this line means the
// fee has been settled.
//
// The response body is a small JSON receipt: the client treats it as "the fee is
// paid, you may now broadcast the send" — and nothing else. This endpoint does
// NOT touch the chain and never sees the user's transfer: the wallet builds,
// signs and broadcasts that itself.
const handler = async (_req: NextRequest) => {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        // GET is a cacheable method, so say explicitly that this receipt is not:
        // it is the result of a settled payment and must never be replayed to a
        // later, unpaid request by a browser or intermediary proxy.
        "Cache-Control": "no-store",
      },
    }
  );
};

// Wrap the handler. The price and network live in the server's route map (see
// lib/x402.ts), keyed by "GET /api/send-token" — this wrapper looks the request
// up there rather than taking payment requirements inline. Unpaid requests get
// HTTP 402 with those requirements; the client pays, retries with the payment
// header, and then receives the "ok" above.
//
// GET, to match the other paid routes and to stay checkable straight from a
// browser. Note the trade-off: charging a fee is not an idempotent action, and
// GET is a method browsers and proxies may prefetch, so the handler sends
// Cache-Control: no-store and every request is settled on its own merits.
export const GET = withX402FromHTTPServer(handler, server);
