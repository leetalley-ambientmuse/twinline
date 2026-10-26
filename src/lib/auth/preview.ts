/**
 * Shared LIVE-PREVIEW OAuth client (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker instead exposes ONE
 * shared "preview" client that accepts any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`
 * (broker: `app-builder-deployer/auth/src/preview-oauth.ts`). Baking it here lets
 * the live preview do REAL sign-in — no demo/mock users — with no platform
 * injection. When deployed the deployer injects a per-app
 * `GROK_AUTH_*` that overrides these (see `server.ts`).
 *
 * The client id is public and matches the broker's `GROK_PREVIEW_CLIENT_ID`.
 * The client secret is `GROK_PREVIEW_CLIENT_SECRET` in the server environment.
 * It must match the broker value whose `base64url(SHA-256)` hash the broker
 * stores. Never prefix it with `VITE_`. A `VITE_` variable is bundled into
 * the browser. A deployed app sets `GROK_AUTH_CLIENT_SECRET` instead, and that
 * value wins.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";

/**
 * The live-preview OAuth client secret. Server-only.
 * Throws when the env var is missing or blank, so a preview sign-in cannot
 * start with an empty secret.
 */
export function previewClientSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env.GROK_PREVIEW_CLIENT_SECRET?.trim();
  if (!value) {
    throw new Error(
      "GROK_PREVIEW_CLIENT_SECRET is unset. The live-preview OAuth client needs this server environment variable.",
    );
  }
  return value;
}

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
