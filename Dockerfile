# syntax=docker/dockerfile:1
# staff-portal — single-app image: Vite build, then nginx serving dist.
# Public build-time config (baked into the bundle; rebuild to change).
FROM node:24-bookworm-slim AS build
WORKDIR /src
ENV npm_config_fund=false npm_config_audit=false CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_TERMINAL_WS_ORIGIN=""
ENV VITE_TERMINAL_WS_ORIGIN=${VITE_TERMINAL_WS_ORIGIN}
RUN npm run build && test -d dist

FROM nginx:1.27-alpine AS serve
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html/dist
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
