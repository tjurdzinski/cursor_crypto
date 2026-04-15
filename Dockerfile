# UI (Vite) + dashboard API (Express + SQLite + Bybit)
FROM node:22-bookworm-slim AS ui-build
WORKDIR /ui
COPY dashboard/ui/package.json ./
RUN npm install
COPY dashboard/ui/ ./
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
COPY --from=ui-build /ui-dist ./dashboard/ui-dist
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "dashboard/server.mjs"]
