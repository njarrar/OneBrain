import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { enabledProviders, getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await (await getAuth()).api.getSession({ headers: await headers() })) redirect("/");
  const providers = await enabledProviders();
  return (
    <div className="login">
      <h1>Brain</h1>
      <LoginForm {...providers} />
    </div>
  );
}
