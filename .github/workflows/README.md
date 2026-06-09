# CI/CD

> **Documentación completa:** ver [`docs/CI-CD.md`](../../docs/CI-CD.md) en la raíz del repo.
> Incluye: visión general, secrets VITE_*, setup en VPS, procedimiento de release,
> rollback, troubleshooting, y descripción de cada workflow.

## Resumen

- **`docker-publish.yml`** — push a `main` (o tag `v*`, o manual). Build multi-stage con `--build-arg VITE_*` desde secrets → `ghcr.io/jezer10/koom-calls`.
- **`deploy-vps.yml`** — tras publish. SSH a VPS, pull, restart con `--restart unless-stopped` y health check.
- Triggers: `push` a `main` o `workflow_dispatch` (manual).
