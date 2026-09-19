// Which build is running: the version from package.json, the short git commit and when it was
// built. next.config.ts stamps these in at build time.
export const BUILD = {
  version: process.env.BRAIN_VERSION ?? "0.0.0",
  commit: process.env.BRAIN_COMMIT ?? "dev",
  builtAt: process.env.BRAIN_BUILT_AT ?? null,
};
