FROM node:25-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm install

FROM base AS build
COPY tsconfig.base.json ./
COPY apps/frontend apps/frontend
RUN npm run build --workspace frontend

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf.template
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
CMD ["/bin/sh", "-c", "envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
