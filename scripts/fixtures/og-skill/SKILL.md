The pending marker is `/workspace/.grok/og-pending`. Treat it as stale after 10 minutes.

## Brand-asset pass: contract fixture

This file is the checked-in contract between the og skill and the brand CLIs. It is not the agent skill. A checkout that has `.grok/skills/og` is held to the same checks.

Do not wait_tasks. Never get_task_output.

`node scripts/brand-check.mjs`

`node scripts/brand-check.mjs --placeholder-ok`

## Out of scope

The heading above ends the prohibition section.
