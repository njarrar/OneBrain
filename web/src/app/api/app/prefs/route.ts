import { allowed, denied } from "@/lib/apptoken";
import { getPrefs, isDesign, isMode, savePrefs, type Prefs } from "@/lib/theme";

// How the app looks, shared by the web and the phone:
//   { "design": "vault" | "sunroom", "mode": "system" | "light" | "dark" }
// PUT takes either field or both and returns the full, saved preferences.
export async function GET(req: Request) {
  if (!(await allowed(req))) return denied();
  return Response.json(await getPrefs());
}

export async function PUT(req: Request) {
  if (!(await allowed(req))) return denied();
  const body = (await req.json().catch(() => null)) as { design?: unknown; mode?: unknown } | null;
  if (!body || (body.design === undefined && body.mode === undefined)) {
    return Response.json({ error: "Send design and/or mode" }, { status: 400 });
  }
  const next: Partial<Prefs> = {};
  if (body.design !== undefined) {
    if (!isDesign(body.design)) return Response.json({ error: "design must be vault or sunroom" }, { status: 400 });
    next.design = body.design;
  }
  if (body.mode !== undefined) {
    if (!isMode(body.mode)) return Response.json({ error: "mode must be system, light or dark" }, { status: 400 });
    next.mode = body.mode;
  }
  await savePrefs(next);
  return Response.json(await getPrefs());
}
