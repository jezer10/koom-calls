#!/usr/bin/env bash
# =============================================================================
# koom-calls · bootstrap del front con Nginx Proxy Manager
# =============================================================================
# Verifica prerequisitos (NPM corriendo, red npm-proxy),
# construye la imagen si hace falta, y levanta el front en modo detach.
#
# Uso:
#   ./scripts/npm-up.sh                       # verifica y up
#   ./scripts/npm-up.sh --build               # fuerza rebuild de la imagen
#   ./scripts/npm-up.sh --no-cache            # build sin caché de Docker
#   ./scripts/npm-up.sh --recreate            # down + up (recrea contenedor)
#   ./scripts/npm-up.sh --create-networks     # crea redes faltantes
#                                             # (placeholder para testing)
#   ./scripts/npm-up.sh --debug               # publica 127.0.0.1:8081
#   ./scripts/npm-up.sh --help
#
# Salida no-cero si falta algo crítico. Mensajes de error apuntan a cómo
# resolver cada prerequisito.
# =============================================================================

set -euo pipefail

# ---- colores -----------------------------------------------------------------
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

info()  { printf "${GREEN}[+]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[!]${NC} %s\n" "$*"; }
err()   { printf "${RED}[x]${NC} %s\n" "$*" >&2; }
title() { printf "\n${BOLD}${CYAN}== %s ==${NC}\n" "$*"; }

# ---- paths -------------------------------------------------------------------
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
COMPOSE_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$COMPOSE_DIR"

# ---- args --------------------------------------------------------------------
BUILD=0
NO_CACHE=0
RECREATE=0
CREATE_NETWORKS=0
DEBUG=0
HELP=0

for arg in "$@"; do
  case "$arg" in
    --build)          BUILD=1 ;;
    --no-cache)       NO_CACHE=1; BUILD=1 ;;
    --recreate)       RECREATE=1 ;;
    --create-networks) CREATE_NETWORKS=1 ;;
    --debug)          DEBUG=1 ;;
    -h|--help)        HELP=1 ;;
    *) err "Argumento desconocido: $arg"; HELP=1 ;;
  esac
done

if (( HELP )); then
  sed -n '3,25p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

# ---- 1. docker disponible -----------------------------------------------------
title "Verificando Docker"
if ! command -v docker >/dev/null 2>&1; then
  err "docker no está instalado o no está en PATH."
  echo "    Instalá Docker: https://docs.docker.com/engine/install/"
  exit 1
fi
if ! docker version >/dev/null 2>&1; then
  err "docker daemon no responde. ¿Está corriendo el servicio?"
  echo "    sudo systemctl start docker"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose (v2) no está disponible. Actualizá Docker."
  exit 1
fi
info "docker $(docker version --format '{{.Server.Version}}') + compose $(docker compose version --short) OK"

# ---- 2. .env (con defaults razonables) ---------------------------------------
title "Cargando variables de entorno"
ENV_FILE=""
if [[ -f "$COMPOSE_DIR/.env.docker-compose" ]]; then
  ENV_FILE="$COMPOSE_DIR/.env.docker-compose"
elif [[ -f "$COMPOSE_DIR/.env" ]]; then
  ENV_FILE="$COMPOSE_DIR/.env"
fi

