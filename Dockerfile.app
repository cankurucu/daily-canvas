# ── Stage 1: Vite build ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_WS_URL is intentionally unset so the smart runtime default kicks in:
# ws://<host>/ws  (routed through nginx — no separate port needed)
# Pass --build-arg VITE_WS_URL=wss://yourhost/ws to override.
ARG VITE_WS_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# ── Stage 2: nginx ────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
