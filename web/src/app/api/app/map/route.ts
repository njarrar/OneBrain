import { appRoute } from "@/lib/http";
import { topicMap } from "@/lib/memory/map";

// The topic map, for the app: circles (x, y, r on a 1000 by 1000 square) and the lines between them.
export const GET = appRoute(async () => topicMap());
