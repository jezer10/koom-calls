# koom-calls · CI/CD, secrets y deploy

> Documento consolidado. Mantén este archivo como la fuente única de verdad
> para la cadena de publicación, secrets y rollback. Los workflows
> en `.github/workflows/*.yml` están documentados en forma breve al final.

---

## 1. Visión general

```
PR develop → main
        │
        ├─── .github/workflows/ci.yml          (en cada push/PR)
        │      · pnpm install --frozen-lockfile
        │      · pnpm lint:check
        │      · pnpm test  (vitest + jsdom)
        │      · pnpm build (vue-tsc + vite)
        │
        ▼
.github/workflows/deploy.yml           (push a main o manual)
  · build linux/amd64 + push a ghcr.io/jezer10/koom-calls
  · build args VITE_API_BASE_URL, VITE_SFU_URL, VITE_DEV_AUTH_ENABLED
  · SSH a la VPS + pull + run + health check
  (single job, contenedor en red npm-proxy)
```

Imágenes publicadas con tags:

| Tag | Cuándo |
|---|---|
| `latest` | push a `main` (con `enable=${{ github.ref == 'refs/heads/main' }}`) |
| `main` | cada push a `main` (branch ref) |
| `<sha-corto>` | cualquier commit |

> Configuración mínima intencional: no se publican tags de develop,
> ni de PR, ni semver. Para versiones formales, tag en `main` y usá
> `Actions → Deploy to VPS → Run workflow → tag: <sha>`.

## 2. GitHub Secrets (Settings → Secrets and variables → Actions)

### Requeridos para deploy

| Secret | Ejemplo | Notas |
|---|---|---|
| `VPS_HOST` | `203.0.113.10` o `vps.example.com` | IP pública o dominio |
| `VPS_USER` | `deploy` | usuario SSH (no root, con `docker` group) |
| `VPS_SSH_KEY` | (clave privada) | la **pública** va en `~/.ssh/authorized_keys` de la VPS |
| `VPS_PORT` | `22` | opcional, default 22 |
| `VPS_DEPLOY_DIR_FRONT` | `~/koom-calls-front` | opcional, default `~/koom-calls-front` |
| `VITE_API_BASE_URL` | `https://api.tudominio.com` | **requerido** en prod — queda baked en el bundle al buildear |

### Opcionales (build-time)

| Secret | Default dev | Notas |
|---|---|---|
| `VITE_SFU_URL` | `''` | URL pública de LiveKit (`wss://...`) |
| `VITE_DEV_AUTH_ENABLED` | `true` | `false` en producción para forzar OAuth real |

### Auto-proveídos

- `GITHUB_TOKEN` — para `docker/login-action` contra `ghcr.io`. Requiere
  `packages: write` (ya está en `deploy.yml`).

> **Importante sobre `VITE_API_BASE_URL`:** como se inyecta al compilar,
> cambiar el secret **no afecta imágenes ya publicadas** — hay que
> re-disparar `deploy.yml`. Si lo cambiaste después de un push
> a `main`, corré el workflow manualmente con `workflow_dispatch`.

## 3. Variables en la VPS: no requiere `.env`

A diferencia del back, **el front no necesita `.env` en la VPS**: las
variables `VITE_*` se compilan dentro del bundle en `deploy.yml`
y la imagen resultante es self-contained.

Si más adelante agregás runtime config (ej. un endpoint de health
externo, o un feature flag de runtime), agregá un `docker-compose.yml`
con `env_file: .env` o convertí el `docker run` del workflow a
`docker compose up`.

## 4. Setup inicial en la VPS (una sola vez)

```bash
ssh deploy@VPS_HOST

# 1. Directorio de deploy (el back tiene el suyo aparte)
mkdir -p ~/koom-calls-front && cd ~/koom-calls-front

# 2. (Opcional) Smoke test ANTES del primer deploy automático:
docker pull ghcr.io/jezer10/koom-calls:latest
docker run -d --name koom-calls-front-test \
  -p 8081:8080 \
  ghcr.io/jezer10/koom-calls:latest
curl -fsS http://localhost:8081/health
docker rm -f koom-calls-front-test

# 3. La red npm-proxy se crea automáticamente en el primer deploy vía SSH.
#    (Nginx Proxy Manager usualmente ya la creó.)
```

## 5. Procedimiento de release

```bash
# 1. PR de develop → main en koom-calls
# 2. CI corre y debe pasar (gate de calidad).
# 3. Merge. Se dispara:
#    a. deploy.yml           → build con VITE_* secrets + push + SSH + pull + restart + health check
# 4. Verificar en la VPS:
ssh deploy@VPS_HOST "docker ps && curl -fsS http://localhost:8081/health"
# 5. (Opcional) Tag formal para auditoría / rollback:
git tag v1.0.0 main && git push --tags
# (El tag no dispara deploy — solo crea un alias en git).
```

## 6. Deploy manual (rollback / hotfix)

Repo → Actions → "Deploy to VPS" → Run workflow.

