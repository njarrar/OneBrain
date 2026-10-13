import { AskBox } from "@/components/AskBox";
import { aiName, aiReady } from "@/lib/ai";

export const metadata = { title: "Ask Brain · Brain" };

// Ask a question of everything you've saved: notes, voice memos, screenshots, bookmarks,
// emails and pins. ?q= asks at once (the palette and the menu button link here).
export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, ready, ai] = await Promise.all([searchParams, aiReady(), aiName()]);
  return (
    <div className="narrow ask-page">
      <header className="page-head"><h1>✦ Ask Brain</h1></header>
      <p className="small muted">
        {ready
          ? `${ai} answers from your own saves and links them up: a name in a voice memo, a screenshot, a bookmark, an email.`
          : "Add an AI key in Settings to get written answers. Until then Brain shows the saves closest to your question."}
      </p>
      <AskBox initial={q?.slice(0, 500) ?? ""} />
    </div>
  );
}
