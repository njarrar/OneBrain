import { Suspense } from "react";
import { SideMenu } from "@/components/SideMenu";
import { menuCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const counts = await menuCounts();
  return (
    <div className="shell">
      <Suspense>
        <SideMenu {...counts} />
      </Suspense>
      <main className="main">{children}</main>
    </div>
  );
}
