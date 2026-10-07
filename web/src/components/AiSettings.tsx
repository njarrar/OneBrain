"use client";

import { useActionState, useState, useTransition } from "react";
import { removeAiKey, saveAiKey, setAiModel, setAiProvider, testAi } from "@/lib/actions";
import type { Provider } from "@/lib/ai";

export type AiRow = {
  id: Provider;
  name: string;
  keyHint: string;
  keyUrl: string;
  model: string;
  defaultModel: string;
  last4: string | null;
  fromEnv: boolean;
};

// Pick which AI does Brain's work, and keep a key for each. The phone shows the same choice.
export function AiSettings({ provider, rows }: { provider: Provider; rows: AiRow[] }) {
  return (
    <section className="source-row" aria-label="AI">
      <div className="source-main">
        <span className="source-name">AI</span>
        <span className={`pill ${rows.find((r) => r.id === provider)?.last4 || rows.find((r) => r.id === provider)?.fromEnv ? "ok" : "off"}`}>
          {rows.find((r) => r.id === provider)?.name}
        </span>
      </div>
      <p className="small muted">
        The AI that sorts your saves, reads voice memos and pictures for names and dates, answers Ask Brain and writes the
        weekly digest. Keys are stored encrypted and shown back only by their last four characters. Search by meaning and
        writing out voice memos stay on Cloudflare, so switching costs nothing.
      </p>
      <form action={setAiProvider} className="seg-group">
        {rows.map((r) => (
          <button key={r.id} name="provider" value={r.id} className={provider === r.id ? "seg on" : "seg"} aria-pressed={provider === r.id}>
            {r.name}
          </button>
        ))}
      </form>
      {rows.map((r) => <ProviderKey key={r.id} row={r} active={r.id === provider} />)}
    </section>
  );
}

function ProviderKey({ row, active }: { row: AiRow; active: boolean }) {
  const [message, action, pending] = useActionState(saveAiKey.bind(null, row.id), null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, startTest] = useTransition();
  const has = !!row.last4 || row.fromEnv;
  return (
    <div className={active ? "ai-key active" : "ai-key"}>
      <div className="source-main">
        <span className="source-name">{row.name}{active && <span className="muted small"> · in use</span>}</span>
        <span className={`pill ${has ? "ok" : "off"}`}>
          {row.last4 ? `Key ends in …${row.last4}` : row.fromEnv ? "Set on the server" : "No key"}
        </span>
      </div>
      <form action={action} className="inline-form">
        <input type="password" name="key" placeholder={row.keyHint} autoComplete="off" aria-label={`${row.name} API key`} required />
        <button className="btn small" disabled={pending}>{pending ? "Saving…" : row.last4 ? "Replace" : "Save"}</button>
      </form>
      <p className="small muted">
        Get a key at <a href={row.keyUrl} target="_blank" rel="noreferrer">{new URL(row.keyUrl).host}</a>.
      </p>
      <form action={setAiModel.bind(null, row.id)} className="inline-form">
        <input name="model" defaultValue={row.model} placeholder={row.defaultModel} aria-label={`${row.name} model`} spellCheck={false} />
        <button className="btn small quiet">Set model</button>
      </form>
      <div className="inline-form">
        {has && (
          <button
            type="button"
            className="btn small quiet"
            disabled={testing}
            onClick={() => startTest(async () => setTest(await testAi(row.id)))}
          >
            {testing ? "Testing…" : "Test"}
          </button>
        )}
        {row.last4 && (
          <form action={removeAiKey.bind(null, row.id)}><button className="link-btn">Remove key</button></form>
        )}
      </div>
      {message && <p className="small" role="status">{message}</p>}
      {test && <p className={test.ok ? "small" : "error small"} role="status">{test.message}</p>}
    </div>
  );
}
