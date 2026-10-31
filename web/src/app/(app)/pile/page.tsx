import { PileDeck } from "@/components/PileDeck";
import { pileCard, pileNext } from "@/lib/memory/pile";

export const metadata = { title: "Clear the pile · Brain" };

// Every inbox save, oldest first, one at a time, until none are left. The phones show the same pile.
export default async function PilePage() {
  const { items, left } = await pileNext(30);
  return (
    <div className="narrow pile-page">
      <header className="page-head">
        <h1>Clear the pile</h1>
        <span className="muted">Oldest first. D keeps it, X lets it go, S snoozes it for two weeks, U takes the last call back.</span>
      </header>
      <PileDeck initial={items.map(pileCard)} left={left} />
    </div>
  );
}
