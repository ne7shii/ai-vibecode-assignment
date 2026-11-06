# Deploy · Coolify (c.bu8-sd.com)

| Resource | Setting |
|---|---|
| Project | `cwn-sabaijang-hotel` · environment `production` · server `localhost` |
| Database | PostgreSQL 16 (`postgres:16-alpine`) · db/user `hotel` · not public · reachable only on Coolify's internal network |
| App | `hotel-web` · public GitHub repo `ne7shii/ai-vibecode-assignment` branch `main` · build pack Dockerfile · base directory `/sabaijang` · Dockerfile `/web/Dockerfile` · port 3000 |
| Domain | https://hotel.c.bu8-sd.com (frontend and `/api/*` on the same domain) |
| Env | `DATABASE_URL` (internal host = database uuid) · `ALLOW_TEST_RESET=0` · `CLOCK_MODE=ticking` · `BUG_MODE=0` · `PUBLIC_URL` · `TZ=Asia/Bangkok` |

The schema and seed load on the first request when the database is empty. Health check: `GET /api/health` → `{"ok":true,"db":true}`.

Secrets (Coolify API token, DB password, resource uuids) live in `devops/coolify.env`, which is git-ignored. Never commit it.

Redeploy: Coolify UI → hotel-web → Deploy, or
`curl -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_URL/api/v1/deploy?uuid=$APP_UUID"`.
