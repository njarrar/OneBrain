import { all, run } from "@/lib/db";

// How the site and the phone look. Kept in the settings table so both share it:
//   design  "vault" (the default) or "sunroom"   settings key "design"
//   mode    "system" (the default), "light" or "dark"   settings key "theme"
export const DESIGNS = ["vault", "sunroom"] as const;
export const MODES = ["system", "light", "dark"] as const;
export type Design = (typeof DESIGNS)[number];
export type Mode = (typeof MODES)[number];
export type Prefs = { design: Design; mode: Mode };

export const DEFAULT_PREFS: Prefs = { design: "vault", mode: "system" };

export const isDesign = (v: unknown): v is Design => typeof v === "string" && (DESIGNS as readonly string[]).includes(v);
export const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v);

export async function getPrefs(): Promise<Prefs> {
  try {
    const rows = await all<{ key: string; value: string }>(`select key, value from settings where key in ('design', 'theme')`);
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const design = get("design");
    const mode = get("theme");
    return { design: isDesign(design) ? design : DEFAULT_PREFS.design, mode: isMode(mode) ? mode : DEFAULT_PREFS.mode };
  } catch {
    // No database (for example while the site is being built): use the defaults.
    return DEFAULT_PREFS;
  }
}

async function put(key: string, value: string) {
  await run(
    `insert into settings (key, value) values (?, ?)
     on conflict (key) do update set value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    key,
    value,
  );
}

export async function savePrefs(prefs: Partial<Prefs>) {
  if (prefs.design) await put("design", prefs.design);
  if (prefs.mode) await put("theme", prefs.mode);
}

// The status bar colour for each design and mode.
export const BAR: Record<Design, { light: string; dark: string }> = {
  vault: { light: "#f7f6f2", dark: "#0b0f17" },
  sunroom: { light: "#fbf8f1", dark: "#1a1712" },
};
