FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
RUN npm ci -w apps/server --include-workspace-root=false
COPY apps/server apps/server
RUN npm run build -w apps/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
WORKDIR /app/apps/server
RUN mkdir -p /app/apps/server/data && chown -R node:node /app/apps/server/data
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
