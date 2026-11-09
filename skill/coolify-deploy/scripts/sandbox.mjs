#!/usr/bin/env node
// coolify-deploy · CLI for the team's Coolify SANDBOX (https://c.bu8-sd.com).
// No dependencies (Node 18+). The API token is NOT part of this skill: it comes from
// $COOLIFY_TOKEN or ~/.config/bu8-sandbox/coolify.env, issued per person by the DevOps team.
//
//   node sandbox.mjs check
//   node sandbox.mjs plan    --config deploy.json
//   node sandbox.mjs deploy  --config deploy.json
//   node sandbox.mjs status  --config deploy.json
//   node sandbox.mjs logs    --config deploy.json [--lines 80]
//   node sandbox.mjs destroy --config deploy.json --yes
//
// Exit codes: 0 ok · 1 failed · 2 no/invalid token or API disabled (ask DevOps) · 3 bad config / conflict

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const SANDBOX = {
  url: (process.env.COOLIFY_URL || 'https://c.bu8-sd.com').replace(/\/$/, ''),
  domain: 'c.bu8-sd.com',
  server: 'localhost',
  environment: 'production',
  marker: '(coolify-deploy)', // Coolify descriptions allow only letters, digits, spaces and - _ . , ! ? ( ) ' " + = * / @ &
  postgresImage: 'postgres:16-alpine',
};
const TOKEN_FILE = path.join(os.homedir(), '.config', 'bu8-sandbox', 'coolify.env');
const ASK_DEVOPS = `Ask the DevOps team for a Coolify sandbox API token (deploy permission) and save it in\n  ${TOKEN_FILE}\nas the line:  COOLIFY_TOKEN='<token>'   (or set the COOLIFY_TOKEN environment variable).`;

