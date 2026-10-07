import { appRoute } from "@/lib/http";
import { Question } from "@/lib/items/schema";
import { ask } from "@/lib/memory/ask";

// Ask a question of your own saves. Returns the AI's answer (null without an AI key) and the
// items it used, cited in the answer as [1], [2] …
export const POST = appRoute(Question, async ({ q }) => ask(q));
