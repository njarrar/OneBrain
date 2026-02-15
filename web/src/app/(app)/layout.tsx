import { Suspense } from "react";
import { SideMenu } from "@/components/SideMenu";
import { menuCounts } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = await menuCounts();
  return (
    <div className="shell">
      <Suspense>
        <SideMenu {...counts} userName={user.displayUsername || user.name || user.email} />
      </Suspense>
      <main className="main">{children}</main>
    </div>
  );
}