// ---------- small helpers ----------
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? true) : def; };
const flag = (name) => args.includes(`--${name}`);
const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error(`\n✖ ${msg}`); process.exit(code); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnvFile(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function token() {
  const t = process.env.COOLIFY_TOKEN || readEnvFile(TOKEN_FILE).COOLIFY_TOKEN;
  if (!t) die(2, `No Coolify API token found.\n${ASK_DEVOPS}`);
  return t;
}

async function api(method, p, body) {
  const res = await fetch(`${SANDBOX.url}/api/v1${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((e) => die(1, `Cannot reach ${SANDBOX.url}: ${e.message}`));
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (res.status === 401) die(2, `The API token was rejected (Unauthenticated) — it is wrong or revoked.\n${ASK_DEVOPS}`);
  if (json?.message === 'API is disabled.') die(2, 'The Coolify API is disabled on the sandbox. Ask the DevOps team to enable it (Settings → Advanced → API Access).');
  if (res.status >= 400) {
    const err = new Error(`${method} ${p} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ---------- config ----------
function loadConfig() {
  const file = opt('config', 'deploy.json');
  if (!fs.existsSync(file)) die(3, `Config ${file} not found. Copy templates/deploy.example.json to deploy.json and fill it in.`);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const root = path.dirname(path.resolve(file));
  const errors = [];
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(c.name ?? '')) errors.push('name: 2–41 chars, lowercase letters, digits, "-"');
  if (!/^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/.test(c.subdomain ?? '')) errors.push('subdomain: lowercase letters, digits, "-" (no dots)');
  if (!/^https:\/\/[^\s]+$/.test(c.repo ?? '')) errors.push('repo: public HTTPS git URL (https://github.com/owner/repo)');
  if (!Number.isInteger(c.port)) errors.push('port: integer the container listens on');
  if (!c.healthPath?.startsWith('/')) errors.push('healthPath: e.g. "/api/health"');
  if (c.database && c.database.type !== 'postgresql') errors.push('database.type: only "postgresql" is supported');
  if (c.env?.DATABASE_URL && c.database) errors.push('env.DATABASE_URL: remove it, the script injects it from the created database');
  if (errors.length) die(3, `deploy.json is invalid:\n  - ${errors.join('\n  - ')}`);
  return {
    ...c,
    project: c.project || c.name,
    branch: c.branch || 'main',
    baseDirectory: c.baseDirectory || '/',
    dockerfile: c.dockerfile || '/Dockerfile',
    fqdn: `https://${c.subdomain}.${SANDBOX.domain}`,
    root,
    stateDir: path.join(root, '.coolify'),
  };
}

function ensureGitignored(root) {
  const gi = path.join(root, '.gitignore');
  const text = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!/^\.coolify\/?$/m.test(text)) fs.appendFileSync(gi, `${text && !text.endsWith('\n') ? '\n' : ''}\n# coolify-deploy: generated secrets and state — never commit\n.coolify/\n`);
}

function saveState(c, state) {
  fs.mkdirSync(c.stateDir, { recursive: true });
  ensureGitignored(c.root);
  fs.writeFileSync(path.join(c.stateDir, 'state.json'), JSON.stringify({ ...state, url: c.fqdn, updatedAt: new Date().toISOString() }, null, 2));
}

function secret(c, key, make) {
  const file = path.join(c.stateDir, 'secrets.env');
  const cur = readEnvFile(file);
  if (cur[key]) return cur[key];
  fs.mkdirSync(c.stateDir, { recursive: true });
  ensureGitignored(c.root);
  const v = make();
  fs.appendFileSync(file, `${key}='${v}'\n`, { mode: 0o600 });
  return v;
}

/** Coolify 4.6 descriptions allow only letters, digits, spaces and - _ . , ! ? ( ) ' " + = * / @ & */
const descRepo = (r) => r.replace(/^https?:\/\//, '').replace(/[^\p{L}\p{N} \-_.,!?()'"+=*/@&]/gu, '');
const pgName = (n) => n.replace(/[^a-z0-9]/g, '_').slice(0, 30);

// ---------- discovery ----------
async function discover(c) {
  const [servers, projects, apps] = await Promise.all([api('GET', '/servers'), api('GET', '/projects'), api('GET', '/applications')]);
  const server = servers.find((s) => s.name === SANDBOX.server) ?? servers[0];
  if (!server) die(1, 'No server found on the sandbox. Ask the DevOps team.');
  const project = projects.find((p) => p.name === c.project) ?? null;
  let env = null;
  if (project) env = await api('GET', `/projects/${project.uuid}/${SANDBOX.environment}`).catch(() => null);
  const app = env?.applications?.find((a) => a.name === c.name) ?? null;
  const db = env?.postgresqls?.find((d) => d.name === `${c.name}-db`) ?? null;
  const owner = apps.find((a) => (a.fqdn || '').split(',').map((s) => s.trim().replace(/\/$/, '')).includes(c.fqdn));
  const domainTaken = owner && (!app || owner.uuid !== app.uuid) ? owner : null;
  return { server, project, env, app, db, domainTaken };
}

// ---------- commands ----------
async function check() {
  const v = await api('GET', '/version');
  const servers = await api('GET', '/servers');
  const team = await api('GET', '/teams/current').catch(() => ({}));
  log(`✔ Coolify sandbox ${SANDBOX.url} · version ${typeof v === 'string' ? v : v.raw ?? JSON.stringify(v)}`);
  log(`✔ token source: ${process.env.COOLIFY_TOKEN ? '$COOLIFY_TOKEN' : TOKEN_FILE} · team: ${team.name ?? '?'}`);
  for (const s of servers) log(`✔ server ${s.name} reachable=${s.settings?.is_reachable ?? s.is_reachable} usable=${s.settings?.is_usable ?? '?'}`);
  log(`  apps are published as https://<subdomain>.${SANDBOX.domain}`);
}

async function plan(c, quiet = false) {
  const d = await discover(c);
  const steps = [];
  if (d.domainTaken) die(3, `${c.fqdn} is already used by app "${d.domainTaken.name}". Pick another subdomain.`);
  if (d.project && !(d.project.description ?? '').includes(SANDBOX.marker)) {
    steps.push(`! project "${c.project}" exists but was NOT created by this skill — it will be reused, never deleted`);
  }
  steps.push(d.project ? `= project "${c.project}" exists (${d.project.uuid})` : `+ create project "${c.project}"`);
  if (c.database) steps.push(d.db ? `= database "${c.name}-db" exists (${d.db.status})` : `+ create PostgreSQL 16 "${c.name}-db" (internal only) and inject DATABASE_URL`);
  steps.push(d.app ? `= app "${c.name}" exists → sync settings + env, redeploy` : `+ create app "${c.name}" from ${c.repo}@${c.branch} (Dockerfile ${c.baseDirectory.replace(/\/$/, '')}${c.dockerfile}, port ${c.port})`);
  const envKeys = [...Object.keys(c.env ?? {}), ...Object.keys(readEnvFile(c.envFile && path.resolve(c.root, c.envFile))), ...(c.database ? ['DATABASE_URL'] : [])];
  steps.push(`~ env vars: ${envKeys.join(', ') || '(none)'}`);
  steps.push(`→ build on the sandbox server, wait for the deployment, then check ${c.fqdn}${c.healthPath}`);
  if (!quiet) {
    log(`Plan for ${c.fqdn}\n`);
    for (const s of steps) log(`  ${s}`);
    log(`\nSandbox reminder: the URL is public and the sandbox may be wiped — no real customer data or production secrets.`);
  }
  return d;
}

async function waitDb(uuid) {
  let started = false;
  for (let i = 0; i < 60; i++) {
    const db = await api('GET', `/databases/${uuid}`);
    if (String(db.status).startsWith('running:healthy')) return db;
    if (i === 6 && !started && String(db.status).startsWith('exited')) { await api('POST', `/databases/${uuid}/start`).catch(() => undefined); started = true; }
    await sleep(5000);
  }
  die(1, 'Database did not become healthy within 5 minutes. Run `status` and check Coolify.');
}

async function syncEnv(appUuid, desired) {
  const current = (await api('GET', `/applications/${appUuid}/envs`)).filter((e) => !e.is_preview);
  for (const [key, value] of Object.entries(desired)) {
    const cur = current.find((e) => e.key === key);
    if (!cur) { await api('POST', `/applications/${appUuid}/envs`, { key, value: String(value), is_preview: false }); log(`  + env ${key}`); }
    else if ((cur.real_value ?? cur.value) !== String(value)) { await api('PATCH', `/applications/${appUuid}/envs`, { key, value: String(value), is_preview: false }); log(`  ~ env ${key}`); }
  }
  const extra = current.map((e) => e.key).filter((k) => !(k in desired));
  if (extra.length) log(`  (left untouched, not in deploy.json: ${extra.join(', ')})`);
}

async function waitDeployment(uuid) {
  let last = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 25 * 60_000) {
    const d = await api('GET', `/deployments/${uuid}`);
    if (d.status !== last) { log(`  deployment ${d.status} (${Math.round((Date.now() - t0) / 1000)}s)`); last = d.status; }
    if (d.status === 'finished') return d;
    if (['failed', 'cancelled', 'cancelled-by-user', 'error'].includes(d.status)) {
      let lines = [];
      try { lines = JSON.parse(d.logs || '[]').filter((l) => !l.hidden).slice(-40).map((l) => l.output); } catch { /* ignore */ }
      die(1, `Deployment ${d.status}. Last build log lines:\n${lines.join('\n')}\n\nSee references/troubleshooting.md, fix, then deploy again.`);
    }
    await sleep(10_000);
  }
  die(1, 'Deployment still running after 25 minutes. Check it in Coolify → project → app → Deployments.');
}

async function verify(c) {
  const url = `${c.fqdn}${c.healthPath}`;
  for (let i = 0; i < 36; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.ok) { log(`✔ ${url} → ${r.status} ${(await r.text()).slice(0, 120)}`); return true; }
      if (i % 6 === 0) log(`  waiting for ${url} (${r.status})`);
    } catch (e) { if (i % 6 === 0) log(`  waiting for ${url} (${e.cause?.code ?? e.message})`); }
    await sleep(5000);
  }
  return false;
}

