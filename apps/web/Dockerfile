FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/web apps/web
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3000"]
