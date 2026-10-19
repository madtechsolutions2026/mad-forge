FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY frontend ./frontend
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3030
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist
COPY --chown=node:node database/migrations ./database/migrations
COPY --chown=node:node scripts/migrate.cjs scripts/docker-start.cjs ./scripts/

USER node
EXPOSE 3030
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 CMD ["node", "-e", "fetch('http://127.0.0.1:3030/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/docker-start.cjs"]
