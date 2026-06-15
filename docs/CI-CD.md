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
        │      · pnpm test  (vitest, 18 spec files, jsdom)
        │      · pnpm build (vue-tsc -b && vite build)
        │
        ▼
.github/workflows/docker-publish.yml
  · build multi-stage: Vite → bundle estático
  · build arg: VITE_API_BASE_URL, VITE_SFU_URL, VITE_DEV_AUTH_ENABLED
  · push a ghcr.io/jezer10/koom-calls
        │
        ▼
.github/workflows/deploy-vps.yml   (workflow_run, auto)
  · SSH a la VPS
  · docker pull
  · docker run --restart unless-stopped
  · health check /health
```

El front es **estático** (SPA Vue 3 servida por nginx). No lee env en runtime:
todas las variables se inyectan en **build time** vía `--build-arg`.

Imágenes publicadas con tags:

| Tag | Cuándo |
|---|---|
| `latest` | push a `main` (default branch) |
| `main-<sha-corto>` | cada push a `main` |
| `vX.Y.Z`, `vX.Y` | tag `v*` |
| `<sha-corto>` | cualquier commit |
| `pr-<n>` | PR builds (no se despliegan) |

## 2. GitHub Secrets (Settings → Secrets and variables → Actions)

### Requeridos para deploy

| Secret | Ejemplo | Notas |
|---|---|---|
| `VPS_HOST` | `203.0.113.10` o `vps.example.com` | IP pública o dominio |
| `VPS_USER` | `deploy` | usuario SSH (no root) |
| `VPS_SSH_KEY` | (clave privada) | la **pública** va en `~/.ssh/authorized_keys` de la VPS |
| `VPS_PORT` | `22` | opcional, default 22 |
| `VPS_DEPLOY_DIR_FRONT` | `~/koom-calls-front` | opcional, default `~/koom-calls-front` |

### Requeridos para build (VITE_*)

| Secret | Requerido | Default | Notas |
|---|---|---|---|
| `VITE_API_BASE_URL` | **sí** | `http://localhost:8080` | URL pública del **back** (ej. `https://api.example.com`). Se inyecta en el bundle en build time. |
| `VITE_SFU_URL` | opcional | `''` | URL pública de LiveKit (ej. `wss://livekit.example.com`). |
| `VITE_DEV_AUTH_ENABLED` | opcional | `true` | `false` en producción para deshabilitar el login dev fake. |

### Auto-proveídos

- `GITHUB_TOKEN` — para `docker/login-action` contra `ghcr.io` y `packages: write`.

## 3. Variables locales (desarrollo)

En local, copia `front/.env.example` a `front/.env` y edita. Vite las lee
automáticamente del `.env` al hacer `npm run dev` o `npm run build`.

| Variable | Default | Notas |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | URL del backend NestJS |
| `VITE_SFU_URL` | (vacío) | URL del SFU LiveKit |
| `VITE_DEV_AUTH_ENABLED` | `true` | mostrar/ocultar form de dev-login |

## 4. Setup inicial en la VPS (una sola vez)

```bash
ssh deploy@VPS_HOST

# 1. Directorio de deploy
mkdir -p ~/koom-calls-front && cd ~/koom-calls-front

# 2. (Opcional) La red koom-net la crea el deploy del back; si corres
#    el front antes, créala manualmente:
docker network create koom-net

# 3. (Opcional) Prueba manual ANTES del primer deploy automático:
docker pull ghcr.io/jezer10/koom-calls:latest
docker run -d --name koom-calls-front-test \
  --network koom-net -p 8081:8080 \
  ghcr.io/jezer10/koom-calls:latest
curl -fsS http://localhost:8081/health
docker rm -f koom-calls-front-test
```

## 5. Procedimiento de release

```bash
# 1. PR de develop → main en koom-calls
# 2. Merge. Se disparan en orden:
#    a. docker-publish.yml → build con VITE_* secrets + push a ghcr.io
#    b. deploy-vps.yml       → SSH + pull + restart
# 3. Verificar en la VPS:
ssh deploy@VPS_HOST "docker ps && curl -fsS http://localhost:8081/health"
# 4. (Opcional) Tag semver:
git tag v1.0.0 main && git push --tags
```

## 6. Deploy manual (rollback / hotfix)

Repo → Actions → "Deploy to VPS" → Run workflow.

- **Default tag:** `latest` (más reciente publicado en GHCR).
- **Tag específico:** pegar `main-abc1234` o `v1.0.0` en el input "tag".

## 7. Rollback de emergencia vía SSH

