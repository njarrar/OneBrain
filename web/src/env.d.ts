// Optional secrets that wrangler types can't see because they are unset locally.
interface CloudflareEnv {
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_CLIENT_SECRET?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_ID?: string;
}
