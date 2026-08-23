import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { z } from "zod";
import { authorized } from "@/lib/apptoken";

// Small helpers every app route uses, so each route file holds only its own logic.

export const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
export const notFound = () => jsonError("Not found", 404);
export const denied = () => jsonError("Sign in again", 401);

// A mistake in what was sent (a bad link, nothing to save). Routes answer it with a 400 and its message.
export class InputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };

export function issues(err: z.ZodError) {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

// A route for the iPhone app or a signed-in browser. Checks access, reads and checks the JSON
// body when a schema is given, and turns thrown errors into JSON. A handler that returns null
// answers 404; anything else that is not a Response is sent as JSON.
export function appRoute<P = Record<string, never>>(
  handler: (req: Request, params: P) => Promise<Response | unknown>,
): (req: Request, ctx: Ctx<P>) => Promise<Response>;
export function appRoute<S extends z.ZodType, P = Record<string, never>>(
  schema: S,
  handler: (body: z.infer<S>, params: P, req: Request) => Promise<Response | unknown>,
): (req: Request, ctx: Ctx<P>) => Promise<Response>;
export function appRoute(a: unknown, b?: unknown) {
  const schema = typeof a === "function" ? null : (a as z.ZodType);
  const handler = (schema ? b : a) as (...args: unknown[]) => Promise<unknown>;
  return async (req: Request, ctx: Ctx<unknown>) => {
    if (!(await authorized(req))) return denied();
    const params = (await ctx?.params) ?? {};
    try {
      let out: unknown;
      if (schema) {
        const json = await req.json().catch(() => InputError);
        if (json === InputError) return jsonError("Send a JSON body.");
        const parsed = schema.safeParse(json);
        if (!parsed.success) return jsonError(issues(parsed.error));
        out = await handler(parsed.data, params, req);
      } else {
        out = await handler(req, params);
      }
      if (out instanceof Response) return out;
      return out === null || out === undefined ? notFound() : Response.json(out);
    } catch (err) {
      if (err instanceof InputError) return jsonError(err.message, err.status);
      console.error(err);
      return jsonError("Something went wrong on the server.", 500);
    }
  };
}

// Runs work after the response is sent (Claude sorting, meaning vectors). Errors are logged, not thrown.
export function runLater(work: Promise<unknown>, label = "background task") {
  getCloudflareContext().ctx.waitUntil(work.catch((err) => console.error(`${label} failed`, err)));
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
