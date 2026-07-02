import { setLook } from "@/lib/actions";
import type { Design, Mode } from "@/lib/theme";

const DESIGNS: { value: Design; label: string; swatch: string[] }[] = [
  { value: "vault", label: "X-Vault", swatch: ["#0b0f17", "#151d2b", "#f59e0b"] },
  { value: "sunroom", label: "Sunroom", swatch: ["#fbf8f1", "#f0e9dc", "oklch(0.72 0.13 65)"] },
];
const MODES: { value: Mode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Design and mode pickers. Plain forms, so they work before any script loads.
export function LookPicker({ design, mode }: { design: Design; mode: Mode }) {
  return (
    <section className="source-row look" aria-label="Appearance">
      <div className="look-row">
        <span className="source-name">Design</span>
        <form action={setLook}>
          {DESIGNS.map((d) => (
            <button key={d.value} name="design" value={d.value} className={design === d.value ? "seg on" : "seg"} aria-pressed={design === d.value}>
              <span className="swatch" aria-hidden="true">
                {d.swatch.map((c) => <i key={c} style={{ background: c }} />)}
              </span>
              {d.label}
            </button>
          ))}
        </form>
      </div>
      <div className="look-row">
        <span className="source-name">Mode</span>
        <form action={setLook}>
          {MODES.map((m) => (
            <button key={m.value} name="mode" value={m.value} className={mode === m.value ? "seg on" : "seg"} aria-pressed={mode === m.value}>
              {m.label}
            </button>
          ))}
        </form>
      </div>
      <p className="muted small">System follows your device. The iPhone app uses the same choices.</p>
    </section>
  );
}
