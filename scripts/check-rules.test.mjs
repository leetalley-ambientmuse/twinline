import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkConsoleLog,
  checkNodeVersion,
  checkRepository,
  checkRoutes,
  checkTestWiring,
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

test("soft findings are the known newline, server-suffix, prettier, and eslint misses", () => {
  const soft = checkRepository(root).filter((item) => item.severity === "soft");
  const paths = (id) => soft.filter((item) => item.id === id).map((item) => item.path).sort();
  assert.deepEqual(paths("S-01"), ["src/components/DeckPanel.tsx"]);
  assert.deepEqual(paths("S-02"), []);
  assert.deepEqual(paths("S-03"), []);
  assert.deepEqual(paths("S-04"), [
    "src/lib/auth/preview.ts",
    "src/lib/auth/server.ts",
    "src/lib/db.ts",
    "src/lib/prompt/compose.ts",
  ]);
  assert.ok(paths("S-05").length > 0, "prettier --check warns");
  assert.ok(paths("S-06").includes("src/lib/app-data/client.server.ts"));
  assert.ok(paths("S-06").includes("src/components/rack-context.tsx"));
  assert.ok(paths("S-06").includes("src/lib/audio/engine.ts"));
});

test("engines.node must match the Actions Node major", () => {
  const dir = mkdtempSync(join(tmpdir(), "rules-node-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  const findings = checkNodeVersion(dir, [
    { rel: ".github/workflows/ci.yml", text: "uses: actions/setup-node@v4\n          node-version: 22\n" },
  ]);
  assert.ok(findings.some((item) => item.message.includes("does not match")));
});

test("a test file outside npm test is a hard finding", () => {
  const findings = checkTestWiring(root, [
    {
      rel: "src/lib/orphan.test.ts",
      text: 'import { test } from "node:test";\nimport assert from "node:assert/strict";\n',
    },
  ]);
  assert.ok(findings.some((item) => item.path === "src/lib/orphan.test.ts"));
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
