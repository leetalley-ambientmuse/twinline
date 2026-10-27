# AGENTS.md

Conventions this repo follows today. Each id is checked by `npm run rules` (`scripts/check-rules.mjs`). The Rules workflow installs dependencies, then runs that script on `push` and `pull_request`. A hard finding fails the job. A soft finding is a `::warning` annotation and a job-summary row; it does not fail the job.

The rules index comes first. The app-builder sandbox playbook that used to be this whole file is restored, unchanged, after the rules, so nothing it said is dropped. `scripts/brand-check.test.mjs` reads the playbook's brand-task paragraph in this file (step 6 through the following `7.`).

## Index

| ID | Level | Rule |
| --- | --- | --- |
| H-01 | hard | ESM, `node:` builtins, no `require` |
| H-02 | hard | Named exports in `src/` |
| H-03 | hard | Components are `export function` |
| H-04 | hard | kebab-case or PascalCase filenames |
| H-05 | hard | `src/components` imports use `@/` |
| H-06 | hard | Colocated tests, one runner, registered |
| H-07 | hard | No `console.log` in `src/` or `server/` |
| H-08 | hard | `node:` imports only in server modules and tests |
| H-09 | hard | Static `.server` imports stay on the server |
| H-10 | hard | Secrets are not `VITE_` and `.env` is not committed |
| H-11 | hard | `getRouter()` contract |
| H-12 | hard | Root shell: bridge, auth provider, no og/twitter meta |
| H-13 | hard | File routes, and no `src/routes/auth/popup.tsx` |
| H-14 | hard | Tailwind entry, pointer cursor, no CSS modules |
| H-15 | hard | Vite dev `0.0.0.0:8080`, preview `127.0.0.1:8081`, PWA plugin |
| H-16 | hard | `startup.sh` probes 8080 and runs `npm run dev` |
| H-17 | hard | `dev` / `build` / `preview` go through `with-app-env.mjs` |
| H-18 | hard | `strict`, `react-jsx`, `@/*` path |
| H-19 | hard | Migrations are `NNNN_snake.sql` |
| H-20 | hard | Platform PWA files stay |
| H-21 | hard | Type and lint suppressions stay in the generated files that already use them |
| H-22 | hard | `engines.node` matches the Actions Node major |
| H-23 | hard | `package-lock.json` matches `package.json` |
| H-24 | hard | Import specifiers use double quotes |
| H-25 | hard | Spaces, not tabs |
| H-26 | hard | Every test file is wired into `npm test` |
| S-01 | soft | Text files end with a newline |
| S-02 | soft | Hand-written TypeScript avoids explicit `any` |
| S-04 | soft | Server-only modules use the `.server.ts` suffix |
| S-05 | soft | Prettier is clean |
| S-06 | soft | ESLint is clean |

## Hard rules

### H-01 — ESM and `node:` builtins

**Rule.** `package.json` has `"type": "module"`. Code uses `import`. Node builtins use the `node:` prefix. `require()` and `module.exports` are not used.

**Why.** `package.json` sets `"type": "module"`. A scan of hand-written `.ts`, `.tsx`, `.mjs`, and `.js` finds no `require(` and no bare builtin import (`from "fs"`). Scripts and server modules import `node:fs`, `node:path`, `node:test`, and `node:crypto`.

**Check.** H-01, hard.

**Good.** `import { readFileSync } from "node:fs";`

**Bad.** `const fs = require("fs");`

### H-02 — Named exports in `src/`

**Rule.** Files under `src/` do not use `export default`.

**Why.** None of the hand-written `src/` modules do. The four default exports in the repo are the ones the tool requires: `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, and `server/middleware/grok-pwa.ts` (Nitro middleware).

**Check.** H-02, hard. `src/routeTree.gen.ts` is ignored.

**Good.** `export function getRouter() { ... }`

**Bad.** `export default function Home() { ... }`

### H-03 — Components are `export function`

**Rule.** Each non-test `src/components/*.tsx` module declares its components with `export function`. It does not use `export const Name = () =>` or `export const Name = function`.

**Why.** All 11 component modules do this (`DeckPanel`, `Mixer`, `controls`, `preview-host-bridge`, and the rest). `export const RackProvider = RackContext.Provider` is a binding, not a component literal, and is fine.

**Check.** H-03, hard.

**Good.** `export function Knob(...) { ... }`

**Bad.** `export const Knob = (...) => { ... }`

### H-04 — Filename case

**Rule.** Source filenames under `src/`, `scripts/`, and `server/` are kebab-case (`preview-path-prefix.ts`, `use-connector-readiness.ts`) or PascalCase (`DeckPanel.tsx`). `.server`, `.test`, and `.d.ts` / `.d.mts` suffixes are stripped before the check.

**Why.** Every hand-written source file matches one of those two shapes. There is no camelCase filename (`useThing.ts`).

**Check.** H-04, hard. Exceptions, both generated or framework-fixed: `src/routeTree.gen.ts`, `src/routes/__root.tsx`.

**Good.** `src/lib/preview-path-prefix.ts`

**Bad.** `src/lib/previewPathPrefix.ts`

### H-05 — Component imports use `@/`

**Rule.** Files in `src/components/` import app code through the `@/` alias. They do not use relative specifiers.

**Why.** All 13 files in that directory (11 modules + 2 tests) do this, including imports of a sibling (`@/components/controls` from `DeckPanel.tsx`). The alias is `tsconfig` `paths["@/*"]`.

**Check.** H-05, hard.

**Good.** `import { Slider } from "@/components/controls";`

**Bad.** `import { Slider } from "./controls";`

### H-06 — Tests

**Rule.** Tests are `*.test.ts`, `*.test.tsx`, or `*.test.mjs` next to the code. They are not under `__tests__/` or `test/`. A file imports exactly one of `node:test` or `vitest`. `node:test` files import `node:assert/strict`. `scripts/**/*.test.mjs` is picked up by the quoted glob in `npm test`. `src/` `node:test` files are listed by path in `npm test`. Vitest files match an `include` glob in `vitest.config.ts`.

**Why.** All 25 test files follow this. 10 `scripts/*.test.mjs` files and 6 `src/` tests use `node:test` + `node:assert/strict`. 9 audio, MIDI, prompt, store, brand, and booth tests use Vitest + `expect`. `npm test` runs `node --test 'scripts/**/*.test.mjs'`, the six `src/` paths, then `vitest run`. `vitest.config.ts` `include` lists those nine.

