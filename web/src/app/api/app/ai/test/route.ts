import { z } from "zod";
import { appRoute } from "@/lib/http";
import { PROVIDERS, testProvider } from "@/lib/ai";

// One tiny call to the given AI, so you know its key and model work. { ok, message }
export const POST = appRoute(z.strictObject({ provider: z.enum(PROVIDERS) }), async ({ provider }) => testProvider(provider));