```bash
ssh deploy@VPS_HOST
docker pull ghcr.io/jezer10/koom-calls:main-<sha-anterior>
docker rm -f koom-calls-front
docker run -d \
  --name koom-calls-front \
  --restart unless-stopped \
  --network koom-net \
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
- `concurrency: ci-…-${{ pr.number || ref }}` con
  `cancel-in-progress: ${{ event_name == 'pull_request' }}`.
  Un force-push sobre la misma PR cancela el run anterior; los pushes a
  `main`/`develop` no se cancelan entre sí (dejan terminar para audit).
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

### `.github/workflows/docker-publish.yml`

- Trigger: push a `main`, tag `v*`, manual.
- Build: docker buildx multi-arch (linux/amd64 + linux/arm64), GHA cache.
- Build args desde secrets: `VITE_API_BASE_URL`, `VITE_SFU_URL`, `VITE_DEV_AUTH_ENABLED`.
- Push: `ghcr.io/jezer10/koom-calls` con tags según `docker/metadata-action`.
- Permisos: `contents: read`, `packages: write`.

### `.github/workflows/deploy-vps.yml`

- Trigger: tras `workflow_run` exitoso de docker-publish, o manual.
- `concurrency: deploy-koom-calls` — cancela runs concurrentes.
- Steps:
  1. Determina tag (input manual o `latest`).
  2. `appleboy/ssh-action@v1` con secretos VPS.
  3. Script remoto:
     - `docker login ghcr.io`.
     - `docker pull` de la imagen.
     - `docker rm -f koom-calls-front` (best-effort).
     - Crea red `koom-net` si no existe.
     - `docker run -d --restart unless-stopped --network koom-net -p 8081:8080 <image>`.
     - Loop de health check hasta 20s.
     - Falla con `docker logs --tail 50` si no sana.

## 9. Verificación end-to-end

Tras el primer deploy:

```bash
# Health
curl -fsS https://app.tu-dominio.com/health
# → ok

# El front puede llamar al back:
TOKEN=$(curl -fsS -X POST http://localhost:8080/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user"}' | jq -r .token)
curl -fsS -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/calls/test/turn-credentials
# → {"urls":[...],"credential":"...","ttl":3600,...}
```

## 10. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Front carga pero requests a `/api/*` fallan (CORS) | `CORS_ORIGIN` del back no incluye el dominio del front | Editar `~/koom-calls-server/.env`, redeploy back |
| Front carga pero `/api/*` apunta a localhost | `VITE_API_BASE_URL` mal configurado al build | Corregir secret, re-disparar publish + deploy |
| `unauthorized` en socket.io (en consola del front) | Token expirado o secret mismatch | Regenerar token; verificar que el firmador y el middleware usen mismo `JWT_SECRET` |
| Front se ve sin estilos | nginx no sirve `assets/` con el `Content-Type` correcto | Revisar `nginx.conf` (commit actual ya tiene `expires 1y` para `/assets/`) |
| Front se ve "Koom Calls" en blanco | `dist/index.html` no se copió al runtime | Rebuild de la imagen (rm cache, re-disparar publish) |
| Bundle > 500kB warning en build | `livekit-client` (~250kB) | Esperable, el ticket LBR-75 lo documenta; code-split pendiente |
| `permission denied` en nginx del contenedor | Usuario `koom` no puede escribir `/var/cache/nginx` | Dockerfile actual usa `nginxinc/nginx-unprivileged` que resuelve esto |
| Deploy falla con `unhealthy` 30s | El healthcheck interno apunta a `:8080` y el server escucha en otro puerto | El Dockerfile fija `PORT=8080` y el healthcheck usa `localhost:8080`; no cambiar `PORT` en `.env` |

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
- Si vas a hablar con el back localmente, el `back/docker-compose.yml`
  debe estar levantado (crea la red `koom-net`).

### Arranque

```bash
# 1. (Opcional) Copiá la plantilla de env
cp .env.docker-compose.example .env.docker-compose
# Editá VITE_API_BASE_URL si querés que el front apunte al back por nombre
# de contenedor (http://koom-calls-server:8080) en vez de localhost.

# 2. Bootstrap
./scripts/npm-up.sh            # verifica redes y levanta el front
./scripts/npm-up.sh --build    # fuerza rebuild de la imagen
./scripts/npm-up.sh --recreate # recrea el contenedor (útil tras cambios
                               # en networks)
./scripts/npm-up.sh --debug    # además levanta `front-debug` con
                               # 127.0.0.1:8081 → 8080 (sin pasar por NPM)
```

El script falla con mensaje accionable si falta NPM o el back, en vez
de dejarte con un `Network … not found` críptico. Pasale
`--create-networks` si querés generar las redes como placeholder vacío
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