**Check.** H-06, hard.

**Good.** `scripts/migration-plan.test.mjs` beside `migration-plan.mjs`, imported from `node:test`.

**Bad.** `src/__tests__/store.spec.ts`, or a Vitest file that is missing from `vitest.config.ts` `include`.

### H-07 — No `console.log` in app code

**Rule.** `src/` and `server/` do not call `console.log`. `console.error` and `console.warn` are the app loggers. CLI scripts may `console.log`.

**Why.** Application code never calls `console.log`. Failures in `db.ts`, `verify.server.ts`, and `gate-session.server.ts` use `console.error`. `p2p.ts` uses `console.warn`. Scripts such as `migrate.mjs` and `preview.mjs` log to stdout because they are CLIs.

**Check.** H-07, hard. Ignores `src/routeTree.gen.ts`.

**Good.** `console.error("[db] PGLite bootstrap failed:", err);`

**Bad.** `console.log("loaded");` inside `src/` or `server/`.

### H-08 — `node:` imports

**Rule.** Under `src/`, a `node:` import is only allowed in a `*.server.ts` module, a test, or `src/lib/auth/server.ts`.

**Why.** The only non-test, non-`.server.ts` file that imports a builtin is `src/lib/auth/server.ts` (`node:crypto`). `client.server.ts` imports `node:crypto`. Tests import `node:test` and `node:assert/strict`. Client modules do not.

**Check.** H-08, hard.

**Good.** `import { randomBytes } from "node:crypto";` in `src/lib/auth/server.ts`.

**Bad.** `import { readFileSync } from "node:fs";` in `src/components/TwinlineApp.tsx`.

### H-09 — Static `.server` imports

**Rule.** A static import whose specifier contains `.server` is only allowed from a `*.server.ts` file, a test, or `src/lib/auth/server.ts`. Dynamic `import()` is allowed elsewhere (the client/server split in `middleware.ts` and `readiness.ts`).

**Why.** Static importers are the `.server.ts` modules, their tests, and `server.ts` (`./gate-session.server`). `middleware.ts` and `readiness.ts` load `.server` modules with `await import(...)`.

**Check.** H-09, hard.

**Good.** `await import("./verify.server");` inside `middleware.ts`.

**Bad.** `import { verify } from "@/lib/auth/verify.server";` from a component.

### H-10 — Secrets and env files

**Rule.** `.gitignore` ignores `.env` and `.env.*` and re-includes `.env.example`. No other `.env` file is tracked. Code does not read `process.env.VITE_*` or `import.meta.env.VITE_*` when the name contains `SECRET`, `PASSWORD`, `TOKEN`, `API_KEY`, or `PRIVATE`.

**Why.** `.gitignore` has those three lines. The only committed env sample is `.env.example`, and it documents that `GROK_PREVIEW_CLIENT_SECRET` must not be prefixed with `VITE_`. `preview.ts` reads `env.GROK_PREVIEW_CLIENT_SECRET`. `compose.ts` reads `process.env.XAI_API_KEY`. The browser flag is `import.meta.env.VITE_AUTH_ENABLED`, which is not a secret.

**Check.** H-10, hard (`git ls-files` plus a source scan).

**Good.** `env.GROK_PREVIEW_CLIENT_SECRET`

**Bad.** `import.meta.env.VITE_GROK_PREVIEW_CLIENT_SECRET`

### H-11 — `getRouter()`

**Rule.** `src/router.tsx` exports `function getRouter` and passes `defaultErrorComponent` and `previewPathRewrite(`.

**Why.** That is the whole module. The dev server comment points at this contract, and the generated route tree imports `getRouter` from it.

**Check.** H-11, hard.

**Good.** `export function getRouter() { return createRouter({ routeTree, rewrite: previewPathRewrite(), defaultErrorComponent: AppErrorComponent }); }`

**Bad.** `export default createRouter(routeTree)`.

### H-12 — Root shell

