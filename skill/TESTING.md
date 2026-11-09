# Testing coolify-deploy on the real sandbox

Run on 2026-11-09 against `https://c.bu8-sd.com` (Coolify 4.6.0). The test app `skill-smoke` deployed this assignment's hotel web app (Next.js + PostgreSQL) and was destroyed afterwards.

| # | Case | Command | Expected | Result |
|---|---|---|---|---|
| 1 | No token anywhere | `check` | Stop, exit 2, "ask the DevOps team", where to save it | ✅ exit 2 + message |
| 2 | Wrong token | `check` with `COOLIFY_TOKEN='1\|wrong'` | Stop, exit 2, token rejected, ask DevOps | ✅ exit 2 + message |
| 3 | Valid token | `check` | Version, team, server reachable | ✅ Coolify 4.6.0 · Root Team · `localhost` reachable |
| 4 | Invalid config | `plan` with bad name / subdomain / repo / port | Exit 3, every problem listed | ✅ exit 3, 5 problems listed |
| 5 | Subdomain already used | `plan` with `subdomain: "hotel"` | Exit 3, names the app using it | ✅ "already used by app hotel-web" |
| 6 | First deploy with PostgreSQL | `plan`, then `deploy` | Create project + DB + app, inject `DATABASE_URL`, build, health 2xx | ✅ built on the sandbox in 231 s · `/api/health` → `{"ok":true,"db":true}` · `/th` → 200 |
| 7 | Secrets handling | look in project dir | DB password only in `.coolify/secrets.env`, `.coolify/` git-ignored, env values never printed | ✅ |
| 8 | Status / logs | `status`, `logs --lines 6` | App + DB healthy, last deployment + commit, container log | ✅ `running:healthy` ×2 · commit `4a2bac7` · log shows `[startup] database ready` |
| 9 | Idempotent plan | `plan` again | Everything reused (`=`), nothing created | ✅ |
| 10 | Redeploy | `deploy` again | Same resources, no env changes, health 2xx | ✅ finished in 42 s (image reused) · health 200 |
| 11 | Destroy without confirmation | `destroy` | Refuse, exit 3 | ✅ |
| 12 | Destroy someone else's project | `destroy --yes` on `cwn-sabaijang-hotel` (created by hand) | Refuse (no `(coolify-deploy)` marker) | ✅ refused · hotel.c.bu8-sd.com still 200 |
| 13 | Destroy own app | `destroy --yes` | Delete app, DB, project | ✅ all 3 deleted · URL → 503 · sandbox back to its original resources |

## Bugs the tests found (fixed)

- **Coolify 4.6 rejects resource descriptions with `[`, `]` or `:`** (422). The original marker `[coolify-deploy]` and the `https://` repo URL in descriptions failed. The marker is now `(coolify-deploy)` and the URL scheme is stripped. Added to `references/troubleshooting.md`.
- A scripted edit broke the description regex. `node --check` caught it before anything reached the sandbox.

## Lessons from the hotel deployment, encoded in the skill

- The token contains `|`, so it must be quoted in env files.
- "API is disabled" means asking DevOps to enable it.
- Start/stop endpoints are POST in 4.6.
- A fresh database briefly shows `exited:unhealthy`; the script waits.
- Create the schema at startup, not on the first request. A fresh deploy once returned 500 because of this.
- Next.js `instrumentation.ts` also gets an Edge build, so Node-only code must sit in a guarded import.
