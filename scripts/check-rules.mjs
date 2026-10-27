#!/usr/bin/env node
/**
 * Check the conventions in AGENTS.md.
 *
 * Hard findings exit 1. Soft findings print as warnings (and, on GitHub
 * Actions, as ::warning annotations plus a job summary) and do not fail.
 *
 *   node scripts/check-rules.mjs
 *   node scripts/check-rules.mjs --demo
 */
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { extname, join, relative } from "node:path";
import { isMainModule, projectRoot } from "./with-app-env.mjs";

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  "public",
  ".output",
  ".vercel",
  ".nitro",
  "screenshots",
  "artifacts",
  ".tanstack",
  ".grok",
]);

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".cjs",
  ".css",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".html",
  ".sql",
  ".sh",
  ".svg",
]);

/** Generated router file. TanStack writes single quotes, `any`, and disables. */
const GENERATED = "src/routeTree.gen.ts";

const BARE_BUILTINS = new Set(
  builtinModules.filter((name) => !name.startsWith("node:") && !name.startsWith("_")),
);

const SERVER_NODE_OK = new Set(["src/lib/auth/server.ts"]);
const SERVER_IMPORT_OK = new Set(["src/lib/auth/server.ts"]);

/**
 * @param {string} id
 * @param {string} path
 * @param {number} line
 * @param {string} message
 */
function hit(path, line, message) {
  return { path, line, message };
}

/**
 * @param {string} root
 * @returns {{ rel: string, text: string }[]}
 */
export function readTextFiles(root) {
  /** @type {{ rel: string, text: string }[]} */
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR.has(name) || name === "package-lock.json") continue;
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      const extra = name === ".gitignore" || name === ".prettierrc";
      if (!extra && !TEXT_EXT.has(extname(name))) continue;
      const rel = relative(root, abs).split("\\").join("/");
      out.push({ rel, text: readFileSync(abs, "utf8") });
    }
  };
  walk(root);
  return out;
}

/** Drop quoted spans so a rule can mention a token without flagging itself. */
function stripStrings(line) {
  return line
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function stripLineComment(line) {
  let out = "";
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += line[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "/" && line[i + 1] === "/") break;
    out += c;
  }
  return out;
}

/**
 * @param {string} text
 * @returns {{ line: number, text: string }[]}
 */
function codeLines(text) {
  /** @type {{ line: number, text: string }[]} */
  const out = [];
  let block = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (block) {
      const end = line.indexOf("*/");
      if (end === -1) continue;
      line = line.slice(end + 2);
      block = false;
    }
    while (line.includes("/*")) {
      const start = line.indexOf("/*");
      const end = line.indexOf("*/", start + 2);
      if (end === -1) {
        line = line.slice(0, start);
        block = true;
        break;
      }
      line = line.slice(0, start) + line.slice(end + 2);
    }
    out.push({ line: i + 1, text: stripStrings(stripLineComment(line)) });
  }
  return out;
}

/**
 * @param {string} text
 * @returns {{ spec: string, line: number, dynamic: boolean, single: boolean }[]}
 */
