# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_SFU_URL=
ARG VITE_DEV_AUTH_ENABLED=true

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SFU_URL=${VITE_SFU_URL} \
    VITE_DEV_AUTH_ENABLED=${VITE_DEV_AUTH_ENABLED}

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
