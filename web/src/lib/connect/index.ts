import { env } from "@/lib/db";
import { gmail } from "@/lib/connect/gmail";
import { outlook } from "@/lib/connect/outlook";
import { pinterest } from "@/lib/connect/pinterest";
import type { Connector, ConnectorId } from "@/lib/connect/types";

export type { Connector, ConnectorId } from "@/lib/connect/types";

export const CONNECTORS: Record<ConnectorId, Connector> = { gmail, outlook, pinterest };

export const connectorFor = (id: string): Connector | null => (id in CONNECTORS ? CONNECTORS[id as ConnectorId] : null);

// Where each source sends you back after its sign-in. This exact link goes in the source's app settings.
export async function redirectUri(id: ConnectorId) {
  return `${(await env()).BETTER_AUTH_URL ?? "http://localhost:3000"}/api/connect/${id}/callback`;
}

// For Sources: whether each one has its app keys and is connected.
export async function connectorStatus() {
  const e = await env();
  const rows = await Promise.all(
    Object.values(CONNECTORS).map(async (c) => [c.id, { keys: c.keysSet(e), connected: await c.connected(), redirect: await redirectUri(c.id) }] as const),
  );
  return Object.fromEntries(rows) as Record<ConnectorId, { keys: boolean; connected: boolean; redirect: string }>;
}
