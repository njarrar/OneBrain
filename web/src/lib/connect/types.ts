// A source you connect with its own sign-in: Gmail, Outlook or Pinterest. The connect and
// callback routes, the Sources page and the timer all go through this shape.

export type ConnectorId = "gmail" | "outlook" | "pinterest";

export type SyncResult = {
  added: number;
  // True while older saves are still waiting to come in.
  more: boolean;
};

export type Connector = {
  id: ConnectorId;
  name: string;
  // Whether the Worker has this source's app keys.
  keysSet(e: CloudflareEnv): boolean;
  authUrl(e: CloudflareEnv, p: { state: string; redirectUri: string; challenge: string }): string;
  finish(code: string, p: { redirectUri: string; verifier: string }): Promise<void>;
  connected(): Promise<boolean>;
  // Brings in new saves, then a slice of older ones.
  sync(): Promise<SyncResult>;
  // Saves already brought in stay.
  disconnect(): Promise<void>;
};