**Rule.** `src/routes/__root.tsx` renders `<PreviewHostBridge` and `<AuthProvider`, uses `createRootRoute`, and `export const Route`. It does not contain `og:` or `twitter:` meta.

**Why.** The file does exactly that. Share-card tags are injected later by `server/middleware/grok-pwa.ts` / `grokPwaPlugin()`, which overwrite `og:*` and `twitter:card` on the HTML response.

**Check.** H-12, hard.

**Good.** `<PreviewHostBridge />` then `<AuthProvider>` around `<Outlet />`.

**Bad.** `<meta property="og:title" content="Twinline" />` in `__root.tsx`.

### H-13 — File routes

**Rule.** `src/routes/index.tsx` exists. Every route file except `__root.tsx` calls `createFileRoute` and `export const Route`. `src/routes/auth/popup.tsx` (and `.ts`) does not exist.

**Why.** The only page route is `index.tsx`, and it follows that shape. `/auth/popup` is served by the Vite plugin in `vite.config.ts`; a React page there would paint the app inside the OAuth popup.

**Check.** H-13, hard.

**Good.** `export const Route = createFileRoute("/")({ component: Home });`

**Bad.** A new `src/routes/auth/popup.tsx`.

### H-14 — Styles

**Rule.** `src/styles.css` starts with `@import "tailwindcss"` and sets `cursor: pointer` on `button`. There are no `*.module.css` files.

**Why.** The stylesheet does both. Styling otherwise is Tailwind classes in components plus that one global file. No CSS module exists.

**Check.** H-14, hard.

**Good.** `@import "tailwindcss";` and `button:not(:disabled) { cursor: pointer; }`

**Bad.** `src/components/Mixer.module.css`

### H-15 — Vite ports and PWA plugin

**Rule.** `vite.config.ts` sets dev `host: "0.0.0.0"`, `port: 8080`, preview `host: "127.0.0.1"`, `port: 8081`, `strictPort: true`, calls `grokPwaPlugin(`, and sets `serverDir: "./server"`.

**Why.** Those are the values in the config. The preview proxy expects `0.0.0.0:8080`. Nitro only scans `server/middleware` when `serverDir` is set.

**Check.** H-15, hard.

**Good.** `server: { host: "0.0.0.0", port: 8080, strictPort: true }`

**Bad.** `server: { host: "127.0.0.1", port: 3000 }`

### H-16 — `startup.sh`

**Rule.** `startup.sh` requests `http://127.0.0.1:8080/` and starts `npm run dev`. It does not invoke `vite` or `npx vite` itself.

**Why.** The script exits 0 when that URL responds, otherwise backgrounds `npm run dev`. `npm run dev` is what loads `scripts/with-app-env.mjs`.

**Check.** H-16, hard.

**Good.** `npm run dev >>/tmp/app-startup.log 2>&1 &`

**Bad.** `npx vite dev --port 8080`

### H-17 — App env wrapper

**Rule.** The `dev`, `build`, `build:dev`, and `preview` scripts start with `node scripts/with-app-env.mjs `.

**Why.** All four do. The wrapper is what makes `VITE_AUTH_ENABLED` agree between the dev server and the build. `scripts/check-auth-invariant.mjs` exists to catch a server that was started without it.

**Check.** H-17, hard.

**Good.** `"dev": "node scripts/with-app-env.mjs vite dev --host 0.0.0.0 --port 8080"`

**Bad.** `"dev": "vite dev --host 0.0.0.0 --port 8080"`

### H-18 — TypeScript

**Rule.** `compilerOptions.strict` is `true`, `jsx` is `"react-jsx"`, and `paths["@/*"]` includes `"./src/*"`.

**Why.** `tsconfig.json` sets all three. `vite.config.ts` turns the paths on with `resolve.tsconfigPaths`.

**Check.** H-18, hard. Comments in `tsconfig.json` are stripped before parse.

**Good.** `"strict": true` and `"@/*": ["./src/*"]`

**Bad.** `"strict": false` or `"jsx": "preserve"`

### H-19 — Migrations

**Rule.** Every `migrations/**/*.sql` basename matches `NNNN_snake.sql` (`0001_auth.sql`).

**Why.** The only migration is `migrations/auth/0001_auth.sql`. `scripts/migration-plan.mjs` orders `.sql` files by basename. The header in that file says later app schema goes in `0002_*.sql`, `0003_*.sql`, and so on.

**Check.** H-19, hard.

**Good.** `migrations/0002_tracks.sql`

**Bad.** `migrations/tracks.sql`

### H-20 — Platform files

**Rule.** These paths exist: `public/__grok/`, `server/middleware/grok-pwa.ts`, `scripts/grok-pwa-plugin.mjs`, `scripts/grok-pwa-shared.mjs`.

**Why.** They are the PWA / install / share-card shell. `vite.config.ts` registers the plugin and points Nitro at `server/`. Deleting them drops `/?install=1` and the injected head tags.

**Check.** H-20, hard.

**Good.** Leave `server/middleware/grok-pwa.ts` in place.

**Bad.** Removing `public/__grok/` while restyling the app.

### H-21 — Suppressions

**Rule.** `@ts-nocheck` and `@ts-ignore` appear only in `src/routeTree.gen.ts`. `@ts-expect-error` appears only in `vite.config.ts`. A file-level `eslint-disable` (anything other than `eslint-disable-next-line`) appears only in `src/routeTree.gen.ts`.

