import { appRoute } from "@/lib/http";
import { BUILD } from "@/lib/version";

// Which web build is live, so the iPhone's Settings can show it next to its own version.
export const GET = appRoute(async () => BUILD);
