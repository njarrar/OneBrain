"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="add-form">
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={pending}>Sign in</button>
    </form>
  );
}
