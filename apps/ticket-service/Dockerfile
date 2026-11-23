# syntax=docker/dockerfile:1

FROM node:26-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ticket-service/package.json apps/ticket-service/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/seed-data/package.json packages/seed-data/
COPY packages/server-kit/package.json packages/server-kit/
RUN pnpm install --frozen-lockfile --filter @nexo/ticket-service...
COPY . .
RUN pnpm --filter @nexo/ticket-service build

FROM node:26-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=root:root /repo/apps/ticket-service/dist ./dist
COPY --from=build --chown=root:root /repo/apps/ticket-service/src/adapters/persistence/migrations ./dist/adapters/persistence/migrations
USER node
EXPOSE 4001
CMD ["node", "dist/main.js"]