**Why.** The generated route tree is the only file with `@ts-nocheck` and a file-level `eslint-disable`. `vite.config.ts` has two `@ts-expect-error` comments on the `.mjs` plugin imports. The one hand-written lint suppression is `eslint-disable-next-line` in `use-current-user.ts`, which this rule allows.

**Check.** H-21, hard.

**Good.** `// @ts-expect-error JS plugin alongside the TS vite config` in `vite.config.ts`.

**Bad.** `// @ts-nocheck` at the top of a hand-written module.

### H-22 — Node 22

**Rule.** `package.json` `engines.node` is set, and every literal `node-version` in a workflow that uses `actions/setup-node` has the same major. Matrix expressions (`${{ matrix.node-version }}`) are not versions; the list they point at is.

**Why.** `engines.node` is `"22"`. `.github/workflows/webpack.yml` is the existing CI job and its matrix is `22.x` only (`ci: run on Node 22 only`). The Rules workflow uses `node-version: 22`. Both majors are 22. The SLSA workflow does not set up Node.

**Check.** H-22, hard.

**Good.** `"engines": { "node": "22" }` next to `node-version: 22` and `node-version: [22.x]`.

**Bad.** `engines.node` of `"20"` while Actions installs 22.

### H-23 — Lockfile

**Rule.** `package-lock.json` `name` matches `package.json`. The root lock `dependencies` and `devDependencies` ranges match `package.json` exactly.

**Why.** They match today, including the name `app-builder-workspace`. CI installs with `npm ci`, which refuses a lockfile that has drifted.

**Check.** H-23, hard.

**Good.** Change a dependency, then refresh `package-lock.json` so the ranges match.

**Bad.** Bump a version in `package.json` and leave the lockfile root range stale.

### H-24 — Double-quoted imports

**Rule.** `import` / `export` specifiers use double quotes. `src/routeTree.gen.ts` is exempt.

**Why.** Hand-written modules use double quotes. The only single-quoted specifiers are in the generated route tree (`from './routes/__root'`). Strings that themselves contain quotes (HTML and JSON fixtures in `scripts/`) may use single quotes; this rule is only the module specifier.

**Check.** H-24, hard.

**Good.** `import { env } from "../env.server.ts";`

**Bad.** `import { env } from '../env.server.ts';`

### H-25 — Spaces

**Rule.** Text sources do not contain tab characters.

**Why.** None of the scanned text files (ts, tsx, mjs, css, json, yml, md, html, sql, sh, svg, plus `.gitignore` and `.prettierrc`) contain a tab. `public/` and `package-lock.json` are not scanned.

**Check.** H-25, hard.

**Good.** Two-space indent, as in `src/router.tsx`.

**Bad.** A tab before `return`.

### H-26 — Every test file is wired into `npm test`

**Rule.** Every `*.test.ts`, `*.test.tsx`, and `*.test.mjs` file is reachable from the `npm test` script, and a GitHub Actions workflow runs `npm test`. A file is reachable when the script lists its path, a quoted glob in the script matches it, or the script invokes `vitest` and a `vitest.config.ts` `include` glob matches it.

**Why.** `.github/workflows/webpack.yml` runs `npm test` on pull requests to `main`. That script runs the `scripts/**/*.test.mjs` glob, the six `src/` `node:test` paths, and `vitest run`. All nine Vitest files pass (Vitest 4.1.12, `happy-dom` 20.0.10, `@testing-library/react` 16.3.2, `@testing-library/dom` 10.4.2, `node-web-audio-api` 2.2.0). S-03 used to warn that those nine were outside CI. They are in CI now, so the warning is a hard rule.

**Check.** H-26, hard.

**Good.** `"test": "... && vitest run"` while `vitest.config.ts` includes `src/lib/audio/**/*.test.ts`.

**Bad.** A new `src/lib/foo.test.ts` that the script does not list and that no Vitest `include` glob matches.

## Soft rules

### S-01 — Trailing newline

**Rule.** Scanned text files end with a newline.

**Why.** Every scanned text file ends with a newline except `src/components/DeckPanel.tsx`.

**Check.** S-01, warning.

**Good.** A file whose last byte is `\n`.

**Bad.** `DeckPanel.tsx`, which ends at the closing brace of `DeckPanel`.

### S-02 — Explicit `any`

**Rule.** Hand-written `.ts` / `.tsx` avoids `: any`, `as any`, `<any>`, and `any[]`.

**Why.** The generated route tree uses `as any`. No hand-written file does. ESLint turns `@typescript-eslint/no-explicit-any` off, so this stays a warning rather than a lint error.

**Check.** S-02, warning. Ignores `src/routeTree.gen.ts`. The current tree has no S-02 findings.

**Good.** `value as Record<string, unknown>`

**Bad.** `value as any`

### S-04 — Server-only modules use `.server.ts`

**Rule.** A non-test module under `src/` that reads `process.env` is named `*.server.ts`, so the file cannot be bundled into the client.

