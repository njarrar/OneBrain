// The Worker entry: the Next.js app, plus a timer that runs /api/cron every hour.
// Built by `opennextjs-cloudflare build` into .open-next/worker.js first.
// @ts-expect-error: made at build time
import { default as app } from "./.open-next/worker.js";

const worker = {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: { BETTER_AUTH_SECRET?: string }, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const req = new Request("https://brain.internal/api/cron", {
      method: "POST",
      headers: { "x-cron-key": env.BETTER_AUTH_SECRET ?? "" },
    });
    ctx.waitUntil(app.fetch(req, env, ctx));
  },
};

export default worker;

// @ts-expect-error: made at build time
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
