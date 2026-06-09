# CI/CD

## Workflows

- **`docker-publish.yml`** — se dispara en `push` a `main` (o tag `v*`, o manual). Construye la imagen Docker multi-stage (Vite build + nginx unprivileged) y la publica en `ghcr.io/jezer10/koom-calls` con tags `latest`, `main-<sha>`, semver.
- **`deploy-vps.yml`** — se dispara tras la publicación exitosa (o manual). Hace SSH a la VPS, hace `docker pull`, recrea el contenedor `koom-calls-front` con `--restart unless-stopped` y health check.

## Secrets requeridos (GitHub repo → Settings → Secrets and variables → Actions)

| Secret | Requerido para | Ejemplo |
|---|---|---|
| `VPS_HOST` | deploy | `203.0.113.10` o `vps.example.com` |
| `VPS_USER` | deploy | `deploy` |
| `VPS_SSH_KEY` | deploy | clave privada OpenSSH |
| `VPS_PORT` | deploy (opcional) | `22` (default) |
| `VPS_DEPLOY_DIR_FRONT` | deploy (opcional) | `~/koom-calls-front` (default) |
| `VITE_API_BASE_URL` | publish | `https://api.koom.example.com` (URL del backend) |
| `VITE_SFU_URL` | publish (opcional) | `wss://livekit.koom.example.com` |
| `VITE_DEV_AUTH_ENABLED` | publish (opcional) | `false` en prod, `true` en dev |

`GITHUB_TOKEN` lo provee GitHub Actions automáticamente.

## Setup en la VPS

```bash
# 1. Crear directorio de deploy
mkdir -p ~/koom-calls-front && cd ~/koom-calls-front

# 2. La red koom-net se crea automáticamente en el primer deploy del backend
# (o créala manualmente: docker network create koom-net)

# 3. Verificar docker
docker --version

# 4. (Opcional) Prueba manual:
docker pull ghcr.io/jezer10/koom-calls:latest
docker run -d --name koom-calls-front -p 8081:8080 ghcr.io/jezer10/koom-calls:latest
curl http://localhost:8081/health
```

## Disparar deploy manual

1. Repo → Actions → "Deploy to VPS" → Run workflow.
2. Tag opcional: `latest` (default), `main-abc1234`, o un tag semver.

## Rollback

```bash
ssh deploy@VPS_HOST
docker pull ghcr.io/jezer10/koom-calls:main-<sha-anterior>
docker rm -f koom-calls-front
docker run -d --name koom-calls-front -p 8081:8080 \
  ghcr.io/jezer10/koom-calls:main-<sha-anterior>
```
