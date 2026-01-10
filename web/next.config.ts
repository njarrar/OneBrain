import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// Gives `next dev` the same D1 and R2 bindings the Worker gets.
initOpenNextCloudflareForDev();
