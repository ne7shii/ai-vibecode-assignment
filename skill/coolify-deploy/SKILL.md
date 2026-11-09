---
name: coolify-deploy
description: Deploy a Dockerized app (optionally with PostgreSQL) to the team's Coolify SANDBOX server at c.bu8-sd.com under its own *.c.bu8-sd.com subdomain, then verify it is live. Use when the user wants to deploy, redeploy, check, view logs of, or remove an app on the sandbox / Coolify / bu8-sd.com, or asks for a demo URL for a project. Not for production deployments.
---

# Coolify sandbox deploy (c.bu8-sd.com)

The team's **sandbox** Coolify server. It is for demos, homework, previews and experiments. It is **not production**.

| Fact | Value |
|---|---|
| Coolify | `https://c.bu8-sd.com` (Coolify v4.6) |
| Domains | Each app gets `https://<subdomain>.c.bu8-sd.com`. Wildcard DNS and HTTPS certificates are already set up, so there is nothing to configure in DNS. |
| Server | One server named `localhost` (the Coolify host itself). Images are **built on this server** from your Git repo. There is no registry. |
| Databases | PostgreSQL 16 created by the skill, internal network only (no public port). |
| API key | **Not included in this skill.** Each person gets their own token from the **DevOps team**. |

## Sandbox rules (tell the user when relevant)

- Anything deployed is on the public internet at its URL. Put **no real customer data, no production secrets**.
- The sandbox may be wiped or restarted without notice. It's not for anything that has to stay up.
- Only touch resources this skill created. Never modify or delete other people's projects. The script enforces this with a `(coolify-deploy)` marker.
- One subdomain per app. Don't take a subdomain someone else already uses (the script checks).
- Builds use the shared server's CPU. Don't redeploy in a loop.

## Step 0 · API token (always first)

Run `node <skill-dir>/scripts/sandbox.mjs check`.

The script looks for the token in this order:
1. the `COOLIFY_TOKEN` environment variable
2. the file `~/.config/bu8-sandbox/coolify.env` (line `COOLIFY_TOKEN='...'`)

Results:
- **Exit code 2, "no token":** stop. Tell the user: *"You need a Coolify sandbox API token. Please ask the DevOps team for one (with deploy permission), then save it in `~/.config/bu8-sandbox/coolify.env` as `COOLIFY_TOKEN='<token>'`."*
  - Suggest they create the file themselves (e.g. `! notepad %USERPROFILE%\.config\bu8-sandbox\coolify.env`) rather than pasting the token into the chat.
  - Never invent a token, never search the disk for other people's tokens, and never copy one into the project.
- **"Unauthenticated" (401):** the token is wrong or revoked. Ask DevOps for a new one.
- **"API is disabled":** the API was switched off on the instance. Ask DevOps to enable it (Settings → Advanced → API Access).
- **If the user pastes a token into the chat anyway:** save it to `~/.config/bu8-sandbox/coolify.env`, never into the repo. Remind them to rotate it later because it is now in the chat transcript.

## Step 1 · Check the app is deployable

Read `references/app-checklist.md` and inspect the repo. Fix what is missing before deploying.

Must have:
- a **Dockerfile** that listens on `0.0.0.0:<port>`
- a **health endpoint**
- the repo **pushed to a public GitHub repo**, because the sandbox clones it on every deploy
- the database schema created **at startup, safely**, not on the first request (otherwise a fresh deploy returns 500)

**Private repos are not supported by this skill.** Ask DevOps to connect the GitHub App, or make the repo public.

## Step 2 · Write `deploy.json` in the project root

Copy `templates/deploy.example.json` and fill it in. Confirm the **subdomain** with the user. Must be lowercase letters, digits and `-`; the final URL is `https://<subdomain>.c.bu8-sd.com`.

| Field | Meaning |
|---|---|
| `name` | app name; also the Coolify project name unless `project` is set |
| `repo` | public HTTPS Git URL |
| `branch` | branch to deploy |
| `baseDirectory` | Docker build context inside the repo (e.g. `/` or `/sabaijang`) |
| `dockerfile` | Dockerfile path **relative to `baseDirectory`** (e.g. `/Dockerfile` or `/web/Dockerfile`) |
| `port` | port the container listens on |
| `subdomain` | gives `https://<subdomain>.c.bu8-sd.com` |
| `healthPath` | e.g. `/api/health` |
| `database` | `{ "type": "postgresql" }` or `null` |
| `env` | plain env vars (non-secret) |
| `envFile` | optional path to a git-ignored file with secret env vars `KEY=value` |

When `database` is set the script creates PostgreSQL 16 and injects **`DATABASE_URL`** (internal host) automatically. Never hard-code it.

## Step 3 · Plan, then deploy

1. `node <skill-dir>/scripts/sandbox.mjs plan --config deploy.json` is a dry run. It shows what will be created or reused and checks the subdomain is free. **Show the plan to the user and get a yes** before deploying the first time.
2. `node <skill-dir>/scripts/sandbox.mjs deploy --config deploy.json` creates or reuses the project, database and app, syncs env vars, builds on the sandbox, waits for the deployment, then checks `https://<subdomain>.c.bu8-sd.com<healthPath>`. It is safe to re-run: it reuses resources by name and only redeploys.
   - The build takes a few minutes. Run it in the background and wait for it to finish, without polling every few seconds.
   - The DB password is generated once and stored in `.coolify/secrets.env` in the project. The script adds `.coolify/` to `.gitignore`.

## Step 4 · Report

Give the user:
- the live URL
- what was created (project, app, database)
- the env vars set (**names only, never values**)
- how to redeploy (`deploy` again)
- the sandbox reminder: public, may be wiped, no real data

If the health check failed, run `logs` and `status`, read `references/troubleshooting.md`, fix, then deploy again. Don't report success until the health check passes.

## Other commands

| Command | Use |
|---|---|
| `status --config deploy.json` | app/DB status and last deployment |
| `logs --config deploy.json [--lines 80]` | app container logs |
| `destroy --config deploy.json --yes` | delete the app, database and project, **only if created by this skill**. Ask the user to confirm first; it cannot be undone. |
