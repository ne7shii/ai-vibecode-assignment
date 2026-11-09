# Is the app ready for the sandbox?

Check each item in the repo before the first deploy. Fix what's missing (with the user's agreement), commit, and push. The sandbox builds from GitHub, not from local files.

| # | Requirement | How to check | Typical fix |
|---|---|---|---|
| 1 | **Dockerfile builds without network access to the DB** | `docker build` locally succeeds | Don't connect to the database during `npm run build` / image build. Mark pages dynamic, or read config at runtime. |
| 2 | **Listens on `0.0.0.0:<port>`** | the `CMD` / start command | Next.js standalone: `ENV HOSTNAME=0.0.0.0 PORT=3000`. Express: `app.listen(port, '0.0.0.0')`. Vite preview: `--host 0.0.0.0`. |
| 3 | **`port` in deploy.json = the port inside the container** | `EXPOSE` / env PORT | Not the host port you use locally. `3100:3000` locally means `port: 3000`. |
| 4 | **Health endpoint returns 2xx only when really ready** | `curl /api/health` | Return `{ok:true, db:true}` after a `SELECT 1`. Add a Dockerfile `HEALTHCHECK` so Coolify's rolling update waits for it. |
| 5 | **Database schema created at startup, safely** | start the app on an EMPTY database and send several requests at once | Create schema/migrations **before serving**, e.g. Next.js `src/instrumentation.ts`, or a `migrate && start` command. Run it in one transaction under `pg_advisory_xact_lock` so concurrent instances don't double-run it. Otherwise the first requests after a fresh deploy return 500 (`relation … does not exist`). This happened for real. |
| 6 | **Reads `DATABASE_URL` from env** | grep for hard-coded hosts like `localhost:5432` | The skill injects `DATABASE_URL` with the internal host (the database uuid). Don't hard-code hosts or ports. |
| 7 | **Build context matches the Dockerfile's `COPY` paths** | the `COPY` lines | `baseDirectory` = Docker build context. `dockerfile` is relative to it. If the Dockerfile copies `../db`, set `baseDirectory` to the parent folder. |
| 8 | **Public GitHub repo, pushed** | `git status`, `git log origin/main` | Push first. Private repos need the GitHub App connected by DevOps. |
| 9 | **No secrets in the repo** | look for `.env`, keys, tokens | Put secrets in a git-ignored file and point `envFile` at it. Never commit `.coolify/`. |
| 10 | **Demo-safe** | test/reset endpoints, admin without login | Disable destructive test hooks on the sandbox (e.g. `ALLOW_TEST_RESET=0`). The URL is public. |
| 11 | **Static assets included in the image** | open a page with images after deploy | Copy `public/` (and `.next/static` for Next.js standalone) into the final stage. |

Time zone: the sandbox runs in UTC. Set `TZ=Asia/Bangkok` in `env` if the app shows local times.
