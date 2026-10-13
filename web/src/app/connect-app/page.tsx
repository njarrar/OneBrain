import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createAppToken } from "@/lib/apptoken";

export const dynamic = "force-dynamic";

// The iPhone and Android apps open this page to sign in. Pressing the button makes a key for the
// app and hands it back through the brain:// link, which only the app can open.
async function connect(form: FormData) {
  "use server";
  await requireUser();
  const device = String(form.get("device") ?? "iPhone").slice(0, 60) || "iPhone";
  const token = await createAppToken(device);
  redirect(`brain://paired?token=${token}`);
}

export default async function ConnectAppPage({ searchParams }: { searchParams: Promise<{ device?: string }> }) {
  const user = await requireUser();
  const { device } = await searchParams;
  return (
    <div className="login">
      <h1>Connect the app</h1>
      <p className="muted">Signed in as {user.email}. Connect Brain on {device || "your phone"} to this account?</p>
      <form action={connect}>
        <input type="hidden" name="device" value={device ?? "iPhone"} />
        <button className="btn" style={{ width: "100%" }}>Connect</button>
      </form>
    </div>
  );
}