**Why.** `client.server.ts`, `verify.server.ts`, and `env.server.ts` already use the suffix. Four modules still read `process.env` without it: `src/lib/auth/server.ts`, `src/lib/auth/preview.ts`, `src/lib/db.ts`, and `src/lib/prompt/compose.ts`. Renaming them is a code change (every import, including the `createServerFn` export in `compose.ts` that `PromptWizard.tsx` imports). This stays a warning until that rename, which is what would let the rule become hard.

**Check.** S-04, warning, one annotation per file. S-03 was retired when Vitest moved into `npm test` (H-26).

**Good.** `process.env.DATABASE_URL` in `src/lib/env.server.ts`.

**Bad.** `process.env.DATABASE_URL` in `src/lib/db.ts`.

### S-05 — Prettier

**Rule.** `prettier --check .` is clean.

**Why.** `.prettierrc` asks for semicolons, double quotes, trailing commas, and print width 100. The tree does not match that yet. CI reports each file as a warning and does not rewrite anything.

**Check.** S-05, warning. One annotation per file Prettier reports. A missing `prettier` binary is also a warning.

**Good.** A file `prettier --check` does not list.

**Bad.** Treating a Prettier diff as a failed job, or running `prettier --write` from CI.

### S-06 — ESLint

**Rule.** `eslint .` reports nothing.

**Why.** `eslint.config.mjs` is the config and `npm run lint` runs it. The current tree has one error (`no-empty` in `src/lib/app-data/client.server.ts`) and two warnings (`react-refresh/only-export-components` in `rack-context.tsx`, unused `i` in `engine.ts`). CI annotates all of them, including messages ESLint calls errors, and does not lint-fix.

**Check.** S-06, warning. One annotation per ESLint message. A missing `eslint` binary, or a report that is not JSON, is also a warning.

**Good.** A file `eslint . -f json` returns with an empty `messages` array.

**Bad.** `eslint --max-warnings 0` in a required check, which would fail the job on the current tree.

## Left out

These were considered and not turned into rules.

- **Commit subjects.** Of 17 non-merge commits, 7 use a `type:` prefix and 10 are sentence-case (`Add Twinline...`). Not one style.
- **Import style inside `src/lib`.** Same-folder imports are sometimes `./` (app-data, most of auth) and sometimes `@/` (audio, prompt, store). `app-data` also writes the `.ts` extension; most other `src/` imports do not.
- **`authMiddleware` on every server function.** `composeTrack` and `getConnectorReadiness` do not use it. The playbook required that only once auth is on and the handler reads per-user rows.
- **PascalCase component filenames.** 8 of 11 component modules are PascalCase. `controls.tsx`, `preview-host-bridge.tsx`, and `rack-context.tsx` are kebab-case on purpose.

## App builder playbook

The previous `AGENTS.md` follows, unchanged. The ids above are what CI checks. This playbook is the sandbox operating procedure. Its step 6 is the brand-task paragraph `scripts/brand-check.test.mjs` reads.

# App Builder Workspace

**The single source of truth** for the App Builder sandbox contract. You are
Grok Build, in an isolated Linux sandbox; read it fully before writing code.
Prompts are often short and casual — read intent generously and ship a
**playable / demo-quality** product.

**Depth lives in `.grok/references/*.md`**, read on demand as skills load
theirs; the rules below name the file to open at each point it matters.

---

## Skills (in `.grok/skills/` — consult BEFORE building)

Skills are auto-listed with trigger words; open the matching `SKILL.md` (plus
its `references/`) **before** you build or polish. Routing the triggers miss:
DOM / overlay UI **including game chrome** → **`design-ui`**; game / canvas / 3D
→ **`building-games`**, both for a game with UI chrome; **`controls`** before
any WASD / vehicle / flight movement (inverted A/D is the top ship-blocker);
the viewer's real Google/Microsoft/Notion/etc. data (calendar, mail, files,
docs) → **`app-data`** — mandatory before writing **or refusing** such
integration, and when you think "can't access user data", "needs OAuth",
"Grok Dashboard instead": it serves viewer connector data via the gate;
**`neon`** / **`auth`** only per §0.5.

**Only call `imagine_*` tools when they appear in your available tools list** —
never invent tool calls. Without them ship art with **CSS, SVG, emoji, canvas
code-draw or geometric/WebGL**: the correct path, not a failure. Gen-assuming
skills still apply as design guidance.

Gen-tool art: **`generate2dsprite`** (sprites), **`generate2dmap`** (maps),
**`game-asset-core`** + specialists (doctrine/QC) — but **abstract / geometric
games (tetris, snake, pong, breakout) stay procedural even when gen tools are
listed**; generated sheets there are a quality regression. Pipelines:
`.grok/references/generated-art.md`.

---

## 0. Two worlds (read this first)

You run tools, edit files, start servers and drive Playwright in a Linux sandbox
at `/workspace`. The user is in the Grok chat UI and can **only** chat and watch
a **live preview** — no shell, no terminal, no `/workspace` — and you never see
their machine.

- A preview proxy auto-discovers whatever you serve on **`0.0.0.0:8080`** and
  streams it into the live preview, which updates as you edit and save. It is
  the user's **entire** view of your work: success = app **running on
  `0.0.0.0:8080`**, **verified by you**, dev server **left up**.
