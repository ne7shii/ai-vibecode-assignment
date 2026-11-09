# Troubleshooting the sandbox

Real problems seen on `c.bu8-sd.com` and what fixed them.

| Symptom | Cause | Fix |
|---|---|---|
| `No Coolify API token found` (exit 2) | No `COOLIFY_TOKEN` env var and no `~/.config/bu8-sandbox/coolify.env` | Ask the **DevOps team** for a token. Save it as `COOLIFY_TOKEN='<token>'` in that file. |
| `Unauthenticated` (401) with a token that looks right | The token wasn't sent intact. A token like `1\|abc…` contains `\|`, and an unquoted `COOLIFY_TOKEN=1\|abc` in a sourced shell file becomes a pipe. | Quote it: `COOLIFY_TOKEN='1\|abc…'`. The script's own parser handles quotes. If it's still 401, the token was revoked: ask DevOps. |
| `API is disabled.` | API access is off on the instance | DevOps: Coolify → Settings → Advanced → enable **API Access** (and the IP allow-list if used). |
| `422 … description may only contain letters … - _ . , ! ? ( ) ' " + = * / @ &` | Coolify 4.6 validates resource descriptions: no `[ ]`, `:` or `#` | Keep descriptions plain (the script strips `https://` and other characters). |
| `This endpoint has changed to a POST request.` | Coolify 4.6 changed start/stop/restart from GET to POST | Use POST (the script does). |
| New database shows `exited:unhealthy` | Normal for the first seconds after creation | Wait. The script waits up to 5 minutes and calls start once if needed. |
| Deployment `failed` at `npm run build` with `Module not found: Can't resolve 'fs'` in `instrumentation.ts` | Next.js also compiles instrumentation for the Edge runtime | Put Node-only code in a separate file, imported inside `if (process.env.NEXT_RUNTIME === 'nodejs') { await import('./instrumentation-node') }`. Exactly this form lets Next.js drop it from the Edge build. |
| Deployment `failed`: `COPY … not found` | `baseDirectory` (build context) doesn't match the Dockerfile's `COPY` paths | Set `baseDirectory` to the folder the Dockerfile expects as context, and `dockerfile` relative to it. |
| Deployed, but the first page loads return **500** `relation "…" does not exist`, then it works | Schema created on first request, and parallel requests raced it | Create the schema at startup under an advisory lock (`references/app-checklist.md` #5). |
| Health check never passes / rolling update stuck "Waiting for healthcheck" | App listens on `127.0.0.1`, wrong `port`, or health returns non-2xx while the DB is unreachable | Listen on `0.0.0.0`. Set `port` to the container port. Check `logs` for DB connection errors (wrong `DATABASE_URL`, DB not healthy). |
| `https://<sub>.c.bu8-sd.com` gives a TLS error for a minute after the first deploy | Certificate still being issued | Wait 1–2 minutes. The script retries for 3 minutes. |
| `… is already used by app "X"` (exit 3) | Subdomain taken | Pick another `subdomain`. |
| `destroy` refuses: marker missing | Project was created by hand, not by this skill | Intentional safety. Delete it in the Coolify UI yourself, or ask DevOps. |
| Redeploy pulls an old commit | You didn't push | `git push`, then deploy again. The sandbox builds from GitHub. |

How builds work here: Coolify clones the repo at the branch head, then runs `docker build` **on the sandbox server**. The image stays in that server's local Docker, tagged `<app-uuid>:<commit>`, with no registry. On a rolling update the old container keeps serving until the new one passes its `HEALTHCHECK`.
