import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkConsoleLog,
  checkRepository,
  checkRoutes,
  demoFindings,
  globMatch,
} from "./check-rules.mjs";
import { projectRoot as rootFromEnv } from "./with-app-env.mjs";

const root = rootFromEnv();

test("globs used by npm test and vitest match a file in that directory", () => {
  assert.equal(globMatch("scripts/**/*.test.mjs", "scripts/brand-check.test.mjs"), true);
  assert.equal(globMatch("scripts/**/*.test.mjs", "scripts/nested/brand-check.test.mjs"), true);
  assert.equal(globMatch("src/lib/audio/**/*.test.ts", "src/lib/audio/engine.test.ts"), true);
  assert.equal(globMatch("src/lib/store.test.ts", "src/lib/store.test.ts"), true);
  assert.equal(globMatch("src/lib/store.test.ts", "src/lib/store.test.tsx"), false);
});

test("the current tree passes every hard rule", () => {
  const hard = checkRepository(root).filter((item) => item.severity === "hard");
  assert.deepEqual(
    hard.map((item) => `${item.id} ${item.path}:${item.line} ${item.message}`),
    [],
  );
});

test("soft findings are the known newline miss and the vitest files CI does not run", () => {
  const soft = checkRepository(root).filter((item) => item.severity === "soft");
  const newline = soft.filter((item) => item.id === "S-01");
  const vitest = soft.filter((item) => item.id === "S-03").map((item) => item.path);
  assert.deepEqual(
    newline.map((item) => item.path),
    ["src/components/DeckPanel.tsx"],
  );
  assert.deepEqual(vitest.sort(), [
    "src/components/booth.test.tsx",
    "src/components/controls.test.tsx",
    "src/lib/audio/engine.test.ts",
    "src/lib/audio/model.test.ts",
    "src/lib/audio/samples.test.ts",
    "src/lib/brand.test.ts",
    "src/lib/midi/nifty.test.ts",
    "src/lib/prompt/arrange.test.ts",
    "src/lib/store.test.ts",
  ]);
  assert.equal(
    soft.some((item) => item.id === "S-02"),
    false,
  );
});

test("demo input trips hard and soft rules", () => {
  const findings = demoFindings();
  for (const id of ["H-01", "H-03", "H-05", "H-07", "H-12", "S-01", "S-02"]) {
    assert.ok(
      findings.some((item) => item.id === id),
      `expected ${id}`,
    );
  }
  assert.ok(findings.some((item) => item.severity === "hard"));
  assert.ok(findings.some((item) => item.severity === "soft"));
});

test("console.log in src is a hard finding", () => {
  const findings = checkConsoleLog([
    { rel: "src/lib/example.ts", text: "console.log(1)\n" },
    { rel: "scripts/cli.mjs", text: "console.log(1)\n" },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, "src/lib/example.ts");
});

test("a temporary auth popup route is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "rules-popup-"));
  mkdirSync(join(dir, "src/routes/auth"), { recursive: true });
  writeFileSync(join(dir, "src/routes/auth/popup.tsx"), "export const Route = () => null;\n");
  const findings = checkRoutes(dir, []);
  assert.ok(findings.some((item) => item.path === "src/routes/auth/popup.tsx"));
});