async function deploy(c) {
  const d = await plan(c, false);
  log('');
  let project = d.project;
  if (!project) {
    project = await api('POST', '/projects', { name: c.project, description: `${SANDBOX.marker} ${descRepo(c.repo)}` });
    log(`✔ project ${c.project} (${project.uuid})`);
  }
  const base = { server_uuid: d.server.uuid, project_uuid: project.uuid, environment_name: SANDBOX.environment };

  let dbUrl = null;
  let db = d.db;
  if (c.database) {
    if (!db) {
      const user = pgName(c.name);
      const pw = secret(c, 'POSTGRES_PASSWORD', () => crypto.randomBytes(24).toString('hex'));
      db = await api('POST', '/databases/postgresql', {
        ...base, name: `${c.name}-db`, description: `${SANDBOX.marker} PostgreSQL for ${c.name}`, image: SANDBOX.postgresImage,
        postgres_user: user, postgres_password: pw, postgres_db: user, is_public: false, instant_deploy: true,
      });
      log(`✔ database ${c.name}-db (${db.uuid}) starting…`);
    }
    const ready = await waitDb(db.uuid);
    dbUrl = ready.internal_db_url;
    log(`✔ database ${c.name}-db healthy (internal host ${db.uuid})`);
  }

  const settings = {
    git_repository: c.repo, git_branch: c.branch, build_pack: 'dockerfile', base_directory: c.baseDirectory,
    dockerfile_location: c.dockerfile, ports_exposes: String(c.port), domains: c.fqdn,
  };
  let app = d.app;
  if (!app) {
    app = await api('POST', '/applications/public', { ...base, ...settings, name: c.name, description: `${SANDBOX.marker} ${descRepo(c.repo)}`, instant_deploy: false });
    log(`✔ app ${c.name} (${app.uuid}) → ${c.fqdn}`);
  } else {
    const full = await api('GET', `/applications/${app.uuid}`);
    const diff = {};
    if (full.git_branch !== c.branch) diff.git_branch = c.branch;
    if ((full.base_directory || '/') !== c.baseDirectory) diff.base_directory = c.baseDirectory;
    if (full.dockerfile_location !== c.dockerfile) diff.dockerfile_location = c.dockerfile;
    if (String(full.ports_exposes) !== String(c.port)) diff.ports_exposes = String(c.port);
    if (Object.keys(diff).length) { await api('PATCH', `/applications/${app.uuid}`, diff); log(`✔ app settings updated: ${Object.keys(diff).join(', ')}`); }
  }

  const desired = { ...(c.env ?? {}), ...readEnvFile(c.envFile && path.resolve(c.root, c.envFile)), ...(dbUrl ? { DATABASE_URL: dbUrl } : {}) };
  log('env:');
  await syncEnv(app.uuid, desired);

  const r = await api('POST', `/deploy?uuid=${app.uuid}&force=false`);
  const dep = r.deployments?.[0]?.deployment_uuid;
  if (!dep) die(1, `Coolify did not queue a deployment: ${JSON.stringify(r).slice(0, 300)}`);
  log(`✔ deployment queued (${dep}) — building on the sandbox server…`);
  saveState(c, { projectUuid: project.uuid, appUuid: app.uuid, dbUuid: db?.uuid ?? null, lastDeployment: dep });
  await waitDeployment(dep);

  if (!(await verify(c))) die(1, `Deployed, but ${c.fqdn}${c.healthPath} did not answer 2xx within 3 minutes. Run \`logs\` and see references/troubleshooting.md.`);
  log(`\n✅ Live: ${c.fqdn}`);
  log(`   project ${c.project} · app ${c.name}${db ? ` · database ${c.name}-db` : ''}`);
  log(`   env vars set: ${Object.keys(desired).join(', ') || '(none)'}`);
  log('   Sandbox: public URL, may be wiped — no real customer data.');
}

