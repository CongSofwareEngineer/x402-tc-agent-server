import type { NextConfig } from "next";

// "/" is deliberately not redirected here. A config redirect answers with a 307
// carrying no HTML, so social crawlers follow it and scrape chainvault.example's
// metadata instead of ours. The page itself serves our metadata and then
// forwards the visitor client-side.
const nextConfig: NextConfig = {};

export default nextConfig;
