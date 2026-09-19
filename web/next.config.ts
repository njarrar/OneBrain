import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { execSync } from "node:child_process";
import pkg from "./package.json" with { type: "json" };

// Stamped into the build, so the footer and /api/app/version say which build is live.
// The GitHub deploy builds right before it publishes, so the build time is the deploy time.
function commit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    BRAIN_VERSION: pkg.version,
    BRAIN_COMMIT: commit(),
    BRAIN_BUILT_AT: new Date().toISOString(),
  },
  // The Add page sends photos through a server action, and the default limit there is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default nextConfig;

// Gives `next dev` the same D1 and R2 bindings the Worker gets. Workers AI and Vectorize only
// run on Cloudflare, so they stay off here unless BRAIN_REMOTE=1 (which needs a wrangler login).
// Without them, search by meaning, Related and Ask Brain fall back to word search.
initOpenNextCloudflareForDev({ remoteBindings: process.env.BRAIN_REMOTE === "1" });
