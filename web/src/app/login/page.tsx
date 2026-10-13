import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { enabledProviders, getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Only pages inside this app can be the place to go back to after signing in.
const RETURNS = new Set(["/", "/connect-app"]);

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: asked } = await searchParams;
  const next = asked && (RETURNS.has(asked) || /^\/connect-app\?device=[\w%.-]{1,200}$/.test(asked)) ? asked : "/";
  if (await (await getAuth()).api.getSession({ headers: await headers() })) redirect(next);
  const providers = await enabledProviders();
  return (
    <div className="login">
      <h1>Brain</h1>
      <LoginForm {...providers} next={next} />
    </div>
  );
}
