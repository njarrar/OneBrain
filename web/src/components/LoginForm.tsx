"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

export function LoginForm({ google, apple }: { google: boolean; apple: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    setError(null);
    setPending(true);
    const login = String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const result =
      mode === "signin"
        ? login.includes("@")
          ? await authClient.signIn.email({ email: login, password })
          : await authClient.signIn.username({ username: login, password })
        : await authClient.signUp.email({
            email: String(form.get("email") ?? "").trim(),
            password,
            name: String(form.get("name") ?? "").trim() || login,
            username: login,
          });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "That didn't work. Try again.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function social(provider: "google" | "apple") {
    setError(null);
    const result = await authClient.signIn.social({ provider, callbackURL: "/" });
    if (result.error) setError(result.error.message ?? "That didn't work. Try again.");
  }

  return (
    <div className="login-box">
      <div className="viewing" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "seg on" : "seg"} onClick={() => { setMode("signin"); setError(null); }}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "seg on" : "seg"} onClick={() => { setMode("signup"); setError(null); }}>
          Create account
        </button>
      </div>

      {(google || apple) && (
        <div className="social">
          {apple && <button type="button" className="btn social-btn apple" onClick={() => social("apple")}>Continue with Apple</button>}
          {google && <button type="button" className="btn social-btn quiet" onClick={() => social("google")}>Continue with Google</button>}
          <p className="or muted small">or</p>
        </div>
      )}

      <form action={submit} className="add-form" key={mode}>
        {mode === "signup" && (
          <>
            <label htmlFor="name">Your name</label>
            <input id="name" name="name" autoComplete="name" dir="auto" />
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </>
        )}
        <label htmlFor="login">{mode === "signin" ? "Username or email" : "Username"}</label>
        <input
          id="login"
          name="login"
          required
          autoComplete="username"
          autoCapitalize="none"
          pattern={mode === "signup" ? "[A-Za-z0-9_.]{3,30}" : undefined}
          title={mode === "signup" ? "3 to 30 letters, numbers, dots or underscores" : undefined}
        />
        <label htmlFor="password">Password {mode === "signup" && <span className="muted">(at least 10 characters)</span>}</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 10 : undefined}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={pending}>
          {pending ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