- **Default tag:** `latest` (más reciente publicado en GHCR).
- **Tag específico:** pegar `main-abc1234` o `v1.0.0` en el input `tag`.

## 7. Rollback de emergencia vía SSH

```bash
ssh deploy@VPS_HOST
docker pull ghcr.io/jezer10/koom-calls:main-<sha-anterior>
docker rm -f koom-calls-front
docker run -d \
  --name koom-calls-front \
  --restart unless-stopped \
  --network npm-proxy \
  -p 8081:8080 \
  ghcr.io/jezer10/koom-calls:main-<sha-anterior>

# Verificar
sleep 3
curl -fsS http://localhost:8081/health
docker logs --tail 100 koom-calls-front
```

## 8. Workflows

### `.github/workflows/ci.yml`

- Trigger: `pull_request` a `main`/`develop`, `push` a `main`/`develop`,
  manual (`workflow_dispatch`).
- `paths-ignore`: `docs/**`, `*.md` (no corre por cambios solo de docs).
- `concurrency: ci-…-${{ pr.number || ref }}` con
  `cancel-in-progress: ${{ event_name == 'pull_request' }}`.
  Un force-push sobre la misma PR cancela el run anterior; los pushes a
  `main`/`develop` no se cancelan entre sí (dejan terminar para audit).
- `permissions: contents: read` (principio de menor privilegio).
- Job `ci` (`ubuntu-latest`, `timeout-minutes: 15`):
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` con `node-version: 22` y `cache: pnpm`
     (cachea el store de pnpm por hash de `pnpm-lock.yaml`).
  3. `corepack enable` — garantiza la versión de pnpm declarada en
     `packageManager` (`11.5.2`).
  4. `pnpm install --frozen-lockfile` — falla si el lockfile está
     desincronizado.
  5. `pnpm lint:check` — eslint, falla en cualquier error.
  6. `pnpm test` — vitest con `jsdom`.
  7. `pnpm build` — `vue-tsc -b && vite build` (type-check + bundle).
- Tiempo esperado de punta a punta: ~1 min cacheado, ~3 min en frío.
- **Branch protection (acción manual):** en GitHub UI →
  Settings → Branches → `main` y `develop` → Require status checks →
  seleccionar `Lint, test, build` como required. Sin esto el check es
  solo informativo y no bloquea merges rotos.

### `.github/workflows/deploy.yml`

- Trigger: push a `main`, manual con input `tag` (default `latest`).
- `concurrency: deploy-<repo>` con `cancel-in-progress: true`.
- `environment: production` (GitHub Environments) — opcionalmente con
  reviewers requeridos en la UI.
- `permissions: contents: read, packages: write`.
- Steps:
  1. Checkout + `docker/setup-buildx-action@v3` + `docker/login-action@v3`
     contra `ghcr.io` con `GITHUB_TOKEN`.
  2. `docker/metadata-action@v5` con tags:
     - `main` (branch ref)
     - `<short-sha>`
     - `latest` (solo si `github.ref == 'refs/heads/main'`)
  3. `docker/build-push-action@v6` con `platforms: linux/amd64`,
     GHA cache `mode=min`, build args desde secrets:
     - `VITE_API_BASE_URL` (requerido en prod, default `http://localhost:8080` para dev).
     - `VITE_SFU_URL` (opcional, default `''`).
     - `VITE_DEV_AUTH_ENABLED` (opcional, default `true`).
     Push a `ghcr.io/jezer10/koom-calls`.
  4. `appleboy/ssh-action@v1` con secretos VPS.
  5. Script remoto (`set -euo pipefail`):
     - `cd $DEPLOY_DIR` (default `~/koom-calls-front`).
     - `docker login ghcr.io` con `GITHUB_TOKEN`.
     - `docker pull <image>`.
     - `docker rm -f koom-calls-front` (best-effort).
     - Crea red `npm-proxy` si no existe.
     - `docker run -d --restart unless-stopped --network npm-proxy -p 8081:8080 <image>`.
     - Loop de health check hasta 20s.
     - Falla con `docker logs --tail 50` si no sana.
- **Single-arch intencional:** la VPS es x86. Para añadir `linux/arm64`,
  cambiar `platforms:` en el workflow.

> **No hay `.env` en la VPS:** el front se compila con los `VITE_*` baked
> en el bundle. Si en el futuro agregás runtime config, seguí el patrón
> del back (`back/.github/workflows/deploy.yml`) con un hard-fail de
> `.env` y `--env-file` en el `docker run`.

## 9. Verificación end-to-end

Tras el primer deploy:

```bash
# Health directo (puerto host)
curl -fsS http://localhost:8081/health
# → ok

# Si NPM está configurado con un dominio
curl -fsS https://app.tu-dominio.com/health
# → ok

# El front puede llamar al back (a través de NPM, no directo a localhost)
# Si VITE_API_BASE_URL apunta a https://api.tu-dominio.com:
curl -fsS https://api.tu-dominio.com/health
# → {"status":"ok",...}
```