async function status(c) {
  const d = await discover(c);
  if (!d.app) die(3, `App "${c.name}" not found in project "${c.project}". Run plan/deploy first.`);
  const app = await api('GET', `/applications/${d.app.uuid}`);
  log(`app      ${c.name}  ${app.status}  ${app.fqdn}`);
  if (d.db) log(`database ${d.db.name}  ${d.db.status}`);
  const st = fs.existsSync(path.join(c.stateDir, 'state.json')) ? JSON.parse(fs.readFileSync(path.join(c.stateDir, 'state.json'), 'utf8')) : null;
  if (st?.lastDeployment) {
    const dep = await api('GET', `/deployments/${st.lastDeployment}`).catch(() => null);
    if (dep) log(`last deployment ${st.lastDeployment}  ${dep.status}  commit ${dep.commit ?? '?'}`);
  }
}

async function logs(c) {
  const d = await discover(c);
  if (!d.app) die(3, `App "${c.name}" not found in project "${c.project}".`);
  const r = await api('GET', `/applications/${d.app.uuid}/logs?lines=${Number(opt('lines', 80))}`);
  log(r.logs ?? JSON.stringify(r));
}

async function destroy(c) {
  if (!flag('yes')) die(3, 'destroy deletes the app, its database and the project. Re-run with --yes after the user confirms.');
  const d = await discover(c);
  if (!d.project) die(3, `Project "${c.project}" not found — nothing to delete.`);
  if (!(d.project.description ?? '').includes(SANDBOX.marker)) die(3, `Project "${c.project}" was not created by this skill (${SANDBOX.marker} marker missing). Refusing to delete it.`);
  const q = 'delete_configurations=true&delete_volumes=true&docker_cleanup=true&delete_connected_networks=true';
  if (d.app) { await api('DELETE', `/applications/${d.app.uuid}?${q}`); log(`✔ deleted app ${c.name}`); }
  if (d.db) { await api('DELETE', `/databases/${d.db.uuid}?${q}`); log(`✔ deleted database ${d.db.name}`); }
  for (let i = 0; i < 12; i++) {
    try { await api('DELETE', `/projects/${d.project.uuid}`); log(`✔ deleted project ${c.project}`); break; } catch (e) {
      if (i === 11) log(`! project not deleted yet (resources still cleaning up): ${e.message}`);
      await sleep(5000);
    }
  }
  const st = path.join(c.stateDir, 'state.json');
  if (fs.existsSync(st)) fs.rmSync(st);
}

// ---------- main ----------
const commands = { check, plan: (c) => plan(c), deploy, status, logs, destroy };
if (!commands[cmd]) {
  log('usage: node sandbox.mjs <check|plan|deploy|status|logs|destroy> [--config deploy.json] [--yes] [--lines N]');
  process.exit(cmd ? 3 : 0);
}
try {
  await (cmd === 'check' ? check() : commands[cmd](loadConfig()));
} catch (e) {
  die(1, e.message);
}
