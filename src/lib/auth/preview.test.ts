import assert from "node:assert/strict";
import test from "node:test";
import { previewClientSecret } from "./preview.ts";

test("previewClientSecret fails when the server env var is missing", () => {
  assert.throws(() => previewClientSecret({}), /GROK_PREVIEW_CLIENT_SECRET/);
});

test("previewClientSecret rejects a blank server env var", () => {
  assert.throws(
    () => previewClientSecret({ GROK_PREVIEW_CLIENT_SECRET: "   " }),
    /GROK_PREVIEW_CLIENT_SECRET/,
  );
});

test("previewClientSecret returns the server env value and ignores a VITE_ copy", () => {
  assert.equal(
    previewClientSecret({
      GROK_PREVIEW_CLIENT_SECRET: "ci-dummy-preview-secret",
      VITE_GROK_PREVIEW_CLIENT_SECRET: "browser-leak",
    }),
    "ci-dummy-preview-secret",
  );
});
