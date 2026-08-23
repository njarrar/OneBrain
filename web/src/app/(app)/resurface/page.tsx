import { ResurfaceDeck, type Card } from "@/components/ResurfaceDeck";
import { resurfaceToday } from "@/lib/memory/reminders";
import { pictures } from "@/components/ItemCard";

export const metadata = { title: "Resurface · Brain" };

// A few saved things a day, brought back so they aren't forgotten: due reminders first, then
// things from this day in past years. The iPhone app shows the same cards.
export default async function ResurfacePage() {
  const cards: Card[] = (await resurfaceToday()).map((c) => ({
    id: c.id,
    reason: c.reason,
    title: c.title,
    body: c.body,
    summary: c.summary,
    note: c.note,
    url: c.url,
    author: c.author ?? c.author_handle,
    category: c.category,
    color: c.category_color,
    date: c.sort_at,
    picture: pictures(c)[0] ?? null,
    rtl: c.lang === "ar",
    sensitive: !!c.sensitive,
  }));
  return (
    <div className="narrow resurface-page">
      <header className="page-head">
        <h1>Resurface</h1>
        <span className="muted">A few things from your memory, every day. Keys 1, 2 and 3 answer.</span>
      </header>
      <ResurfaceDeck cards={cards} />
    </div>
  );
}
