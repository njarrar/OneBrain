import { LookPicker } from "@/components/LookPicker";
import { AiSettings, type AiRow } from "@/components/AiSettings";
import { PROVIDERS, PROVIDER_INFO, aiSettings } from "@/lib/ai";
import { keyStatus } from "@/lib/secrets";
import { getPrefs } from "@/lib/theme";

export default async function SettingsPage() {
  const [look, ai, keys] = await Promise.all([getPrefs(), aiSettings(), Promise.all(PROVIDERS.map((p) => keyStatus(p)))]);
  const rows: AiRow[] = PROVIDERS.map((id, i) => ({
    id,
    name: PROVIDER_INFO[id].name,
    keyHint: PROVIDER_INFO[id].keyHint,
    keyUrl: PROVIDER_INFO[id].keyUrl,
    model: ai.models[id],
    defaultModel: PROVIDER_INFO[id].model,
    ...keys[i],
  }));
  return (
    <div className="narrow">
      <header className="page-head"><h1>Settings</h1></header>
      <LookPicker {...look} />
      <AiSettings provider={ai.provider} rows={rows} />
    </div>
  );
}
