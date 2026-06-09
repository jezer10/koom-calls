# koom-calls · CI/CD, secrets y deploy

> Documento consolidado. Mantén este archivo como la fuente única de verdad
> para la cadena de publicación, secrets y rollback. Los workflows
> en `.github/workflows/*.yml` están documentados en forma breve al final.

---

## 1. Visión general

```
PR develop → main
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
