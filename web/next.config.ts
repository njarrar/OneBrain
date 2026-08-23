import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // The Add page sends photos through a server action, and the default limit there is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default nextConfig;

// Gives `next dev` the same D1 and R2 bindings the Worker gets. Workers AI and Vectorize only
// run on Cloudflare, so they stay off here unless BRAIN_REMOTE=1 (which needs a wrangler login).
// Without them, search by meaning, Related and Ask Brain fall back to word search.
initOpenNextCloudflareForDev({ remoteBindings: process.env.BRAIN_REMOTE === "1" });