function importSpecifiers(text) {
  /** @type {{ spec: string, line: number, dynamic: boolean, single: boolean }[]} */
  const out = [];
  let block = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (block) {
      const end = line.indexOf("*/");
      if (end === -1) continue;
      line = line.slice(end + 2);
      block = false;
    }
    const start = line.indexOf("/*");
    if (start !== -1 && line.indexOf("*/", start + 2) === -1) {
      line = line.slice(0, start);
      block = true;
    }
    line = stripLineComment(line);
    const from = line.match(/\bfrom\s+(["'])([^"']+)\1/);
    if (from) {
      out.push({ spec: from[2], line: i + 1, dynamic: false, single: from[1] === "'" });
    }
    const side = line.match(/^\s*import\s+(["'])([^"']+)\1/);
    if (side) {
      out.push({ spec: side[2], line: i + 1, dynamic: false, single: side[1] === "'" });
    }
    const dyn = line.match(/\bimport\s*\(\s*(["'])([^"']+)\1/);
    if (dyn) {
      out.push({ spec: dyn[2], line: i + 1, dynamic: true, single: dyn[1] === "'" });
    }
  }
  return out;
}

function isBareBuiltin(spec) {
  if (spec.startsWith("node:") || spec.startsWith(".") || spec.startsWith("@")) return false;
  if (BARE_BUILTINS.has(spec)) return true;
  const head = spec.split("/")[0];
  return BARE_BUILTINS.has(head);
}

function moduleStem(filename) {
  let name = filename;
  if (name.endsWith(".d.mts")) name = name.slice(0, -6);
  else if (name.endsWith(".d.ts")) name = name.slice(0, -5);
  else if (name.endsWith(".test.tsx")) name = name.slice(0, -9);
  else if (name.endsWith(".test.ts")) name = name.slice(0, -8);
  else if (name.endsWith(".test.mjs")) name = name.slice(0, -9);
  else if (name.endsWith(".tsx")) name = name.slice(0, -4);
  else if (name.endsWith(".ts")) name = name.slice(0, -3);
  else if (name.endsWith(".mjs")) name = name.slice(0, -4);
  else return null;
  if (name.endsWith(".server")) name = name.slice(0, -7);
  return name;
}

function isKebab(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function isPascal(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/**
 * `**` matches zero or more path segments. Enough for the globs this repo uses.
 * @param {string} glob
 * @param {string} rel
 */
export function globMatch(glob, rel) {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp("^" + body + "$").test(rel);
}

function readJson(root, name) {
  return JSON.parse(readFileSync(join(root, name), "utf8"));
}

/** tsconfig.json allows comments. Strip them without touching quoted text. */
function readJsonc(root, name) {
  const text = readFileSync(join(root, name), "utf8");
  const stripped = text
    .split("\n")
    .map((line) => stripLineComment(line))
    .join("\n");
  return JSON.parse(stripped);
}

function scoped(files, prefix) {
  return files.filter((file) => file.rel === prefix || file.rel.startsWith(prefix));
}

/** @param {{ rel: string, text: string }[]} files */
export function checkEsm(root, files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  let pkg;
  try {
    pkg = readJson(root, "package.json");
  } catch {
    pkg = null;
  }
  if (!pkg || pkg.type !== "module") {
    findings.push(hit("package.json", 1, 'package.json "type" must be "module"'));
  }
  const requireCall = "require" + "(";
  const moduleExports = "module" + ".exports";
  for (const file of files) {
    if (!/\.(ts|tsx|mjs|js|cjs)$/.test(file.rel) || file.rel === GENERATED) continue;
    for (const { line, text } of codeLines(file.text)) {
      if (text.includes(requireCall) || text.includes(moduleExports)) {
        findings.push(hit(file.rel, line, "CommonJS require / module.exports in an ESM repo"));
      }
    }
    for (const spec of importSpecifiers(file.text)) {
      if (isBareBuiltin(spec.spec)) {
        findings.push(
          hit(file.rel, spec.line, `import Node builtin "${spec.spec}" as "node:${spec.spec}"`),
        );
      }
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkNoDefaultExport(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of scoped(files, "src/")) {
    if (file.rel === GENERATED) continue;
    for (const { line, text } of codeLines(file.text)) {
      if (/\bexport\s+default\b/.test(text)) {
        findings.push(hit(file.rel, line, "src/ uses named exports"));
      }
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkComponentStyle(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of files) {
    if (!file.rel.startsWith("src/components/") || !file.rel.endsWith(".tsx")) continue;
    if (file.rel.endsWith(".test.tsx")) continue;
    if (!file.text.includes("export function ")) {
      findings.push(hit(file.rel, 1, "component modules declare components with export function"));
    }
    const arrow = file.text.match(/export const \w+\s*=\s*(?:async\s*)?(?:\(|function\b)/);
    if (arrow) {
      const line = file.text.slice(0, arrow.index).split("\n").length;
      findings.push(hit(file.rel, line, "component modules do not use export const arrow components"));
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkFilenames(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const allow = new Set([GENERATED, "src/routes/__root.tsx"]);
  for (const file of files) {
    if (!/^(src|scripts|server)\//.test(file.rel)) continue;
    if (!/\.(ts|tsx|mjs)$/.test(file.rel)) continue;
    if (allow.has(file.rel)) continue;
    const base = file.rel.split("/").pop() ?? file.rel;
    const stem = moduleStem(base);
    if (stem === null || isKebab(stem) || isPascal(stem)) continue;
    findings.push(
      hit(file.rel, 1, `filename "${base}" is not kebab-case or PascalCase`),
    );
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkComponentImports(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of files) {
    if (!file.rel.startsWith("src/components/")) continue;
    for (const spec of importSpecifiers(file.text)) {
      if (spec.spec.startsWith(".")) {
        findings.push(
          hit(file.rel, spec.line, "src/components imports go through the @/ alias, not a relative path"),
        );
      }
    }
  }
  return findings;
}

/**
 * @param {string} root
 * @param {{ rel: string, text: string }[]} files
 */
export function checkTests(root, files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  let testScript = "";
  try {
    testScript = readJson(root, "package.json").scripts?.test ?? "";
  } catch {
    testScript = "";
  }
  const quotedGlobs = [...testScript.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  let vitestGlobs = [];
  const vitest = files.find((file) => file.rel === "vitest.config.ts");
  const include = vitest?.text.match(/include:\s*\[([\s\S]*?)\]/);
  if (include) {
    vitestGlobs = [...include[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  }
  const tests = files.filter((file) => /\.test\.(ts|tsx|mjs)$/.test(file.rel));
  for (const file of tests) {
    if (file.rel.includes("/__tests__/") || file.rel.startsWith("test/") || file.rel.startsWith("tests/")) {
      findings.push(hit(file.rel, 1, "tests sit next to the code, not in a test directory"));
    }
    const nodeTest = /from\s*["']node:test["']/.test(file.text);
    const vitestRunner = /from\s*["']vitest["']/.test(file.text);
    if (nodeTest === vitestRunner) {
      findings.push(hit(file.rel, 1, "a test file imports exactly one of node:test or vitest"));
      continue;
    }
    if (nodeTest) {
      if (!/from\s*["']node:assert\/strict["']/.test(file.text)) {
        findings.push(hit(file.rel, 1, "node:test files import node:assert/strict"));
      }
      if (file.rel.startsWith("scripts/")) {
        if (!quotedGlobs.some((glob) => globMatch(glob, file.rel))) {
          findings.push(hit(file.rel, 1, "scripts test is not matched by the npm test glob"));
        }
      } else if (!testScript.includes(file.rel)) {
        findings.push(hit(file.rel, 1, "src node:test file is not listed in the npm test script"));
      }
    } else if (!vitestGlobs.some((glob) => globMatch(glob, file.rel))) {
      findings.push(hit(file.rel, 1, "vitest file is not matched by vitest.config.ts include"));
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkConsoleLog(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const needle = "console" + ".log";
  for (const file of files) {
    if (!file.rel.startsWith("src/") && !file.rel.startsWith("server/")) continue;
    if (file.rel === GENERATED) continue;
    for (const { line, text } of codeLines(file.text)) {
      if (text.includes(needle)) {
        findings.push(hit(file.rel, line, "application code uses console.error / console.warn, not console.log"));
      }
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkNodeImports(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of scoped(files, "src/")) {
    if (file.rel.includes(".test.") || file.rel.includes(".server.") || SERVER_NODE_OK.has(file.rel)) {
      continue;
    }
    for (const spec of importSpecifiers(file.text)) {
      if (spec.spec.startsWith("node:")) {
        findings.push(
          hit(file.rel, spec.line, `node: import belongs in a .server.ts module or src/lib/auth/server.ts`),
        );
      }
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkServerImports(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of scoped(files, "src/")) {
    const allowed =
      file.rel.includes(".server.") ||
      file.rel.includes(".test.") ||
      SERVER_IMPORT_OK.has(file.rel);
    if (allowed) continue;
    for (const spec of importSpecifiers(file.text)) {
      if (!spec.dynamic && spec.spec.includes(".server")) {
        findings.push(
          hit(file.rel, spec.line, "static .server imports stay in server modules, server.ts, or tests"),
        );
      }
    }
  }
  return findings;
}

/**
 * @param {string} root
 * @param {{ rel: string, text: string }[]} files
 */
export function checkSecrets(root, files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const ignore = files.find((file) => file.rel === ".gitignore")?.text ?? "";
  for (const line of [".env", ".env.*", "!.env.example"]) {
    if (!ignore.split("\n").includes(line)) {
      findings.push(hit(".gitignore", 1, `gitignore is missing ${line}`));
    }
  }
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
  } catch {
    findings.push(hit(".gitignore", 1, "could not list tracked files to confirm .env is untracked"));
  }
  for (const rel of tracked) {
    if (/(^|\/)\.env(\.|$)/.test(rel) && rel !== ".env.example") {
      findings.push(hit(rel, 1, "env file is tracked; only .env.example is committed"));
    }
  }
  const secret = /(?:process\.env|import\.meta\.env)(?:\.|\[\s*["'])VITE_[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE)\b/;
  for (const file of files) {
    if (!/^(src|scripts|server)\//.test(file.rel)) continue;
    const lines = file.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (secret.test(lines[i])) {
        findings.push(hit(file.rel, i + 1, "VITE_ variables are bundled; secrets stay unprefixed"));
      }
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkRouter(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const file = files.find((item) => item.rel === "src/router.tsx");
  if (!file) {
    return [hit("src/router.tsx", 1, "src/router.tsx is missing")];
  }
  for (const needle of ["export function getRouter", "defaultErrorComponent", "previewPathRewrite("]) {
    if (!file.text.includes(needle)) {
      findings.push(hit(file.rel, 1, `router must include ${needle}`));
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkRootShell(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const file = files.find((item) => item.rel === "src/routes/__root.tsx");
  if (!file) return [hit("src/routes/__root.tsx", 1, "src/routes/__root.tsx is missing")];
  for (const needle of ["<PreviewHostBridge", "<AuthProvider", "createRootRoute", "export const Route"]) {
    if (!file.text.includes(needle)) {
      findings.push(hit(file.rel, 1, `root route must include ${needle}`));
    }
  }
  const lines = file.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("og:") || lines[i].includes("twitter:")) {
      findings.push(hit(file.rel, i + 1, "root route does not set og: or twitter: meta; the PWA injector owns those"));
    }
  }
  return findings;
}

/**
 * @param {string} root
 * @param {{ rel: string, text: string }[]} files
 */
export function checkRoutes(root, files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const rel of ["src/routes/auth/popup.tsx", "src/routes/auth/popup.ts"]) {
    if (existsSync(join(root, rel))) {
      findings.push(hit(rel, 1, "do not add a React page at src/routes/auth/popup; Vite serves that path"));
    }
  }
  if (!files.some((file) => file.rel === "src/routes/index.tsx")) {
    findings.push(hit("src/routes/index.tsx", 1, "src/routes/index.tsx is missing"));
  }
  for (const file of files) {
    if (!file.rel.startsWith("src/routes/") || !file.rel.endsWith(".tsx")) continue;
    if (file.rel === "src/routes/__root.tsx") continue;
    if (!file.text.includes("createFileRoute") || !file.text.includes("export const Route")) {
      findings.push(hit(file.rel, 1, "route files call createFileRoute and export Route"));
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkStyles(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const css = files.find((file) => file.rel === "src/styles.css");
  if (!css) return [hit("src/styles.css", 1, "src/styles.css is missing")];
  if (!css.text.includes('@import "tailwindcss"')) {
    findings.push(hit(css.rel, 1, 'styles start with @import "tailwindcss"'));
  }
  if (!css.text.includes("cursor: pointer") || !css.text.includes("button")) {
    findings.push(hit(css.rel, 1, 'button and [role="button"] set cursor: pointer'));
  }
  for (const file of files) {
    if (file.rel.endsWith(".module.css")) {
      findings.push(hit(file.rel, 1, "styles live in src/styles.css, not CSS modules"));
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkVite(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const file = files.find((item) => item.rel === "vite.config.ts");
  if (!file) return [hit("vite.config.ts", 1, "vite.config.ts is missing")];
  for (const needle of [
    'host: "0.0.0.0"',
    "port: 8080",
    'host: "127.0.0.1"',
    "port: 8081",
    "strictPort: true",
    "grokPwaPlugin(",
    'serverDir: "./server"',
  ]) {
    if (!file.text.includes(needle)) {
      findings.push(hit(file.rel, 1, `vite config must include ${needle}`));
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkStartup(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const file = files.find((item) => item.rel === "startup.sh");
  if (!file) return [hit("startup.sh", 1, "startup.sh is missing")];
  if (!file.text.includes("http://127.0.0.1:8080/") || !file.text.includes("npm run dev")) {
    findings.push(hit(file.rel, 1, "startup.sh probes http://127.0.0.1:8080/ and starts npm run dev"));
  }
  if (/\bnpx\s+vite\b/.test(file.text) || /\bvite\s+(dev|build|preview)\b/.test(file.text)) {
    findings.push(hit(file.rel, 1, "startup.sh must not invoke vite directly"));
  }
  return findings;
}

/** @param {string} root */
export function checkNpmScripts(root) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  let scripts = {};
  try {
    scripts = readJson(root, "package.json").scripts ?? {};
  } catch {
    return [hit("package.json", 1, "package.json is missing")];
  }
  for (const name of ["dev", "build", "build:dev", "preview"]) {
    const value = scripts[name] ?? "";
    if (!value.startsWith("node scripts/with-app-env.mjs ")) {
      findings.push(hit("package.json", 1, `npm run ${name} must start with node scripts/with-app-env.mjs`));
    }
  }
  return findings;
}

/** @param {string} root */
export function checkTsconfig(root) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  let cfg;
  try {
    cfg = readJsonc(root, "tsconfig.json");
  } catch {
    return [hit("tsconfig.json", 1, "tsconfig.json is missing")];
  }
  const options = cfg.compilerOptions ?? {};
  if (options.strict !== true) findings.push(hit("tsconfig.json", 1, "compilerOptions.strict is true"));
  if (options.jsx !== "react-jsx") findings.push(hit("tsconfig.json", 1, 'compilerOptions.jsx is "react-jsx"'));
  const alias = options.paths?.["@/*"];
  if (!Array.isArray(alias) || !alias.includes("./src/*")) {
    findings.push(hit("tsconfig.json", 1, 'paths["@/*"] includes "./src/*"'));
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkMigrations(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const sql = files.filter((file) => file.rel.startsWith("migrations/") && file.rel.endsWith(".sql"));
  if (sql.length === 0) {
    findings.push(hit("migrations", 1, "expected at least the auth migration"));
  }
  for (const file of sql) {
    const base = file.rel.split("/").pop() ?? "";
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(base)) {
      findings.push(hit(file.rel, 1, "migration filenames are NNNN_snake.sql"));
    }
  }
  return findings;
}

/** @param {string} root */
export function checkPlatform(root) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const paths = [
    ["public/__grok", "public/__grok platform chrome"],
    ["server/middleware/grok-pwa.ts", "Nitro PWA middleware"],
    ["scripts/grok-pwa-plugin.mjs", "grokPwaPlugin"],
    ["scripts/grok-pwa-shared.mjs", "shared PWA helper"],
  ];
  for (const [rel, label] of paths) {
    if (!existsSync(join(root, rel))) findings.push(hit(rel, 1, `${label} is part of the platform shell`));
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkSuppressions(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of files) {
    if (!/\.(ts|tsx|mjs)$/.test(file.rel)) continue;
    const lines = file.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const stripped = stripStrings(lines[i]);
      const nocheck = stripped.includes("@" + "ts-nocheck") || stripped.includes("@" + "ts-ignore");
      const expectError = stripped.includes("@" + "ts-expect-error");
      const disable =
        stripped.includes("eslint-disable") && !stripped.includes("eslint-disable-next-line");
      if (nocheck && file.rel !== GENERATED) {
        findings.push(hit(file.rel, i + 1, "ts-nocheck / ts-ignore is only used in the generated route tree"));
      }
      if (expectError && file.rel !== "vite.config.ts") {
        findings.push(hit(file.rel, i + 1, "ts-expect-error is only used in vite.config.ts for the JS plugins"));
      }
      if (disable && file.rel !== GENERATED) {
        findings.push(hit(file.rel, i + 1, "file-level eslint-disable is only used in the generated route tree"));
      }
    }
  }
  return findings;
}

/** First number in a Node range: "22", "22.x", ">=22.0.0". */
function nodeMajor(spec) {
  const match = String(spec).match(/(\d+)/);
  return match ? match[1] : "";
}

/** Literal `node-version` values. Matrix expressions are ignored; the list they point at is not. */
function workflowNodeVersions(text) {
  /** @type {string[]} */
  const versions = [];
  for (const match of text.matchAll(/node-version:\s*\[([^\]]+)\]/g)) {
    for (const part of match[1].split(",")) {
      const value = part.trim().replace(/^["']|["']$/g, "");
      if (/\d/.test(value)) versions.push(value);
    }
  }
  for (const match of text.matchAll(/node-version:\s*["']?(\d[^"'\s#]*)/g)) {
    versions.push(match[1]);
  }
  return versions;
}

/**
 * @param {string} root
 * @param {{ rel: string, text: string }[]} files
 */
export function checkNodeVersion(root, files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  let enginesNode = "";
  try {
    enginesNode = String(readJson(root, "package.json").engines?.node ?? "");
  } catch {
    enginesNode = "";
  }
  const enginesMajor = nodeMajor(enginesNode);
  if (!enginesMajor) {
    findings.push(hit("package.json", 1, 'engines.node is set to the CI Node major ("22")'));
  }
  const workflows = files.filter((file) => file.rel.startsWith(".github/workflows/") && /\.ya?ml$/.test(file.rel));
  if (!workflows.some((file) => file.text.includes("actions/setup-node"))) {
    findings.push(hit(".github/workflows", 1, "CI sets up Node"));
  }
  for (const file of workflows) {
    if (!file.text.includes("actions/setup-node")) continue;
    const versions = workflowNodeVersions(file.text);
    if (versions.length === 0) {
      findings.push(hit(file.rel, 1, "actions/setup-node declares a Node version"));
      continue;
    }
    for (const version of versions) {
      if (!enginesMajor || nodeMajor(version) !== enginesMajor) {
        findings.push(
          hit(
            file.rel,
            1,
            `actions/setup-node ${version} does not match engines.node ${enginesNode || "(unset)"}`,
          ),
        );
      }
    }
  }
  return findings;
}

/** @param {string} root */
export function checkLockfile(root) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  let pkg;
  let lock;
  try {
    pkg = readJson(root, "package.json");
    lock = readJson(root, "package-lock.json");
  } catch {
    return [hit("package-lock.json", 1, "package.json and package-lock.json are both present")];
  }
  if (lock.name !== pkg.name) {
    findings.push(hit("package-lock.json", 1, "lockfile name matches package.json"));
  }
  const locked = lock.packages?.[""] ?? {};
  for (const field of ["dependencies", "devDependencies"]) {
    const want = pkg[field] ?? {};
    const got = locked[field] ?? {};
    for (const name of Object.keys(want)) {
      if (got[name] !== want[name]) {
        findings.push(hit("package-lock.json", 1, `lockfile ${field} ${name} does not match package.json`));
      }
    }
    for (const name of Object.keys(got)) {
      if (!(name in want)) {
        findings.push(hit("package-lock.json", 1, `lockfile ${field} has ${name} which package.json does not`));
      }
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkImportQuotes(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of files) {
    if (file.rel === GENERATED) continue;
    if (!/\.(ts|tsx|mjs|js)$/.test(file.rel)) continue;
    for (const spec of importSpecifiers(file.text)) {
      if (spec.single) {
        findings.push(hit(file.rel, spec.line, "import specifiers use double quotes"));
      }
    }
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkNoTabs(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of files) {
    const index = file.text.indexOf("\t");
    if (index === -1) continue;
    const line = file.text.slice(0, index).split("\n").length;
    findings.push(hit(file.rel, line, "indent with spaces"));
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkTrailingNewline(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  for (const file of files) {
    if (file.text.length === 0 || file.text.endsWith("\n")) continue;
    const line = file.text.split("\n").length;
    findings.push(hit(file.rel, line, "text file does not end with a newline"));
  }
  return findings;
}

/** @param {{ rel: string, text: string }[]} files */
export function checkExplicitAny(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const pattern = /:\s*any\b|\bas\s+any\b|<any\s*>|<any\s*,|\bany\[\]/;
  for (const file of files) {
    if (!/\.(ts|tsx)$/.test(file.rel) || file.rel === GENERATED) continue;
    for (const { line, text } of codeLines(file.text)) {
      if (pattern.test(text)) {
        findings.push(hit(file.rel, line, "hand-written TypeScript avoids explicit any (the lint rule is off, so this only warns)"));
      }
    }
  }
  return findings;
}

/**
 * @param {string} root
 * @param {{ rel: string, text: string }[]} files
 */
/**
 * @param {string} script
 * @param {{ rel: string, text: string }[]} files
 */
function vitestIncludeGlobs(script, files) {
  if (!/\bvitest\b/.test(script)) return [];
  const vitest = files.find((file) => file.rel === "vitest.config.ts");
  const include = vitest?.text.match(/include:\s*\[([\s\S]*?)\]/);
  if (!include) return [];
  return [...include[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

/**
 * Every test file is reachable from `npm test`, and a workflow runs that script.
 * @param {string} root
 * @param {{ rel: string, text: string }[]} files
 */
export function checkTestWiring(root, files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  let testScript = "";
  try {
    testScript = readJson(root, "package.json").scripts?.test ?? "";
  } catch {
    testScript = "";
  }
  const quoted = [...testScript.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] || match[2]);
  const vitestGlobs = vitestIncludeGlobs(testScript, files);
  const workflows = files.filter((file) => file.rel.startsWith(".github/workflows/") && /\.ya?ml$/.test(file.rel));
  const ciRuns = workflows.some((file) => /(?:^|\n)\s*-?\s*run:\s*npm (?:run )?test\b/.test(file.text));
  if (!ciRuns) {
    findings.push(hit(".github/workflows", 1, "a workflow runs npm test"));
  }
  for (const file of files) {
    if (!/\.test\.(ts|tsx|mjs)$/.test(file.rel)) continue;
    const byPath =
      quoted.some((token) => token.includes("*") && globMatch(token, file.rel)) || testScript.includes(file.rel);
    const byVitest = vitestGlobs.some((glob) => globMatch(glob, file.rel));
    if (!byPath && !byVitest) {
      findings.push(hit(file.rel, 1, "test file is not wired into npm test"));
    }
  }
  return findings;
}

/** Non-test src modules that read process.env belong in a `.server.ts` file. */
export function checkServerSuffix(files) {
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const needle = "process" + ".env";
  for (const file of files) {
    if (!file.rel.startsWith("src/") || !file.rel.endsWith(".ts")) continue;
    if (file.rel.includes(".test.") || file.rel.endsWith(".server.ts") || file.rel === GENERATED) continue;
    for (const { line, text } of codeLines(file.text)) {
      if (!text.includes(needle)) continue;
      findings.push(
        hit(
          file.rel,
          line,
          "server-only module should use the .server.ts suffix so it is not bundled to the client",
        ),
      );
      break;
    }
  }
  return findings;
}

/**
 * @param {string} root
 * @param {string} bin
 * @param {string[]} args
 */
function runBin(root, bin, args) {
  const exe = join(root, "node_modules", ".bin", bin);
  if (!existsSync(exe)) return { missing: true, text: "" };
  const result = spawnSync(exe, args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error) return { missing: true, text: "" };
  return { missing: false, text: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

/** @type {Map<string, ReturnType<typeof hit>[]>} */
const prettierCache = new Map();

/** @param {string} root */
export function checkPrettier(root) {
  const cached = prettierCache.get(root);
  if (cached) return cached;
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const run = runBin(root, "prettier", ["--check", "."]);
  if (run.missing) {
    findings.push(hit("package.json", 1, "prettier is installed so CI can warn on format drift"));
  } else {
    for (const line of run.text.split("\n")) {
      const match = line.match(/^\[warn\] (.+)$/);
      if (!match || match[1].startsWith("Code style issues")) continue;
      findings.push(hit(match[1].trim(), 1, "prettier --check reports this file"));
    }
  }
  prettierCache.set(root, findings);
  return findings;
}

/** @type {Map<string, ReturnType<typeof hit>[]>} */
const eslintCache = new Map();

/** @param {string} root */
export function checkEslint(root) {
  const cached = eslintCache.get(root);
  if (cached) return cached;
  /** @type {ReturnType<typeof hit>[]} */
  const findings = [];
  const run = runBin(root, "eslint", [".", "-f", "json"]);
  if (run.missing) {
    findings.push(hit("package.json", 1, "eslint is installed so CI can warn on lint findings"));
  } else {
    const start = run.text.indexOf("[");
    const end = run.text.lastIndexOf("]");
    /** @type {null | { filePath: string, messages?: { line?: number, ruleId?: string | null, message: string }[] }[]} */
    let parsed = null;
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(run.text.slice(start, end + 1));
      } catch {
        parsed = null;
      }
    }
    if (!parsed) {
      findings.push(hit("package.json", 1, "eslint --format json did not return a report"));
    } else {
      for (const file of parsed) {
        const rel = relative(root, file.filePath).split("\\").join("/");
        if (rel.startsWith("..") || rel.startsWith("node_modules/")) continue;
        for (const message of file.messages ?? []) {
          const rule = message.ruleId ? `${message.ruleId}: ` : "";
          findings.push(hit(rel || file.filePath, message.line || 1, `${rule}${message.message}`));
        }
      }
    }
  }
  eslintCache.set(root, findings);
  return findings;
}

export const RULES = [
  { id: "H-01", severity: "hard", check: checkEsm },
  { id: "H-02", severity: "hard", check: (_root, files) => checkNoDefaultExport(files) },
  { id: "H-03", severity: "hard", check: (_root, files) => checkComponentStyle(files) },
  { id: "H-04", severity: "hard", check: (_root, files) => checkFilenames(files) },
  { id: "H-05", severity: "hard", check: (_root, files) => checkComponentImports(files) },
  { id: "H-06", severity: "hard", check: checkTests },
  { id: "H-07", severity: "hard", check: (_root, files) => checkConsoleLog(files) },
  { id: "H-08", severity: "hard", check: (_root, files) => checkNodeImports(files) },
  { id: "H-09", severity: "hard", check: (_root, files) => checkServerImports(files) },
  { id: "H-10", severity: "hard", check: checkSecrets },
  { id: "H-11", severity: "hard", check: (_root, files) => checkRouter(files) },
  { id: "H-12", severity: "hard", check: (_root, files) => checkRootShell(files) },
  { id: "H-13", severity: "hard", check: checkRoutes },
  { id: "H-14", severity: "hard", check: (_root, files) => checkStyles(files) },
  { id: "H-15", severity: "hard", check: (_root, files) => checkVite(files) },
  { id: "H-16", severity: "hard", check: (_root, files) => checkStartup(files) },
  { id: "H-17", severity: "hard", check: (root) => checkNpmScripts(root) },
  { id: "H-18", severity: "hard", check: (root) => checkTsconfig(root) },
  { id: "H-19", severity: "hard", check: (_root, files) => checkMigrations(files) },
  { id: "H-20", severity: "hard", check: (root) => checkPlatform(root) },
  { id: "H-21", severity: "hard", check: (_root, files) => checkSuppressions(files) },
  { id: "H-22", severity: "hard", check: checkNodeVersion },
  { id: "H-23", severity: "hard", check: (root) => checkLockfile(root) },
  { id: "H-24", severity: "hard", check: (_root, files) => checkImportQuotes(files) },
  { id: "H-25", severity: "hard", check: (_root, files) => checkNoTabs(files) },
  { id: "H-26", severity: "hard", check: checkTestWiring },
  { id: "S-01", severity: "soft", check: (_root, files) => checkTrailingNewline(files) },
  { id: "S-02", severity: "soft", check: (_root, files) => checkExplicitAny(files) },
  { id: "S-04", severity: "soft", check: (_root, files) => checkServerSuffix(files) },
  { id: "S-05", severity: "soft", check: (root) => checkPrettier(root) },
  { id: "S-06", severity: "soft", check: (root) => checkEslint(root) },
];

/**
 * @param {string} root
 * @param {{ rel: string, text: string }[]=} files
 */
export function checkRepository(root, files = readTextFiles(root)) {
  /** @type {{ id: string, severity: string, path: string, line: number, message: string }[]} */
  const findings = [];
  for (const rule of RULES) {
    for (const item of rule.check(root, files)) {
      findings.push({ id: rule.id, severity: rule.severity, ...item });
    }
  }
  findings.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path) || a.line - b.line);
  return findings;
}

/** Synthetic violations used by the unit test and `node scripts/check-rules.mjs --demo`. */
export function demoFindings() {
  const files = [
    { rel: "src/bad.ts", text: "const fs = require(" + '"fs");\nconsole' + ".log(1)\n" },
    {
      rel: "src/components/Widget.tsx",
      text: 'import { X } from "./X";\nexport const Widget = () => null;\n',
    },
    {
      rel: "src/routes/__root.tsx",
      text: '<meta property="og:title" content="x" />\n',
    },
    { rel: "src/no-newline.ts", text: "export const a = 1;" },
    { rel: "src/typed.ts", text: "export const n = value as any;\n" },
  ];
  const tagged = (id, severity, items) =>
    items.map((item) => ({ id, severity, ...item }));
  return [
    ...tagged("H-01", "hard", checkEsm(projectRoot(), files)),
    ...tagged("H-03", "hard", checkComponentStyle(files)),
    ...tagged("H-05", "hard", checkComponentImports(files)),
    ...tagged("H-07", "hard", checkConsoleLog(files)),
    ...tagged("H-12", "hard", checkRootShell(files)),
    ...tagged("S-01", "soft", checkTrailingNewline(files)),
    ...tagged("S-02", "soft", checkExplicitAny(files)),
  ];
}

/**
 * @param {{ id: string, severity: string, path: string, line: number, message: string }[]} findings
 * @param {{ demo?: boolean }} [opts]
 */
export function formatReport(findings, opts = {}) {
  const hard = findings.filter((item) => item.severity === "hard");
  const soft = findings.filter((item) => item.severity === "soft");
  const lines = [];
  if (opts.demo) lines.push("demo violations (synthetic, not the repo):");
  else {
    const failed = new Set(hard.map((item) => item.id));
    const ok = RULES.filter((rule) => rule.severity === "hard" && !failed.has(rule.id)).map((rule) => rule.id);
    lines.push(`hard ok (${ok.length}/${RULES.filter((rule) => rule.severity === "hard").length}): ${ok.join(" ")}`);
  }
  for (const item of findings) {
    lines.push(`${item.id} ${item.path}:${item.line} ${item.message}`);
  }
  lines.push(
    opts.demo
      ? `demo: ${hard.length} hard, ${soft.length} soft`
      : `result: ${hard.length} hard failure(s), ${soft.length} soft warning(s)`,
  );
  return lines.join("\n");
}

function emitGitHub(findings) {
  if (!process.env.GITHUB_ACTIONS) return;
  for (const item of findings) {
    const kind = item.severity === "hard" ? "error" : "warning";
    const message = item.message.replaceAll("\n", " ").replaceAll("%", "%25");
    console.log(`::${kind} file=${item.path},line=${item.line},title=${item.id}::${message}`);
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const hard = findings.filter((item) => item.severity === "hard");
  const soft = findings.filter((item) => item.severity === "soft");
  const rows = findings
    .map((item) => `| ${item.id} | \`${item.path}:${item.line}\` | ${item.message.replaceAll("|", "/")} |`)
    .join("\n");
  appendFileSync(
    summaryPath,
    [
      "## AGENTS.md rules",
      "",
      `Hard failures: ${hard.length}. Soft warnings: ${soft.length}.`,
      "",
      "| ID | Location | Finding |",
      "| --- | --- | --- |",
      rows || "| — | — | none |",
      "",
    ].join("\n"),
  );
}

function main(argv) {
  if (argv.includes("--demo")) {
    console.log(formatReport(demoFindings(), { demo: true }));
    return;
  }
  const findings = checkRepository(projectRoot());
  console.log(formatReport(findings));
  emitGitHub(findings);
  if (findings.some((item) => item.severity === "hard")) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
