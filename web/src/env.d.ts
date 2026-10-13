// Optional secrets that wrangler types can't see because they are unset locally.
interface CloudflareEnv {
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_CLIENT_SECRET?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  // Outlook (Microsoft Graph) and Pinterest sign-in.
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  PINTEREST_APP_ID?: string;
  PINTEREST_APP_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_ID?: string;
  // Meaning search, Related and Ask. Missing in local runs and on deploys made before they were added.
  AI?: Ai;
  VECTORS?: Vectorize;
}
