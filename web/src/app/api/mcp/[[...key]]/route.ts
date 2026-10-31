import { keyOk } from "@/lib/apptoken";
import { handleRpc } from "@/lib/mcp";

// The connector link for other AIs: https://<this site>/api/mcp/<key>. The key can also come as
// "Authorization: Bearer <key>". Make or remove keys in Settings.

type Ctx = { params: Promise<{ key?: string[] }> };

async function allowed(req: Request, ctx: Ctx) {
  const key = (await ctx.params).key?.[0] ?? req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/)?.[1];
  return key ? keyOk(key, "connector") : false;
}

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "POST, OPTIONS" };

export async function POST(req: Request, ctx: Ctx) {
  if (!(await allowed(req, ctx))) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "This connector link is wrong or was removed." } }, { status: 401, headers: cors });
  const body = await req.json().catch(() => undefined);
  const out = await handleRpc(body);
  if (!out) return new Response(null, { status: 202, headers: cors });
  return Response.json(out, { headers: cors });
}

// No server-sent stream: everything is answered in the POST.
export async function GET() {
  return new Response("Brain's connector answers POST only.", { status: 405, headers: { ...cors, allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { ...cors, allow: "POST" } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
