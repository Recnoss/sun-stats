FROM node:25-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
RUN npm install

FROM base AS build
COPY tsconfig.base.json ./
COPY apps/backend apps/backend
RUN npm run build --workspace backend

FROM node:25-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY apps/backend/package.json ./apps/backend/package.json
RUN mkdir -p /app/data
CMD ["node", "apps/backend/dist/index.js"]

