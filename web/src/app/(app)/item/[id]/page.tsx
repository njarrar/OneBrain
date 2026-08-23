import { notFound } from "next/navigation";
import { ItemView } from "@/components/ItemView";
import { first } from "@/lib/db";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await first(`select 1 from items where id = ?`, id))) notFound();
  return <ItemView id={id} />;
}
