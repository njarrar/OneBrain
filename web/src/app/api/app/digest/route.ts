import { appRoute, errorMessage } from "@/lib/http";
import { listDigests, makeDigest, weekStart } from "@/lib/memory/digest";

// The latest weekly digests, newest first. Reading never asks Claude for a new one.
export const GET = appRoute(async (req) => {
  const limit = Math.floor(Number(new URL(req.url).searchParams.get("limit"))) || 4;
  return { digests: await listDigests(limit) };
});

// Writes this week's digest now (the app's "Write it now" button). Returns why not when it can't.
export const POST = appRoute(async () => {
  const result = await makeDigest(weekStart()).catch((err) => ({ made: false, reason: `Claude couldn't write it: ${errorMessage(err)}` }));
  return { ...result, digests: await listDigests(4) };
});