if [[ -n "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  info "Sourced $ENV_FILE"
else
  warn "No hay .env ni .env.docker-compose — uso los defaults del compose"
  warn "  cp .env.docker-compose.example .env.docker-compose  # recomendado"
fi

# Validación suave de VITE_API_BASE_URL
if [[ "${VITE_API_BASE_URL:-}" == "http://localhost:8080" ]]; then
  warn "VITE_API_BASE_URL=http://localhost:8080 (default)"
  warn "  Dento del contenedor, 'localhost' apunta al front, no al back."
  warn "  Para apuntar a un back en este host desde el contenedor:"
  warn "    VITE_API_BASE_URL=http://host.docker.internal:8080"
fi

# ---- 3. redes requeridas -----------------------------------------------------
title "Verificando redes Docker"

ensure_network() {
  local name="$1"
  local label="$2"
  if docker network inspect "$name" >/dev/null 2>&1; then
    info "red $name OK"
  elif (( CREATE_NETWORKS )); then
    docker network create --driver bridge "$name" >/dev/null
    warn "red $name creada (placeholder; sin $label todavía)"
  else
    err "Falta la red $name (esperada: $label)."
    case "$name" in
      npm-proxy)
        echo "    Para crearla, instalá y arrancá Nginx Proxy Manager:"
        echo "      docker volume create npm-data npm-db npm-letsencrypt"
        echo "      docker run -d --name npm \\"
        echo "        -p 80:80 -p 443:443 -p 81:81 \\"
        echo "        -v npm-data:/data \\"
        echo "        -v npm-db:/etc/mysql \\"
        echo "        -v npm-letsencrypt:/etc/letsencrypt \\"
        echo "        jc21/nginx-proxy-manager:latest"
        echo "    UI admin en http://HOST:81 (default admin@example.com / changeme)"
        echo
        echo "    O, para saltearte NPM en este momento, re-ejecutá con --create-networks"
        echo "    (queda como placeholder vacío; el front no será alcanzable vía proxy)"
        ;;
    esac
    exit 2
  fi
}

ensure_network "npm-proxy" "Nginx Proxy Manager"

# ---- 4. validar compose file -------------------------------------------------
title "Validando docker-compose.yml"
if ! docker compose config -q 2>err.tmp; then
  err "docker-compose.yml no es válido:"
  cat err.tmp >&2
  rm -f err.tmp
  exit 1
fi
rm -f err.tmp
info "compose OK"

# ---- 5. (re)crear si se pidió -------------------------------------------------
if (( RECREATE )); then
  title "Recreando contenedor"
  docker compose down --remove-orphans || true
fi

# ---- 6. build si hace falta --------------------------------------------------
NEEDS_BUILD=0
if (( BUILD )); then
  NEEDS_BUILD=1
elif ! docker image inspect koom-calls-front:local >/dev/null 2>&1; then
  NEEDS_BUILD=1
  info "Imagen koom-calls-front:local ausente → build inicial"
fi

if (( NEEDS_BUILD )); then
  title "Construyendo imagen"
  BUILD_ARGS=()
  if (( NO_CACHE )); then BUILD_ARGS+=(--no-cache); fi
  docker compose build "${BUILD_ARGS[@]}"
fi

# ---- 7. up --------------------------------------------------------------------
title "Levantando stack"
COMPOSE_ARGS=(up -d)
(( DEBUG )) && COMPOSE_ARGS=(--profile debug up -d)
docker compose "${COMPOSE_ARGS[@]}"

# ---- 8. health check ---------------------------------------------------------
title "Esperando health check"
for i in $(seq 1 20); do
  if docker inspect --format '{{.State.Health.Status}}' koom-calls-front 2>/dev/null \
       | grep -q '^healthy$'; then
    info "healthy tras ${i}s"
    break
  fi
  sleep 1
done

HEALTH=$(docker inspect --format '{{.State.Health.Status}}' koom-calls-front 2>/dev/null || echo missing)
if [[ "$HEALTH" != "healthy" ]]; then
  warn "Estado: $HEALTH tras 20s. Revisá los logs:"
  echo "    docker compose logs --tail 50 front"
  exit 3
fi

# ---- 9. resumen --------------------------------------------------------------
title "Listo"
echo
info "Contenedor: koom-calls-front  ($HEALTH)"
echo
echo "  Acceso por red (desde NPM u otros contenedores en npm-proxy):"
echo "    http://koom-calls-front:8080"
echo
if (( DEBUG )); then
  echo "  Acceso directo (loopback, profile debug):"
  echo "    http://127.0.0.1:8081  /  http://127.0.0.1:8081/health"
  echo
fi
echo "  Configurá NPM → Proxy Host → Forward: koom-calls-front:8080"
echo "  No olvides activar 'Websockets Support' en NPM (LiveKit los usa)."
echo
echo "  Logs en vivo:    docker compose logs -f front"
echo "  Apagar:          docker compose down"