## 10. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Front carga pero requests a `/api/*` fallan (CORS) | `CORS_ORIGIN` del back no incluye el dominio del front | Editar `~/koom-calls-server/.env`, redeploy back |
| Front carga pero `/api/*` apunta a localhost | `VITE_API_BASE_URL` mal configurado al build | Corregir secret, re-disparar publish + deploy |
| `unauthorized` en socket.io (en consola del front) | Token expirado o secret mismatch | Regenerar token; verificar que el firmador y el middleware usen mismo `JWT_SECRET` |
| Front se ve sin estilos | nginx no sirve `assets/` con el `Content-Type` correcto | Revisar `nginx.conf` (commit actual ya tiene `expires 1y` para `/assets/`) |
| Front se ve "Koom Calls" en blanco | `dist/index.html` no se copió al runtime | Rebuild de la imagen (rm cache, re-disparar publish) |
| Bundle > 500kB warning en build | `livekit-client` (~250kB) | Esperable, code-split pendiente |
| `permission denied` en nginx del contenedor | Usuario `koom` no puede escribir `/var/cache/nginx` | Dockerfile actual usa `nginxinc/nginx-unprivileged` que resuelve esto |
| Deploy falla con `unhealthy` 20s | El healthcheck interno apunta a `:8080` y el server escucha en otro puerto | El Dockerfile fija `PORT=8080` y el healthcheck usa `localhost:8080`; no cambiar `PORT` en `.env` |
| Front no resuelve desde NPM | Contenedor no está en la red `npm-proxy` | `docker network connect npm-proxy koom-calls-front` o re-disparar deploy (el script une la red) |
| `is_default_branch` taggea develop como `latest` | Default branch del repo es `develop` | El workflow usa `enable=${{ github.ref == 'refs/heads/main' }}`; verificar en la UI que el cambio esté en main, no en develop |

---

## 11. Desarrollo local con docker compose + Nginx Proxy Manager

El repo trae un `docker-compose.yml` pensado para correr el front **idéntico
a producción** (mismo `nginx-unprivileged`, mismo puerto interno 8080)
compartiendo red Docker con Nginx Proxy Manager. Esto es útil para
testear el bundle compilado, validar el `nginx.conf` o reproducir el
flujo de proxy inverso localmente.

### Prerequisitos en el host

- Docker + compose v2.
- Nginx Proxy Manager corriendo (crea la red `npm-proxy` por defecto).
- El back **no comparte red Docker con el front** (se despliegan en
  entornos separados). Para hablar con un back local, exportá
  `VITE_API_BASE_URL=http://host.docker.internal:8080` (Docker Desktop
  lo resuelve gratis; en Linux podés necesitar
  `extra_hosts: ["host.docker.internal:host-gateway"]` en el
  `docker-compose.yml`). La alternativa más simple es usar
  `pnpm dev` (Vite en :5173 + Nest en :8080) sin Docker.

### Arranque

```bash
# 1. (Opcional) Copiá la plantilla de env
cp .env.docker-compose.example .env.docker-compose
# Editá VITE_API_BASE_URL: apuntá al back en este host vía
# http://host.docker.internal:8080 (docker compose) o http://localhost:8080
# (pnpm dev). NO uses http://koom-calls-server:8080 — back y front ya
# no comparten red Docker.

# 2. Bootstrap
./scripts/npm-up.sh            # verifica red y levanta el front
./scripts/npm-up.sh --build    # fuerza rebuild de la imagen
./scripts/npm-up.sh --recreate # recrea el contenedor (útil tras cambios
                               # en networks)
./scripts/npm-up.sh --debug    # además levanta `front-debug` con
                               # 127.0.0.1:8081 → 8080 (sin pasar por NPM)
```

El script falla con mensaje accionable si falta NPM, en vez de
dejarte con un `Network … not found` críptico. Pasale
`--create-networks` si querés generar la red como placeholder vacío
para iterar sin el resto del stack.

### Configuración del proxy host en NPM

| Campo | Valor |
|---|---|
| Domain Names | `koom.local` (o el dominio real) |
| Scheme | `http` |
| Forward Hostname / IP | `koom-calls-front` (nombre del contenedor) |
| Forward Port | `8080` (puerto interno del contenedor) |
| Websockets Support | **ON** (LiveKit usa WSS) |
| Cache Assets | opcional |

Verificá que el contenedor esté en la red compartida:

```bash
docker network inspect npm-proxy | grep koom-calls-front
# debe listar al contenedor
```

### Diferencias con `pnpm dev`

| | `pnpm dev` (Vite) | `docker compose up` (Nginx bundle) |
|---|---|---|
| HMR | ✅ | ❌ |
| Paridad con prod | ❌ | ✅ |
| Valida `nginx.conf` y `vue-tsc` build | solo manual | siempre |
| Cuándo usar | dev de features | pre-merge, QA, troubleshooting |

Recomendación: `pnpm dev` para el día a día, `docker compose` antes de
abrir PR o tras tocar `nginx.conf` / `Dockerfile` / `vite.config.js`.
