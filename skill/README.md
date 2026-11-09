# coolify-deploy · Claude Code skill for the team sandbox

A Claude Code skill that deploys a team member's app to the **Coolify sandbox server `c.bu8-sd.com`**, under its own `https://<subdomain>.c.bu8-sd.com` address, then checks that it's really live.

## Why this skill and not a generic one

Claude Code already knows Docker, Next.js and the Coolify API in general. What it doesn't know is **this team's setup**, so this skill encodes only that:

| Team-specific knowledge | Where |
|---|---|
| The sandbox instance, its single server and the `*.c.bu8-sd.com` domain rule | `SKILL.md`, `scripts/sandbox.mjs` |
| Sandbox rules: public URLs, may be wiped, no real data, only touch your own resources | `SKILL.md` |
| API token policy: **not included**; each person gets one from the DevOps team, stored outside the repo; clear stop-and-ask message when missing | `SKILL.md` step 0, `scripts/sandbox.mjs` |
| Gotchas actually hit on this instance (token with `\|`, "API is disabled", GET→POST in Coolify 4.6, first-request DB race, Edge build of `instrumentation.ts`) | `references/troubleshooting.md` |
| What an app needs before it can run on the sandbox | `references/app-checklist.md` |

## What it does

```text
check  → token present & valid? API enabled? server reachable?
plan   → dry run: what will be created/reused · subdomain free? · config valid?
deploy → project → PostgreSQL 16 (optional, DATABASE_URL injected) → app from public GitHub repo
         → sync env vars → build on the sandbox → wait → verify https://<sub>.c.bu8-sd.com/<health>
status · logs · destroy (only resources this skill created, marked (coolify-deploy))
```

- **Idempotent:** running `deploy` again reuses the project, database and app by name, syncs only changed env vars, and redeploys.
- **Safe:** a subdomain already used by another app is refused. `destroy` refuses projects it didn't create. Generated secrets go to `.coolify/`, which is added to `.gitignore` automatically. Env var values are never printed.
- **No dependencies:** one Node 18+ script, so it works on Windows and macOS.

## Install

```bash
# personal (all projects)
cp -r skill/coolify-deploy ~/.claude/skills/
# or per project
cp -r skill/coolify-deploy <your-project>/.claude/skills/
```

Then ask the DevOps team for a sandbox API token and save it in `~/.config/bu8-sandbox/coolify.env`:

```text
COOLIFY_TOKEN='<token from DevOps>'
```

## Use

In Claude Code, inside your project: *"deploy this to the sandbox as `my-demo`"*. Claude loads the skill and then:
1. checks the token
2. checks the app against the checklist
3. writes `deploy.json`
4. shows you the plan for approval
5. deploys and gives you the live URL

The script can also be run by hand:

```bash
node ~/.claude/skills/coolify-deploy/scripts/sandbox.mjs check
node ~/.claude/skills/coolify-deploy/scripts/sandbox.mjs plan   --config deploy.json
node ~/.claude/skills/coolify-deploy/scripts/sandbox.mjs deploy --config deploy.json
```

## Tested

See [`TESTING.md`](TESTING.md) for the runs against the real sandbox: no token, wrong token, invalid config, taken subdomain, a full deploy with PostgreSQL, a redeploy that reuses everything, status, logs, and destroy.