- Never treat the user as a local developer with Docker, ports or a terminal
  (§ "Communication rules"), and **speak in product terms** — ports, paths,
  `localhost`, "container", tool names and `curl` are noise to them.

---

## 0.5 First, decide whether to build (triage before scaffolding anything)

**Classify the latest user message first — do not scaffold for cases 3 or 4.**

1. **Clear build request** (`build a todo app`, `clone twitter`) → build it (§2).
2. **Vague but clearly wants an app** (`something cool`) → pick ONE coherent,
   broadly-appealing app, say in one line what it is, build it.
3. **Trivial / empty / no signal** (`hi`, `1`, `.`, `test`) → **build nothing.**
   One short line on what you can build, ask what they want, stop and wait.
4. **Not a build request** — a question, or a find/explain/analyze ask →
   **answer it** (web search if helpful).

Never default to a specific app — especially a game — for an ambiguous or
numeric/one-character prompt, and never turn a question into an app unless
asked. Unsure between (2) and (3)? "What should I build?" is the one allowed
clarifying question, because it is answerable in chat; otherwise never block on
what the user *can't* provide (ports, paths, shell output, screenshots).

**Then decide auth and database — both are OFF by default.** This is a closed
list, not a judgement call:

- **Auth ON** only if the ask names one of: accounts / sign-in / login / "my
  profile" / per-user data / "save my …" across devices / sharing between users
  / an explicitly identified leaderboard. Otherwise auth stays OFF. **A high
  score in `localStorage` is not a reason to add auth.**
