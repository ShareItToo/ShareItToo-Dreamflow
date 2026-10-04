ARG NODE_IMAGE=node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global pnpm@11.16.0 \
    && pnpm install --prod --frozen-lockfile \
    && pnpm store prune \
    && npm cache clean --force

FROM ${NODE_IMAGE}
ARG APP_VERSION=development
ARG APP_COMMIT=unknown
ARG APP_BUILD_TIME=unknown
ARG APP_SOURCE_URL=unknown

LABEL org.opencontainers.image.title="ShareItToo API" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_COMMIT}" \
      org.opencontainers.image.created="${APP_BUILD_TIME}" \
      org.opencontainers.image.source="${APP_SOURCE_URL}"

ENV NODE_ENV=production
ENV APP_VERSION="${APP_VERSION}"
ENV APP_COMMIT="${APP_COMMIT}"
ENV APP_BUILD_TIME="${APP_BUILD_TIME}"
WORKDIR /app
RUN addgroup -S shareittoo && adduser -S -G shareittoo shareittoo
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY sql ./sql
COPY src ./src
RUN mkdir -p /data/uploads && chown -R shareittoo:shareittoo /app /data
USER shareittoo
EXPOSE 8080
CMD ["node", "src/server.js"]
