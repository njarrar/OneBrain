"use client";

import { useActionState, useState } from "react";
import { makeConnectorLink, removeConnectorLink } from "@/lib/actions";
import { shortDate } from "@/lib/links";

type Key = { id: string; name: string; created_at: string; last_used_at: string | null };

// Settings > Use Brain in other AIs. Each link holds its own key, so one can be removed alone.
export function ConnectorSettings({ keys }: { keys: Key[] }) {
  const [state, action, pending] = useActionState(makeConnectorLink, {});
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel">
      <h2>Use Brain in other AIs</h2>
      <p className="muted small">
        Make a link, then add it as a connector in Claude, ChatGPT or any AI app that takes MCP connectors.
        That AI can then search your saves, read them and ask Brain. It can&apos;t change or delete anything.
      </p>
      <form action={action} className="inline-form">
        <input name="name" placeholder="Which AI, for example Claude" maxLength={40} aria-label="Which AI" />
        <button className="btn" disabled={pending}>{pending ? "Making…" : "Make a link"}</button>
      </form>
      {state.error && <p className="error">{state.error}</p>}
      {state.url && (
        <div className="connector-link">
          <p className="small"><b>Copy this link now.</b> Brain won&apos;t show it again. Anyone with it can read your saves.</p>
          <code dir="ltr">{state.url}</code>
          <button
            className="btn quiet small"
            onClick={() => navigator.clipboard.writeText(state.url!).then(() => setCopied(true))}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <ol className="small muted">
            <li>In Claude: Settings, Connectors, Add custom connector. Paste the link as the URL.</li>
            <li>In ChatGPT: Settings, Apps and Connectors, Create. Paste the link and pick No authentication.</li>
          </ol>
        </div>
      )}
      {keys.length > 0 && (
        <ul className="connector-keys">
          {keys.map((k) => (
            <li key={k.id}>
              <span dir="auto">{k.name.replace(/^AI connector · /, "")}</span>
              <span className="muted small">made {shortDate(k.created_at)}{k.last_used_at ? `, last used ${shortDate(k.last_used_at)}` : ", not used yet"}</span>
              <form action={removeConnectorLink.bind(null, k.id)}>
                <button className="btn quiet small danger">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