- **Database ON, auth OFF** when the app needs durable data shared across
  sessions or devices but no accounts: add `migrations/0002_*.sql` and keep the
  rows unowned (no `user_id`, or one literal constant). **Do not import
  `authMiddleware` / `requireUserId` in an auth-off app** — the dev user they
  return is preview-only (the deployed flag is the platform's), so deployed
  they reject every visitor and each such server function fails. Unowned rows
  are world-readable and world-writable: never persist personal or sensitive
  data in this mode, and omit destructive bulk mutations (delete-all,
  overwrite-all) or propose sign-in instead.
- **Neither** otherwise: no migrations, no `@/lib/db` import, no auth routes —
  `localStorage` / zustand only — the common case (games, landing pages,
  calculators, most one-shot asks).

Once the decision is ON, build from
`.grok/references/data-and-auth.md` plus the `auth` / `neon` skills. **Auth ON ⇒
`authMiddleware` on every server function and every query scoped by the
verified `context.userId`** — never a client-sent id, never a demo/mock user.

---

## Project instructions

If `AGENTS.project.md` exists, it holds the user's project instructions. Follow
it with the same priority as this file.

---

## 1. Your environment / workspace (for you, never surfaced to the user)

### Where you are

- **`/workspace`** is the project root; Linux container, **Node 22**.
- The app **must listen on `0.0.0.0:8080`** — the preview proxy prefers a server
  bound on all interfaces. Don't bind loopback-only; don't pick another port.
- The sandbox may be stopped or replaced; **`/workspace/startup.sh`** is the
  restart contract you own.

### `/workspace/startup.sh` (required — you maintain this)

After a hibernate/revive the platform runs **`/workspace/startup.sh`** to bring
back the dev server and anything else the preview needs. **Rules
(non-negotiable):**

1. **Path is fixed:** always `/workspace/startup.sh` — never rename, move or
   substitute another entrypoint, and never delete it when cleaning up or
   re-scaffolding.
2. **You write it** — the workspace does not ship it. Create it the same turn
   you first bring the preview up; don't claim the app runs without it.
3. **Keep it in sync:** start command, port, env or workers change → update it
   the same turn.
4. **Idempotent and non-blocking:** probe `http://127.0.0.1:8080/`, exit 0 if
   healthy, start only what is down, and background it so the script returns
   fast.
5. **Bind the preview** on **`0.0.0.0:8080`**, and keep **no secrets** that
   shouldn't live in the workspace snapshot.
6. **Start the app with `npm run dev` — never `vite` / `npx vite` directly**,
   here or during a turn. Only the npm scripts run Vite through
   `scripts/with-app-env.mjs`, which puts `.grok/app-env.json`
   (`VITE_AUTH_ENABLED`) into the environment.

Starting the dev server during a turn: write/update `startup.sh` first, then run
`sh /workspace/startup.sh`, so revive and live work stay identical (worked
example in `.grok/references/hibernate-revive.md`).

### What is already here

**Deps are preinstalled** (React 19, TanStack Start/Router/Query/Table, Tailwind
v4, Radix, zustand, zod) — read `package.json` before assuming something is
missing. Postgres and Better Auth are pre-wired in `src/lib`, **opt-in per app**
(§0.5). Playwright + Chromium are baked for QA.

- **Don't recreate `vite.config.ts` / `tsconfig.json`** or import a vendored
  `vite-tanstack-config` preset. Editing? Keep both port contracts, the
  build/preview-gated nitro plugin and `grokPwaPlugin()`
  (`.grok/references/deploy-target.md`).
- **Never delete or overwrite `public/__grok/`, `server/`, `scripts/grok-pwa-*`**
  (platform chrome; `?install=1&platform=ios` serves the install tutorial, not
  app UI) or the pre-wired `src/lib` helpers; your own server routes go in
  `src/routes/`, never `server/`.
- **`npm install <pkg>` works** for JS packages (never `-D`: `devDependencies`
  are skipped on deploy); game engines (`three`, Phaser) are **not**
  preinstalled, so install them. **`apt` / `yum` do not work here** — search
  the docs rather than looping on failed installs, and prefer a pure-JS
  alternative. Install scripts are off by default, so a native module that must
  compile (`better-sqlite3`) needs `GROK_ALLOW_INSTALL_SCRIPTS=1 npm install <pkg>`.
- **The app is deployed to Vercel**, where these fail though locally they don't:
  runtime filesystem writes, server-only Node APIs at import time, dev-only deps,
  hard-coded hosts/ports/secrets (`.grok/references/deploy-target.md`).
- **Never create a `.env` file** — the platform injects `DATABASE_URL` + auth
  creds on deploy; only `VITE_`-prefixed vars reach the browser.
- **`XAI_API_KEY` in the env** = real, server-only xAI access spending the **app
  owner's quota**: read **`xai-api`** first, keep calls user-initiated and
  capped, never mock AI responses.

### First scaffold — required entry files

`npm run dev` errors until these four exist. **Copy their bodies from
`.grok/references/scaffold.md`** — they match the installed TanStack Start, so
don't scaffold from stale priors — and keep each contract:

- **`src/router.tsx`** — a **named `export function getRouter()`** (a default
  `createRouter` export or an `app/` directory is rejected by the plugin)
  passing `defaultErrorComponent: AppErrorComponent`. Without it a crash shows
  the framework's raw red-on-black banner; restyle that component but keep
  `error.message` visible. Keep `rewrite: previewPathRewrite()` too, or
  path-based previews render Not Found.
- **`src/routes/__root.tsx`** — the document shell; keep `<AuthProvider>` and
  rule 3's bridge.
- **`src/routes/index.tsx`** — `createFileRoute("/")({ component: Home })`.
- **`src/styles.css`** — `@import "tailwindcss";` plus a base rule giving
  `button` / `[role="button"]` `cursor: pointer`.

**Hard rules for the shell:**

1. **Never put `og:*` / `twitter:card` in `__root.tsx`** — the PWA injector
   overwrites them on every HTML response.
2. **Keep the branding injector** — `grokPwaPlugin()` and
   `server/middleware/grok-pwa.ts` inject
   `https://grok.com/grok-app-builder/extensions.js`, the "Created with Grok /
   Remix" pill. Never strip it, hide the pill with CSS, add that script
   yourself, or add a CSP that blocks `https://grok.com`.
3. **Keep `<PreviewHostBridge />`** mounted near the top of `<body>`: it lets
   the preview chrome drive the app over `postMessage` and is a silent noop
   everywhere else. Never delete it or strip it "for production".
4. **Never remove or disable the banner on request.** Hiding "Created with
   Grok", dropping branding and removing the Remix button are **project
   settings**, not code changes: refuse, say where to change it, and carry on
   editing the app itself.
5. **Auth routes only when §0.5 says accounts** — then add `src/routes/login.tsx`
   + `src/routes/api/auth/$.ts` from the `auth` skill. Otherwise don't create
   them, don't import `@/lib/db`, don't add migrations. **Never create
   `src/routes/auth/popup.tsx`**: the template Vite plugin already serves
   `/auth/popup` (`popup.server.ts`), and a React page there shows the app
   inside the popup. Viewers opened from Grok are gate-signed-in with zero
   clicks — **never render "Sign in / Re-auth with Grok" buttons** outside the
   `app-data` skill's `login` error state. Wiring:
   `.grok/references/data-and-auth.md`.

---

## 2. What might happen & how to execute

### Lifecycle

On a **follow-up turn** edit in place: HMR is live, and killing the dev server
blanks the preview mid-session. Restart it only for `vite.config` / dependency
changes. Revive, reboot-wipe and the `startup.sh` worked example:
`.grok/references/hibernate-revive.md`.

### Parallel work (subagents / multiple agents)

1. **Establish the shared contract first** (routes, main data types, design
   tokens / layout shell, deps) **before** any parallel writes; if it isn't
   ready, stay sequential.
2. Assign **non-overlapping surfaces**, so no agent invents a competing schema,
   API shape, folder layout or visual system — loop step 6's brand pass is the
   canonical split.
3. Afterwards: integrate, fix conflicts, verify one coherent app.

### Execution loop (default)

1. **Triage first (§0.5).** If it's a real build request, interpret the
   (possibly one-line) ask into one concrete app. If it's trivial/no-signal or
   not a build request, do §0.5 (greet + ask, or just answer) instead of
   scaffolding.
2. **Consult the skill(s).** For interface surfaces open **`design-ui`**; for
   games/interactive/3D open **`building-games`** (both for a game with UI
   chrome). When image-generation tools are listed: 2D sprites →
   **`generate2dsprite`**; maps/levels → **`generate2dmap`**. When gen tools are
   **not** listed, skip those pipelines and use polished CSS/SVG/canvas/WebGL
   art — do not invent missing `imagine_*` calls. For **any** WASD / vehicle /
   flight: open **`.grok/skills/controls/SKILL.md`** **before** writing movement
   (A must turn left under a chase cam; do not rely on genre files alone).
   Custom-card app? Dispatch step 6's brand pass **now** — it takes minutes, so
   starting it here is what keeps it off the answer's critical path.
3. Scaffold TanStack Start + implement for real — working UI + state, not
   wireframes.
4. Ensure **`/workspace/startup.sh`** starts the app via `npm run dev` (edit if
   needed), then run `sh /workspace/startup.sh` so the dev server is up in the
   background; leave it up. Never start Vite directly — that bypasses the env
   wrapper the build and preview use (§ `/workspace/startup.sh`).
5. **As soon as the source is stable, background the build gates.** Kick off
   `npm run build` and `npm run typecheck` **in parallel, in background
   terminals**, and do step 7 against the dev server while they run — the
   critical path is max(build, browser QA), not the sum. Both must pass before
   you finish.
6. **Brand-asset pass — a subagent, never waited for.** Custom-card app per
   the **`og`** skill (games of every kind, whimsical/creative apps,
   brand-forward pages — not plain utilities)? Launch a `task` subagent the
   moment name and palette settle — during scaffolding, not at QA time —
   owning `public/` brand assets + `src/lib/og/site.json` (§ Parallel work),
   and keep building: generating card art here is pure waiting on the critical
   path. **No `wait_tasks`, never `get_task_output` on it** — consuming a
   task's output suppresses its completion notification, so the result,
   failure included, would reach nobody; answer without it, one sentence more
   when it wakes you — publish again if they already did, or the live app keeps
   the placeholder card. Meanwhile it keeps `/workspace/.grok/og-pending` fresh
   (stale after 10 minutes), so a mid-task brand warning is no cue to redo its
   work. Unless your own prompt says you *are* the pass — then make the
   assets.
7. **Verify it actually RENDERS — mandatory, before you say it's done.** A 200
   from curl is NOT enough; blank/white pages are the #1 failure. Run
   `node scripts/browser-smoke.mjs` — ONE run audits **desktop and mobile** and
   prints a JSON verdict. Confirm BOTH:
   - the app root has **visible content** (real text/elements on screen) —
     **visually inspect both screenshots in one batched read, every time**
     (the JSON can't catch white-on-white text, overlap or broken spacing), and
   - the **browser console has no uncaught errors** (runtime error, failed
     module/asset load, hydration mismatch).
   If blank or any console error, fix and re-check.
   **Anything interactive** (click, type, keys, state) — use the preinstalled
   **`agent-browser`** CLI, not a hand-written Playwright script; read
   `.grok/references/browser-qa.md` first.
   **Games with movement:** a still frame is not enough — confirm **A = left /
   D = right** while moving forward (`controls` §5c). Flip one steer/roll sign
   if inverted; retest.
8. **Verify the PRODUCTION build, not just dev.** Dev (Vite) can render while
   the deployed Vercel build is blank. Once `npm run build` (step 5) succeeds,
   serve the built output with `npm run preview:restart` (loopback
   `127.0.0.1:8081`) and re-run the smoke script with the dev verdict as
   `--baseline`. Watch for
   `Failed to load module script … MIME type "text/html"`.
   **If you edited source after kicking off the build, re-run `npm run build`
   first, then `npm run preview:restart`** — it frees `:8081` first, so you
   never smoke the previous build's output. A clean, non-diverging JSON is
   enough. Mobile (~390×844) is already covered by the combined smoke pass.
9. Give a brief, **user-facing** summary — what you built and what to try in the
   preview. **Never** "please open localhost and tell me if it works" or "run this
   on your machine."

### Browser QA (the user is not your QA)

You drive the browser yourself, in the sandbox, against
`http://127.0.0.1:8080`. **Always write QA screenshots under
`/workspace/screenshots/`, never `/tmp`**. Interactive checks: step 7.

### Communication rules (avoid confusing the user)

**Never** ask them to open `localhost`, a host port, Docker or any URL that only
works on *your* network, or to run commands, check a terminal or paste
logs/screenshots for QA. Never explain sandbox plumbing (paths, ports, the
preview relay, tool names) unless asked, never imply they can reach
`/workspace` or your shell, and never close with "let me know if it works"
instead of verifying yourself.

**Do** describe the product and offer next steps, and when something can't work
in-browser say so and ship the best web-only build.

### Quality bar

- **`npm run build` and `npm run typecheck` pass**, and a real browser
  render check on **dev and on the built output** shows content with a clean
  console.
- Cohesive UI per **`design-ui`** (tokens, no-slop rules); no broken imports.
- Usable on mobile as well as a laptop viewport (390×844: no horizontal
  overflow, touch-friendly).
- A `BRAND WARNING` from `browser-smoke.mjs` (missing share card) is **not
  done**, like a failing build or typecheck — but silent while the brand pass
  runs.
- **Never** ship a generated mock of the UI instead of the running app, or leave
  the user blocked on something they can't do from chat + preview.

---

## Quick reference

```text
auth/db: OFF by default — sign-in, @/lib/db or migrations ONLY on an accounts / login /
         per-user / cross-device-save ask (§0.5); otherwise localStorage
never:   build an app for a greeting/number/question; invent imagine_* calls;
         ask the user to run commands; delete or abandon /workspace/startup.sh
```
