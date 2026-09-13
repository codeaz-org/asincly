# syntax=docker/dockerfile:1.7
# Asincly production image: `docker compose -f docker-compose.selfhost.yml up -d`

FROM node:22-alpine AS base
RUN npm install -g corepack@latest && corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Full source + dependencies. Also used as the one-off `migrate` service.
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values and the S3 origin (for the CSP) are baked in at build.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SOURCE_URL=https://github.com/codeaz-org/asincly
ARG S3_ENDPOINT=http://localhost:9000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SOURCE_URL=$NEXT_PUBLIC_SOURCE_URL \
    S3_ENDPOINT=$S3_ENDPOINT \
    NEXT_TELEMETRY_DISABLED=1
# Placeholders so route modules can be imported during the build; the real
# values come from the environment at runtime.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build AUTH_SECRET=build-only pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/sign-in >/dev/null || exit 1
CMD ["node", "server.js"]
