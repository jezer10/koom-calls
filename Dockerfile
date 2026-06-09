# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=10.34.1

FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Corepack ships with Node 22+ and pins the pnpm version declared in
# package.json (packageManager), so this is reproducible.
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_SFU_URL=
ARG VITE_DEV_AUTH_ENABLED=true

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SFU_URL=${VITE_SFU_URL} \
    VITE_DEV_AUTH_ENABLED=${VITE_DEV_AUTH_ENABLED}

RUN pnpm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
