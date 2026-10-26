FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY prisma ./prisma
COPY prisma.config.ts next.config.ts tsconfig.json postcss.config.mjs ./
COPY src ./src
COPY scripts ./scripts
# Non-secret build placeholders. The image has no environment files or pilot credentials.
# Runtime configuration is validated again before listening; build has no database access.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_URL=https://build.invalid \
    BETTER_AUTH_SECRET=build-only-placeholder-not-a-runtime-secret \
    LOCAL_DEV_MODE=false DEMO_ENABLED=false \
    SMTP_HOST=build.invalid SMTP_PORT=465 SMTP_USER=build SMTP_PASSWORD=build SMTP_FROM=build@example.invalid \
    npm run build

FROM dependencies AS runtime
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/next.config.ts /app/tsconfig.json ./
USER node
EXPOSE 3000
CMD ["node", "scripts/run-platform.mjs", "--hostname", "0.0.0.0", "--port", "3000"]
