import { z } from "zod";
import { appRoute } from "@/lib/http";
import { DESIGNS, MODES, getPrefs, savePrefs } from "@/lib/theme";

// How the app looks, shared by the web and the phone:
//   { "design": "vault" | "sunroom", "mode": "system" | "light" | "dark" }
// PUT takes either field or both and returns the full, saved preferences.
export const GET = appRoute(async () => getPrefs());

const PrefsChange = z
  .object({ design: z.enum(DESIGNS).optional(), mode: z.enum(MODES).optional() })
  .refine((p) => p.design !== undefined || p.mode !== undefined, { message: "Send design and/or mode" });

export const PUT = appRoute(PrefsChange, async (next) => {
  await savePrefs(next);
  return getPrefs();
});
